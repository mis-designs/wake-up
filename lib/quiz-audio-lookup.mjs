export function audioLookupKeys(identity) {
  return [...new Set([identity.quizKey, ...(identity.previousQuizKeys || []),
    ...(identity.legacySafe === false ? [] : [identity.legacyQuizKey])].filter(Boolean))];
}

// Preserve exact/current -> established chapter -> safe legacy priority.
export function selectAudioRow(identity, rows, isLegacyAmbiguous) {
  const byKey = new Map(rows.map(row => [row.quiz_key, row]));
  for (const key of [identity.quizKey, ...(identity.previousQuizKeys || [])]) {
    const row = byKey.get(key);
    if (row) return { row, matchedQuizKey: key, legacy: false, requiresReview: false };
  }
  const legacy = identity.legacySafe === false ? null : byKey.get(identity.legacyQuizKey);
  if (!legacy) return { row: null, matchedQuizKey: "", legacy: false, requiresReview: false };
  const requiresReview = isLegacyAmbiguous(identity.legacyQuizKey);
  return { row: requiresReview ? null : legacy, matchedQuizKey: identity.legacyQuizKey,
    legacy: true, requiresReview };
}
