import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("one app transition owns delayed navigation and duplicate taps are ignored", () => {
  const script = read("script.js");
  const styles = read("mobile-experience.css");

  assert.match(script, /function begin\(name\)\s*\{\s*if \(activeToken\) return null;/u);
  assert.match(script, /function scheduleExclusiveAppNavigation\(name, beforeNavigate, navigate, delay = 460\)/u);
  assert.match(script, /if \(!appActionGate\.isCurrent\(token\)\) return;[\s\S]*?await navigate\(\);[\s\S]*?appActionGate\.release\(token\);/u);
  assert.match(styles, /html\.android-webview\[data-app-transition\][\s\S]*?#quizModeOverlay button,[\s\S]*?#examModeOverlay button[\s\S]*?pointer-events:\s*none;/u);
});

test("chapter, exam and quiz launches use the same exclusive action owner", () => {
  const script = read("script.js");

  assert.match(script, /function startEngineSequence\(\)[\s\S]*?appActionGate\.begin\(`start-chapter-\$\{selectedChapter\}`\)[\s\S]*?appActionGate\.isCurrent\(transitionToken\)/u);
  assert.match(script, /function startExamQuiz\(mode\)[\s\S]*?scheduleExclusiveAppNavigation\(/u);
  assert.match(script, /function startExamPdf\(\)[\s\S]*?scheduleExclusiveAppNavigation\(/u);
  for (const action of ["startStudyQuiz", "startMixQuiz", "startCapQuiz", "startMultiQuiz"]) {
    const start = script.indexOf(`function ${action}(`);
    assert.notEqual(start, -1, `${action} must exist`);
    assert.notEqual(script.indexOf("scheduleExclusiveAppNavigation(", start), -1, `${action} must coordinate navigation`);
  }
});

test("late audio responses are aborted before a newer control can take over", () => {
  const study = read("study-quiz.js");
  const quiz = read("quiz.js");

  assert.match(study, /function cancelPendingExplanation\(\)[\s\S]*?pending\.controller\?\.abort\(\)/u);
  assert.match(study, /fetchExplanationBlob\(question, \{ signal: request\.controller\.signal \}\)/u);
  assert.match(quiz, /function cancelPendingQuizExplanationAudio[\s\S]*?sharedAudioLoadController\?\.abort\(\)/u);
  assert.match(quiz, /requestSharedAudioBlob\(question, \{ signal \} = \{\}\)[\s\S]*?signal,/u);
});
