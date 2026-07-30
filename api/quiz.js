import crypto from "crypto";
import { createRequire } from "module";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { neon } from "@neondatabase/serverless";

const require = createRequire(import.meta.url);
const {
  QUIZ_AUDIO_IDENTITY_VERSION,
  getQuizAudioIdentity,
  normalizeQuizAudioFigure,
  normalizeQuizAudioQuestion
} = require("../quiz-audio-identity.cjs");
const quizAudioLegacyRegistry = require("../data/quiz-audio-legacy-collisions-v1.json");

const ACCESS_GAS_URL = process.env.GAS_ACCESS_URL;
const ACCESS_GAS_SECRET = process.env.GAS_SECRET;
const QUIZ_GAS_URL = process.env.QUIZ_GAS_URL;
const QUIZ_PROXY_SECRET = process.env.QUIZ_PROXY_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const QUIZ_AUDIO_R2_BUCKET = process.env.QUIZ_AUDIO_R2_BUCKET;
const QUIZ_AUDIO_R2_ACCOUNT_ID = process.env.QUIZ_AUDIO_R2_ACCOUNT_ID;
const QUIZ_AUDIO_R2_ACCESS_KEY_ID = process.env.QUIZ_AUDIO_R2_ACCESS_KEY_ID;
const QUIZ_AUDIO_R2_SECRET_ACCESS_KEY = process.env.QUIZ_AUDIO_R2_SECRET_ACCESS_KEY;
const QUIZ_AUDIO_DATABASE_URL = process.env.DATABASE_URL || process.env.STORAGE_URL || process.env.NEON_DATABASE_URL;
const ADMIN_PHONE_NUMBERS = (process.env.ADMIN_PHONE_NUMBERS || "")
  .split(/[\s,;]+/)
  .map(normalizePhoneNumber)
  .filter(Boolean);

const GET_ACTIONS = new Set(["getQuiz", "getItalianAudio", "getBengaliAudio", "getTTS"]);
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const QUIZ_SESSION_TOKEN_TTL_MS = 30 * 60 * 1000;
const PASSING_SCORE_RATIO = 0.9;
const EXAM_CHAPTER_CODE = "0";
const EXAM_POOL_START_INDEX = 790;
const EXAM_POOL_SIZE = 80;
const EXAM_POOL_FETCH_ATTEMPTS = 20;
const EXAM_POOL_FETCH_BATCH_SIZE = 4;
const EXAM_QUIZ_MODES = {
  exam80: {
    mode: "exam80",
    questionCount: 80,
    timerMinutes: 50,
    sessionTtlMs: 55 * 60 * 1000,
    title: "Exam"
  },
  exam30: {
    mode: "exam30",
    questionCount: 30,
    timerMinutes: 20,
    sessionTtlMs: QUIZ_SESSION_TOKEN_TTL_MS,
    title: "Exam"
  }
};

let quizAudioDatabase = null;
let quizAudioStorage = null;
let quizAudioCatalogCache = { expiresAt: 0, rows: [] };
let quizAudioCatalogLoading = null;

function isQuizAudioConfigured() {
  return Boolean(
    QUIZ_AUDIO_DATABASE_URL &&
    QUIZ_AUDIO_R2_BUCKET &&
    QUIZ_AUDIO_R2_ACCOUNT_ID &&
    QUIZ_AUDIO_R2_ACCESS_KEY_ID &&
    QUIZ_AUDIO_R2_SECRET_ACCESS_KEY
  );
}

function getQuizAudioDatabase() {
  if (!isQuizAudioConfigured()) {
    const error = new Error("quiz_audio_not_configured");
    error.statusCode = 503;
    throw error;
  }
  if (!quizAudioDatabase) quizAudioDatabase = neon(QUIZ_AUDIO_DATABASE_URL);
  return quizAudioDatabase;
}

