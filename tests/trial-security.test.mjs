import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasOnlyIssuedTrialQuestions, isAllowedTrialChapter, isAllowedTrialService } from "../api/trial.js";

test("free trial is restricted to chapters 1 and 3", () => {
  assert.equal(isAllowedTrialChapter(1), true);
  assert.equal(isAllowedTrialChapter("3"), true);
  for (const chapter of ["2", "4", "5", "0", "1,3", "../../1"]) assert.equal(isAllowedTrialChapter(chapter), false);
});

test("free trial exposes only the required audio and translation services", () => {
  assert.equal(isAllowedTrialService("getItalianAudio"), true);
  assert.equal(isAllowedTrialService("getBengaliAudio"), true);
  assert.equal(isAllowedTrialService("getTTS"), true);
  for (const action of ["getQuiz", "checkQuiz", "admin", "getPages", "getAllQuestions"]) {
    assert.equal(isAllowedTrialService(action), false);
  }
});

test("free trial grading accepts only IDs issued in its signed quiz", () => {
  const ids = ["q2-a", "q2-b"];
  assert.equal(hasOnlyIssuedTrialQuestions([{ id: "q2-a", answer: 1 }, { id: "q2-b", answer: null }], ids), true);
  assert.equal(hasOnlyIssuedTrialQuestions([{ id: "private-question", answer: 1 }], ids), false);
  assert.equal(hasOnlyIssuedTrialQuestions([{ id: "q2-a", answer: 7 }], ids), false);
});

test("every browser trial surface uses only chapters 1 and 3", () => {
  const main = readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const quiz = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
  const study = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(main, /FREE_TRIAL_CHAPTERS\s*=\s*Object\.freeze\(\[1, 3\]\)/);
  assert.match(quiz, /TRIAL_ALLOWED_CHAPTERS\s*=\s*new Set\(\["1", "3"\]\)/);
  assert.match(study, /TRIAL_ALLOWED_CHAPTERS\s*=\s*new Set\(\[1, 3\]\)/);
  assert.match(page, /Capitoli 1 e 3 con libro, audio e quiz/);
  assert.doesNotMatch(main, /\[2, 4\]/);
  assert.doesNotMatch(quiz, /\["2", "4"\]/);
});

test("trial study mode and locked chapters stay on the isolated trial path", () => {
  const api = readFileSync(new URL("../api/trial.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const study = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");

  assert.match(api, /action === "getQuiz" \|\| action === "getStudyQuiz"/);
  assert.match(api, /Math\.min\(guest\.exp, Date\.now\(\) \+ TRIAL_TOKEN_TTL_MS\)/);
  assert.match(main, /\/studia-quiz\/prova-gratis/);
  assert.match(study, /trialOffer=1&feature=/);
  assert.match(study, /guestKey: session\.guestKey/);
});
