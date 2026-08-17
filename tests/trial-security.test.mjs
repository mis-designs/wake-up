import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasOnlyIssuedTrialQuestions, hasTrialAudioPreview, isAllowedTrialChapter, isAllowedTrialService } from "../api/trial.js";
import {
  createGuestTrialToken,
  GUEST_TRIAL_ENABLED,
  verifyGuestTrialToken
} from "../api/trialAccess.js";

test("legacy trial helpers remain restricted to chapters 1 and 3", () => {
  assert.equal(isAllowedTrialChapter(1), true);
  assert.equal(isAllowedTrialChapter("3"), true);
  for (const chapter of ["2", "4", "5", "0", "1,3", "../../1"]) assert.equal(isAllowedTrialChapter(chapter), false);
});

test("legacy trial services retain their narrow allowlist", () => {
  assert.equal(isAllowedTrialService("getItalianAudio"), true);
  assert.equal(isAllowedTrialService("getBengaliAudio"), true);
  assert.equal(isAllowedTrialService("getTTS"), true);
  for (const action of ["getQuiz", "checkQuiz", "admin", "getPages", "getAllQuestions"]) {
    assert.equal(isAllowedTrialService(action), false);
  }
});

test("legacy grading accepts only IDs issued in its signed quiz", () => {
  const ids = ["q2-a", "q2-b"];
  assert.equal(hasOnlyIssuedTrialQuestions([{ id: "q2-a", answer: 1 }, { id: "q2-b", answer: null }], ids), true);
  assert.equal(hasOnlyIssuedTrialQuestions([{ id: "private-question", answer: 1 }], ids), false);
  assert.equal(hasOnlyIssuedTrialQuestions([{ id: "q2-a", answer: 7 }], ids), false);
});

test("the public landing offers the seven-day trial without promo-code fields", () => {
  const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const main = readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
  const landing = page.match(/<main class="public-landing[\s\S]*?<\/main>/)?.[0] || "";

  assert.match(landing, /class="trial-card"/);
  assert.match(landing, /data-trial-hours>168</);
  assert.match(landing, /startGuestTrial\(\{ openChapter: 1 \}\)[\s\S]*?startGuestTrial\(\{ openChapter: 3 \}\)/);
  assert.doesNotMatch(landing, /promo-access-card|promoLandingPhone|promoLandingCode|Login con Promo Code/);
  assert.doesNotMatch(page, /id="promoCode"|promo-code-hint/);
  assert.match(main, /FREE_TRIAL_DURATION_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(main, /setupTrialMarketing\(\);/);
  assert.match(styles, /\.trial-card/);
});

test("the guest trial can issue and consume restricted access", () => {
  const secret = "test-secret";
  const trialId = "trial_device_123456789";
  const issued = createGuestTrialToken(trialId, secret);
  const accessApi = readFileSync(new URL("../api/trialAccess.js", import.meta.url), "utf8");
  const quizApi = readFileSync(new URL("../api/trial.js", import.meta.url), "utf8");
  const bookApi = readFileSync(new URL("../api/trialBook.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../script.js", import.meta.url), "utf8");

  assert.equal(GUEST_TRIAL_ENABLED, true);
  assert.equal(verifyGuestTrialToken(issued.token, trialId, secret)?.trialId, trialId);
  assert.match(accessApi, /if \(!GUEST_TRIAL_ENABLED\) return res\.status\(410\)/);
  assert.match(quizApi, /if \(!GUEST_TRIAL_ENABLED\) return res\.status\(410\)/);
  assert.match(bookApi, /if \(!GUEST_TRIAL_ENABLED\) return res\.status\(410\)/);
  assert.match(main, /path === "\/prova-gratis"\) return \{ screen: "trialHub" \}/);
});

test("trial audio is a deterministic preview enforced by server and clients", () => {
  const quizApi = readFileSync(new URL("../api/trial.js", import.meta.url), "utf8");
  const quizClient = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
  const studyClient = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");

  assert.equal(hasTrialAudioPreview(0), true);
  assert.equal(hasTrialAudioPreview(1), false);
  assert.equal(hasTrialAudioPreview(2), false);
  assert.equal(hasTrialAudioPreview(3), true);
  assert.match(quizApi, /audioIds: quiz\.filter\(q => q\.trialAudioPreview\)/);
  assert.match(quizApi, /payload\.audioIds\?\.includes\(questionId\)/);
  assert.match(quizClient, /question\?\.trialAudioPreview === true/);
  assert.match(studyClient, /question\.trialAudioPreview !== true/);
});