function getQuizAudioStorage() {
  if (!isQuizAudioConfigured()) {
    const error = new Error("quiz_audio_not_configured");
    error.statusCode = 503;
    throw error;
  }
  if (!quizAudioStorage) {
    quizAudioStorage = new S3Client({
      region: "auto",
      forcePathStyle: true,
      endpoint: `https://${QUIZ_AUDIO_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: QUIZ_AUDIO_R2_ACCESS_KEY_ID,
        secretAccessKey: QUIZ_AUDIO_R2_SECRET_ACCESS_KEY
      }
    });
  }
  return quizAudioStorage;
}

// R2 signs the exact Content-Type header. MediaRecorder often reports
// "audio/webm;codecs=opus", while the signed upload uses "audio/webm".
// Keep one canonical value for both the signed PUT and the database row.
function normalizeQuizAudioMimeType(value) {
  const mimeType = String(value || "audio/webm").split(";", 1)[0].trim().toLowerCase();
  return mimeType === "audio/webm" ? "audio/webm" : "audio/webm";
}

function assertQuizAudioIdentityVersion(value) {
  if (Number(value) !== QUIZ_AUDIO_IDENTITY_VERSION) {
    const error = new Error("quiz_audio_identity_upgrade_required");
    error.statusCode = 409;
    throw error;
  }
}

function isLegacyQuizAudioAmbiguous(legacyQuizKey) {
  return Boolean(quizAudioLegacyRegistry?.collisions?.[legacyQuizKey]);
}

async function requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly = false }) {
  const access = await ensureAccess({ phone, deviceId, accessToken });
  if (!access.ok) {
    const error = new Error(access.error || "unauthorized");
    error.statusCode = access.statusCode || 401;
    throw error;
  }
  const isAdmin = access.role === "admin" || isAdminPhone(phone);
  if (adminOnly && !isAdmin) {
    const error = new Error("admin_forbidden");
    error.statusCode = 403;
    throw error;
  }
  return { access, isAdmin };
}

async function getQuizAudioRow(quizKey) {
  const sql = getQuizAudioDatabase();
  const rows = await sql`
    SELECT quiz_key, audio_key, audio_mime_type, audio_duration_ms
    FROM quiz_audio_explanations
    WHERE quiz_key = ${quizKey}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function findQuizAudioRow(identity, { allowAmbiguousLegacy = false } = {}) {
  const current = await getQuizAudioRow(identity.quizKey);
  if (current) return { row: current, matchedQuizKey: identity.quizKey, legacy: false, requiresReview: false };
  const legacy = await getQuizAudioRow(identity.legacyQuizKey);
  if (!legacy) return { row: null, matchedQuizKey: "", legacy: false, requiresReview: false };
  const requiresReview = isLegacyQuizAudioAmbiguous(identity.legacyQuizKey);
  if (requiresReview && !allowAmbiguousLegacy) {
    return { row: null, matchedQuizKey: identity.legacyQuizKey, legacy: true, requiresReview: true };
  }
  return { row: legacy, matchedQuizKey: identity.legacyQuizKey, legacy: true, requiresReview };
}

async function getCanonicalQuizAudioCandidates(questionId, question, figure) {
  const now = Date.now();
  if (quizAudioCatalogCache.expiresAt <= now || !quizAudioCatalogCache.rows.length) {
    quizAudioCatalogLoading ||= forwardCatalogAction()
      .then(catalog => {
        quizAudioCatalogCache = {
          expiresAt: Date.now() + 5 * 60 * 1000,
          rows: getQuizRows(catalog).map(normalizeQuestionRow)
        };
      })
      .finally(() => { quizAudioCatalogLoading = null; });
    await quizAudioCatalogLoading;
  }

  const id = String(questionId ?? "").trim();
  const normalizedQuestion = normalizeQuizAudioQuestion(question);
  const requestedFigure = normalizeQuizAudioFigure(figure);
  const matches = quizAudioCatalogCache.rows.filter(item => {
    const sameId = id && String(item?.id ?? "").trim() === id;
    const sameQuestion = normalizedQuestion
      && normalizeQuizAudioQuestion(item?.question) === normalizedQuestion;
    return sameId || sameQuestion;
  });

  matches.sort((a, b) => {
    const aId = id && String(a?.id ?? "").trim() === id ? 1 : 0;
    const bId = id && String(b?.id ?? "").trim() === id ? 1 : 0;
    if (aId !== bId) return bId - aId;
    const aFigure = normalizeQuizAudioFigure(a?.figure) === requestedFigure ? 1 : 0;
    const bFigure = normalizeQuizAudioFigure(b?.figure) === requestedFigure ? 1 : 0;
    return bFigure - aFigure;
  });

  const candidates = [];
  const keys = new Set();
  for (const row of matches) {
    if (!row?.question) continue;
    const identity = getQuizAudioIdentity(row.question, row.figure);
    if (keys.has(identity.quizKey)) continue;
    keys.add(identity.quizKey);
    candidates.push({ identity, row });
  }
  return candidates;
}

async function resolveQuizAudioRow({ question, figure, questionId }) {
  const requestedIdentity = getQuizAudioIdentity(question, figure);
  const requestedResult = await findQuizAudioRow(requestedIdentity);
  if (requestedResult.row) return { identity: requestedIdentity, result: requestedResult };

  const canonicalCandidates = await getCanonicalQuizAudioCandidates(questionId, question, figure);
  let reviewCandidate = null;
  for (const { identity: canonicalIdentity } of canonicalCandidates) {
    if (canonicalIdentity.quizKey === requestedIdentity.quizKey) continue;
    const canonicalResult = await findQuizAudioRow(canonicalIdentity);
    if (canonicalResult.row) {
      return { identity: canonicalIdentity, result: canonicalResult };
    }
    if (!reviewCandidate && canonicalResult.requiresReview) {
      reviewCandidate = { identity: canonicalIdentity, result: canonicalResult };
    }
  }

  if (reviewCandidate) return reviewCandidate;
  return { identity: requestedIdentity, result: requestedResult };
}

async function attachCanonicalAudioSources(rows) {
  try {
    return await Promise.all(rows.map(async row => {
      const candidates = await getCanonicalQuizAudioCandidates(row.id, row.question, row.figure);
      const source = candidates[0]?.row;
      return source
        ? { ...row, audioQuestion: source.question, audioFigure: source.figure }
        : row;
    }));
  } catch (_) {
    // Audio metadata must never prevent the quiz itself from loading.
    return rows;
  }
}

async function moveLegacyQuizAudio(identity, { requireAmbiguous }) {
  const ambiguous = isLegacyQuizAudioAmbiguous(identity.legacyQuizKey);
  if (Boolean(requireAmbiguous) !== ambiguous) {
    const error = new Error(requireAmbiguous ? "quiz_audio_legacy_not_ambiguous" : "quiz_audio_requires_review");
    error.statusCode = 409;
    throw error;
  }
  if (ambiguous) {
    const candidates = quizAudioLegacyRegistry.collisions[identity.legacyQuizKey]?.candidates || [];
    if (!candidates.some(candidate => candidate.figureKey === identity.figureKey)) {
      const error = new Error("quiz_audio_figure_not_in_legacy_candidates");
      error.statusCode = 400;
      throw error;
    }
  }
  const existingTarget = await getQuizAudioRow(identity.quizKey);
  if (existingTarget) {
    if (ambiguous) {
      const error = new Error("quiz_audio_target_already_has_audio");
      error.statusCode = 409;
      throw error;
    }
    const sql = getQuizAudioDatabase();
    await sql`DELETE FROM quiz_audio_explanations WHERE quiz_key = ${identity.legacyQuizKey}`;
    return existingTarget;
  }
  const sql = getQuizAudioDatabase();
  const moved = await sql`
    WITH legacy AS (
      SELECT audio_key, audio_mime_type, audio_duration_ms, created_by, created_at, updated_at
      FROM quiz_audio_explanations
      WHERE quiz_key = ${identity.legacyQuizKey}
    ),
    upserted AS (
      INSERT INTO quiz_audio_explanations (
        quiz_key, audio_key, audio_mime_type, audio_duration_ms, created_by, created_at, updated_at
      )
      SELECT
        ${identity.quizKey}, audio_key, audio_mime_type, audio_duration_ms, created_by, created_at, NOW()
      FROM legacy
      ON CONFLICT (quiz_key) DO NOTHING
      RETURNING quiz_key
    )
    DELETE FROM quiz_audio_explanations
    WHERE quiz_key = ${identity.legacyQuizKey}
      AND EXISTS (SELECT 1 FROM upserted)
    RETURNING quiz_key
  `;
  if (!moved.length) {
    const existing = await getQuizAudioRow(identity.quizKey);
    if (!existing) {
      const error = new Error("quiz_audio_legacy_not_found");
      error.statusCode = 404;
      throw error;
    }
  }
  return getQuizAudioRow(identity.quizKey);
}

async function deleteQuizAudioAssociation(matchedQuizKey, row) {
  const sql = getQuizAudioDatabase();
  const deleted = await sql`
    DELETE FROM quiz_audio_explanations
    WHERE quiz_key = ${matchedQuizKey}
    RETURNING audio_key
  `;
  if (!deleted.length || !row?.audio_key) return false;
  const references = await sql`
    SELECT 1 FROM quiz_audio_explanations
    WHERE audio_key = ${row.audio_key}
    LIMIT 1
  `;
  if (!references.length) {
    await getQuizAudioStorage().send(new DeleteObjectCommand({
      Bucket: QUIZ_AUDIO_R2_BUCKET,
      Key: row.audio_key
    }));
  }
  return true;
}

async function retireSafeLegacyAssociation(identity) {
  if (isLegacyQuizAudioAmbiguous(identity.legacyQuizKey)) return;
  const sql = getQuizAudioDatabase();
  await sql`
    DELETE FROM quiz_audio_explanations
    WHERE quiz_key = ${identity.legacyQuizKey}
  `;
}

function calculateQuizResult(correctAnswers, totalQuestions) {
  const total = Number(totalQuestions) || 0;
  const correct = Number(correctAnswers) || 0;

  if (total <= 0) {
    return {
      passed: false,
      passingScore: 0,
      scorePercentage: 0
    };
  }

  const passingScore = Math.ceil(total * PASSING_SCORE_RATIO);
  const scorePercentage = Math.round((correct / total) * 100);

  return {
    passed: correct >= passingScore,
    passingScore,
    scorePercentage
  };
}

function getCorrectAnswerCount(result) {
  const candidates = [
    result?.correct,
    result?.correctAnswers,
    result?.correctCount
  ];

  for (const value of candidates) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }

  return 0;
}

function normalizeQuizResult(result, totalQuestions) {
  const correctAnswers = getCorrectAnswerCount(result);
  const calculated = calculateQuizResult(correctAnswers, totalQuestions);

  return {
    ...result,
    correct: correctAnswers,
    totalQuestions: Number(totalQuestions) || 0,
    passingScore: calculated.passingScore,
    scorePercentage: calculated.scorePercentage,
    passed: calculated.passed
  };
}

function normalizePhoneNumber(phone) {
  if (!phone) return "";

  let normalized = String(phone).replace(/\D/g, "");
  if (normalized.startsWith("39") && normalized.length === 12) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

function isAdminPhone(phone) {
  const normalizedPhone = normalizePhoneNumber(phone);
  return normalizedPhone !== "" && ADMIN_PHONE_NUMBERS.includes(normalizedPhone);
}

function isConfigured() {
  return ACCESS_GAS_URL && ACCESS_GAS_SECRET && QUIZ_GAS_URL && QUIZ_PROXY_SECRET && SESSION_SECRET;
}

function getAuthError(authData) {
  const error = authData?.error || authData?.status;
  if (["expired", "not_found", "device_replaced", "device_mismatch", "device_limit", "busy", "temporary_error", "server_error"].includes(error)) return error;
  return "unauthorized";
}

function getAuthStatusCode(error) {
  if (error === "busy" || error === "temporary_error" || error === "server_error") return 503;
  if (error === "device_replaced" || error === "device_mismatch" || error === "device_limit") return 403;
  return 401;
}

function isAuthSuccess(authData) {
  return authData?.success === true || authData?.status === "success";
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function signTokenPayload(encodedPayload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");
}

function createSignedToken({ phone, deviceId, purpose, ttlMs, role = "user" }) {
  const expiresAt = Date.now() + ttlMs;
  const payload = {
    phone,
    deviceId,
    purpose,
    role: role === "admin" ? "admin" : "user",
    exp: expiresAt
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signTokenPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt
  };
}

function verifySignedToken(token, { phone, deviceId, purpose }) {
  if (!token || !phone || !deviceId) return { ok: false, error: "unauthorized" };

  const parts = String(token).split(".");
  if (parts.length !== 2) return { ok: false, error: "unauthorized" };

  const [encodedPayload, signature] = parts;
  const expectedSignature = signTokenPayload(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { ok: false, error: "unauthorized" };
  }

  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return { ok: false, error: "unauthorized" };
  }

  if (payload.purpose !== purpose || payload.phone !== phone || payload.deviceId !== deviceId) {
    return { ok: false, error: "unauthorized" };
  }

  if (!payload.exp || payload.exp <= Date.now()) {
    return { ok: false, error: purpose === "quiz" ? "quiz_session_expired" : "token_expired" };
  }

  return { ok: true, payload };
}

async function ensureAccess({ phone, deviceId, accessToken, forceValidate = false }) {
  const tokenStatus = verifySignedToken(accessToken, { phone, deviceId, purpose: "access" });
  if (tokenStatus.ok && !forceValidate) {
    return { ok: true, usedAccessToken: true, role: tokenStatus.payload.role || "user" };
  }

  const authData = await validateAccess(phone, deviceId);
  if (!isAuthSuccess(authData)) {
    const error = getAuthError(authData);
    return { ok: false, error, statusCode: getAuthStatusCode(error) };
  }

  if (tokenStatus.ok) {
    return { ok: true, usedAccessToken: true, role: tokenStatus.payload.role || "user" };
  }

  const access = createSignedToken({
    phone,
    deviceId,
    purpose: "access",
    ttlMs: ACCESS_TOKEN_TTL_MS,
    role: "user"
  });

  return {
    ok: true,
    usedAccessToken: false,
    role: "user",
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt
  };
}

async function validateAccess(phone, deviceId) {
  if (!phone || !deviceId) return { success: false, error: "unauthorized" };

  const response = await fetch(ACCESS_GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: ACCESS_GAS_SECRET,
      action: "validate",
      phone,
      deviceId,
      registerDevice: false
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok && !data) return { success: false, error: "unauthorized" };
  return data || { success: false, error: "unauthorized" };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: "invalid_quiz_response" };
  }
}

function getRequestData(req) {
  const query = req.query || {};
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  return {
    action: body.action || query.action,
    phone: body.phone || query.phone,
    deviceId: body.deviceId || query.deviceId,
    accessToken: body.accessToken || query.accessToken,
    quizSessionToken: body.quizSessionToken || query.quizSessionToken,
    chapters: body.chapters || query.chapters,
    mode: body.mode || query.mode,
    text: body.text || query.text,
    question: body.question || query.question,
    questionId: body.questionId ?? query.questionId,
    figure: Object.prototype.hasOwnProperty.call(body, "figure") ? body.figure : query.figure,
    quizAudioIdentityVersion: body.quizAudioIdentityVersion ?? query.quizAudioIdentityVersion,
    audioDurationMs: body.audioDurationMs || query.audioDurationMs,
    audioBase64: body.audioBase64 || query.audioBase64,
    audioMimeType: body.audioMimeType || query.audioMimeType,
    answers: body.answers
  };
}

function hasValidRequestShape({ phone, deviceId, text, chapters }) {
  if (!/^\d{6,15}$/.test(String(phone || "").replace(/\D/g, ""))) return false;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(String(deviceId || ""))) return false;
  if (String(text || "").length > 500) return false;
  if (String(chapters || "").length > 200) return false;
  return true;
}

async function forwardGetAction({ action, chapters, text, mode, limit, count, questionCount }) {
  const params = new URLSearchParams({
    action,
    token: QUIZ_PROXY_SECRET
  });

  if (action === "getQuiz") params.set("draw", crypto.randomUUID());
  if (chapters) params.set("chapters", chapters);
  if (text) params.set("text", text);
  if (mode) params.set("mode", mode);
  if (limit !== undefined && limit !== null) params.set("limit", String(limit));
  if (count !== undefined && count !== null) params.set("count", String(count));
  if (questionCount !== undefined && questionCount !== null) params.set("questionCount", String(questionCount));

  const url = `${QUIZ_GAS_URL}?${params.toString()}`;
  const response = await fetch(url);
  return readJsonResponse(response);
}

async function forwardCatalogAction() {
  const params = new URLSearchParams({
    action: "getCatalog",
    token: QUIZ_PROXY_SECRET
  });
  const response = await fetch(`${QUIZ_GAS_URL}?${params.toString()}`);
  return readJsonResponse(response);
}

function getQuizRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.quiz)) return data.quiz;
  if (Array.isArray(data?.questions)) return data.questions;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

