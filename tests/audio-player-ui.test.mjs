import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const quizPage = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const studyPage = readFileSync(new URL("../study-quiz.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../audio-player-ui.css", import.meta.url), "utf8");
const quizScript = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const studyScript = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../aggiungi-spiegazioni.html", import.meta.url), "utf8");
const adminStyles = readFileSync(new URL("../aggiungi-spiegazioni.css", import.meta.url), "utf8");

test("Admin explanations and legacy review load the shared player instead of the old black skin", () => {
  const local = adminPage.indexOf("aggiungi-spiegazioni.css?v=12-shared-player");
  const shared = adminPage.indexOf("audio-player-ui.css?v=6-admin-unified");
  assert.ok(local >= 0 && shared > local);
  assert.match(styles, /\.audio-admin-player,\s*\.quiz-audio-explanation,\s*\.study-explanation-player\s*\{[\s\S]*?--audio-player-start:\s*#34d399;[\s\S]*?background:\s*transparent;/u);
  assert.match(styles, /\.audio-admin-player-play\.is-playing \.audio-player-icon--pause,[\s\S]*?opacity:\s*1;/u);
  assert.match(styles, /\.audio-admin-player-speed,\s*\.quiz-audio-speed,/u);
  assert.doesNotMatch(adminStyles, /\.audio-admin-player[^{}]*\{[^}]*\b(?:background|color):/u);
  assert.doesNotMatch(adminStyles, /\.audio-admin-player-play[^{}]*::before/u);
});

test("Quiz and Studia quiz load one shared Admin-derived player skin", () => {
  assert.ok(quizPage.indexOf("mystyle.css?v=56-web-open-paper") < quizPage.indexOf("audio-player-ui.css?v=8-native-quiz"));
  assert.ok(studyPage.indexOf("study-quiz.css?v=26-numberless-figures") < studyPage.indexOf("audio-player-ui.css?v=6-admin-unified"));
  assert.match(styles, /\.quiz-audio-explanation,\s*\.study-explanation-player\s*\{[\s\S]*?min-height:\s*56px;[\s\S]*?border:\s*1px solid var\(--audio-player-line\);[\s\S]*?border-radius:\s*999px;[\s\S]*?background:\s*transparent;/u);
  assert.match(styles, /box-shadow:[^;]*0 10px 28px rgba\(5, 150, 105, \.14\);[\s\S]*?backdrop-filter:\s*none;/u);
  assert.match(styles, /--audio-player-start:\s*#34d399;[\s\S]*?--audio-player-mid:\s*#10b981;[\s\S]*?--audio-player-end:\s*#059669;/u);
  assert.match(styles, /\.quiz-audio-speed,\s*\.study-explanation-speed\s*\{[\s\S]*?rgba\(124, 58, 237, \.08\)[\s\S]*?color:\s*#5b21b6;/u);
});

test("the supplied play and pause SVGs share one stable centred 40px control", () => {
  assert.match(styles, /\.quiz-audio-play,\s*\.study-explanation-play\s*\{[\s\S]*?display:\s*grid;[\s\S]*?width:\s*40px;[\s\S]*?height:\s*40px;[\s\S]*?place-items:\s*center;/u);
  assert.match(quizPage, /audio-player-icon--play[\s\S]*?M12 22C17\.5228[\s\S]*?M9\.5 8\.96533/u);
  assert.match(quizPage, /audio-player-icon--pause[\s\S]*?M9\.5 15V9M14\.5 15V9M22 12/u);
  assert.match(studyScript, /audio-player-icon--play[\s\S]*?M12 22C17\.5228[\s\S]*?M9\.5 8\.96533/u);
  assert.match(studyScript, /audio-player-icon--pause[\s\S]*?M9\.5 15V9M14\.5 15V9M22 12/u);
  assert.match(styles, /\.audio-player-icon\s*\{[\s\S]*?grid-area:\s*1 \/ 1;[\s\S]*?width:\s*25px;[\s\S]*?height:\s*25px;/u);
  assert.match(styles, /\.quiz-audio-play\.is-playing \.audio-player-icon--pause,[\s\S]*?opacity:\s*1;[\s\S]*?scale\(1\)/u);
  assert.match(styles, /\.quiz-audio-play::before,\s*\.study-explanation-play::before\s*\{[\s\S]*?content:\s*none;/u);
});

test("legacy black states cannot replace the transparent player surface", () => {
  assert.match(styles, /\.quiz-audio-explanation\.is-active\s*\{[\s\S]*?background:\s*transparent;/u);
  assert.match(styles, /\.quiz-audio-explanation\.is-loading,\s*\.study-explanation-player\.is-loading\s*\{[\s\S]*?background:\s*transparent;/u);
  assert.match(styles, /\.quiz-audio-explanation\.is-error,\s*\.study-explanation-player\.is-error\s*\{[\s\S]*?background:\s*transparent;/u);
});

test("the speed selector slows to 0.8x first and then advances to 2x", () => {
  assert.match(quizScript, /const SHARED_AUDIO_SPEED_STEPS = \[1, 0\.8, 1, 1\.25, 1\.5, 2\];/u);
  assert.match(quizScript, /let sharedAudioSpeedStep = 0;[\s\S]*?function cycleSharedAudioSpeed\(\)[\s\S]*?sharedAudioSpeedStep = \(sharedAudioSpeedStep \+ 1\) % SHARED_AUDIO_SPEED_STEPS\.length;[\s\S]*?formatSharedAudioSpeed\(sharedAudioSpeedValue\)/u);
  assert.match(studyScript, /const EXPLANATION_AUDIO_SPEED_STEPS = \[1, 0\.8, 1, 1\.25, 1\.5, 2\];/u);
  assert.match(studyScript, /speedStep: 0,[\s\S]*?function changeExplanationSpeed\(controls\)[\s\S]*?controls\.speedStep = \(controls\.speedStep \+ 1\) % EXPLANATION_AUDIO_SPEED_STEPS\.length;/u);
  assert.match(studyScript, /String\(controls\.speedValue\)\.replace\("\.", ","\)/u);
});

const speedButton = () => ({textContent: '1×', attributes: {}, setAttribute(name,value) {this.attributes[name] = value;}});
const speedClicks = [0.8, 1, 1.25, 1.5, 2, 1, 0.8, 1, 1.25, 1.5, 2, 1];

test("Quiz speed clicks update real playback rate and localized labels through two complete cycles", () => {
  const context = {
    sharedAudioSpeedStep: 0, sharedAudioSpeedValue: 1,
    sharedAudio: {playbackRate: 1}, sharedAudioSpeed: speedButton()
  };
  const steps = quizScript.match(/const SHARED_AUDIO_SPEED_STEPS = \[[^\]]+\];/u)[0];
  const format = quizScript.match(/function formatSharedAudioSpeed\([^]*?\n\}/u)[0];
  const cycle = quizScript.match(/function cycleSharedAudioSpeed\([^]*?\n\}/u)[0];
  vm.runInNewContext([steps,format,cycle].join('\n'),context);
  for (const expected of speedClicks) {
    context.cycleSharedAudioSpeed();
    assert.equal(context.sharedAudio.playbackRate,expected);
    assert.equal(context.sharedAudioSpeed.textContent,`${String(expected).replace('.',',')}×`);
    assert.equal(context.sharedAudioSpeed.attributes['aria-label'],`Velocità ${expected}x`);
  }
  context.sharedAudioSpeed = null;
  context.cycleSharedAudioSpeed();
  assert.equal(context.sharedAudio.playbackRate,0.8);
});

test("Study speed clicks stay synchronized and never alter a different question's audio", () => {
  const audio = {playbackRate: 1};
  const context = {activePlayback: {key: 'current', audio}};
  const controls = {key: 'current', speedStep: 0, speedValue: 1, speed: speedButton()};
  const steps = studyScript.match(/const EXPLANATION_AUDIO_SPEED_STEPS = \[[^\]]+\];/u)[0];
  const cycle = studyScript.match(/function changeExplanationSpeed\([^]*?\n  \}/u)[0];
  vm.runInNewContext([steps,cycle].join('\n'),context);
  for (const expected of speedClicks) {
    context.changeExplanationSpeed(controls);
    assert.equal(audio.playbackRate,expected);
    assert.equal(controls.speed.textContent,`${String(expected).replace('.',',')}×`);
    assert.equal(controls.speed.attributes['aria-label'],`Velocità ${expected}x`);
  }
  const other = {key: 'other', speedStep: 0, speedValue: 1, speed: speedButton()};
  context.changeExplanationSpeed(other);
  assert.equal(other.speedValue,0.8);
  assert.equal(audio.playbackRate,1);
  context.activePlayback = null;
  context.changeExplanationSpeed(controls);
  assert.equal(controls.speedValue,0.8);
  assert.equal(controls.speed.textContent,'0,8×');
});

test("artwork, progress and every speed label stay inside the mobile card", () => {
  assert.match(styles, /\.quiz-audio-explanation-shell,\s*\.study-explanation-media\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*44px minmax\(0, 1fr\);[\s\S]*?max-width:\s*100%;/u);
  assert.match(styles, /\.quiz-audio-explanation,\s*\.study-explanation-player\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*40px minmax\(42px, 1fr\) 56px;[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;/u);
  assert.match(styles, /\.quiz-audio-speed,\s*\.study-explanation-speed\s*\{[\s\S]*?justify-self:\s*stretch;[\s\S]*?width:\s*56px;[\s\S]*?max-width:\s*56px;[\s\S]*?white-space:\s*nowrap;[\s\S]*?transform-origin:\s*center;/u);
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*?grid-template-columns:\s*40px minmax\(36px, 1fr\) 52px;/u);
});

test("player controls expose hover, focus, state and motion-safe feedback", () => {
  assert.match(styles, /\.quiz-audio-play:hover:not\(:disabled\)[\s\S]*?translateY\(-2px\)/u);
  assert.match(styles, /\.quiz-audio-explanation:focus-within,[\s\S]*?border-color:\s*#10b981;[\s\S]*?rgba\(38, 59, 212, \.12\)/u);
  assert.match(styles, /\.quiz-audio-play:focus-visible,[\s\S]*?outline:\s*3px solid #263bd4;/u);
  assert.match(styles, /@keyframes audio-player-emerald-breathe[\s\S]*?rgba\(16, 185, 129, \.46\)/u);
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
  assert.match(quizPage, /audio-focus\.js\?v=1-resumable-tts[\s\S]*?quiz\.js\?v=85-audio-speed/u);
  assert.match(studyPage, /audio-focus\.js\?v=1-resumable-tts[\s\S]*?study-quiz\.js\?v=27-audio-speed/u);
  assert.match(quizPage, /quiz\.js\?v=85-audio-speed/u);
  assert.match(studyPage, /study-quiz\.js\?v=27-audio-speed/u);
  assert.match(worker, /CACHE_NAME = "magicbook-pwa-v197-dictionary-sequence"/u);
  assert.match(worker, /audio-player-ui\.css\?v=6-admin-unified/u);
  assert.match(worker, /audio-focus\.js\?v=1-resumable-tts/u);
  assert.match(worker, /quiz\.js\?v=85-audio-speed/u);
  assert.match(worker, /study-quiz\.js\?v=27-audio-speed/u);
});
