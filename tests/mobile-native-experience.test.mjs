import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Android WebView is detected before the responsive stylesheet paints", () => {
  const index = read("index.html");
  const quiz = read("quiz.html");
  const marker = read("android-webview-mode.js");

  for (const page of [index, quiz]) {
    assert.match(page, /android-webview-mode\.js\?v=2-aura-fluid/u);
    assert.match(page, /mobile-experience\.css\?v=4-admin-scroll/u);
  }

  assert.match(marker, /classList\.add\("android-webview"\)/u);
  assert.ok(index.indexOf("android-webview-mode.js") < index.indexOf("style.css?v=72-solid-profile-controls"));
  assert.ok(quiz.indexOf("android-webview-mode.js") < quiz.indexOf("mystyle.css?v=51-question-footer-reflow"));
});

test("native density removes the blank promo and keeps compact, scroll-safe controls", () => {
  const styles = read("mobile-experience.css");

  assert.match(styles, /#home \.home-promo-shell\s*\{\s*display: none;/u);
  assert.match(styles, /\.chapter-card-track\s*\{[^}]*touch-action: pan-y;/su);
  assert.match(styles, /\.quiz-command-bar \.controls button,[^}]*height: 44px;/su);
  assert.match(styles, /-webkit-text-size-adjust: 100%/u);
  assert.match(styles, /\.dash-engine\s*\{[^}]*animation: none;/su);
});

test("the native header reserves symmetric space for live utility buttons", () => {
  const styles = read("mobile-experience.css");
  const script = read("script.js");

  assert.match(styles, /grid-template-columns:\s*var\(--native-header-side\) minmax\(0, 1fr\) var\(--native-header-side\);/u);
  assert.match(styles, /data-app-utility-count="2"[^}]*--native-header-side:\s*94px;/su);
  assert.match(styles, /data-app-profile-visible="true"[^}]*\.admin-entry[\s\S]*?right:\s*60px;/u);
  assert.match(styles, /\.chapter-status\s*\{[^}]*max-width:\s*100%;[^}]*justify-content:\s*center;/su);
  assert.match(script, /function syncAppUtilityLayout\(\)[\s\S]*?root\.dataset\.appUtilityCount[\s\S]*?root\.dataset\.appAdminVisible[\s\S]*?root\.dataset\.appProfileVisible/u);
});

test("native home actions center when they fit and remain scroll-safe when they do not", () => {
  const styles = read("mobile-experience.css");

  assert.match(styles, /#home > \.home-actions\s*\{[^}]*margin-block:\s*auto;[^}]*margin-inline:\s*auto;/su);
  assert.match(styles, /#home\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior-y:\s*contain;/su);
});

test("the native Admin panel owns one touch-safe vertical scroller", () => {
  const styles = read("mobile-experience.css");

  assert.match(styles, /html\.android-webview body\.admin-mode\s*\{[^}]*height:\s*100dvh;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/su);
  assert.match(styles, /html\.android-webview body\.admin-mode #adminPanel\s*\{[^}]*height:\s*100dvh;[^}]*min-height:\s*0;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior-y:\s*contain;[^}]*-webkit-overflow-scrolling:\s*touch;[^}]*touch-action:\s*pan-y pinch-zoom;/su);
});

test("chapter drag work is frame-batched and native navigation is shorter", () => {
  const script = read("script.js");
  const worker = read("service-worker.js");

  assert.match(script, /cardDragFrame = requestAnimationFrame/u);
  assert.match(script, /updateCardTrack\(cardDragDelta, cardTrackBaseOffset\)/u);
  assert.match(script, /const navigationDelay = compactMotion \? 650 : 1650;/u);
  assert.match(script, /const appActionGate = \(\(\) =>/u);
  assert.match(script, /function scheduleExclusiveAppNavigation/u);
  assert.match(worker, /mobile-experience\.css\?v=4-admin-scroll/u);
  assert.match(worker, /script\.js\?v=70-aura-fluid-drag/u);
});