function getExamModeConfig(mode) {
  return EXAM_QUIZ_MODES[String(mode || "").toLowerCase()] || null;
}

function getMappedValue(row, names) {
  if (!row || typeof row !== "object") return undefined;

  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }

  const entries = Object.entries(row);
  for (const name of names) {
    const match = entries.find(([key]) => String(key).trim().toLowerCase() === String(name).trim().toLowerCase());
    if (match) return match[1];
  }

  return undefined;
}

function normalizeQuestionRow(row) {
  // image_0.png defines these database headers; image_1.png identifies the exam rows from index 790+.
  return {
    ...row,
    id: getMappedValue(row, ["id", "ID", "quiz_id", "quizId"]),
    chapter: getMappedValue(row, ["chapter", "Chapter", "capitolo", "Capitolo"]),
    question: getMappedValue(row, ["question", "Question", "q", "domanda", "Domanda"]),
    figure: getMappedValue(row, ["figure", "Figure", "img", "image", "Image", "figura", "Figura"]),
    correct: getMappedValue(row, ["correct", "Correct", "answer", "risposta", "Risposta"]),
    question_bd: getMappedValue(row, ["question_bd", "Question_BD", "questionBD", "questionBd"]),
    explanations: getMappedValue(row, ["explanations", "Explanations"])
  };
}

