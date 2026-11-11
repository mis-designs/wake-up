"use strict";

const records = require("../api/_quiz-theory.json");
const { getQuizAudioIdentity, normalizeQuizAudioFigure } = require("../quiz-audio-identity.cjs");
const byKey = new Map();
for (const record of records) {
  const theory = Object.freeze({
    id: record.id,
    correct_answer: record.correct_answer,
    focus_it: record.focus_it,
    explanation: Object.freeze({ it: record.explanation.it, bn: record.explanation.bn })
  });
  for (const key of record.keys) {
    if (byKey.has(key)) throw new Error("duplicate_quiz_theory_key");
    byKey.set(key, theory);
  }
}

const own = (row, field) => Object.prototype.hasOwnProperty.call(row, field);
function answer(value) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  return null;
}

// Input must be a canonical, authorized server row, never a client answer claim.
// This resolver performs content matching, not authentication or entitlement checks.
function findQuizTheory(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const answerFields = ["correct", "a"].filter(field => own(row, field));
  if (!answerFields.length) return null;
  const correct = answer(row[answerFields[0]]);
  if (correct === null || answerFields.some(field => answer(row[field]) !== correct)) return null;

  const figureFields = ["figure", "img"].filter(field => own(row, field));
  for (const field of figureFields) {
    const figure = row[field];
    if (figure != null && !["string", "number", "boolean"].includes(typeof figure)) return null;
    if (normalizeQuizAudioFigure(figure) !== "none") return null;
  }

  const questionFields = ["question", "q"].filter(field => own(row, field));
  if (!questionFields.length) return null;
  let key;
  try {
    for (const field of questionFields) {
      if (typeof row[field] !== "string" || !row[field].trim()) return null;
      const candidate = getQuizAudioIdentity(row[field], "").quizKey;
      if (key && key !== candidate) return null;
      key = candidate;
    }
  } catch {
    return null;
  }
  const theory = byKey.get(key);
  return theory && theory.correct_answer === correct ? theory : null;
}

module.exports = { findQuizTheory };
