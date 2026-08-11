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
  assert.match(page, /অধ্যায় ১ ও ৩/);
  assert.match(main, /Capitoli 1 e 3 con libro, audio e quiz/);
  assert.doesNotMatch(main, /\[2, 4\]/);
  assert.doesNotMatch(quiz, /\["2", "4"\]/);
});

test("trial promotion starts in Bangla and alternates safely every ten seconds", () => {
  const main = readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");

  assert.match(page, /id="trialPromoCopy" lang="bn"/);
  assert.match(page, /href="https:\/\/banglawebfonts\.pages\.dev\/css\/ekush\.css" rel="stylesheet"/);
  assert.match(page, /৪ দিন বিনামূল্যে/);
  assert.match(page, /ম্যাজিকবুক ব্যবহার করে দেখুন/);
  const banglaCopy = page.match(/<span class="trial-card-copy is-bangla"[\s\S]*?<\/span>/)?.[0] || "";
  assert.doesNotMatch(banglaCopy.replace(/<[^>]+>/g, ""), /[A-Za-z]/);
  assert.match(main, /setInterval\(\(\) => \{[\s\S]*?\}, 10000\)/);
  assert.match(main, /replaceChildren\(copy\.kicker\)/);
  assert.doesNotMatch(main, /trialPromoCopy[\s\S]{0,800}innerHTML/);
  assert.match(styles, /font-family:"Ekush",serif/);
  assert.match(main, /classList\.add\("is-copy-leaving"\)[\s\S]*?classList\.add\("is-copy-entering"\)/);
  assert.match(styles, /is-copy-leaving[^{]*\{[^}]*filter:blur\(5px\)/);
  assert.match(styles, /is-copy-entering[^{]*\{[^}]*translateY\(10px\)/);
  assert.match(page, /class="trial-countdown-ring" data-trial-progress/);
  assert.match(main, /remaining \/ FREE_TRIAL_DURATION_MS \* 100/);
  assert.match(main, /setProperty\("--trial-progress", `\$\{progress\.toFixed\(4\)\}%`\)/);
  assert.match(page, /startGuestTrial\(\{ openChapter: 1 \}\)/);
  assert.match(page, /startGuestTrial\(\{ openChapter: 3 \}\)/);
  assert.doesNotMatch(page, /startGuestTrial\(\{ openChapter: (?:2|4) \}\)/);
  assert.match(styles, /@keyframes trialCountdownBreath/);
  assert.match(styles, /@keyframes trialChapterShine/);
  assert.match(styles, /@keyframes trialPromoGiftSwing/);
  assert.match(styles, /translateX\(-10px\)[\s\S]*translateX\(10px\)/);
  assert.match(styles, /prefers-reduced-motion:reduce[\s\S]*trial-promo-gift/);
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
