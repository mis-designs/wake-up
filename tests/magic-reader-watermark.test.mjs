import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import {
  BOOK_WATERMARK_TEXT,
  watermarkMagicBookPage
} from "../api/book-watermark.mjs";

const script = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const bookApi = readFileSync(new URL("../api/getPages.js", import.meta.url), "utf8");
const trialBookApi = readFileSync(new URL("../api/trialBook.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

test("every MagicBook image is watermarked by the backend before delivery", async () => {
  assert.equal(BOOK_WATERMARK_TEXT, "TMM Bangla Patente");
  const watermarkSource = readFileSync(new URL("../api/book-watermark.mjs", import.meta.url), "utf8");
  assert.match(watermarkSource, /BOOK_WATERMARK_TEXT = "TMM Bangla Patente"/u);
  assert.match(watermarkSource, /BOOK_WATERMARK_TILE/u);
  assert.doesNotMatch(watermarkSource, /UTENTE|phone|device|accessToken/iu);

  const input = await sharp({
    create: { width: 320, height: 480, channels: 3, background: "#ffffff" }
  }).jpeg().toBuffer();
  const output = await watermarkMagicBookPage(input);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 480);

  assert.match(bookApi, /watermarkMagicBookPage\(object\.buffer\)/u);
  assert.match(trialBookApi, /watermarkMagicBookPage\(object\.buffer\)/u);
});

test("book watermarking accepts PNG bytes stored under JPG page keys", async () => {
  const input = await sharp({
    create: { width: 320, height: 480, channels: 3, background: "#ffffff" }
  }).png().toBuffer();
  const output = await watermarkMagicBookPage(input);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 480);
});

test("the watermark exists only inside book images and not as a page overlay", () => {
  assert.doesNotMatch(script, /drawMagicBookPageWatermark|getMagicBookPageWatermarkText/u);
  assert.doesNotMatch(readFileSync(new URL("../screen-protection.js", import.meta.url), "utf8"), /watermark|TMM MAGICBOOK/u);
});

test("the PWA requests the private-book reader build", () => {
  assert.match(index, /script\.js\?v=67-promo-ui-disabled/u);
  assert.match(worker, /magicbook-pwa-v151-audio-player-pill/u);
  assert.match(worker, /script\.js\?v=67-promo-ui-disabled/u);
});
