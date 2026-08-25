import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

test("the passed-result video plays once with audio and settles on a static image", () => {
  assert.match(script, /function setModalVideo\(videoSrc, fallbackIconSrc, fallbackText, options = \{\}\)/u);
  assert.match(script, /const shouldMute = options\.muted === true;/u);
  assert.match(script, /const shouldLoop = options\.loop !== false;/u);
  assert.match(script, /modalResultVideo\.muted = shouldMute;\s*modalResultVideo\.volume = shouldMute \? 0 : 1;/u);
  assert.match(script, /modalResultVideo\.onended = !shouldLoop && endIconSrc[\s\S]*?setModalIcon\(endIconSrc, fallbackText\);/u);
  assert.match(
    script,
    /setModalVideo\([\s\S]*?isPassed \? RESULT_VIDEO_SOURCES\.pass : RESULT_VIDEO_SOURCES\.fail,[\s\S]*?muted:\s*!isPassed,[\s\S]*?loop:\s*!isPassed,[\s\S]*?endIconSrc:\s*isPassed \? "icons\/superato\.png" : ""/u
  );
  assert.match(script, /function setModalIcon[\s\S]*?modalIconShell\.onclick = null;[\s\S]*?removeAttribute\("role"\)/u);
});

test("the one-shot passed-result video ships with its static image", () => {
  assert.match(page, /quiz\.js\?v=68-review-exclusive-accordion/u);
  assert.match(worker, /magicbook-pwa-v137-hadi-title-ekushey-study-text/u);
  assert.match(worker, /quiz\.js\?v=68-review-exclusive-accordion/u);
  assert.match(worker, /\/icons\/superato\.png/u);
});
