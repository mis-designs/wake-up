import crypto from "crypto";

const ACCESS_GAS_URL = process.env.GAS_ACCESS_URL;
const ACCESS_GAS_SECRET = process.env.GAS_SECRET;
const QUIZ_GAS_URL = process.env.QUIZ_GAS_URL;
const QUIZ_PROXY_SECRET = process.env.QUIZ_PROXY_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_PHONE_NUMBERS = (process.env.ADMIN_PHONE_NUMBERS || "")
  .split(",")
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
  if (["expired", "not_found", "device_replaced", "device_mismatch", "device_limit"].includes(error)) return error;
  return "unauthorized";
}

function getAuthStatusCode(error) {
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

function createSignedToken({ phone, deviceId, purpose, ttlMs }) {
  const expiresAt = Date.now() + ttlMs;
  const payload = { phone, deviceId, purpose, exp: expiresAt };
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
    return { ok: true, usedAccessToken: true };
  }

  const authData = await validateAccess(phone, deviceId);
  if (!isAuthSuccess(authData)) {
    const error = getAuthError(authData);
    return { ok: false, error, statusCode: getAuthStatusCode(error) };
  }

  if (tokenStatus.ok) {
    return { ok: true, usedAccessToken: true };
  }

  const access = createSignedToken({
    phone,
    deviceId,
    purpose: "access",
    ttlMs: ACCESS_TOKEN_TTL_MS
  });

  return {
    ok: true,
    usedAccessToken: false,
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
    answers: body.answers
  };
}

async function forwardGetAction({ action, chapters, text, mode, limit, count, questionCount }) {
  const params = new URLSearchParams({
    action,
    token: QUIZ_PROXY_SECRET
  });

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
    id: getMappedValue(row, ["id", "ID"]),
    chapter: getMappedValue(row, ["chapter", "Chapter"]),
    question: getMappedValue(row, ["question", "Question"]),
    figure: getMappedValue(row, ["figure", "Figure"]),
    correct: getMappedValue(row, ["correct", "Correct"]),
    question_bd: getMappedValue(row, ["question_bd", "Question_BD", "questionBD", "questionBd"])
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

async function fetchExamRows(action, text) {
  let collected = [];
  let lastReceived = 0;

  for (let attempt = 0; attempt < EXAM_POOL_FETCH_ATTEMPTS && collected.length < EXAM_POOL_SIZE; attempt += EXAM_POOL_FETCH_BATCH_SIZE) {
    const remainingAttempts = EXAM_POOL_FETCH_ATTEMPTS - attempt;
    const batchSize = Math.min(EXAM_POOL_FETCH_BATCH_SIZE, remainingAttempts);
    const batch = await Promise.all(
      Array.from({ length: batchSize }, () => forwardGetAction({
        action,
        chapters: EXAM_CHAPTER_CODE,
        text,
        mode: "exam",
        limit: EXAM_POOL_SIZE,
        count: EXAM_POOL_SIZE,
        questionCount: EXAM_POOL_SIZE
      }))
    );

    batch.forEach(data => {
      const rows = getExamPool(getQuizRows(data));
      lastReceived = rows.length;
      collected = mergeQuestionsById(collected, rows);
    });
  }

  if (collected.length < EXAM_POOL_SIZE) {
    console.warn("[api/quiz] incomplete exam pool", {
      expected: EXAM_POOL_SIZE,
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
    const { action, phone, deviceId, accessToken, quizSessionToken, chapters, mode, text, answers } = getRequestData(req);
    console.log("[api/quiz] action", action);

    if (!action) {
      return res.status(400).json({ error: "missing_action" });
    }

    if (req.method === "GET" && action === "getQuiz") {
      const access = await ensureAccess({ phone, deviceId, accessToken, forceValidate: true });
      if (!access.ok) {
        return res.status(access.statusCode || 401).json({ error: access.error || "unauthorized" });
      }

      const modeConfig = getExamModeConfig(mode);
      const data = modeConfig ? null : await forwardGetAction({ action, chapters, text });
      const admin = isAdminPhone(phone);
      const rows = modeConfig ? await fetchExamRows(action, text) : getQuizRows(data);
      const quiz = modeConfig ? buildExamQuiz(rows, modeConfig) : rows;
      const quizForClient = admin ? await addAdminCorrectAnswers(quiz) : quiz;
      const quizSession = createSignedToken({
        phone,
        deviceId,
        purpose: "quiz",
        ttlMs: modeConfig?.sessionTtlMs || QUIZ_SESSION_TOKEN_TTL_MS
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

      if (!Array.isArray(answers)) {
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
