import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

test("the failed-result video stays muted while the passed-result video keeps its audio", () => {
  assert.match(script, /function setModalVideo\(videoSrc, fallbackIconSrc, fallbackText, muted = false\)/u);
  assert.match(script, /const shouldMute = muted === true;/u);
  assert.match(script, /modalResultVideo\.muted = shouldMute;\s*modalResultVideo\.volume = shouldMute \? 0 : 1;/u);
  assert.match(
    script,
    /setModalVideo\([\s\S]*?isPassed \? RESULT_VIDEO_SOURCES\.pass : RESULT_VIDEO_SOURCES\.fail,[\s\S]*?isPassed \? "OK" : "X",\s*!isPassed\s*\);/u
  );
});

test("the muted failed-result behavior ships in a fresh PWA build", () => {
  assert.match(page, /quiz\.js\?v=63-fail-video-muted/u);
  assert.match(worker, /magicbook-pwa-v103-pro-gradient-open/u);
  assert.match(worker, /quiz\.js\?v=63-fail-video-muted/u);
});
