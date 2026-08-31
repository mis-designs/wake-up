import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const quizPage = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const studyPage = readFileSync(new URL("../study-quiz.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../audio-player-ui.css", import.meta.url), "utf8");
const quizScript = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const studyScript = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

test("Quiz and Studia quiz load one shared Admin-derived player skin", () => {
  assert.ok(quizPage.indexOf("mystyle.css?v=49-single-surface-loader") < quizPage.indexOf("audio-player-ui.css?v=1-admin-pill"));
  assert.ok(studyPage.indexOf("study-quiz.css?v=24-shared-gif-loader") < studyPage.indexOf("audio-player-ui.css?v=1-admin-pill"));
  assert.match(styles, /\.quiz-audio-explanation,\s*\.study-explanation-player\s*\{[\s\S]*?min-height:\s*54px;[\s\S]*?border-radius:\s*999px;[\s\S]*?linear-gradient\(180deg/u);
  assert.match(styles, /--audio-player-start:\s*#34d399;[\s\S]*?--audio-player-mid:\s*#10b981;[\s\S]*?--audio-player-end:\s*#059669;/u);
  assert.match(styles, /\.quiz-audio-speed,\s*\.study-explanation-speed\s*\{[\s\S]*?rgba\(124, 58, 237, \.08\)[\s\S]*?color:\s*#5b21b6;/u);
});

test("play and pause marks are geometrically centred in a stable 40px control", () => {
  assert.match(styles, /\.quiz-audio-play,\s*\.study-explanation-play\s*\{[\s\S]*?display:\s*grid;[\s\S]*?width:\s*40px;[\s\S]*?height:\s*40px;[\s\S]*?place-items:\s*center;/u);
  assert.match(styles, /\.quiz-audio-play::before,[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*50%;[\s\S]*?left:\s*50%;/u);
  assert.match(styles, /\.quiz-audio-play\.is-playing::before,[\s\S]*?width:\s*3px;[\s\S]*?height:\s*14px;[\s\S]*?translate\(-5px, -50%\)/u);
  assert.match(styles, /\.quiz-audio-play\.is-playing::after,[\s\S]*?opacity:\s*1;[\s\S]*?translate\(2px, -50%\)/u);
});

test("player controls expose hover, focus, state and motion-safe feedback", () => {
  assert.match(styles, /\.quiz-audio-play:hover:not\(:disabled\)[\s\S]*?translateY\(-2px\)/u);
  assert.match(styles, /\.quiz-audio-play:focus-visible,[\s\S]*?outline:\s*3px solid #263bd4;/u);
  assert.match(styles, /\.quiz-audio-explanation\.is-loading,[\s\S]*?\.study-explanation-player\.is-loading/u);
  assert.match(styles, /\.quiz-audio-explanation\.is-error,[\s\S]*?\.study-explanation-player\.is-error/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*none;/u);
  assert.match(styles, /@media \(forced-colors: active\)[\s\S]*?background:\s*ButtonFace;[\s\S]*?color:\s*ButtonText;/u);
});

test("playback state updates the visible control and its accessible action", () => {
  assert.match(quizScript, /function setSharedAudioPlaying\(isPlaying\)[\s\S]*?sharedAudioPlay\?\.setAttribute\("aria-label", isPlaying \? "Metti in pausa la spiegazione" : "Riproduci spiegazione"\)[\s\S]*?sharedAudioPlayer\?\.classList\.toggle\("is-playing", isPlaying\)/u);
  assert.match(studyScript, /function setExplanationPlaying\(controls, isPlaying\)[\s\S]*?controls\?\.play\.classList\.toggle\("is-playing", isPlaying\)[\s\S]*?controls\?\.play\.setAttribute\("aria-label", isPlaying \? "Metti in pausa la spiegazione" : "Riproduci spiegazione"\)/u);
});

test("the shared player ships through the current PWA cache", () => {
  assert.match(quizPage, /quiz\.js\?v=75-audio-player-pill/u);
  assert.match(studyPage, /study-quiz\.js\?v=19-audio-player-pill/u);
  assert.match(worker, /CACHE_NAME = "magicbook-pwa-v151-audio-player-pill"/u);
  assert.match(worker, /audio-player-ui\.css\?v=1-admin-pill/u);
  assert.match(worker, /quiz\.js\?v=75-audio-player-pill/u);
  assert.match(worker, /study-quiz\.js\?v=19-audio-player-pill/u);
});
