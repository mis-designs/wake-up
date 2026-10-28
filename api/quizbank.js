import { authorizeQuizBankPreview, quizBankSession, serveQuizBankMedia } from "./quiz.js";
import { loadQuizBank, quizBankAudioIdentity } from "./quizbank-catalog.mjs";

const actions = {
  GET: new Set(["catalog", "getStudyQuiz", "getItalianAudio", "getBengaliAudio", "getTTS"]),
  POST: new Set(["refreshQuizSession", "getQuizAudioStatus", "getQuizAudioBlob", "getQuizAudioPlayback"])
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (!actions[req.method]) return res.status(405).json({ error: "method_not_allowed" });
  try {
    // Authorize every call BEFORE touching R2 or the shared process cache.
    const { data, access } = await authorizeQuizBankPreview(req);
    if (!actions[req.method].has(data.action)) return res.status(400).json({ error: "invalid_action" });
    const renewed = access.accessToken ? { accessToken: access.accessToken, accessTokenExpiresAt: access.accessTokenExpiresAt } : {};
    if (access.accessToken) {
      res.setHeader("X-Access-Token", access.accessToken);
      res.setHeader("X-Access-Token-Expires", String(access.accessTokenExpiresAt));
    }
    if (data.action === "refreshQuizSession") return res.status(200).json({ ok: true, ...quizBankSession(data), ...renewed });
    if (data.action === "getTTS") return await serveQuizBankMedia({ action: data.action, text: data.text }, res);
    const sheet = Number(data.chapters);
    if (data.action === "getStudyQuiz" && (!Number.isInteger(sheet) || sheet < 1 || sheet > 50)) {
      return res.status(400).json({ error: "quizbank_invalid_sheet" });
    }
    const bank = await loadQuizBank();
    if (data.action === "catalog") {
      return res.status(200).json({ ok: true, preview: true, questionCount: 1500,
        sheets: bank.sheets.map((rows, index) => ({ number: index + 1, count: rows.length })), ...renewed });
    }
    if (data.action === "getStudyQuiz") {
      return res.status(200).json({ ok: true, sheet, quiz: bank.sheets[sheet - 1], ...quizBankSession(data), ...renewed });
    }
    const row = bank.byId.get(String(data.questionId || ""));
    if (!row) return res.status(404).json({ error: "quizbank_question_not_found" });
    // Ignore submitted text/figure/answer when choosing the explanation or IT/BN source.
    return await serveQuizBankMedia({ action: data.action, row, identity: quizBankAudioIdentity(row) }, res);
  } catch (error) {
    const status = Number(error.statusCode) || 503;
    const known = new Set(["quizbank_not_configured", "quizbank_archive_unavailable", "quizbank_invalid_archive"]);
    return res.status(status).json({ error: status < 500 || known.has(error.message) ? error.message : "service_unavailable" });
  }
}
