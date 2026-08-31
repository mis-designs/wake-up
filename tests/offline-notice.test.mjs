import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const script = read("offline-notice.js");
const css = read("offline-notice.css");
const worker = read("service-worker.js");

test("all Magic Book pages load the shared offline notice", () => {
  for (const page of ["index.html", "quiz.html", "study-quiz.html", "libreria-font.html", "aggiungi-spiegazioni.html"]) {
    const html = read(page);
    assert.match(html, /offline-notice\.css\?v=1\.0\.0/u, `${page} must load the offline styles`);
    assert.match(html, /offline-notice\.js\?v=1\.0\.0/u, `${page} must load the offline behavior`);
  }
});

test("the notice reacts on first render, disconnect, reconnect and page restore", () => {
  assert.match(script, /navigator\?\.onLine === false/u);
  assert.match(script, /addEventListener\("offline", updateConnectivityNotice\)/u);
  assert.match(script, /addEventListener\("online", updateConnectivityNotice\)/u);
  assert.match(script, /addEventListener\("pageshow", updateConnectivityNotice\)/u);
  assert.match(script, /DOMContentLoaded/u);
  assert.match(script, /notice\.hidden = false/u);
  assert.match(script, /notice\.hidden = true/u);
});

test("the blocking alert owns focus and restores the previous application state", () => {
  assert.match(script, /role", "alertdialog"/u);
  assert.match(script, /aria-modal/u);
  assert.match(script, /previousFocus = documentObject\.activeElement/u);
  assert.match(script, /setBackgroundInert\(true\)/u);
  assert.match(script, /setBackgroundInert\(false\)/u);
  assert.match(script, /focusTarget\.focus/u);
  assert.match(script, /event\.key !== "Tab"/u);
  assert.doesNotMatch(script, /alert\(|confirm\(|prompt\(/u);
});

test("the notice is responsive, motion-safe and cached for offline rendering", () => {
  assert.match(css, /max\(20px, env\(safe-area-inset-top\)\)/u);
  assert.match(css, /@media \(max-width: 480px\)/u);
  assert.match(css, /prefers-reduced-motion: reduce/u);
  assert.match(css, /forced-colors: active/u);
  assert.match(worker, /\/offline-notice\.css\?v=1\.0\.0/u);
  assert.match(worker, /\/offline-notice\.js\?v=1\.0\.0/u);
  assert.match(worker, /\/icons\/no-internet\.gif/u);
  assert.ok(existsSync(new URL("../icons/no-internet.gif", import.meta.url)));
});
