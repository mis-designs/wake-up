import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const quizPage = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const studyPage = readFileSync(new URL("../study-quiz.html", import.meta.url), "utf8");
const quizSource = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const quizHelpSource = readFileSync(new URL("../quiz-help.js", import.meta.url), "utf8");
const studySource = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
const dictionarySource = readFileSync(new URL("../magic-dictionary.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../audio-player-ui.css", import.meta.url), "utf8");
const reviewStyles = readFileSync(new URL("../mystyle.css", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

test("Quiz and Studia load the shared audio coordinator before their playback owners", () => {
  const focusAsset = "audio-focus.js?v=1-resumable-tts";
  assert.ok(quizPage.indexOf(focusAsset) < quizPage.indexOf("magic-dictionary.js?v=1.2.6-audio-focus"));
  assert.ok(quizPage.indexOf(focusAsset) < quizPage.indexOf("quiz.js?v=79-audio-focus"));
  assert.ok(studyPage.indexOf(focusAsset) < studyPage.indexOf("magic-dictionary.js?v=1.2.6-audio-focus"));
  assert.ok(studyPage.indexOf(focusAsset) < studyPage.indexOf("study-quiz.js?v=24-audio-focus"));
  assert.match(worker, /\/audio-focus\.js\?v=1-resumable-tts/u);
});

test("live Quiz question and keyword TTS share one resumable explanation focus", () => {
  assert.match(quizSource, /sharedAudioFocusAdapter[\s\S]*?reviewAudioFocusAdapter/u);
  assert.match(quizSource, /function beginQuizTtsFocus\([\s\S]*?audioFocus\.beginTransient/u);
  assert.match(quizSource, /function completeQuizTts\([\s\S]*?completeTransient\(token, \{ resume \}\)/u);
  assert.match(quizSource, /cancelQuizTts\("it", \{ resume: false, reason: "manual" \}\)/u);
  assert.match(quizSource, /cancelQuizTts\("bn", \{ resume: false, reason: "manual" \}\)/u);
  assert.match(quizHelpSource, /key: `quiz-word:\$\{key\}`[\s\S]*?completeWordAudio\(playback, \{ resume: true \}\)/u);
});

test("pending Quiz explanation starts are invalidated before transient audio", () => {
  assert.match(quizSource, /function cancelPendingQuizExplanationAudio\([\s\S]*?sharedAudioPlayRequestId \+= 1;[\s\S]*?reviewAudioPending/u);
  assert.match(quizSource, /function beginQuizTtsFocus\([\s\S]*?cancelPendingQuizExplanationAudio\(\{ preserveStartedPlayback: Boolean\(audioFocus\) \}\)/u);
  assert.match(quizHelpSource, /cancelPendingQuizExplanationAudio\?\.\(\{ preserveStartedPlayback: Boolean\(focus\) \}\)/u);
});

test("Studia separates explanation playback from TTS and guards stale requests", () => {
  assert.match(studySource, /let activePlayback = null;\s+let activeTtsPlayback = null;/u);
  assert.match(studySource, /createExplanationFocusAdapter\([\s\S]*?setSuspended/u);
  assert.match(studySource, /function beginStudyTts\([\s\S]*?cancelPendingExplanation\(\);[\s\S]*?beginTransient/u);
  assert.match(studySource, /completeStudyTts\(playback, \{ resume: true \}\)/u);
  assert.match(studySource, /stopStudyTts\(\{ resume: false, reason: "manual" \}\)/u);
  assert.match(studySource, /pendingExplanation !== request \|\| request\.id !== explanationRequestId/u);
});

test("dictionary speech uses the same transient focus lifecycle", () => {
  assert.match(dictionarySource, /focus\.beginTransient\(\{[\s\S]*?key: `dictionary-it:/u);
  assert.match(dictionarySource, /utterance\.onend = \(\) => completeItalianSpeech\(focusToken, requestId, \{ resume: true \}\)/u);
  assert.match(dictionarySource, /focus\.cancelTransient\(token, \{ resume, reason \}\)/u);
});

test("interrupted explanation players have a stable visual and accessible state", () => {
  assert.match(styles, /\.quiz-audio-explanation\.is-interrupted,\s*\.study-explanation-player\.is-interrupted\s*\{[\s\S]*?border-style:\s*dashed;[\s\S]*?background:\s*transparent;/u);
  assert.match(reviewStyles, /\.modal-review-audio-button\.is-interrupted\s*\{[\s\S]*?outline:\s*2px dashed/u);
  assert.match(quizSource, /Spiegazione in pausa durante l'altro audio/u);
  assert.match(studySource, /Spiegazione in pausa durante l'altro audio/u);
});
