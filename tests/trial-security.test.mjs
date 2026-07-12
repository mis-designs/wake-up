import assert from "node:assert/strict";
import test from "node:test";
import { hasOnlyIssuedTrialQuestions, isAllowedTrialChapter } from "../api/trial.js";

test("free trial is restricted to chapters 2 and 4", () => {
  assert.equal(isAllowedTrialChapter(2), true);
  assert.equal(isAllowedTrialChapter("4"), true);
  for (const chapter of ["1", "3", "5", "0", "2,4", "../../2"]) assert.equal(isAllowedTrialChapter(chapter), false);
});

test("free trial grading accepts only IDs issued in its signed quiz", () => {
  const ids = ["q2-a", "q2-b"];
  assert.equal(hasOnlyIssuedTrialQuestions([{ id: "q2-a", answer: 1 }, { id: "q2-b", answer: null }], ids), true);
  assert.equal(hasOnlyIssuedTrialQuestions([{ id: "private-question", answer: 1 }], ids), false);
  assert.equal(hasOnlyIssuedTrialQuestions([{ id: "q2-a", answer: 7 }], ids), false);
});
