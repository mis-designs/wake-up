import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quizSource = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const studySource = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test("quiz audio availability waits and no longer downloads the blob automatically", () => {
  assert.match(quizSource, /SHARED_AUDIO_AVAILABILITY_DELAY_MS\s*=\s*350/);
  assert.match(quizSource, /sharedAudioAvailabilityController\?\.abort\(\)/);
  assert.match(quizSource, /sharedAudioAvailabilityCache\s*=\s*new Map\(\)/);

  const availability = functionSource(quizSource, "updateSharedAudioAvailability", "playSharedAudio");
  assert.doesNotMatch(availability, /loadSharedAudioSource|requestSharedAudioBlob/);
});

test("navigating questions does not prefetch Italian or Bangla TTS", () => {
  const showQuestion = functionSource(quizSource, "showQuestion", "answer");
  assert.doesNotMatch(showQuestion, /prefetchItalian|prefetchBengali/);
  assert.doesNotMatch(quizSource, /function prefetchItalian|function prefetchBengali/);
});

test("figure requests and study audio checks require a short dwell", () => {
  assert.match(quizSource, /QUIZ_IMAGE_REQUEST_DELAY_MS\s*=\s*140/);
  assert.match(studySource, /STUDY_AUDIO_STATUS_DELAY_MS\s*=\s*400/);
  assert.match(studySource, /pendingAudioStatusChecks/);
  assert.match(studySource, /audioStatusCache\s*=\s*new Map\(\)/);
});
