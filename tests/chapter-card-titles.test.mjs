import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const script = read("script.js");
const style = read("style.css");
const page = read("index.html");
const worker = read("service-worker.js");

test("all chapter cards show the matching official chapter title", () => {
  const titleBlock = script.match(/const CHAPTER_TITLES = Object\.freeze\(\[([\s\S]*?)\]\);/u);
  assert.ok(titleBlock, "CHAPTER_TITLES must exist");

  const titles = [...titleBlock[1].matchAll(/^\s*"([^"]+)",?$/gmu)].map(match => match[1]);
  assert.equal(titles.length, 25);
  assert.equal(titles[12], "Norme e circolazione veicoli");
  assert.equal(titles[24], "Manutenzione ed elementi del veicolo");

  assert.match(script, /class="chapter-card-title">\$\{chapterTitle\}<\/span>/u);
  assert.match(script, /card\.setAttribute\("aria-label", `Capitolo \$\{i\}: \$\{chapterTitle\}`\)/u);
});

test("chapter titles stay inside the mini cards without changing carousel geometry", () => {
  assert.match(
    style,
    /\.chapter-card-title\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*12px;[\s\S]*?-webkit-line-clamp:\s*2;[\s\S]*?overflow-wrap:\s*anywhere;/u
  );
  assert.match(style, /\.chapter-card\s*\{[\s\S]*?width:\s*140px;[\s\S]*?height:\s*185px;[\s\S]*?overflow:\s*hidden;/u);
});

test("chapter-card titles ship with fresh stylesheet, script, and PWA cache versions", () => {
  assert.match(page, /style\.css\?v=70-whatsapp-dialog/u);
  assert.match(page, /script\.js\?v=67-promo-ui-disabled/u);
  assert.match(worker, /magicbook-pwa-v153-transparent-svg-player/u);
  assert.match(worker, /style\.css\?v=70-whatsapp-dialog/u);
  assert.match(worker, /script\.js\?v=67-promo-ui-disabled/u);
});
