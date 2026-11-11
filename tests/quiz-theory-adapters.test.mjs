import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

for (const study of [false, true]) test(`${study ? "Study/QuizBank" : "Quiz/review"} stops existing audio before opening theory, without autoplay`, () => {
  const source = readFileSync(new URL(study ? "../study-quiz.js" : "../quiz.js", import.meta.url), "utf8");
  const name = study ? "createStudyTheoryButton" : "createQuizTheoryButton";
  const indent = study ? "  " : "";
  const match = source.match(new RegExp(`^${indent}function ${name}\\([^]*?^${indent}}`, "m"));
  assert.ok(match);
  const events = [], handlers = [], question = { id: "cap1_q38", question: "Fixture", figure: "" };
  let existingAudioPlaying = true;
  const button = { dataset: {}, addEventListener(type, handler, options) {
    assert.equal(type, "click"); handlers.push({ handler, capture: options?.capture === true });
  } };
  const owner = { createButton() {
    // Shared owner installs the actual dialog's ordinary click listener first.
    button.addEventListener("click", () => {
      assert.equal(existingAudioPlaying, false, "the prior recording must already be silent"); events.push("open");
    });
    return button;
  } };
  const stop = () => { existingAudioPlaying = false; events.push("stop"); };
  const context = vm.createContext({ window: { MagicQuizTheory: owner }, TRIAL_MODE: false,
    quizTheoryScope: "fixture", studyTheoryScope: "fixture", quizTheoryButtons: new Set(), studyTheoryButtons: new Set(),
    stopAllAudio: stop, stopPlayback: stop, requestQuizTheory() {}, requestStudyTheory() {} });
  vm.runInContext(match[0], context);
  const result = study ? context[name](question, {}) : context[name](question, "review", () => true);
  assert.equal(result, button); assert.deepEqual(events, [], "rendering does not stop or play media");
  assert.equal(handlers.filter(item => item.capture).length, 1);
  for (const item of [...handlers.filter(item => item.capture), ...handlers.filter(item => !item.capture)]) item.handler();
  assert.deepEqual(events, ["stop", "open"]);
  assert.equal(existingAudioPlaying, false, "opening never auto-resumes the old recording");
});
