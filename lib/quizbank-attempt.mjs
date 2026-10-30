import crypto from "node:crypto";
import { normalizeQuizResult } from "../api/quiz-result.mjs";

const fail = (message, statusCode = 400) => {
  throw Object.assign(new Error(message), { statusCode });
};

export function normalizeQuizBankSheet(value) {
  if (!["string", "number"].includes(typeof value) || !/^\d{1,2}$/.test(String(value).trim())) {
    fail("quizbank_invalid_sheet");
  }
  const sheet = Number(value);
  if (!Number.isInteger(sheet) || sheet < 1 || sheet > 50) fail("quizbank_invalid_sheet");
  return sheet;
}

// Hash canonical server content in sheet order, with explicit field order.
// Position IDs alone cannot detect an archive correction during an attempt.
export function quizBankRevision(rows) {
  if (!Array.isArray(rows) || rows.length !== 30) fail("quizbank_invalid_archive", 503);
  const sheet = rows[0]?.sheet;
  if (!Number.isInteger(sheet) || sheet < 1 || sheet > 50) fail("quizbank_invalid_archive", 503);
  const content = Array.from(rows, (row, index) => {
    const number = index + 1;
    const id = `qb_s${String(sheet).padStart(2, "0")}_q${String(number).padStart(2, "0")}`;
    if (!row || row.sheet !== sheet || row.number !== number || row.id !== id
      || typeof row.question !== "string" || !row.question.trim() || typeof row.correct !== "boolean") {
      fail("quizbank_invalid_archive", 503);
    }
    return [id, sheet, number, row.question, row.correct, row.figure ?? "",
      row.figureRotation ?? 0, row.question_bd ?? ""];
  });
  return crypto.createHash("sha256").update(JSON.stringify(["quizbank-sheet-v1", content])).digest("hex");
}

export function buildQuizBankAttempt(rows) {
  return {
    quizbankRevision: quizBankRevision(rows),
    // Never delete answers on cached rows used by study, media and grading.
    quiz: rows.map(({ correct: _correct, ...question }) => question)
  };
}

export function gradeQuizBankAttempt(rows, { quizbankRevision, answers } = {}) {
  const revision = quizBankRevision(rows);
  if (typeof quizbankRevision !== "string" || !/^[a-f0-9]{64}$/.test(quizbankRevision)) {
    fail("quizbank_invalid_revision");
  }
  if (quizbankRevision !== revision) fail("quizbank_revision_changed", 409);
  if (!Array.isArray(answers) || answers.length !== 30) fail("quizbank_invalid_answers");
  let correct = 0;
  const results = Array.from(rows, (row, index) => {
    const submitted = answers[index];
    // Exact positional equality also rejects duplicates and IDs from other sheets.
    if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)
      || submitted.id !== row.id || !Object.hasOwn(submitted, "answer")
      || (submitted.answer !== 0 && submitted.answer !== 1 && submitted.answer !== null)) {
      fail("quizbank_invalid_answers");
    }
    const correctAnswer = row.correct === true ? 1 : 0;
    const isCorrect = submitted.answer !== null && submitted.answer === correctAnswer;
    if (isCorrect) correct++;
    return { id: row.id, correct: isCorrect, correctAnswer };
  });
  return normalizeQuizResult({ correct, wrong: 30 - correct, results }, 30);
}
