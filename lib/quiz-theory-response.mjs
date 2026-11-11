import theoryCatalog from "./quiz-theory.cjs";
import identityTools from "../quiz-audio-identity.cjs";
import { dictionarySpeechChunks } from "../api/dictionary-audio.mjs";
import { detectQuizAudioMimeType } from "../api/audio-mime.mjs";

const fail = (message, statusCode) => { throw Object.assign(new Error(message), { statusCode }); };
export const isQuizTheoryAction = action => action === "getQuizTheory" || action === "getQuizTheoryAudio";

// Call only AFTER the product's authorization and (for QuizBank) row-token gate.
// Submitted text/figure detect a stale page; they never select another row or answer.
export async function quizTheoryResponse({ row, data, speak, isCancelled = () => false }) {
  if (!isQuizTheoryAction(data.action)) fail("invalid_action", 400);
  if (typeof data.questionId !== "string" || !data.questionId || data.questionId.length > 128
    || typeof data.question !== "string" || !data.question.trim() || data.question.length > 1500
    || typeof data.figure !== "string" || data.figure.length > 120) fail("invalid_theory_request", 400);
  if (data.action === "getQuizTheoryAudio" && !["it", "bn"].includes(data.language)) fail("invalid_theory_language", 400);
  if (!row || String(row.id) !== data.questionId) fail("quiz_theory_not_found", 404);
  const expected = identityTools.getQuizAudioIdentity(row.question, row.figure);
  const submitted = identityTools.getQuizAudioIdentity(data.question, data.figure);
  if (expected.quizKey !== submitted.quizKey) fail("quiz_theory_content_changed", 409);
  const theory = theoryCatalog.findQuizTheory(row);
  if (!theory) fail("quiz_theory_not_found", 404);
  if (isCancelled()) fail("quiz_theory_cancelled", 499);
  if (data.action === "getQuizTheory") return { theory };

  // Existing GAS getTTS is Bengali-only and does not chunk. Never translate
  // editorial Bangla again or accept a caller's text/provider/URL/answer.
  const text = theory.explanation[data.language];
  if (typeof text !== "string" || !text.trim() || text.length > 500) fail("quiz_theory_audio_unavailable", 503);
  const chunks = dictionarySpeechChunks(text, data.language);
  if (!chunks.length || chunks.length > 3) fail("quiz_theory_audio_unavailable", 503);
  const clips = [];
  let totalBytes = 0;
  for (const chunk of chunks) {
    if (isCancelled()) fail("quiz_theory_cancelled", 499);
    const result = await speak({ action: data.language === "bn" ? "getTTS" : "getItalianAudio", text: chunk });
    if (isCancelled()) fail("quiz_theory_cancelled", 499);
    const audio = result?.audio;
    if (typeof audio !== "string" || !audio || audio.length > 4 * 1024 * 1024
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) fail("quiz_theory_audio_unavailable", 503);
    totalBytes += audio.length;
    if (totalBytes > 4 * 1024 * 1024) fail("quiz_theory_audio_unavailable", 503);
    clips.push({ audio, mimeType: detectQuizAudioMimeType(Buffer.from(audio, "base64"), "audio/mpeg") });
  }
  return { ...(clips.length === 1 ? clips[0] : {}), clips, language: data.language };
}
