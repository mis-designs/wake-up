import crypto from "node:crypto";
import { createRequire } from "node:module";
import identityTools from "../quiz-audio-identity.cjs";
import { LOCAL_QUIZ_ROWS, normalizeLocalAnswer } from "./local-quiz-bank.mjs";
import { applyQuizFigureCorrections } from "./quiz-figure-corrections.mjs";

// Keep the literal require visible to Vercel's dependency tracer. Calling
// createRequire(...)(...) inline omits this JSON from the deployed function.
const require = createRequire(import.meta.url);
const legacyRegistrySource = require("../data/quiz-audio-legacy-collisions-v1.json");

const { getQuizAudioIdentity, normalizeQuizAudioFigure, filterQuizAudioCollisionRegistry } = identityTools;
const exactText = value => String(value ?? "").normalize("NFC").trim().replace(/\s+/gu, " ");

// Preserve punctuation and case: the old text-only normalization is too broad
// to prove that two recordings explain the same question.
export function audioContentSignature(row) {
  return JSON.stringify([exactText(row.question), normalizeQuizAudioFigure(row.figure), normalizeLocalAnswer(row.correct)]);
}

export function createAudioCatalog(sourceRows) {
  const rows = sourceRows.map(applyQuizFigureCorrections);
  const byId = new Map(rows.map(row => [String(row.id), row]));
  const groups = new Map();
  const legacyGroups = new Map();
  for (const row of rows) {
    const base = getQuizAudioIdentity(row.question, row.figure);
    for (const [map, key] of [[groups, base.quizKey], [legacyGroups, base.legacyQuizKey]]) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
  }
  function identityFor(row) {
    const base = getQuizAudioIdentity(row.question, row.figure);
    const signature = audioContentSignature(row);
    const peers = groups.get(base.quizKey) || [];
    const conflicting = peers.some(peer => audioContentSignature(peer) !== signature);
    const verifiedChapter = peers.some(peer => Number(peer.chapter) !== 0 && audioContentSignature(peer) === signature);
    // Unmatched Exam content has its own namespace. No unverified All Books
    // or historical audio is inferred just because its normalized text matches.
    const isolated = conflicting || (Number(row.chapter) === 0 && !verifiedChapter);
    const quizKey = isolated
      ? `q2_${crypto.createHash("sha256").update(`magicph-exact-audio-v1\u001f${signature}`).digest("hex")}`
      : base.quizKey;
    // Exam was added after the chapter recordings. A differing Exam variant
    // must not invalidate the established chapter identity or its recordings.
    const chapterPeers = peers.filter(peer => Number(peer.chapter) !== 0);
    const establishedChapter = chapterPeers.length > 0
      && chapterPeers.every(peer => audioContentSignature(peer) === signature);
    const previousQuizKeys = isolated && establishedChapter ? [base.quizKey] : [];
    const legacyPeers = (legacyGroups.get(base.legacyQuizKey) || [])
      .filter(peer => !establishedChapter || Number(peer.chapter) !== 0);
    const legacySafe = (!isolated || establishedChapter) && legacyPeers
      .every(peer => audioContentSignature(peer) === signature);
    return { ...base, quizKey, audioKey: `quiz-explanations/v2/${quizKey}/explanation.webm`, previousQuizKeys, legacySafe };
  }
  function resolve({ questionId, question, figure }) {
    const id = String(questionId ?? "").trim();
    const matches = id ? [byId.get(id)].filter(Boolean) : rows.filter(row =>
      exactText(row.question) === exactText(question) && normalizeQuizAudioFigure(row.figure) === normalizeQuizAudioFigure(figure));
    const signatures = new Set(matches.map(audioContentSignature));
    if (!matches.length || signatures.size !== 1 || matches.some(row =>
      exactText(row.question) !== exactText(question) || normalizeQuizAudioFigure(row.figure) !== normalizeQuizAudioFigure(figure))) {
      const error = new Error("quiz_audio_catalog_mismatch");
      error.statusCode = 409;
      throw error;
    }
    return identityFor(matches[0]);
  }
  return { rows, identityFor, resolve };
}

export const quizAudioCatalog = createAudioCatalog(LOCAL_QUIZ_ROWS);

// Use the same current-catalog filtering as the admin page. Obsolete Magic
// Book figures are no longer competing candidates; All Books candidates must
// remain because the audio database is shared with that application.
export const quizAudioLegacyRegistry = filterQuizAudioCollisionRegistry(
  legacyRegistrySource,
  quizAudioCatalog.rows.map(quizAudioCatalog.identityFor),
  { preserveSources: ["all-books"] }
);
