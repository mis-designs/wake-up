import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const index = read("index.html");
const style = read("style.css");
const worker = read("service-worker.js");

test("the MagicBook image reveals an OPEN cue on hover and keyboard focus", () => {
  assert.match(
    index,
    /home-start-btn[\s\S]*?<img[^>]+startbtn\.gif[\s\S]*?<span class="home-start-open-label" aria-hidden="true">OPEN<\/span>/u
  );
  assert.match(style, /#home \.home-start-open-label[\s\S]*?text-shadow:/u);
  assert.match(style, /#home \.home-start-btn:hover \.home-start-open-label/u);
  assert.match(style, /#home \.home-start-btn:focus-visible \.home-start-open-label/u);
  assert.match(style, /opacity:\s*1;[\s\S]*?translate\(-50%, -50%\) scale\(1\)/u);
  assert.match(style, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.home-start-open-label[\s\S]*?opacity:\s*0\.94/u);
});

test("the OPEN cue ships in a fresh PWA cache", () => {
  assert.match(index, /style\.css\?v=49-home-open-hover/u);
  assert.match(worker, /magicbook-pwa-v86-private-book/u);
  assert.match(worker, /style\.css\?v=49-home-open-hover/u);
});
