import crypto from "crypto";
import { createRequire } from "module";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { neon } from "@neondatabase/serverless";
import { applyQuizFigureCorrections } from "./quiz-figure-corrections.mjs";
import { getExplanationFiguresFromObjectKeys } from "./quiz-explanation-availability.mjs";
import { detectQuizAudioMimeType, normalizeQuizAudioMimeType } from "./audio-mime.mjs";
import { fetchUpstream, publicApiError, withOperationalTimeout } from "./upstream-fetch.mjs";
import { normalizeStudyChapter, selectStudyChapterRows } from "./study-quiz.mjs";
import { quizAudioCatalog } from "./quiz-audio-catalog.mjs";
import { matchesQuizAudioIdentityTicket } from "./quiz-audio-ticket.mjs";
import {
  applyCuratedQuizTranslation,
  getCuratedQuizTranslation
} from "./quiz-translations.mjs";
import {
  LOCAL_EXAM_ROWS,
  LOCAL_MAGIC_BOOK_ROWS,
  addLocalAdminAnswers,
  getLocalCatalog,
  gradeLocalQuiz,
  hideLocalCorrectAnswers,
  selectLocalQuizRows
} from "./local-quiz-bank.mjs";

const require = createRequire(import.meta.url);
const {
  QUIZ_AUDIO_IDENTITY_VERSION,
  getQuizAudioIdentity,
  normalizeQuizAudioFigure
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
const EXPLANATION_R2_BUCKET = process.env.EXPLANATION_R2_BUCKET
  || process.env.R2_BUCKET_NAME
  || process.env.R2_BUCKET
  || QUIZ_AUDIO_R2_BUCKET;
const EXPLANATION_R2_ACCOUNT_ID = process.env.EXPLANATION_R2_ACCOUNT_ID
  || process.env.R2_ACCOUNT_ID
  || QUIZ_AUDIO_R2_ACCOUNT_ID;
const EXPLANATION_R2_ACCESS_KEY_ID = process.env.EXPLANATION_R2_ACCESS_KEY_ID
  || process.env.R2_ACCESS_KEY_ID
  || QUIZ_AUDIO_R2_ACCESS_KEY_ID;
const EXPLANATION_R2_SECRET_ACCESS_KEY = process.env.EXPLANATION_R2_SECRET_ACCESS_KEY
  || process.env.R2_SECRET_ACCESS_KEY
  || QUIZ_AUDIO_R2_SECRET_ACCESS_KEY;
const QUIZ_AUDIO_DATABASE_URL = process.env.DATABASE_URL || process.env.STORAGE_URL || process.env.NEON_DATABASE_URL;

const GET_ACTIONS = new Set(["getQuiz", "getExplanationFigures", "getItalianAudio", "getBengaliAudio", "getTTS"]);
const BENGALI_TEXT_PATTERN = /[\u0980-\u09ff]/u;
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const QUIZ_SESSION_TOKEN_TTL_MS = 30 * 60 * 1000;
const PASSING_SCORE_RATIO = 0.9;
const EXAM_CHAPTER_CODE = "0";
const EXAM_POOL_SIZE = 80;
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
let explanationStorage = null;
const quizAudioObjectAvailabilityCache = new Map();
const QUIZ_AUDIO_OBJECT_CACHE_TTL_MS = 5 * 60 * 1000;
const EXPLANATION_FIGURES_CACHE_TTL_MS = 5 * 60 * 1000;
let explanationFiguresCache = { expiresAt: 0, figures: [] };
let explanationFiguresLoading = null;
const magicBookQuestionById = new Map(
  quizAudioCatalog.rows.map(row => [String(row.id ?? "").trim(), String(row.question ?? "").trim()])
);

function adminAudioIdentity(row) {
  const identity = quizAudioCatalog.resolve({ questionId: row.id, question: row.question, figure: row.figure });
  return { ...identity, legacySafe: identity.legacySafe && !isLegacyQuizAudioAmbiguous(identity.legacyQuizKey) };
}

export function getAdminItalianQuestionText(questionId) {
  const id = String(questionId ?? "").trim();
  if (!id) return "";
  return magicBookQuestionById.get(id) || "";
}

export function isExactCatalogQuestion(questionId, questionText) {
  const expected = magicBookQuestionById.get(String(questionId ?? "").trim()) || "";
  return Boolean(expected && expected === String(questionText ?? "").trim());
}

function isQuizAudioConfigured() {
  return Boolean(
    QUIZ_AUDIO_DATABASE_URL &&
    isQuizAudioStorageConfigured()
  );
}

function isQuizAudioStorageConfigured() {
  return Boolean(
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
  if (!isQuizAudioStorageConfigured()) {
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

function getExplanationStorage() {
  if (!EXPLANATION_R2_BUCKET
    || !EXPLANATION_R2_ACCOUNT_ID
    || !EXPLANATION_R2_ACCESS_KEY_ID
    || !EXPLANATION_R2_SECRET_ACCESS_KEY) {
    const error = new Error("explanation_r2_not_configured");
    error.statusCode = 503;
    throw error;
  }
  if (!explanationStorage) {
    explanationStorage = new S3Client({
      region: "auto",
      forcePathStyle: true,
      endpoint: `https://${EXPLANATION_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: EXPLANATION_R2_ACCESS_KEY_ID,
        secretAccessKey: EXPLANATION_R2_SECRET_ACCESS_KEY
      }
    });
  }
  return explanationStorage;
}

async function listExplanationFigures() {
  if (explanationFiguresCache.expiresAt > Date.now()) return explanationFiguresCache.figures;
  if (explanationFiguresLoading) return explanationFiguresLoading;

  explanationFiguresLoading = (async () => {
    const keys = [];
    let continuationToken;
    do {
      const page = await getExplanationStorage().send(new ListObjectsV2Command({
        Bucket: EXPLANATION_R2_BUCKET,
        Prefix: "explanations/",
        ContinuationToken: continuationToken
      }));
      for (const object of page.Contents || []) {
        if (object?.Key) keys.push(object.Key);
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    const figures = getExplanationFiguresFromObjectKeys(keys);
    explanationFiguresCache = {
      figures,
      expiresAt: Date.now() + EXPLANATION_FIGURES_CACHE_TTL_MS
    };
    return figures;
  })().finally(() => { explanationFiguresLoading = null; });

  return explanationFiguresLoading;
}

async function readQuizAudioObject(row) {
  const object = await getQuizAudioStorage().send(new GetObjectCommand({
    Bucket: QUIZ_AUDIO_R2_BUCKET,
    Key: row.audio_key
  }));
  const body = object.Body;
  if (!body) throw new Error("quiz_audio_body_missing");
  if (typeof body.transformToByteArray === "function") return body.transformToByteArray();
  if (typeof body.arrayBuffer === "function") return new Uint8Array(await body.arrayBuffer());
  if (Symbol.asyncIterator in Object(body)) {
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    return new Uint8Array(Buffer.concat(chunks));
  }
  throw new Error("quiz_audio_body_unsupported");
}

function isMissingQuizAudioObject(error) {
  const code = String(error?.name || error?.Code || error?.code || "").toLowerCase();
  const status = Number(error?.$metadata?.httpStatusCode || error?.statusCode || 0);
  return status === 404 || code === "nosuchkey" || code === "notfound";
}

async function hasQuizAudioObject(row) {
  const audioKey = String(row?.audio_key || "");
  if (!audioKey) return false;
  const cached = quizAudioObjectAvailabilityCache.get(audioKey);
  if (cached && cached.expiresAt > Date.now()) return cached.available;
  try {
    const object = await getQuizAudioStorage().send(new HeadObjectCommand({
      Bucket: QUIZ_AUDIO_R2_BUCKET,
      Key: audioKey
    }));
    const available = Number(object.ContentLength || 0) > 0;
    quizAudioObjectAvailabilityCache.set(audioKey, {
      available,
      expiresAt: Date.now() + QUIZ_AUDIO_OBJECT_CACHE_TTL_MS
    });
    return available;
  } catch (error) {
    if (!isMissingQuizAudioObject(error)) throw error;
    quizAudioObjectAvailabilityCache.set(audioKey, {
      available: false,
      expiresAt: Date.now() + QUIZ_AUDIO_OBJECT_CACHE_TTL_MS
    });
    return false;
  }
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
  const isAdmin = access.role === "admin";
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

async function findQuizAudioRow(identity) {
  const current = await getQuizAudioRow(identity.quizKey);
  if (current) return { row: current, matchedQuizKey: identity.quizKey, legacy: false, requiresReview: false };
  if (identity.legacySafe === false) return { row: null, matchedQuizKey: "", legacy: false, requiresReview: false };
  const legacy = await getQuizAudioRow(identity.legacyQuizKey);
  if (!legacy) return { row: null, matchedQuizKey: "", legacy: false, requiresReview: false };
  const requiresReview = isLegacyQuizAudioAmbiguous(identity.legacyQuizKey);
  if (requiresReview) {
    return { row: null, matchedQuizKey: identity.legacyQuizKey, legacy: true, requiresReview: true };
  }
  return { row: legacy, matchedQuizKey: identity.legacyQuizKey, legacy: true, requiresReview };
}

async function getCanonicalQuizAudioCandidates(questionId, question, figure) {
  try {
    const identity = quizAudioCatalog.resolve({ questionId, question, figure });
    const row = quizAudioCatalog.rows.find(row => String(row.id) === String(questionId))
      || quizAudioCatalog.rows.find(row => quizAudioCatalog.identityFor(row).quizKey === identity.quizKey);
    return [{ identity, row }];
  } catch (_) { return []; }
}

async function resolveQuizAudioRow({ question, figure, questionId }) {
  const identity = quizAudioCatalog.resolve({ questionId, question, figure });
  return { identity, result: await findQuizAudioRow(identity) };
}

function verifyQuizAudioIdentityToken({ token, phone, deviceId, questionId, question, figure }) {
  const verified = verifySignedToken(token, { phone, deviceId, purpose: "quiz-audio" });
  if (!verified.ok) return null;

  const identity = quizAudioCatalog.resolve({ questionId, question, figure });
  return matchesQuizAudioIdentityTicket(verified.payload, {
    questionId,
    quizKey: identity.quizKey,
    legacyQuizKey: identity.legacyQuizKey
  }) ? identity : null;
}

async function resolveQuizAudioRequest({
  question,
  figure,
  questionId,
  audioIdentityToken,
  phone,
  deviceId
}) {
  const trustedIdentity = verifyQuizAudioIdentityToken({
    token: audioIdentityToken,
    phone,
    deviceId,
    questionId,
    question,
    figure
  });

  if (trustedIdentity) {
    const trustedResult = await findQuizAudioRow(trustedIdentity);
    // A signed request proves its identity, never the contents of old audio.
    return { identity: trustedIdentity, result: trustedResult };
  }

  return resolveQuizAudioRow({ question, figure, questionId });
}

function attachQuizAudioIdentityTokens(rows, { phone, deviceId, ttlMs }) {
  return rows.map(row => {
    const audioQuestion = String(row?.audioQuestion || row?.question || "");
    if (!audioQuestion) return row;
    const audioFigure = row?.audioFigure ?? row?.figure ?? "";
    const identity = quizAudioCatalog.resolve({ questionId: row.id, question: audioQuestion, figure: audioFigure });
    const signed = createSignedToken({
      phone,
      deviceId,
      purpose: "quiz-audio",
      ttlMs,
      claims: {
        questionId: String(row?.id ?? ""),
        quizKey: identity.quizKey,
        legacyQuizKey: identity.legacyQuizKey
      }
    });
    return { ...row, audioIdentityToken: signed.token };
  });
}

async function attachCanonicalAudioSources(rows) {
  try {
    return await Promise.all(rows.map(async row => {
      // Single-chapter Magic Book rows have already been verified against the
      // audio DB. Preserve their exact catalog question/figure pair instead
      // of trying to infer another row with a similar text or id.
      if (row.audioQuestion) return row;
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
  if (identity.legacySafe === false) {
    const error = new Error("quiz_audio_requires_review"); error.statusCode = 409; throw error;
  }
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
  quizAudioObjectAvailabilityCache.delete(String(row.audio_key));
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
  if (identity.legacySafe === false) return;
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

const ADMIN_PHONE_NUMBERS = new Set(
  (process.env.ADMIN_PHONE_NUMBERS || "")
    .split(/[\s,;]+/)
    .map(normalizePhoneNumber)
    .filter(Boolean)
);

function isAdminPhone(phone) {
  return ADMIN_PHONE_NUMBERS.has(normalizePhoneNumber(phone));
}

function isConfigured() {
  return ACCESS_GAS_URL && ACCESS_GAS_SECRET && SESSION_SECRET;
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

function createSignedToken({ phone, deviceId, purpose, ttlMs, role = "user", claims = {} }) {
  const expiresAt = Date.now() + ttlMs;
  const payload = {
    ...(claims && typeof claims === "object" ? claims : {}),
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

  const serializedToken = String(token);
  if (serializedToken.length > 4096) return { ok: false, error: "unauthorized" };

  const parts = serializedToken.split(".");
  if (parts.length !== 2) return { ok: false, error: "unauthorized" };

  const [encodedPayload, signature] = parts;
  if (encodedPayload.length > 3072 || signature.length > 128) {
    return { ok: false, error: "unauthorized" };
  }
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
    return {
      ok: false,
      error: purpose === "quiz" ? "quiz_session_expired" : "token_expired",
      signatureValid: true,
      payload
    };
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

  // An expired token with a valid signature can preserve the admin role only
  // while the phone is still in the server-side admin allow-list. Forged,
  // mismatched, and ordinary user tokens always renew as users.
  const renewedRole = tokenStatus.signatureValid
    && tokenStatus.payload?.role === "admin"
    && isAdminPhone(phone)
    ? "admin"
    : "user";
  const access = createSignedToken({
    phone,
    deviceId,
    purpose: "access",
    ttlMs: ACCESS_TOKEN_TTL_MS,
    role: renewedRole
  });

  return {
    ok: true,
    usedAccessToken: false,
    role: renewedRole,
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt
  };
}

async function validateAccess(phone, deviceId) {
  if (!phone || !deviceId) return { success: false, error: "unauthorized" };

  const response = await fetchUpstream(ACCESS_GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: ACCESS_GAS_SECRET,
      action: "validate",
      phone,
      deviceId,
      registerDevice: false
    })
  }, { service: "access_service", timeoutMs: 10_000 });

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
  let body = req.body || {};
  if (typeof req.body === "string") {
    try {
      body = JSON.parse(req.body || "{}");
    } catch {
      const error = new Error("invalid_json");
      error.statusCode = 400;
      throw error;
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("invalid_request");
    error.statusCode = 400;
    throw error;
  }
  const authorization = String(req.headers?.authorization || "");
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const headerAccessToken = bearerMatch?.[1] || "";
  const headerQuizSessionToken = String(req.headers?.["x-quiz-session"] || "");

  return {
    action: body.action || query.action,
    phone: body.phone || query.phone,
    deviceId: body.deviceId || query.deviceId,
    // Headers keep credentials out of URLs, browser history and request logs.
    // Query support remains as a temporary compatibility fallback for old clients.
    accessToken: body.accessToken || headerAccessToken || query.accessToken,
    quizSessionToken: body.quizSessionToken || headerQuizSessionToken || query.quizSessionToken,
    chapters: body.chapters || query.chapters,
    mode: body.mode || query.mode,
    text: body.text || query.text,
    question: body.question || query.question,
    questionId: body.questionId ?? query.questionId,
    figure: Object.prototype.hasOwnProperty.call(body, "figure") ? body.figure : query.figure,
    quizAudioIdentityVersion: body.quizAudioIdentityVersion ?? query.quizAudioIdentityVersion,
    audioIdentityToken: body.audioIdentityToken || query.audioIdentityToken,
    audioDurationMs: body.audioDurationMs || query.audioDurationMs,
    audioBase64: body.audioBase64 || query.audioBase64,
    audioMimeType: body.audioMimeType || query.audioMimeType,
    answers: body.answers
  };
}

function hasValidRequestShape({ phone, deviceId, text, chapters, question, figure, questionId, accessToken, quizSessionToken, audioIdentityToken }) {
  if (!/^\d{6,15}$/.test(String(phone || "").replace(/\D/g, ""))) return false;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(String(deviceId || ""))) return false;
  if (String(text || "").length > 500) return false;
  if (String(chapters || "").length > 200) return false;
  if (String(question || "").length > 1_500) return false;
  if (String(figure || "").length > 120) return false;
  if (String(questionId || "").length > 128) return false;
  if ([accessToken, quizSessionToken, audioIdentityToken].some(value => String(value || "").length > 4096)) return false;
  return true;
}

async function forwardGetAction({ action, chapters, text, mode, limit, count, questionCount }) {
  if (!QUIZ_GAS_URL || !QUIZ_PROXY_SECRET) {
    const error = new Error("quiz_media_service_not_configured");
    error.statusCode = 503;
    throw error;
  }
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
  const response = await fetchUpstream(url, {}, { service: "quiz_service" });
  return readJsonResponse(response);
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
  const normalized = applyQuizFigureCorrections({
    id: getMappedValue(row, ["id", "ID", "quiz_id", "quizId"]),
    chapter: getMappedValue(row, ["chapter", "Chapter", "capitolo", "Capitolo"]),
    question: getMappedValue(row, ["question", "Question", "q", "domanda", "Domanda"]),
    figure: getMappedValue(row, ["figure", "Figure", "img", "image", "Image", "figura", "Figura"]),
    correct: getMappedValue(row, ["correct", "Correct", "answer", "risposta", "Risposta"]),
    question_bd: getMappedValue(row, ["question_bd", "Question_BD", "questionBD", "questionBd"])
  });
  return applyCuratedQuizTranslation(normalized);
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
  return normalized.filter(isExamQuestion).slice(0, EXAM_POOL_SIZE);
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

async function addAdminCorrectAnswers(quiz) {
  return addLocalAdminAnswers(quiz);
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
      audioIdentityToken,
      audioDurationMs,
      audioBase64,
      audioMimeType,
      answers
    } = getRequestData(req);
    console.log("[api/quiz] action", action);

    if (!action) {
      return res.status(400).json({ error: "missing_action" });
    }

    if (!hasValidRequestShape({
      phone,
      deviceId,
      text,
      chapters,
      question,
      figure,
      questionId,
      accessToken,
      quizSessionToken,
      audioIdentityToken
    })) {
      return res.status(400).json({ error: "invalid_request" });
    }

    if (req.method === "POST" && action === "refreshQuizSession") {
      res.setHeader("Cache-Control", "no-store");
      const access = await ensureAccess({ phone, deviceId, accessToken });
      if (!access.ok) {
        return res.status(access.statusCode || 401).json({ error: access.error || "unauthorized" });
      }

      const modeConfig = getExamModeConfig(mode);
      const quizSession = createSignedToken({
        phone,
        deviceId,
        purpose: "quiz",
        ttlMs: modeConfig?.sessionTtlMs || QUIZ_SESSION_TOKEN_TTL_MS,
        role: access.role === "admin" ? "admin" : "user"
      });

      return res.status(200).json({
        ok: true,
        quizSessionToken: quizSession.token,
        quizSessionTokenExpiresAt: quizSession.expiresAt,
        ...(access.accessToken ? {
          accessToken: access.accessToken,
          accessTokenExpiresAt: access.accessTokenExpiresAt
        } : {})
      });
    }

    if (req.method === "GET" && action === "getExplanationFigures") {
      const access = await ensureAccess({ phone, deviceId, accessToken });
      if (!access.ok) {
        return res.status(access.statusCode || 401).json({ error: access.error || "unauthorized" });
      }
      const figures = await listExplanationFigures();
      res.setHeader("Cache-Control", "private, max-age=60");
      return res.status(200).json({
        ok: true,
        count: figures.length,
        figures,
        ...(access.accessToken ? {
          accessToken: access.accessToken,
          accessTokenExpiresAt: access.accessTokenExpiresAt
        } : {})
      });
    }

    if (req.method === "GET" && action === "getQuiz") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("CDN-Cache-Control", "no-store");
      res.setHeader("Vercel-CDN-Cache-Control", "no-store");

      // A valid short-lived signed access token is sufficient here. This keeps
      // quiz loading independent of a fresh Google Apps Script round trip.
      const access = await ensureAccess({ phone, deviceId, accessToken });
      if (!access.ok) {
        return res.status(access.statusCode || 401).json({ error: access.error || "unauthorized" });
      }

      const modeConfig = getExamModeConfig(mode);
      // Admin authority comes only from a valid signed admin token.
      const admin = access.role === "admin";
      let rows = (modeConfig ? LOCAL_EXAM_ROWS : selectLocalQuizRows(chapters)).map(normalizeQuestionRow);
      if (!modeConfig) {
        rows = shuffleQuestions(rows).slice(0, 30);
        rows = await attachCanonicalAudioSources(rows);
      }
      const quiz = modeConfig ? buildExamQuiz(rows, modeConfig) : rows;
      const quizWithAdminAnswers = admin ? await addAdminCorrectAnswers(quiz) : quiz;
      // Correct answers remain server-side and are never serialized for normal users.
      const quizForClient = hideLocalCorrectAnswers(quizWithAdminAnswers);
      const sessionTtlMs = modeConfig?.sessionTtlMs || QUIZ_SESSION_TOKEN_TTL_MS;
      const quizWithAudioTokens = modeConfig
        ? quizForClient
        : attachQuizAudioIdentityTokens(quizForClient, { phone, deviceId, ttlMs: sessionTtlMs });
      const quizSession = createSignedToken({
        phone,
        deviceId,
        purpose: "quiz",
        ttlMs: sessionTtlMs,
        role: admin ? "admin" : "user"
      });

      return res.status(200).json({
        quiz: quizWithAudioTokens,
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

    if (req.method === "GET" && action === "getStudyQuiz") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("CDN-Cache-Control", "no-store");
      res.setHeader("Vercel-CDN-Cache-Control", "no-store");

      const chapter = normalizeStudyChapter(chapters);
      if (!chapter) return res.status(400).json({ error: "invalid_study_chapter" });

      const access = await ensureAccess({ phone, deviceId, accessToken });
      if (!access.ok) {
        return res.status(access.statusCode || 401).json({ error: access.error || "unauthorized" });
      }

      const catalogRows = LOCAL_MAGIC_BOOK_ROWS.map(normalizeQuestionRow);
      const chapterRows = selectStudyChapterRows(catalogRows, chapter);
      if (!chapterRows.length) return res.status(404).json({ error: "study_chapter_empty" });
      const quiz = chapterRows.map(row => ({
        id: row.id,
        chapter: row.chapter,
        question: row.question,
        figure: row.figure,
        correct: row.correct,
        question_bd: row.question_bd,
        questionTranslationSource: row.questionTranslationSource || "",
        audioQuestion: row.audioQuestion,
        audioFigure: row.audioFigure
      }));

      const quizSession = createSignedToken({
        phone,
        deviceId,
        purpose: "quiz",
        ttlMs: QUIZ_SESSION_TOKEN_TTL_MS,
        role: access.role === "admin" ? "admin" : "user"
      });
      const quizWithAudioTokens = attachQuizAudioIdentityTokens(quiz, {
        phone,
        deviceId,
        ttlMs: QUIZ_SESSION_TOKEN_TTL_MS
      });

      return res.status(200).json({
        ok: true,
        chapter,
        count: quiz.length,
        quiz: quizWithAudioTokens,
        quizSessionToken: quizSession.token,
        quizSessionTokenExpiresAt: quizSession.expiresAt,
        ...(access.accessToken ? {
          accessToken: access.accessToken,
          accessTokenExpiresAt: access.accessTokenExpiresAt
        } : {})
      });
    }

    if (req.method === "POST" && (action === "getMagicBookCatalog" || action === "getAdminAudioCatalog")) {
      await requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly: true });
      const data = getLocalCatalog();
      const fullAudioCatalog = action === "getAdminAudioCatalog";
      const rows = (fullAudioCatalog ? quizAudioCatalog.rows : data.quiz).map(normalizeQuestionRow).filter(row => row.id && row.question);
      const expectedCount = fullAudioCatalog ? 868 : 788;
      if (rows.length !== expectedCount) {
        const error = new Error("magic_catalog_count_mismatch");
        error.statusCode = 409;
        error.details = { expected: expectedCount, received: rows.length };
        throw error;
      }
      return res.status(200).json({
        ok: true,
        source: data?.source || "local-quiz-bank",
        count: rows.length,
        quiz: rows.map(row => ({
          id: row.id,
          chapter: row.chapter,
          question: row.question,
          figure: row.figure,
          correct: row.correct,
          ...(fullAudioCatalog ? { audioIdentity: adminAudioIdentity(row) } : {})
        }))
      });
    }

    if (req.method === "POST" && action === "getAdminItalianQuestionAudio") {
      await requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly: true });
      const canonicalQuestion = getAdminItalianQuestionText(questionId);
      if (!canonicalQuestion) {
        return res.status(404).json({ error: "quiz_question_not_found" });
      }

      // The browser sends only the catalog id. The server chooses the text so
      // this admin-only route cannot be turned into an arbitrary TTS proxy.
      const data = await forwardGetAction({ action: "getItalianAudio", text: canonicalQuestion });
      if (!data?.audio || typeof data.audio !== "string") {
        const error = new Error("italian_audio_unavailable");
        error.statusCode = 502;
        throw error;
      }
      return res.status(200).json({ ok: true, audio: data.audio });
    }

    if (req.method === "POST" && action === "getQuizAudioStatus") {
      const { isAdmin } = await requireQuizAudioAccess({ phone, deviceId, accessToken });
      assertQuizAudioIdentityVersion(quizAudioIdentityVersion);
      try {
        const { identity, result } = await withOperationalTimeout(
          resolveQuizAudioRequest({
            question,
            figure,
            questionId,
            audioIdentityToken,
            phone,
            deviceId
          }),
          { service: "audio_status", timeoutMs: 8_000 }
        );
        const available = Boolean(result.row) && !result.requiresReview && await withOperationalTimeout(
          hasQuizAudioObject(result.row),
          { service: "audio_object_status", timeoutMs: 4_000 }
        );
        return res.status(200).json({
          ok: true,
          available,
          requiresReview: result.requiresReview,
          isAdmin,
          quizKey: identity.quizKey,
          durationMs: result.row?.audio_duration_ms || null
        });
      } catch (error) {
        // Audio is optional: a temporary Neon/R2/catalog issue must not turn
        // every question navigation into a 500 or interrupt the quiz.
        console.warn("[api/quiz] audio_status_unavailable", {
          code: error?.message || "unknown",
          questionId: String(questionId ?? "").slice(0, 80)
        });
        return res.status(200).json({
          ok: true,
          available: false,
          requiresReview: false,
          temporaryUnavailable: true,
          isAdmin
        });
      }
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
      const { result } = await resolveQuizAudioRequest({
        question,
        figure,
        questionId,
        audioIdentityToken,
        phone,
        deviceId
      });
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
      const { result } = await resolveQuizAudioRequest({
        question,
        figure,
        questionId,
        audioIdentityToken,
        phone,
        deviceId
      });
      if (result.requiresReview) return res.status(409).json({ error: "quiz_audio_requires_review" });
      if (!result.row) return res.status(404).json({ error: "quiz_audio_not_found" });

      const bytes = await readQuizAudioObject(result.row);
      const mimeType = detectQuizAudioMimeType(bytes, result.row.audio_mime_type);
      res.statusCode = 200;
      res.setHeader("Content-Type", mimeType);
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
      const bytes = await readQuizAudioObject(row);
      const mimeType = detectQuizAudioMimeType(bytes, row.audio_mime_type);
      res.statusCode = 200;
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Length", String(bytes.byteLength));
      res.setHeader("X-Audio-Duration-Ms", String(row.audio_duration_ms || 0));
      res.setHeader("Access-Control-Expose-Headers", "X-Audio-Duration-Ms");
      return res.end(Buffer.from(bytes));
    }

    if (req.method === "POST" && (action === "assignLegacyQuizAudio" || action === "migrateLegacyQuizAudio")) {
      await requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly: true });
      assertQuizAudioIdentityVersion(quizAudioIdentityVersion);
      const identity = action === "assignLegacyQuizAudio"
        ? getQuizAudioIdentity(question, figure)
        : quizAudioCatalog.resolve({ questionId, question, figure });
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

      const identity = quizAudioCatalog.resolve({ questionId, question, figure });
      const { quizKey, audioKey } = identity;
      const mimeType = normalizeQuizAudioMimeType(audioMimeType);
      await getQuizAudioStorage().send(new PutObjectCommand({
        Bucket: QUIZ_AUDIO_R2_BUCKET,
        Key: audioKey,
        Body: audioBuffer,
        ContentType: mimeType
      }));
      quizAudioObjectAvailabilityCache.delete(audioKey);

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
      const { quizKey, audioKey } = quizAudioCatalog.resolve({ questionId, question, figure });
      const uploadContentType = normalizeQuizAudioMimeType(audioMimeType);
      const uploadUrl = await getSignedUrl(
        getQuizAudioStorage(),
        new PutObjectCommand({
          Bucket: QUIZ_AUDIO_R2_BUCKET,
          Key: audioKey,
          ContentType: uploadContentType
        }),
        { expiresIn: 5 * 60 }
      );
      return res.status(200).json({ ok: true, quizKey, audioKey, uploadUrl, uploadContentType });
    }

    if (req.method === "POST" && action === "confirmQuizAudioUpload") {
      await requireQuizAudioAccess({ phone, deviceId, accessToken, adminOnly: true });
      assertQuizAudioIdentityVersion(quizAudioIdentityVersion);
      const identity = quizAudioCatalog.resolve({ questionId, question, figure });
      const { quizKey, audioKey } = identity;
      const uploadedObject = await getQuizAudioStorage().send(new HeadObjectCommand({
        Bucket: QUIZ_AUDIO_R2_BUCKET,
        Key: audioKey
      }));
      quizAudioObjectAvailabilityCache.delete(audioKey);
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
      const identity = quizAudioCatalog.resolve({ questionId, question, figure });
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

      if (action === "getBengaliAudio" && !isExactCatalogQuestion(questionId, text)) {
        return res.status(403).json({ error: "translation_content_forbidden" });
      }
      if (action === "getTTS" && !BENGALI_TEXT_PATTERN.test(String(text || ""))) {
        return res.status(400).json({ error: "invalid_bengali_text" });
      }

      const curatedTranslation = action === "getBengaliAudio"
        ? getCuratedQuizTranslation({ id: questionId, question: text })
        : "";
      const data = await forwardGetAction({
        action: curatedTranslation ? "getTTS" : action,
        chapters,
        text: curatedTranslation || text
      });
      if (curatedTranslation) {
        return res.status(200).json({
          ...data,
          translation: curatedTranslation,
          translationSource: "curated"
        });
      }
      return res.status(200).json(action === "getBengaliAudio" ? {
        ...data,
        translationSource: "automatic"
      } : data);
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

      const data = gradeLocalQuiz(answers);
      const normalizedResult = normalizeQuizResult(data, answers.length);
      return res.status(200).json(normalizedResult);
    }

    return res.status(400).json({ error: "invalid_action" });
  } catch (err) {
    const { statusCode, error: publicError } = publicApiError(err);
    const log = statusCode >= 500 ? console.error : console.warn;
    log("[api/quiz] server_error", {
      code: err.message || "server_error",
      statusCode,
      details: err.details || null
    });
    if (statusCode === 503) res.setHeader("Retry-After", "5");
    return res.status(statusCode).json({
      error: publicError
    });
  }
}
