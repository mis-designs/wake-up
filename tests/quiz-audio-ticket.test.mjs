import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchesQuizAudioIdentityTicket } from "../api/quiz-audio-ticket.mjs";

const expected = {
  questionId: "cap1_q23",
  quizKey: "q2_current",
  legacyQuizKey: "q_legacy"
};

test("a signed audio identity is accepted only for its exact catalog question", () => {
  assert.equal(matchesQuizAudioIdentityTicket({ ...expected }, expected), true);
  assert.equal(matchesQuizAudioIdentityTicket({ ...expected, questionId: "cap1_q24" }, expected), false);
  assert.equal(matchesQuizAudioIdentityTicket({ ...expected, quizKey: "q2_other" }, expected), false);
  assert.equal(matchesQuizAudioIdentityTicket({ ...expected, legacyQuizKey: "q_other" }, expected), false);
});

test("missing or malformed audio identity claims fail closed", () => {
  assert.equal(matchesQuizAudioIdentityTicket(null, expected), false);
  assert.equal(matchesQuizAudioIdentityTicket({}, expected), false);
  assert.equal(matchesQuizAudioIdentityTicket(expected, null), false);
});

test("quiz status and blob requests preserve the server-signed audio identity", () => {
  const client = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
  const api = readFileSync(new URL("../api/quiz.js", import.meta.url), "utf8");

  assert.match(client, /audioIdentityToken: question\?\.audioIdentityToken \|\| ""/);
  assert.match(client, /audioIdentityToken: question\.audioIdentityToken \|\| ""/);
  assert.match(api, /purpose: "quiz-audio"/);
  assert.match(api, /findQuizAudioRow\(trustedIdentity, \{ allowAmbiguousLegacy: true \}\)/);
  assert.match(api, /trustedResult\.row[\s\S]*requiresReview: false/);
});
