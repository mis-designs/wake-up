import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

test("every decoded Magic Book page receives the branded diagonal watermark", () => {
  assert.match(script, /function getMagicBookPageWatermarkText\(\)[\s\S]*?TMM Bangla Patente/u);
  assert.match(script, /function drawMagicBookPageWatermark\(context, canvas\)/u);
  assert.match(script, /context\.globalAlpha\s*=\s*0\.1/u);
  assert.match(script, /context\.rotate\(-Math\.PI\s*\/\s*7\)/u);
  assert.match(
    script,
    /context\.drawImage\(decoded\.source[\s\S]*?drawMagicBookPageWatermark\(context, canvas\)/u
  );
});

test("the PWA requests and caches the watermark-aware reader build", () => {
  assert.match(index, /script\.js\?v=44-reader-watermark/u);
  assert.match(worker, /magicbook-pwa-v82-screen-protection/u);
  assert.match(worker, /script\.js\?v=44-reader-watermark/u);
});
