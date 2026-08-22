import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const script = read("script.js");
const style = read("style.css");
const index = read("index.html");
const worker = read("service-worker.js");

test("the What's new popup opens after manual and restored authentication", () => {
  assert.equal((script.match(/openRouteState\(getRouteStateFromLocation\(\)\);\s*maybeShowWhatsNewPopup\(\);/gu) || []).length, 2);
  assert.match(script, /const WHATS_NEW_ARTWORK = "icons\/ui%20mobile\.svg"/u);
  assert.match(script, /whatsNewPopupShownThisVisit = true/u);
});

test("the popup is shown at most three times for each authenticated user", () => {
  assert.match(script, /const WHATS_NEW_MAX_SHOWS_PER_USER = 3;/u);
  assert.match(script, /const WHATS_NEW_SHOW_COUNT_PREFIX = "whats_new_popup_show_count:";/u);
  assert.match(script, /normalizePhone\(getCurrentSessionPhone\(\)\)/u);
  assert.match(script, /getWhatsNewPopupShowCount\(\) >= WHATS_NEW_MAX_SHOWS_PER_USER/u);
  assert.match(script, /Math\.min\(WHATS_NEW_MAX_SHOWS_PER_USER, getWhatsNewPopupShowCount\(\) \+ 1\)/u);
  assert.match(script, /recordWhatsNewPopupShown\(\);\s*whatsNewPopupShownThisVisit = true;/u);
  assert.match(script, /if \(hasReachedWhatsNewPopupLimit\(\)\) return false;/u);
  assert.ok((script.match(/if \(hasReachedWhatsNewPopupLimit\(\)\) return;/gu) || []).length >= 2);
});

test("the popup has both requested dismissal controls", () => {
  assert.match(script, /closeButton\.className = "whats-new-close"/u);
  assert.match(script, /understoodButton\.className = "whats-new-understood"/u);
  assert.match(script, /understoodButton\.textContent = "Capito"/u);
  assert.match(style, /\.whats-new-close[\s\S]*?top:[\s\S]*?right:/u);
  assert.match(style, /\.whats-new-understood[\s\S]*?bottom:[\s\S]*?left:\s*50%/u);
});

test("the popup coordinates with existing blocking dialogs and ships in the PWA cache", () => {
  assert.match(script, /document\.getElementById\("whatsNewPopupOverlay"\)/u);
  assert.match(index, /style\.css\?v=62-home-learning-layout/u);
  assert.match(index, /script\.js\?v=57-whats-new-limit/u);
  assert.match(worker, /magicbook-pwa-v120-quiet-study-canvas/u);
  assert.match(worker, /script\.js\?v=57-whats-new-limit/u);
  assert.match(worker, /\/icons\/ui%20mobile\.svg/u);
});
