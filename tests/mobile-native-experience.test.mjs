import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Android WebView is detected before the responsive stylesheet paints", () => {
  const index = read("index.html");
  const quiz = read("quiz.html");

  for (const page of [index, quiz]) {
    assert.match(page, /classList\.add\("android-webview"\)/u);
    assert.match(page, /mobile-experience\.css\?v=1-native-density/u);
  }

  assert.ok(index.indexOf("android-webview") < index.indexOf("style.css?v=72-solid-profile-controls"));
  assert.ok(quiz.indexOf("android-webview") < quiz.indexOf("mystyle.css?v=50-user-timer-prompt"));
});

test("native density removes the blank promo and keeps compact, scroll-safe controls", () => {
  const styles = read("mobile-experience.css");

  assert.match(styles, /#home \.home-promo-shell\s*\{\s*display: none;/u);
  assert.match(styles, /\.chapter-card-track\s*\{[^}]*touch-action: pan-y;/su);
  assert.match(styles, /\.quiz-command-bar \.controls button,[^}]*height: 44px;/su);
  assert.match(styles, /-webkit-text-size-adjust: 100%/u);
  assert.match(styles, /\.dash-engine\s*\{[^}]*animation: none;/su);
});

test("chapter drag work is frame-batched and native navigation is shorter", () => {
  const script = read("script.js");
  const worker = read("service-worker.js");

  assert.match(script, /cardDragFrame = requestAnimationFrame/u);
  assert.match(script, /updateCardTrack\(cardDragDelta, cardTrackBaseOffset\)/u);
  assert.match(script, /const navigationDelay = compactMotion \? 650 : 1650;/u);
  assert.match(worker, /mobile-experience\.css\?v=1-native-density/u);
  assert.match(worker, /script\.js\?v=68-native-fluidity/u);
});
