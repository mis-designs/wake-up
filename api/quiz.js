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
    text: body.text || query.text,
    answers: body.answers
  };
}

async function forwardGetAction({ action, chapters, text }) {
  const params = new URLSearchParams({
    action,
    token: QUIZ_PROXY_SECRET
  });

  if (chapters) params.set("chapters", chapters);
  if (text) params.set("text", text);

  const url = `${QUIZ_GAS_URL}?${params.toString()}`;
  const response = await fetch(url);
  return readJsonResponse(response);
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

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!isConfigured()) {
    return res.status(500).json({ error: "missing_server_config" });
  }

  try {
    const { action, phone, deviceId, accessToken, quizSessionToken, chapters, text, answers } = getRequestData(req);
    console.log("[api/quiz] action", action);

    if (!action) {
      return res.status(400).json({ error: "missing_action" });
    }

    if (req.method === "GET" && action === "getQuiz") {
      const access = await ensureAccess({ phone, deviceId, accessToken, forceValidate: true });
      if (!access.ok) {
        return res.status(access.statusCode || 401).json({ error: access.error || "unauthorized" });
      }

      const data = await forwardGetAction({ action, chapters, text });
      const quizSession = createSignedToken({
        phone,
        deviceId,
        purpose: "quiz",
        ttlMs: QUIZ_SESSION_TOKEN_TTL_MS
      });

      return res.status(200).json({
        quiz: Array.isArray(data) ? data : [],
        isAdmin: isAdminPhone(phone),
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
    return res.status(500).json({ error: "server_error" });
  }
}
