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
    /home-start-btn[\s\S]*?<img[^>]+startbtn\.gif[\s\S]*?<span class="home-start-open-label" aria-hidden="true">OPEN<\/span>/u
  );
  assert.match(style, /#home \.home-start-btn[\s\S]*?aspect-ratio:\s*29 \/ 15[\s\S]*?linear-gradient\(128deg, #063f36[\s\S]*?#65bf49 100%\)/u);
  assert.match(style, /#home \.home-start-open-label[\s\S]*?text-shadow:/u);
  assert.match(style, /#home \.home-start-open-label[\s\S]*?linear-gradient\(135deg, rgba\(2, 52, 48, 0\.72\), rgba\(3, 79, 66, 0\.38\)\)/u);
  assert.match(style, /#home \.home-start-open-label[\s\S]*?opacity:\s*1/u);
  assert.match(style, /#home \.home-start-btn:hover \.home-start-open-label/u);
  assert.match(style, /#home \.home-start-btn:focus-visible \.home-start-open-label/u);
  assert.match(style, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.home-start-open-label[\s\S]*?opacity:\s*1/u);
});

test("the OPEN cue ships in a fresh PWA cache", () => {
  assert.match(index, /style\.css\?v=69-shared-gif-loader/u);
  assert.match(worker, /magicbook-pwa-v148-shared-gif-loader/u);
  assert.match(worker, /style\.css\?v=69-shared-gif-loader/u);
});
