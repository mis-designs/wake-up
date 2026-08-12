import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasOnlyIssuedTrialQuestions, isAllowedTrialChapter, isAllowedTrialService } from "../api/trial.js";
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

test("the public landing replaces the guest trial with promo-code login", () => {
  const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const main = readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
  const landing = page.match(/<main class="public-landing[\s\S]*?<\/main>/)?.[0] || "";

  assert.match(landing, /class="promo-access-card"/);
  assert.match(landing, /Login con Promo Code/);
  assert.match(landing, /Prendi il Promo Code dalle nostre pagine e dai gruppi WhatsApp!/);
  assert.match(landing, /id="promoLandingPhone"[\s\S]*?id="promoLandingCode"/);
  assert.match(landing, /data-promo-days[\s\S]*?data-promo-hours[\s\S]*?data-promo-minutes[\s\S]*?data-promo-seconds/);
  assert.match(landing, /facebook\.com\/TMMBanglaPatente/);
  assert.match(landing, /chat\.whatsapp\.com\/LBL1G7nvz2B3SThJj4uRxD/);
  assert.doesNotMatch(landing, /class="trial-card"|startGuestTrial/);
  assert.match(main, /PROMO_STATUS_API = "\/api\/promo-status"/);
  assert.match(main, /function setupPromoCampaign/);
  assert.match(main, /remaining \/ PROMO_CAMPAIGN_DURATION_MS \* 100/);
  assert.match(styles, /PROMO CODE ACCESS/);
  assert.match(styles, /--promo-teal: #0A8270/);
  assert.match(styles, /--promo-lime: #7CFF6B/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?promo-access-card/);
});

test("the former guest trial cannot issue or consume access", () => {
  const secret = "test-secret";
  const trialId = "trial_device_123456789";
  const issued = createGuestTrialToken(trialId, secret);
  const accessApi = readFileSync(new URL("../api/trialAccess.js", import.meta.url), "utf8");
  const quizApi = readFileSync(new URL("../api/trial.js", import.meta.url), "utf8");
  const bookApi = readFileSync(new URL("../api/trialBook.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../script.js", import.meta.url), "utf8");

  assert.equal(GUEST_TRIAL_ENABLED, false);
  assert.equal(verifyGuestTrialToken(issued.token, trialId, secret), null);
  assert.match(accessApi, /if \(!GUEST_TRIAL_ENABLED\) return res\.status\(410\)/);
  assert.match(quizApi, /if \(!GUEST_TRIAL_ENABLED\) return res\.status\(410\)/);
  assert.match(bookApi, /if \(!GUEST_TRIAL_ENABLED\) return res\.status\(410\)/);
  assert.match(main, /path === "\/prova-gratis"[\s\S]*?return \{ screen: "welcome" \}/);
});
