import crypto from "crypto";
import { verifyGuestTrialToken } from "./trialAccess.js";
import { fetchUpstream, publicApiError } from "./upstream-fetch.mjs";
import {
  applyCuratedQuizTranslation,
  getCuratedQuizTranslation
} from "./quiz-translations.mjs";

const QUIZ_GAS_URL = process.env.QUIZ_GAS_URL;
const QUIZ_PROXY_SECRET = process.env.QUIZ_PROXY_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
export const TRIAL_CHAPTERS = new Set(["2", "4"]);
const TRIAL_TOKEN_TTL_MS = 71 * 60 * 60 * 1000;
const TRIAL_SERVICE_ACTIONS = new Set(["getItalianAudio", "getBengaliAudio", "getTTS"]);

export function isAllowedTrialChapter(value) {
  return TRIAL_CHAPTERS.has(String(value || "").trim());
}

export function hasOnlyIssuedTrialQuestions(answers, issuedIds) {
  if (!Array.isArray(answers) || answers.length < 1 || answers.length > 30) return false;
  const allowed = new Set((issuedIds || []).map(String));
  return answers.every(answer => allowed.has(String(answer?.id)) && [0, 1, null].includes(answer?.answer));
}

export function isAllowedTrialService(action) {
  return TRIAL_SERVICE_ACTIONS.has(String(action || ""));
}

function textHash(value) {
  return crypto.createHash("sha256").update(String(value || "").trim()).digest("base64url");
}

function sign(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verify(token, trialId) {
  const [encoded, signature, extra] = String(token || "").split(".");
  if (!encoded || !signature || extra) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.purpose !== "trial" || payload.trialId !== trialId || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function callQuizBackend(action, options = {}) {
  if (action === "getQuiz") {
    const params = new URLSearchParams({
      action: "getQuiz",
      token: QUIZ_PROXY_SECRET,
      chapters: options.chapter,
      limit: "30",
      count: "30",
      questionCount: "30",
      draw: crypto.randomUUID()
    });
    const response = await fetchUpstream(`${QUIZ_GAS_URL}?${params}`, {}, { service: "trial_quiz", timeoutMs: 15_000 });
    return response.json();
  }

  if (isAllowedTrialService(action)) {
    const params = new URLSearchParams({ action, token: QUIZ_PROXY_SECRET, text: options.text });
    const response = await fetchUpstream(`${QUIZ_GAS_URL}?${params}`, {}, { service: "trial_audio", timeoutMs: 15_000 });
    return response.json();
  }

  const response = await fetchUpstream(`${QUIZ_GAS_URL}?action=checkQuiz`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: QUIZ_PROXY_SECRET, answers: options.answers })
  }, { service: "trial_grading", timeoutMs: 15_000 });
  return response.json();
}

function getRows(data) {
  if (Array.isArray(data)) return data;
  return data?.quiz || data?.questions || data?.rows || [];
}

export default async function handler(req, res) {
  if (!QUIZ_GAS_URL || !QUIZ_PROXY_SECRET || !SESSION_SECRET) return res.status(500).json({ error: "missing_server_config" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const action = body.action || req.query?.action;
  const trialId = String(body.trialId || req.query?.trialId || "");
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(trialId)) return res.status(400).json({ error: "invalid_trial" });

  try {
    if (req.method === "GET" && action === "getQuiz") {
      const chapter = String(req.query?.chapter || "").trim();
      const guest = verifyGuestTrialToken(req.query?.guestKey, trialId);
      if (!guest || !guest.chapters.includes(Number(chapter))) return res.status(401).json({ error: "invalid_guest_key" });
      if (!isAllowedTrialChapter(chapter)) return res.status(403).json({ error: "trial_chapter_forbidden" });
      const data = await callQuizBackend("getQuiz", { chapter });
      const quiz = getRows(data)
        .filter(question => String(question?.chapter ?? "").trim() === chapter)
        .slice(0, 30)
        .map(({ id, chapter: rowChapter, question, figure, question_bd, explanations }) =>
          applyCuratedQuizTranslation({ id, chapter: rowChapter, question, figure, question_bd, explanations })
        );
      if (!quiz.length) return res.status(502).json({ error: "invalid_quiz_response" });
      const expiresAt = Date.now() + TRIAL_TOKEN_TTL_MS;
      const trialToken = sign({
        purpose: "trial",
        trialId,
        chapter,
        ids: quiz.map(q => String(q.id)),
        textHashes: quiz.map(q => textHash(q.question)),
        exp: expiresAt
      });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ quiz, trialToken, trialTokenExpiresAt: expiresAt, timerMinutes: 20, title: `Prova gratuita · Capitolo ${chapter}` });
    }

    if (req.method === "GET" && isAllowedTrialService(action)) {
      const payload = verify(req.query?.trialToken, trialId);
      const text = String(req.query?.text || "").trim();
      const questionId = String(req.query?.questionId || "").trim();
      if (!payload) return res.status(401).json({ error: "trial_session_expired" });
      if (!isAllowedTrialChapter(payload.chapter) || !text || text.length > 500 || !payload.textHashes?.includes(textHash(text))) {
        return res.status(403).json({ error: "trial_content_forbidden" });
      }
      const curatedTranslation = action === "getBengaliAudio"
        ? getCuratedQuizTranslation({ id: questionId, question: text })
        : "";
      const data = curatedTranslation
        ? await callQuizBackend("getTTS", { text: curatedTranslation })
        : await callQuizBackend(action, { text });
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.status(200).json(curatedTranslation ? {
        ...data,
        translation: curatedTranslation,
        translationSource: "curated"
      } : data);
    }

    if (req.method === "POST" && action === "checkQuiz") {
      const payload = verify(body.trialToken, trialId);
      if (!payload) return res.status(401).json({ error: "trial_session_expired" });
      if (!isAllowedTrialChapter(payload.chapter) || !hasOnlyIssuedTrialQuestions(body.answers, payload.ids)) {
        return res.status(403).json({ error: "trial_questions_forbidden" });
      }
      const result = await callQuizBackend("checkQuiz", { answers: body.answers });
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: "invalid_action" });
  } catch (error) {
    console.error("[api/trial]", error);
    const { statusCode, error: publicError } = publicApiError(error);
    if (statusCode === 503) res.setHeader("Retry-After", "5");
    return res.status(statusCode).json({ error: publicError });
  }
}
