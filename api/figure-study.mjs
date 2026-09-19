import { normalizeFigureId, getFigureDetail } from '../figure-catalog.mjs';
import { normalizeLocalAnswer } from './local-quiz-bank.mjs';

// Study already exposes correct answers through authenticated getStudyQuiz.
// This bounded projection never returns the whole bank or changes quiz grading.
export function selectFigureStudyExamples(rows, requestedFigure) {
  const figure = normalizeFigureId(requestedFigure);
  if (!getFigureDetail(figure)) return null;
  const examples = [];
  for (const correct of [1, 0]) {
    const row = rows.find(item => normalizeFigureId(item.figure) === figure
      && normalizeLocalAnswer(item.correct) === correct && item.question && Number(item.chapter) > 0);
    if (row) examples.push({ id: row.id, chapter: row.chapter, question: row.question,
      question_bd: row.question_bd || '', correct, figure });
  }
  return examples;
}
