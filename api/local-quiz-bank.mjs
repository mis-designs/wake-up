import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const quizBank = require("./_quiz-bank.json");

export const LOCAL_QUIZ_SOURCE = quizBank?.meta?.source || "local-quiz-bank";
export const LOCAL_QUIZ_ROWS = Object.freeze(
  (Array.isArray(quizBank?.quiz) ? quizBank.quiz : []).map(row => Object.freeze({ ...row }))
);
export const LOCAL_MAGIC_BOOK_ROWS = Object.freeze(LOCAL_QUIZ_ROWS.filter(row => Number(row.chapter) !== 0));
export const LOCAL_EXAM_ROWS = Object.freeze(LOCAL_QUIZ_ROWS.filter(row => Number(row.chapter) === 0));

const answerById = new Map(LOCAL_QUIZ_ROWS.map(row => [String(row.id), Number(row.correct)]));

if (LOCAL_MAGIC_BOOK_ROWS.length !== 788 || LOCAL_EXAM_ROWS.length !== 80) {
  throw new Error("invalid_local_quiz_bank");
}

export function getLocalCatalog() {
  return {
    ok: true,
    source: LOCAL_QUIZ_SOURCE,
    count: LOCAL_MAGIC_BOOK_ROWS.length,
    expectedCount: 788,
    quiz: LOCAL_MAGIC_BOOK_ROWS
  };
}

export function selectLocalQuizRows(chapters) {
  const selected = String(chapters || "")
    .split(",")
    .map(value => Number(String(value).trim()))
    .filter(value => Number.isInteger(value) && value >= 1 && value <= 25);
  if (!selected.length) return LOCAL_MAGIC_BOOK_ROWS.slice();
  const selectedChapters = new Set(selected);
  return LOCAL_MAGIC_BOOK_ROWS.filter(row => selectedChapters.has(Number(row.chapter)));
}

export function normalizeLocalAnswer(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value === 1 || value === true) return 1;
  if (value === 0 || value === false) return 0;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "vero", "v", "si", "yes"].includes(normalized)) return 1;
  if (["0", "false", "falso", "f", "no"].includes(normalized)) return 0;
  return null;
}

export function gradeLocalQuiz(answers) {
  let correct = 0;
  const results = answers.map(answer => {
    const submitted = normalizeLocalAnswer(answer?.answer);
    const expected = answerById.get(String(answer?.id ?? "").trim());
    const isCorrect = submitted !== null && expected !== undefined && submitted === expected;
    if (isCorrect) correct += 1;
    return { id: answer?.id, correct: isCorrect };
  });

  return {
    correct,
    wrong: answers.length - correct,
    results
  };
}

export function addLocalAdminAnswers(questions) {
  return questions.map(question => ({
    ...question,
    admin_correct_answer: answerById.get(String(question?.id ?? ""))
  }));
}

export function hideLocalCorrectAnswers(questions) {
  return questions.map(({ correct: _correct, explanations: _explanations, xyz3d: _xyz3d, ...question }) => question);
}
