import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { normalizeLocalAnswer } from "../api/local-quiz-bank.mjs";

import { audioContentSignature, quizAudioCatalog } from "../api/quiz-audio-catalog.mjs";

const require = createRequire(import.meta.url);
const rows = require("../api/_video-gallery-allbooks.json");
let index;
function catalogIndex() {
  if (!index) {
    index = {
      byId: new Map(rows.map(row => [row.id, row])),
      recordings: new Map(quizAudioCatalog.rows.map(row => [audioContentSignature(row), row.id])),
      revision: createHash("sha256").update(JSON.stringify(rows)).digest("hex")
    };
  }
  return index;
}

export function allQuizRecordingId(id) {
  const { byId, recordings } = catalogIndex();
  const row = byId.get(id);
  return row && recordings.get(audioContentSignature(row));
}

const invalid = error => Object.assign(new Error(error), { statusCode: 400 });

export function drawAllQuiz(chapters, shuffle) {
  const selected = chapters ? String(chapters).split(",") : [];
  if (selected.some(number => !/^(?:[1-9]|1[0-9]|2[0-5])$/.test(number))) throw invalid("invalid_chapters");
  const pool = selected.length ? rows.filter(row => selected.includes(row.chapter)) : rows;
  return shuffle(pool).slice(0, 30).map(({ id, chapter, question, figure }) => ({
    id, chapter, question, figure, hasSharedAudioSource: Boolean(allQuizRecordingId(id))
  }));
}

export function allQuizClaims(quiz) {
  return { catalog: "all", revision: catalogIndex().revision, drawIds: quiz.map(row => row.id) };
}

export function issuedAllQuizRow(payload, id) {
  const { byId, revision } = catalogIndex();
  return payload?.catalog === "all" && payload.revision === revision && payload.drawIds?.includes(id) ? byId.get(id) : null;
}

export function gradeAllQuiz(payload, answers) {
  const { byId, revision } = catalogIndex();
  if (payload.revision !== revision) throw Object.assign(new Error("all_quiz_updated"), { statusCode: 409 });
  const ids = new Set(answers.map(item => item?.id));
  if (answers.length !== payload.drawIds?.length || ids.size !== answers.length ||
      !payload.drawIds.every(id => ids.has(id))) throw invalid("invalid_draw_answers");
  const results = answers.map(({id, answer}) => ({id, correct: normalizeLocalAnswer(answer) === Number(byId.get(id).correct)}));
  const correct = results.filter(row => row.correct).length;
  return { correct, wrong: results.length - correct, results };
}
