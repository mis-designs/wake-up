import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFileSync(path.join(root, file), "utf8");

const loadingCss = read("loading-ui.css");
const page = read("index.html");
const script = read("script.js");
const quizPage = read("quiz.html");
const quiz = read("quiz.js");
const quizStyle = read("mystyle.css");
const quizHelp = read("quiz-help.js");
const studyPage = read("study-quiz.html");
const study = read("study-quiz.js");
const audioAdminPage = read("aggiungi-spiegazioni.html");
const audioAdmin = read("aggiungi-spiegazioni.js");
const dictionary = read("magic-dictionary.js");
const learning = read("src/learning-insights.js");
const worker = read("service-worker.js");

test("the supplied 640px GIF is the canonical shared loading asset", () => {
  const gif = readFileSync(path.join(root, "icons", "loading.gif"));
  assert.equal(gif.subarray(0, 6).toString("ascii"), "GIF89a");
  assert.equal(gif.readUInt16LE(6), 640);
  assert.equal(gif.readUInt16LE(8), 640);
  assert.match(loadingCss, /url\("\/icons\/loading\.gif"\)/u);
  assert.match(loadingCss, /\.magic-loading-indicator--panel/u);
  assert.match(loadingCss, /\.magic-loading-control\.is-loading::after/u);
  assert.match(loadingCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?visibility: hidden/u);
  assert.match(loadingCss, /@media \(forced-colors: active\)/u);
});

test("every asynchronous application entry loads the shared indicator stylesheet", () => {
  for (const html of [page, quizPage, studyPage, audioAdminPage]) {
    assert.match(html, /loading-ui\.css\?v=1-shared-gif-loader/u);
  }
  assert.match(page, /login-submit-spinner[\s\S]*?icons\/loading\.gif/u);
  assert.match(page, /promo-access-submit[\s\S]*?icons\/loading\.gif/u);
  assert.match(studyPage, /study-loader[\s\S]*?icons\/loading\.gif/u);
  assert.doesNotMatch(studyPage, /icons\/driving-license\.gif/u);
});

test("main, Admin, book, dictionary and learning operations expose truthful GIF loading states", () => {
  assert.match(script, /function setLoginButtonBusy[\s\S]*?aria-busy[\s\S]*?spinner\?\.classList\.toggle\("hidden", !isBusy\)/u);
  assert.match(script, /renderAdminLoading[\s\S]*?magic-loading-indicator--panel[\s\S]*?icons\/loading\.gif/u);
  assert.match(script, /admin-promo-spinner magic-loading-indicator__media[\s\S]*?icons\/loading\.gif/u);
  assert.match(script, /viewer-loading magic-loading-indicator[\s\S]*?img\.src = "icons\/loading\.gif"/u);
  assert.doesNotMatch(script, /VIEWER_LOADING_FIGURES/u);
  assert.match(dictionary, /renderGateLoading[\s\S]*?icons\/loading\.gif/u);
  assert.match(dictionary, /magicDictionaryList[\s\S]*?aria-busy[\s\S]*?icons\/loading\.gif/u);
  assert.match(learning, /li-loading-copy magic-loading-indicator[\s\S]*?icons\/loading\.gif/u);
});

test("quiz, study and explanation operations reuse the same busy-control contract", () => {
  assert.match(quizPage, /quiz-loading-figure[\s\S]*?icons\/loading\.gif/u);
  assert.match(quizPage, /id="loading-text" class="sr-only"/u);
  assert.match(quizStyle, /\.loading-overlay\s*\{[\s\S]*?background:\s*#ffffff;/u);
  assert.match(quizStyle, /\.loading-card\s*\{\s*display:\s*contents;/u);
  assert.match(quizStyle, /\.quiz-loading-figure\s*\{[\s\S]*?border:\s*0;[\s\S]*?box-shadow:\s*none;/u);
  assert.doesNotMatch(quizStyle, /#loading-text\s*\{[\s\S]*?font-weight/u);
  assert.doesNotMatch(quiz, /QUIZ_LOADING_FIGURES/u);
  assert.match(quiz, /"Risultato non disponibile"[\s\S]*?"Non siamo riusciti a controllare il risultato\. Verifica la connessione e riprova\."/u);
  assert.match(quiz, /modal-review-translation-loading magic-loading-indicator[\s\S]*?icons\/loading\.gif/u);
  assert.match(quiz, /modal-review-audio-button magic-loading-control/u);
  assert.match(quizHelp, /quiz-help-word-audio magic-loading-control/u);
  assert.match(quizHelp, /magic-loading-inline-status", "is-loading/u);
  assert.match(study, /study-action magic-loading-control/u);
  assert.match(study, /study-explanation-player magic-loading-host/u);
  assert.match(study, /Caricamento traduzione…[\s\S]*?icons\/loading\.gif|icons\/loading\.gif[\s\S]*?Caricamento traduzione…/u);
  assert.match(audioAdmin, /audio-admin-help-status magic-loading-inline-status is-loading/u);
  assert.match(audioAdmin, /audio-admin-italian-listen magic-loading-control/u);
  assert.match(audioAdmin, /save\.classList\.toggle\("is-loading", item\.saving\)/u);
  assert.match(audioAdmin, /trigger\.setAttribute\("aria-busy", "true"\)/u);
});

test("the shared loader and all changed consumers ship in one fresh PWA cache", () => {
  assert.match(worker, /magicbook-pwa-v159-solid-profile-controls/u);
  assert.match(worker, /loading-ui\.css\?v=1-shared-gif-loader/u);
  assert.match(worker, /icons\/loading\.gif/u);
  assert.match(worker, /style\.css\?v=72-solid-profile-controls/u);
  assert.match(worker, /script\.js\?v=68-native-fluidity/u);
  assert.match(worker, /mystyle\.css\?v=50-user-timer-prompt/u);
  assert.match(worker, /audio-player-ui\.css\?v=4-speed-outward/u);
  assert.match(worker, /quiz\.js\?v=78-audio-speed-cycle/u);
  assert.match(worker, /quiz-help\.js\?v=20260901-italian-display-order/u);
  assert.match(worker, /study-quiz\.js\?v=23-audio-speed-cycle/u);
  assert.match(worker, /magic-dictionary\.js\?v=1\.2\.5-shared-gif-loader/u);
  assert.match(worker, /learning-insights\.js\?v=5-figure-explanation-ui&ui=7-shared-gif-loader/u);
});
