import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLearningInsights,
  LEARNING_ANALYTICS_RULES,
  LEARNING_CATALOG
} from "../api/learning-analytics.mjs";

const NOW = Date.parse("2026-08-21T12:00:00.000Z");

function event(index, quizId, result, minutesAgo = index) {
  return {
    event_id: `ans_${String(index).padStart(20, "0")}`,
    user_id: "3331112222",
    quiz_id: quizId,
    result,
    answered_at: new Date(NOW - minutesAgo * 60_000).toISOString()
  };
}

function quizIdsForFigure() {
  const byFigure = new Map();
  for (const item of LEARNING_CATALOG.rows.values()) {
    if (!item.figureId) continue;
    const values = byFigure.get(item.figureId) || [];
    values.push(item.quizId);
    byFigure.set(item.figureId, values);
  }
  return [...byFigure.entries()].find(([, ids]) => ids.length >= 2);
}

test("empty and insufficient histories never fabricate a diagnosis", () => {
  const empty = buildLearningInsights([], { now: NOW });
  assert.equal(empty.state, "empty");
  assert.equal(empty.summary.overallAccuracyPct, null);
  assert.equal(empty.plan.length, 0);
  assert.equal(empty.chapters.length, 25);

  const quizId = [...LEARNING_CATALOG.rows.keys()][0];
  const small = buildLearningInsights(Array.from({ length: 9 }, (_, index) => event(index + 1, quizId, "WRONG")), { now: NOW });
  assert.equal(small.state, "insufficient");
  assert.equal(small.summary.activeErrors, 0);
  assert.equal(small.plan.length, 0);
});

test("a figure pattern requires wrong answers on different linked quizzes", () => {
  const [figureId, ids] = quizIdsForFigure();
  const filler = [...LEARNING_CATALOG.rows.keys()].filter(id => !ids.includes(id)).slice(0, 8);
  const repeated = [
    ...filler.map((id, index) => event(index + 1, id, "CORRECT", 30 - index)),
    event(19, ids[0], "WRONG", 3),
    event(20, ids[0], "WRONG", 2),
    event(21, ids[0], "WRONG", 1)
  ];
  assert.equal(buildLearningInsights(repeated, { now: NOW }).errors.figures.some(item => item.id === figureId), false);

  repeated[repeated.length - 1] = event(21, ids[1], "WRONG", 1);
  const model = buildLearningInsights(repeated, { now: NOW });
  const figure = model.errors.figures.find(item => item.id === figureId);
  assert.ok(figure);
  assert.equal(figure.differentQuizWrong, 2);
});

test("recent correct evidence can mark a historic weakness as recovered", () => {
  const quizId = [...LEARNING_CATALOG.rows.keys()][0];
  const values = ["WRONG", "WRONG", "CORRECT", "CORRECT", "CORRECT", "CORRECT", "CORRECT", "CORRECT", "CORRECT", "CORRECT"];
  const model = buildLearningInsights(values.map((result, index) => event(index + 1, quizId, result, 20 - index)), { now: NOW });
  assert.ok(model.errors.recovered.some(item => item.id === quizId));
  assert.equal(model.errors.questions.length, 0);
});

test("large histories stay bounded to clear outputs and three plan items", () => {
  const quizIds = [...LEARNING_CATALOG.rows.keys()].slice(0, 80);
  const values = Array.from({ length: 5000 }, (_, index) => event(
    index + 1,
    quizIds[index % quizIds.length],
    index % 5 === 0 ? "WRONG" : "CORRECT",
    6000 - index
  ));
  const model = buildLearningInsights(values, { now: NOW });
  assert.equal(model.summary.totalAnswers, 5000);
  assert.equal(model.summary.recentWindowSize, LEARNING_ANALYTICS_RULES.recentWindow);
  assert.equal(model.chapters.length, 25);
  assert.ok(model.plan.length <= LEARNING_ANALYTICS_RULES.maxPlanItems);
});

test("duplicate and invalid events do not inflate totals", () => {
  const quizId = [...LEARNING_CATALOG.rows.keys()][0];
  const valid = event(1, quizId, "CORRECT");
  const model = buildLearningInsights([valid, valid, { ...event(2, "missing", "WRONG") }], { now: NOW });
  assert.equal(model.summary.totalAnswers, 1);
  assert.equal(model.dataQuality.rejectedEvents, 2);
});
