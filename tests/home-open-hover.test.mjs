import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const index = read("index.html");
const style = read("style.css");
const worker = read("service-worker.js");

test("the MagicBook action uses the green horizontal OPEN design", () => {
  assert.match(
    index,
    /home-start-btn[\s\S]*?<img[^>]+startbtn\.gif[\s\S]*?<span class="home-start-open-label" aria-hidden="true">OPEN<span class="home-start-tap-cue"><\/span><\/span>/u
  );
  assert.match(style, /#home \.home-start-btn[\s\S]*?aspect-ratio:\s*29 \/ 15[\s\S]*?linear-gradient\(128deg, #063f36[\s\S]*?#65bf49 100%\)/u);
  assert.match(style, /#home \.home-start-open-label[\s\S]*?text-shadow:/u);
  assert.match(style, /#home \.home-start-open-label[\s\S]*?linear-gradient\(135deg, rgba\(2, 52, 48, 0\.72\), rgba\(3, 79, 66, 0\.38\)\)/u);
  assert.match(style, /#home \.home-start-open-label[\s\S]*?opacity:\s*1/u);
  assert.match(style, /#home \.home-start-btn:hover \.home-start-open-label/u);
  assert.match(style, /#home \.home-start-btn:focus-visible \.home-start-open-label/u);
  assert.match(style, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.home-start-open-label[\s\S]*?opacity:\s*1/u);
});

test("OPEN reuses the decorative Android tap timeline with a shorter browser cycle", () => {
  const native = read("android-study-shell.css");
  assert.match(index, /<button class="home-start-btn" onclick="showChapters\(\)" type="button" aria-label="Apri Magic Book">/u);
  assert.match(style, /#home \.home-start-tap-cue\s*\{[^}]*position: absolute;[^}]*width: 34px;[^}]*height: 34px;[^}]*clich_here\.svg[^}]*pointer-events: none;[^}]*animation: native-book-tap 2\.8s/u);
  assert.match(native, /animation: native-book-tap 5s/u);
  assert.match(native, /@keyframes native-book-tap[^]*var\(--tap-cue-contact-y, -48px\)/u);
  assert.doesNotMatch(style, /@keyframes native-book-tap/u);
  assert.ok(worker.includes('/icons/clich_here.svg'));
});

test("the hand yields to input, unavailable actions and motion preferences", () => {
  assert.match(style, /:is\(:hover, :focus-visible, :active, :disabled, \[aria-disabled="true"\], \[aria-busy="true"\]\) \.home-start-tap-cue/u);
  assert.match(style, /html\[data-app-transition\] #home \.home-start-tap-cue/u);
  assert.match(style, /html\[data-native-motion-paused\] #home \.home-start-tap-cue\s*\{\s*animation: none;\s*opacity: 0;/u);
  assert.match(style, /@media \(prefers-reduced-motion: reduce\), \(forced-colors: active\)\s*\{\s*#home \.home-start-tap-cue \{ display: none; animation: none;/u);
});

test("the OPEN cue ships in a fresh PWA cache", () => {
  assert.match(index, /style\.css\?v=73-open-hand/u);
  assert.match(worker, /magicbook-pwa-v194-native-quiz/u);
  assert.match(worker, /style\.css\?v=73-open-hand/u);
});
