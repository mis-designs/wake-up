import { authorizeQuizBankPreview, quizBankSession, serveQuizBankMedia, saveQuizBankAudio, serveQuizTheory, serveQuizVideo, isQuizVideoMaster } from "./quiz.js";
import { loadQuizBank, quizBankStorageIdentity, quizBankContentToken, matchesQuizBankContentToken } from "./quizbank-catalog.mjs";
import { isQuizTheoryAction } from "../lib/quiz-theory-response.mjs";
import { decodeQuizAudioUpload } from "../lib/quiz-audio-upload.mjs";
import { buildQuizBankAttempt, gradeQuizBankAttempt, normalizeQuizBankSheet } from "../lib/quizbank-attempt.mjs";

const actions = {
  GET: new Set(["catalog", "getStudyQuiz", "getQuiz", "getItalianAudio", "getBengaliAudio", "getTTS"]),
  POST: new Set(["getQuizVideo", "createQuizVideoUpload", "uploadQuizVideoChunk", "confirmQuizVideoUpload", "deleteQuizVideo", "cleanupQuizVideo", "getQuizTheory", "getQuizTheoryAudio", "refreshQuizSession", "checkQuiz", "getQuizAudioStatus", "getQuizAudioBlob", "getQuizAudioPlayback", "saveQuizAudio"])
};

const withContentTokens = rows => rows.map(row => ({ ...row, audioIdentityToken: quizBankContentToken(row) }));
const contentChanged = res => res.status(409).json({ error: "quizbank_content_changed_refresh_required",
  refreshRequired: true, message: "La scheda è stata aggiornata. Ricarica la pagina prima di usare o salvare gli audio." });

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (!actions[req.method]) return res.status(405).json({ error: "method_not_allowed" });
  try {
    // Authorize every call BEFORE touching R2 or the shared process cache.
    const { data, access, role, canUploadAudio } = await authorizeQuizBankPreview(req);
    if (!actions[req.method].has(data.action)) return res.status(400).json({ error: "invalid_action" });
    const canUploadVideo = canUploadAudio && isQuizVideoMaster({ ...data, accessToken: access.accessToken || data.accessToken });
    if (['createQuizVideoUpload', 'uploadQuizVideoChunk', 'confirmQuizVideoUpload', 'deleteQuizVideo', 'cleanupQuizVideo'].includes(data.action) && !canUploadVideo) return res.status(403).json({ error: 'master_admin_required' });
    const renewed = access.accessToken ? { accessToken: access.accessToken, accessTokenExpiresAt: access.accessTokenExpiresAt } : {};
    if (access.accessToken) {
      res.setHeader("X-Access-Token", access.accessToken);
      res.setHeader("X-Access-Token-Expires", String(access.accessTokenExpiresAt));
    }
    if (data.action === "refreshQuizSession") return res.status(200).json({ ok: true, role, canUploadAudio,
      ...quizBankSession(data, { role }), ...renewed });
    // Standalone word TTS has no archive identity; question TTS must pass the row guard.
    if (data.action === "getTTS" && !data.questionId) return await serveQuizBankMedia({ action: data.action, text: data.text }, res);
    const upload = data.action === "saveQuizAudio" ? decodeQuizAudioUpload(data) : null;
    const isAttempt = data.action === "getQuiz" || data.action === "checkQuiz";
    const sheet = isAttempt ? normalizeQuizBankSheet(data.chapters) : Number(data.chapters);
    if (data.action === "getStudyQuiz" && (!Number.isInteger(sheet) || sheet < 1 || sheet > 50)) {
      return res.status(400).json({ error: "quizbank_invalid_sheet" });
    }
    const bank = await loadQuizBank();
    if (data.action === "getQuiz") {
      return res.status(200).json({ ok: true, sheet, role, canUploadAudio, isAdmin: canUploadAudio,
        source: "quizbank", mode: "default", title: `QuizBank · Scheda ${sheet}`, timerMinutes: 20,
        ...buildQuizBankAttempt(withContentTokens(bank.sheets[sheet - 1])), ...quizBankSession(data, { role }), ...renewed });
    }
    if (data.action === "checkQuiz") {
      // Authorization already validated JSON/body shape. Keep this QuizBank-only
      // field out of the Magic Book request/action surface.
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const result = gradeQuizBankAttempt(bank.sheets[sheet - 1], {
        quizbankRevision: body?.quizbankRevision, answers: data.answers
      });
      return res.status(200).json({ ok: true, sheet, ...result, ...renewed });
    }
    if (data.action === "catalog") {
      return res.status(200).json({ ok: true, preview: canUploadAudio, role, canUploadAudio, questionCount: 1500,
        sheets: bank.sheets.map((rows, index) => ({ number: index + 1, count: rows.length })), ...renewed });
    }
    if (data.action === "getStudyQuiz") {
      return res.status(200).json({ ok: true, sheet, role, canUploadAudio,
        quiz: withContentTokens(bank.sheets[sheet - 1]), ...quizBankSession(data, { role }), ...renewed });
    }
    const row = bank.byId.get(String(data.questionId || ""));
    if (!row) return res.status(404).json({ error: "quizbank_question_not_found" });
    // Fail before any explanation database/object access, upload or TTS request.
    if (!matchesQuizBankContentToken(row, data.audioIdentityToken)) return contentChanged(res);
    if (['getQuizVideo', 'createQuizVideoUpload', 'uploadQuizVideoChunk', 'confirmQuizVideoUpload', 'deleteQuizVideo', 'cleanupQuizVideo'].includes(data.action)) return res.status(200).json(await serveQuizVideo({ action: data.action, row, master: canUploadVideo, owner: String(data.phone).replace(/\D/g, ''), video: data.video }, req, res));
    if (isQuizTheoryAction(data.action)) return res.status(200).json(await serveQuizTheory(data, row, req, res));
    const identity = quizBankStorageIdentity(row);
    if (upload) return await saveQuizBankAudio({ data, identity, upload, req }, res);
    // Ignore submitted text/figure/answer when choosing the explanation or IT/BN source.
    return await serveQuizBankMedia({ action: data.action, row, identity, text: data.text }, res);
  } catch (error) {
    const status = Number(error.statusCode) || 503;
    const known = new Set(["quizbank_not_configured", "quizbank_archive_unavailable", "quizbank_invalid_archive"]);
    return res.status(status).json({ error: status < 500 || known.has(error.message) ? error.message : "service_unavailable" });
  }
}
