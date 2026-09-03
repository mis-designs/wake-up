import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const page = read("index.html");
const script = read("script.js");
const style = read("style.css");
const worker = read("service-worker.js");

test("the WhatsApp dialog uses the local Bengali type system and clear learner copy", () => {
  assert.match(page, /assets\/fonts\/magicbook-bangla-fonts\.css\?v=1-adorsho/u);
  assert.match(script, /title: "MagicBook WhatsApp গ্রুপে যোগ দিন"/u);
  assert.match(script, /message: "অ্যাপের খবর, সাহায্য ও নতুন আপডেট পেতে আমাদের অফিসিয়াল WhatsApp গ্রুপে যোগ দিন।"/u);
  assert.match(script, /secondary: "এখন নয়"/u);
  assert.match(script, /bnBtn\.textContent = "বাংলা"/u);
  assert.match(style, /#whatsappGroupPopupCard\[lang="bn"\] \.wgp-title[\s\S]*?var\(--font-bn-title\)/u);
  assert.match(style, /#whatsappGroupPopupCard\[lang="bn"\] \.wgp-message,[\s\S]*?var\(--font-bn-support\)/u);
});

test("the language bar stays aligned and the two actions reuse the Admin pill grammar", () => {
  assert.match(script, /topbar\.className = "wgp-topbar"/u);
  assert.match(script, /topbar\.appendChild\(closeBtn\);\s*topbar\.appendChild\(langToggle\);/u);
  assert.match(style, /\.wgp-topbar\s*\{[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*space-between;/u);
  assert.match(style, /\.wgp-lang\s*\{[\s\S]*?min-height:\s*44px;/u);
  assert.doesNotMatch(style, /\.wgp-lang\s*\{[^}]*position:\s*absolute;/u);
  assert.match(script, /primary\.className = "wgp-action-pill wgp-primary"/u);
  assert.match(script, /secondary\.className = "wgp-action-pill wgp-secondary"/u);
  assert.match(style, /\.wgp-action-pill\s*\{[\s\S]*?min-height:\s*58px;[\s\S]*?border-radius:\s*999px;/u);
  assert.match(style, /\.wgp-action-icon\s*\{[\s\S]*?radial-gradient/u);
});

test("the WhatsApp invitation behaves as a bounded accessible modal", () => {
  assert.match(script, /overlay\.setAttribute\("aria-modal", "true"\)/u);
  assert.match(script, /overlay\.setAttribute\("aria-labelledby", "whatsappGroupPopupTitle"\)/u);
  assert.match(script, /overlay\.setAttribute\("aria-describedby", "whatsappGroupPopupMessage"\)/u);
  assert.match(script, /if \(event\.key === "Escape"\)[\s\S]*?closePopup\(\)/u);
  assert.match(script, /if \(event\.key !== "Tab"\) return;[\s\S]*?const focusable = \[closeBtn, bnBtn, itBtn, primary, secondary\]/u);
  assert.match(script, /backgroundState\.push\(\{ element, inert: element\.inert \}\);\s*element\.inert = true;/u);
  assert.match(script, /previouslyFocused instanceof HTMLElement[\s\S]*?previouslyFocused\.focus/u);
  assert.match(style, /max-height:\s*calc\(100dvh - 32px\)/u);
  assert.match(style, /@media \(max-height: 620px\)/u);
  assert.match(style, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?#whatsappGroupPopupOverlay/u);
  assert.match(style, /@media \(forced-colors: active\)[\s\S]*?#whatsappGroupPopupCard/u);
});

test("popup presentation belongs to shared CSS and ships in the current cache", () => {
  assert.doesNotMatch(script, /injectWhatsAppGroupPopupStyles|whatsappGroupPopupStyles/u);
  assert.doesNotMatch(script, /icon\.textContent\s*=/u);
  assert.match(page, /style\.css\?v=72-solid-profile-controls/u);
  assert.match(page, /script\.js\?v=69-exclusive-actions/u);
  assert.match(worker, /magicbook-pwa-v159-solid-profile-controls/u);
  assert.match(worker, /style\.css\?v=72-solid-profile-controls/u);
  assert.match(worker, /script\.js\?v=69-exclusive-actions/u);
});
