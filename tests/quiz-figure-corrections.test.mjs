import test from "node:test";
import assert from "node:assert/strict";
import { applyQuizFigureCorrections } from "../api/quiz-figure-corrections.mjs";

test("Magic Book quiz q01131 receives its missing figure 37", () => {
  assert.deepEqual(
    applyQuizFigureCorrections({ id: "q01131", figure: "", question: "vento laterale" }),
    { id: "q01131", figure: "fig37", question: "vento laterale" }
  );
});

test("the correction accepts the catalog no-figure placeholder", () => {
  assert.equal(applyQuizFigureCorrections({ id: "Q01131", figure: 0 }).figure, "fig37");
});

test("existing figures and unrelated quizzes are preserved", () => {
  assert.equal(applyQuizFigureCorrections({ id: "q01131", figure: "fig37" }).figure, "fig37");
  assert.equal(applyQuizFigureCorrections({ id: "q01132", figure: "" }).figure, "");
});