function isExamQuestion(question) {
  const chapter = String(question?.chapter ?? "").trim().toLowerCase();
  const id = String(question?.id ?? "").trim().toLowerCase();
  return chapter === EXAM_CHAPTER_CODE || chapter === "exam" || /^exam_q\d+$/.test(id);
}

function shuffleQuestions(questions) {
  const shuffled = questions.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getExamPool(rows) {
  const normalized = rows.map(normalizeQuestionRow);
  const examRows = normalized.filter(isExamQuestion);

  if (examRows.length >= EXAM_POOL_SIZE) {
    return examRows.slice(0, EXAM_POOL_SIZE);
  }

  if (normalized.length === EXAM_POOL_SIZE) {
    return normalized;
  }

  if (normalized.length >= EXAM_POOL_START_INDEX + EXAM_POOL_SIZE) {
    return normalized.slice(EXAM_POOL_START_INDEX, EXAM_POOL_START_INDEX + EXAM_POOL_SIZE);
  }

  return examRows;
}

function mergeQuestionsById(existingRows, nextRows) {
  const merged = existingRows.slice();
  const seen = new Set(merged.map((question, index) => String(question?.id ?? `__index_${index}`)));

  nextRows.forEach((question, index) => {
    const key = String(question?.id ?? `__new_${merged.length}_${index}`);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(question);
  });

  return merged;
}

async function fetchExamRows(action, text, modeConfig) {
  let collected = [];
  let lastReceived = 0;
  const targetCount = modeConfig.questionCount;

  const firstData = await forwardGetAction({
    action,
    chapters: EXAM_CHAPTER_CODE,
    text,
    mode: modeConfig.mode,
    limit: modeConfig.questionCount,
    count: modeConfig.questionCount,
    questionCount: modeConfig.questionCount
  });
  collected = mergeQuestionsById(collected, getExamPool(getQuizRows(firstData)));
  lastReceived = collected.length;

  for (let attempt = 0; attempt < EXAM_POOL_FETCH_ATTEMPTS && collected.length < targetCount; attempt += EXAM_POOL_FETCH_BATCH_SIZE) {
    const remainingAttempts = EXAM_POOL_FETCH_ATTEMPTS - attempt;
    const batchSize = Math.min(EXAM_POOL_FETCH_BATCH_SIZE, remainingAttempts);
    const batch = await Promise.all(
      Array.from({ length: batchSize }, () => forwardGetAction({
        action,
        chapters: EXAM_CHAPTER_CODE,
        text,
        mode: modeConfig.mode,
        limit: targetCount,
        count: targetCount,
        questionCount: targetCount
      }))
    );

    batch.forEach(data => {
      const rows = getExamPool(getQuizRows(data));
      lastReceived = rows.length;
      collected = mergeQuestionsById(collected, rows);
    });
  }

  if (collected.length < targetCount) {
    console.warn("[api/quiz] incomplete exam pool", {
      expected: targetCount,
      collected: collected.length,
      lastReceived
    });
  }

  return collected;
}

function buildExamQuiz(rows, modeConfig) {
  const pool = getExamPool(rows);
  const requiredCount = modeConfig.questionCount === EXAM_POOL_SIZE ? EXAM_POOL_SIZE : modeConfig.questionCount;

  if (pool.length < requiredCount) {
    const err = new Error("invalid_exam_pool");
    err.statusCode = 502;
    err.details = { expected: requiredCount, received: pool.length };
    throw err;
  }

  return shuffleQuestions(pool).slice(0, modeConfig.questionCount);
}

async function forwardCheckQuiz(answers) {
  const url = `${QUIZ_GAS_URL}?action=checkQuiz`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: QUIZ_PROXY_SECRET,
      answers
    })
  });

  return readJsonResponse(response);
}

