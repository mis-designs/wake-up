import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import {
  getQuizFigureNumberMask,
  QUIZ_FIGURE_PRESENTATION_VERSION,
  renderNumberlessQuizFigure
} from "../api/quiz-figure-image.mjs";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function pixelAt(data, info, x, y) {
  const offset = (y * info.width + x) * info.channels;
  return Array.from(data.subarray(offset, offset + 3));
}

test("the shared figure owner removes the embedded catalog number in source pixels", async () => {
  assert.equal(QUIZ_FIGURE_PRESENTATION_VERSION, "numberless-v1");
  assert.deepEqual(getQuizFigureNumberMask(800, 600), {
    left: 0,
    top: 0,
    width: 192,
    height: 120
  });
  assert.deepEqual(getQuizFigureNumberMask(375, 281), {
    left: 0,
    top: 0,
    width: 90,
    height: 57
  });

  const input = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#ffffff" }
  }).composite([
    {
      input: await sharp({ create: { width: 120, height: 70, channels: 3, background: "#000000" } }).png().toBuffer(),
      left: 24,
      top: 20
    },
    {
      input: await sharp({ create: { width: 160, height: 120, channels: 3, background: "#ed1b2f" } }).png().toBuffer(),
      left: 310,
      top: 250
    },
    {
      input: await sharp({ create: { width: 120, height: 36, channels: 3, background: "#18a56f" } }).png().toBuffer(),
      left: 36,
      top: 124
    }
  ]).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();

  const output = await renderNumberlessQuizFigure(input);
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  const hiddenNumberPixel = pixelAt(data, info, 60, 45);
  const preservedFigurePixel = pixelAt(data, info, 360, 300);
  const preservedBoundaryPixel = pixelAt(data, info, 60, 136);

  assert.ok(hiddenNumberPixel.every(channel => channel >= 250));
  assert.ok(preservedFigurePixel[0] >= 225);
  assert.ok(preservedFigurePixel[1] <= 45);
  assert.ok(preservedFigurePixel[2] <= 65);
  assert.ok(preservedBoundaryPixel[0] <= 45);
  assert.ok(preservedBoundaryPixel[1] >= 140);
  assert.ok(preservedBoundaryPixel[2] >= 80);
  assert.equal(info.width, 800);
  assert.equal(info.height, 600);

  for (const width of [80, 320, 1600]) {
    const resized = await sharp(output).resize({ width }).raw().toBuffer({ resolveWithObject: true });
    const hiddenAfterScale = pixelAt(
      resized.data,
      resized.info,
      Math.floor(resized.info.width * 0.075),
      Math.floor(resized.info.height * 0.075)
    );
    assert.ok(hiddenAfterScale.every(channel => channel >= 245), `number region leaked at width ${width}`);
  }
});

test("figure delivery is fail-closed and owned by the shared API path", async () => {
  await assert.rejects(renderNumberlessQuizFigure(Buffer.from("not-an-image")));

  const assetApi = source("../api/asset.js");
  assert.match(assetApi, /figurePresentation:\s*QUIZ_FIGURE_PRESENTATION_VERSION/u);
  assert.match(assetApi, /selectedAsset\.figurePresentation === QUIZ_FIGURE_PRESENTATION_VERSION/u);
  assert.match(assetApi, /await renderNumberlessQuizFigure\(selectedObject\.buffer\)/u);
  assert.doesNotMatch(assetApi, /renderNumberlessQuizFigure\([^)]*\)\.catch/u);
  assert.doesNotMatch(assetApi, /catch\s*\([^)]*\)\s*\{[^}]{0,180}return\s+selectedObject\.buffer/u);
});

test("every current quiz-figure client requests the fresh numberless representation", () => {
  for (const path of [
    "../quiz.js",
    "../study-quiz.js",
    "../src/learning-insights.js",
    "../aggiungi-spiegazioni.js"
  ]) {
    const client = source(path);
    assert.match(client, /kind:\s*"figure"[\s\S]{0,180}presentation:\s*(?:QUIZ_FIGURE_PRESENTATION|"numberless-v1")/u, path);
  }

  assert.doesNotMatch(source("../study-quiz.css"), /\.study-figure-frame::after/u);
});
