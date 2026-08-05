import test from "node:test";
import assert from "node:assert/strict";
import { applyQuizFigureCorrections } from "../api/quiz-figure-corrections.mjs";

test("Magic Book quiz q01131 receives its missing figure 37", () => {
  assert.deepEqual(
    applyQuizFigureCorrections({ id: "q01131", figure: "", question: "vento laterale" }),
    { id: "q01131", figure: "fig37", question: "vento laterale" }
  );
});

test("the correction replaces legacy non-empty figure values", () => {
  for (const figure of [0, 37, "37", "fig37.jpg", "/img_sign/37.png"]) {
    assert.equal(applyQuizFigureCorrections({ id: "Q01131", figure }).figure, "fig37");
  }
});

test("the wind question receives figure 37 even when its upstream ID changes", () => {
  const row = {
    id: "1131",
    figure: "",
    question: "Il segnale raffigurato preannuncia, in caso di forte vento laterale, un pericolo maggiore all'entrata delle gallerie per i veicoli stretti e alti"
  };
  assert.equal(applyQuizFigureCorrections(row).figure, "fig37");
});

test("existing figures and unrelated quizzes are preserved", () => {
  assert.equal(applyQuizFigureCorrections({ id: "q01131", figure: "fig37" }).figure, "fig37");
  assert.equal(applyQuizFigureCorrections({ id: "q01132", figure: "" }).figure, "");
});
