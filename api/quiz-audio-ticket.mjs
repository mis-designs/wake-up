export function matchesQuizAudioIdentityTicket(payload, expected) {
  if (!payload || typeof payload !== "object" || !expected || typeof expected !== "object") return false;
  return String(payload.questionId ?? "") === String(expected.questionId ?? "")
    && String(payload.quizKey || "") === String(expected.quizKey || "")
    && String(payload.legacyQuizKey || "") === String(expected.legacyQuizKey || "");
}