function getReviewItems(result = {}) {
  const reviewArrays = [
    result.review,
    result.details,
    result.answers,
    result.results,
    result.questions
  ];

  return reviewArrays.find(Array.isArray) || [];
}

function normalizeAnswerValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value === 1 || value === true) return 1;
  if (value === 0 || value === false) return 0;

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "vero", "v", "yes"].includes(normalized)) return 1;
  if (["0", "false", "falso", "f", "no"].includes(normalized)) return 0;

  return null;
}

function getReviewCorrectAnswer(item, submittedAnswer) {
  const explicitAnswer = normalizeAnswerValue(
    item?.correctAnswer ??
    item?.correct_answer ??
    item?.rightAnswer ??
    item?.right_answer ??
    item?.solution ??
    item?.soluzione ??
    item?.risposta_corretta
  );
  if (explicitAnswer !== null) return explicitAnswer;

  if (typeof item?.correct === "boolean") {
    return item.correct ? submittedAnswer : (submittedAnswer === 1 ? 0 : 1);
  }

  if (typeof item?.isCorrect === "boolean") {
    return item.isCorrect ? submittedAnswer : (submittedAnswer === 1 ? 0 : 1);
  }

  return null;
}

async function addAdminCorrectAnswers(quiz) {
  if (!Array.isArray(quiz) || quiz.length === 0) return quiz;

  const submittedAnswer = 1;
  const probeAnswers = quiz.map((question, index) => ({
    id: question?.id ?? index,
    answer: submittedAnswer
  }));

  const result = await forwardCheckQuiz(probeAnswers);
  const reviewItems = getReviewItems(result);
  if (!reviewItems.length) return quiz;

  const answerById = new Map();
  reviewItems.forEach((item, index) => {
    const correctAnswer = getReviewCorrectAnswer(item, submittedAnswer);
    if (correctAnswer === null) return;

    if (item?.id !== undefined && item?.id !== null) {
      answerById.set(String(item.id), correctAnswer);
    }
    answerById.set(`__index_${index}`, correctAnswer);
  });

  return quiz.map((question, index) => {
    const correctAnswer = answerById.get(String(question?.id)) ?? answerById.get(`__index_${index}`);
    if (correctAnswer === undefined) return question;

    return {
      ...question,
      admin_correct_answer: correctAnswer
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!isConfigured()) {
    return res.status(500).json({ error: "missing_server_config" });
  }

  try {
    const {
      action,
      phone,
      deviceId,
      accessToken,
      quizSessionToken,
      chapters,
      mode,
      text,
      question,
      questionId,
      figure,
      quizAudioIdentityVersion,
      audioDurationMs,
      audioBase64,
      audioMimeType,
      answers
    } = getRequestData(req);
    console.log("[api/quiz] action", action);

    if (!action) {
      return res.status(400).json({ error: "missing_action" });
    }

    if (!hasValidRequestShape({ phone, deviceId, text, chapters })) {
      return res.status(400).json({ error: "invalid_request" });
    }

    if (req.method === "GET" && action === "getQuiz") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("CDN-Cache-Control", "no-store");
      res.setHeader("Vercel-CDN-Cache-Control", "no-store");

      const access = await ensureAccess({ phone, deviceId, accessToken, forceValidate: true });
      if (!access.ok) {
        return res.status(access.statusCode || 401).json({ error: access.error || "unauthorized" });
      }

      const modeConfig = getExamModeConfig(mode);
      const data = modeConfig ? null : await forwardGetAction({ action, chapters, text });
      // Keep Quiz UI authorization consistent with requireQuizAudioAccess:
      // a validated admin role or a server allow-listed phone is sufficient.
      const admin = access.role === "admin" || isAdminPhone(phone);
      // Use the same canonical row shape as the Magic Book audio catalog.
      // Audio identity depends on question + figure, so the two entry points
      // must never interpret sheet column aliases differently.
      let rows = (modeConfig ? await fetchExamRows(action, text, modeConfig) : getQuizRows(data))
        .map(normalizeQuestionRow);
      if (!modeConfig) rows = await attachCanonicalAudioSources(rows);
      const quiz = modeConfig ? buildExamQuiz(rows, modeConfig) : rows;
      const quizForClient = admin ? await addAdminCorrectAnswers(quiz) : quiz;
      const quizSession = createSignedToken({
        phone,
        deviceId,
        purpose: "quiz",
        ttlMs: modeConfig?.sessionTtlMs || QUIZ_SESSION_TOKEN_TTL_MS,
        role: admin ? "admin" : "user"
      });

      return res.status(200).json({
        quiz: quizForClient,
        isAdmin: admin,
        mode: modeConfig?.mode || "default",
        title: modeConfig?.title || "Quiz",
        timerMinutes: modeConfig?.timerMinutes || 20,
        quizSessionToken: quizSession.token,
        quizSessionTokenExpiresAt: quizSession.expiresAt,
        ...(access.accessToken ? {
          accessToken: access.accessToken,
          accessTokenExpiresAt: access.accessTokenExpiresAt
        } : {})
      });
    }

    if (req.method === "POST" && action === "getMagicBookCatalog") {
      await requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly: true });
      const data = await forwardCatalogAction();
      const rows = getQuizRows(data).map(normalizeQuestionRow).filter(row => row.id && row.question);
      if (rows.length !== 788) {
        const error = new Error("magic_catalog_count_mismatch");
        error.statusCode = 409;
        error.details = { expected: 788, received: rows.length };
        throw error;
      }
      return res.status(200).json({
        ok: true,
        source: data?.source || "magicph-google-sheet-quiz",
        count: rows.length,
        quiz: rows.map(row => ({
          id: row.id,
          chapter: row.chapter,
          question: row.question,
          figure: row.figure,
          correct: row.correct
        }))
      });
    }

    if (req.method === "POST" && action === "getQuizAudioStatus") {
      const { isAdmin } = await requireQuizAudioAccess({ phone, deviceId, accessToken });
      assertQuizAudioIdentityVersion(quizAudioIdentityVersion);
      const { identity, result } = await resolveQuizAudioRow({ question, figure, questionId });
      return res.status(200).json({
        ok: true,
        available: Boolean(result.row),
        requiresReview: result.requiresReview,
        isAdmin,
        quizKey: identity.quizKey,
        durationMs: result.row?.audio_duration_ms || null
      });
    }

    if (req.method === "POST" && action === "getQuizAudioAdminOverview") {
      await requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly: true });
      const sql = getQuizAudioDatabase();
      const rows = await sql`SELECT quiz_key FROM quiz_audio_explanations`;
      const quizKeys = rows.map(row => String(row.quiz_key));
      return res.status(200).json({
        ok: true,
        quizKeys,
        legacyReviewKeys: quizKeys.filter(key => isLegacyQuizAudioAmbiguous(key))
      });
    }

    if (req.method === "POST" && action === "getQuizAudioPlayback") {
      await requireQuizAudioAccess({ phone, deviceId, accessToken });
      assertQuizAudioIdentityVersion(quizAudioIdentityVersion);
      const { result } = await resolveQuizAudioRow({ question, figure, questionId });
      if (result.requiresReview) return res.status(409).json({ error: "quiz_audio_requires_review" });
      if (!result.row) return res.status(404).json({ error: "quiz_audio_not_found" });

      const audioUrl = await getSignedUrl(
        getQuizAudioStorage(),
        new GetObjectCommand({ Bucket: QUIZ_AUDIO_R2_BUCKET, Key: result.row.audio_key }),
        { expiresIn: 10 * 60 }
      );
      return res.status(200).json({
        ok: true,
        audioUrl,
        mimeType: result.row.audio_mime_type || "audio/webm",
        durationMs: result.row.audio_duration_ms || null
      });
    }

    if (req.method === "POST" && action === "getQuizAudioBlob") {
      await requireQuizAudioAccess({ phone, deviceId, accessToken });
      assertQuizAudioIdentityVersion(quizAudioIdentityVersion);
      const { result } = await resolveQuizAudioRow({ question, figure, questionId });
      if (result.requiresReview) return res.status(409).json({ error: "quiz_audio_requires_review" });
      if (!result.row) return res.status(404).json({ error: "quiz_audio_not_found" });

      const object = await getQuizAudioStorage().send(new GetObjectCommand({
        Bucket: QUIZ_AUDIO_R2_BUCKET,
        Key: result.row.audio_key
      }));
      const bytes = await object.Body.transformToByteArray();
      res.statusCode = 200;
      res.setHeader("Content-Type", result.row.audio_mime_type || "audio/webm");
      res.setHeader("Content-Length", String(bytes.byteLength));
      res.setHeader("X-Audio-Duration-Ms", String(result.row.audio_duration_ms || 0));
      res.setHeader("Access-Control-Expose-Headers", "X-Audio-Duration-Ms");
      return res.end(Buffer.from(bytes));
    }

    if (req.method === "POST" && action === "getLegacyQuizAudioBlob") {
      await requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly: true });
      assertQuizAudioIdentityVersion(quizAudioIdentityVersion);
      const identity = getQuizAudioIdentity(question, figure);
      if (!isLegacyQuizAudioAmbiguous(identity.legacyQuizKey)) {
        return res.status(409).json({ error: "quiz_audio_legacy_not_ambiguous" });
      }
      const row = await getQuizAudioRow(identity.legacyQuizKey);
      if (!row) return res.status(404).json({ error: "quiz_audio_legacy_not_found" });
      const object = await getQuizAudioStorage().send(new GetObjectCommand({
        Bucket: QUIZ_AUDIO_R2_BUCKET,
        Key: row.audio_key
      }));
      const bytes = await object.Body.transformToByteArray();
      res.statusCode = 200;
      res.setHeader("Content-Type", row.audio_mime_type || "audio/webm");
      res.setHeader("Content-Length", String(bytes.byteLength));
      res.setHeader("X-Audio-Duration-Ms", String(row.audio_duration_ms || 0));
      res.setHeader("Access-Control-Expose-Headers", "X-Audio-Duration-Ms");
      return res.end(Buffer.from(bytes));
    }

    if (req.method === "POST" && (action === "assignLegacyQuizAudio" || action === "migrateLegacyQuizAudio")) {
      await requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly: true });
      assertQuizAudioIdentityVersion(quizAudioIdentityVersion);
      const identity = getQuizAudioIdentity(question, figure);
      const row = await moveLegacyQuizAudio(identity, { requireAmbiguous: action === "assignLegacyQuizAudio" });
      return res.status(200).json({ ok: true, quizKey: identity.quizKey, migrated: Boolean(row) });
    }

    if (req.method === "POST" && action === "saveQuizAudio") {
      const { access } = await requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly: true });
      assertQuizAudioIdentityVersion(quizAudioIdentityVersion);
      const encodedAudio = String(audioBase64 || "").replace(/^data:[^,]+,/, "");
      if (!encodedAudio || encodedAudio.length > 4 * 1024 * 1024 || !/^[a-z0-9+/=]+$/i.test(encodedAudio)) {
        const error = new Error("invalid_audio_payload");
        error.statusCode = 400;
        throw error;
      }
      const audioBuffer = Buffer.from(encodedAudio, "base64");
      if (!audioBuffer.length || audioBuffer.length > 3 * 1024 * 1024) {
        const error = new Error("audio_too_large_max_3mb");
        error.statusCode = 413;
        throw error;
      }

      const identity = getQuizAudioIdentity(question, figure);
      const { quizKey, audioKey } = identity;
      const mimeType = normalizeQuizAudioMimeType(audioMimeType);
      await getQuizAudioStorage().send(new PutObjectCommand({
        Bucket: QUIZ_AUDIO_R2_BUCKET,
        Key: audioKey,
        Body: audioBuffer,
        ContentType: mimeType
      }));

      const durationMs = Math.max(0, Math.min(60 * 60 * 1000, Math.round(Number(audioDurationMs) || 0))) || null;
      const sql = getQuizAudioDatabase();
      await sql`
        INSERT INTO quiz_audio_explanations (
          quiz_key, audio_key, audio_mime_type, audio_duration_ms, created_by, created_at, updated_at
        ) VALUES (
          ${quizKey}, ${audioKey}, ${mimeType}, ${durationMs}, ${String(phone || access.role || "")}, NOW(), NOW()
        )
        ON CONFLICT (quiz_key) DO UPDATE SET
          audio_key = EXCLUDED.audio_key,
          audio_mime_type = EXCLUDED.audio_mime_type,
          audio_duration_ms = EXCLUDED.audio_duration_ms,
          created_by = EXCLUDED.created_by,
          updated_at = NOW()
      `;
      await retireSafeLegacyAssociation(identity);
      return res.status(200).json({ ok: true, quizKey });
    }

    if (req.method === "POST" && action === "createQuizAudioUpload") {
      await requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly: true });
      assertQuizAudioIdentityVersion(quizAudioIdentityVersion);
      const { quizKey, audioKey } = getQuizAudioIdentity(question, figure);
      const uploadUrl = await getSignedUrl(
        getQuizAudioStorage(),
        new PutObjectCommand({
          Bucket: QUIZ_AUDIO_R2_BUCKET,
          Key: audioKey,
          ContentType: "audio/webm"
        }),
        { expiresIn: 5 * 60 }
      );
      return res.status(200).json({ ok: true, quizKey, audioKey, uploadUrl, uploadContentType: "audio/webm" });
    }

    if (req.method === "POST" && action === "confirmQuizAudioUpload") {
      await requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly: true });
      assertQuizAudioIdentityVersion(quizAudioIdentityVersion);
      const identity = getQuizAudioIdentity(question, figure);
      const { quizKey, audioKey } = identity;
      const uploadedObject = await getQuizAudioStorage().send(new HeadObjectCommand({
        Bucket: QUIZ_AUDIO_R2_BUCKET,
        Key: audioKey
      }));
      const uploadedBytes = Number(uploadedObject.ContentLength || 0);
      if (!uploadedBytes || uploadedBytes > 20 * 1024 * 1024 || !String(uploadedObject.ContentType || "").startsWith("audio/")) {
        const error = new Error("invalid_uploaded_audio");
        error.statusCode = 400;
        throw error;
      }

      const durationMs = Math.max(0, Math.min(60 * 60 * 1000, Math.round(Number(audioDurationMs) || 0))) || null;
      const sql = getQuizAudioDatabase();
      await sql`
        INSERT INTO quiz_audio_explanations (
          quiz_key, audio_key, audio_mime_type, audio_duration_ms, created_by, created_at, updated_at
        ) VALUES (
          ${quizKey}, ${audioKey}, ${normalizeQuizAudioMimeType(uploadedObject.ContentType)}, ${durationMs}, ${String(phone || "")}, NOW(), NOW()
        )
        ON CONFLICT (quiz_key) DO UPDATE SET
          audio_key = EXCLUDED.audio_key,
          audio_mime_type = EXCLUDED.audio_mime_type,
          audio_duration_ms = EXCLUDED.audio_duration_ms,
          created_by = EXCLUDED.created_by,
          updated_at = NOW()
      `;
      await retireSafeLegacyAssociation(identity);
      return res.status(200).json({ ok: true, quizKey });
    }

    if (req.method === "POST" && action === "deleteQuizAudio") {
      await requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly: true });
      assertQuizAudioIdentityVersion(quizAudioIdentityVersion);
      const identity = getQuizAudioIdentity(question, figure);
      const result = await findQuizAudioRow(identity);
      if (result.requiresReview) return res.status(409).json({ error: "quiz_audio_requires_review" });
      const deleted = result.row
        ? await deleteQuizAudioAssociation(result.matchedQuizKey, result.row)
        : false;
      return res.status(200).json({ ok: true, deleted, quizKey: identity.quizKey });
    }

    if (req.method === "GET" && GET_ACTIONS.has(action)) {
      const quizSession = verifySignedToken(quizSessionToken, { phone, deviceId, purpose: "quiz" });
      if (!quizSession.ok) {
        return res.status(401).json({ error: quizSession.error });
      }

      const data = await forwardGetAction({ action, chapters, text });
      return res.status(200).json(data);
    }

    if (req.method === "POST" && action === "checkQuiz") {
      console.log("[api/quiz] checkQuiz answers", Array.isArray(answers) ? answers.length : "invalid");

      const quizSession = verifySignedToken(quizSessionToken, { phone, deviceId, purpose: "quiz" });
      if (!quizSession.ok) {
        return res.status(401).json({ error: quizSession.error });
      }

      if (!Array.isArray(answers) || answers.length < 1 || answers.length > 100) {
        return res.status(400).json({ error: "missing_answers" });
      }

      const data = await forwardCheckQuiz(answers);
      const normalizedResult = normalizeQuizResult(data, answers.length);
      return res.status(200).json(normalizedResult);
    }

    return res.status(400).json({ error: "invalid_action" });
  } catch (err) {
    console.error("[api/quiz] server_error", err);
    return res.status(err.statusCode || 500).json({
      error: err.message || "server_error",
      ...(err.details ? { details: err.details } : {})
    });
  }
}
