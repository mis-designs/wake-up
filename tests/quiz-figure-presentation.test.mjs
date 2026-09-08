import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { QUIZ_FIGURE_PRESENTATION_VERSION, renderNumberlessQuizFigure } from "../api/quiz-figure-image.mjs";

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");
const pixels = input => sharp(input).flatten({ background: "white" }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
const fixtures = [
  { id: 40, label: [48, 40, 106, 84] },
  { id: 698, label: [10, 12, 100, 59] },
  { id: 552, label: [48, 40, 131, 84] },
  { id: 704, label: [50, 60, 395, 225] }
];

for (const { id, label } of fixtures) {
  test(`real figure ${id}: remove the number and preserve every pixel of the drawing`, async () => {
    const original = readFileSync(new URL(`fixtures/quiz-figures/fig${id}.jpg`, import.meta.url));
    const input = await pixels(original);
    const output = await renderNumberlessQuizFigure(original, { figure: `fig${id}` });
    const result = await pixels(output);
    assert.equal((await sharp(output).metadata()).format, "png");
    assert.equal(result.info.width, input.info.width);
    assert.equal(result.info.height, input.info.height);
    let removedInk = 0;
    for (let y = 0; y < input.info.height; y += 1) {
      for (let x = 0; x < input.info.width; x += 1) {
        const offset = (y * input.info.width + x) * 3;
        const inside = x >= label[0] && y >= label[1] && x <= label[2] && y <= label[3];
        for (let c = 0; c < 3; c += 1) {
          if (inside) {
            assert.ok(result.data[offset + c] >= 200, `number remains at ${x},${y}`);
            if (input.data[offset + c] < 100) removedInk += 1;
          } else if (result.data[offset + c] !== input.data[offset + c]) {
            assert.fail(`drawing changed at ${x},${y}`);
          }
        }
      }
    }
    assert.ok(removedInk > 100);
  });
}

test("the reported yield sign keeps its upper-left corner at alternate source sizes", async () => {
  const original = readFileSync(new URL("fixtures/quiz-figures/fig40.jpg", import.meta.url));
  for (const width of [320, 375, 1600]) {
    const input = await sharp(original).resize({ width }).png().toBuffer();
    const output = await renderNumberlessQuizFigure(input, { figure: "fig40" });
    const before = await pixels(input), after = await pixels(output);
    const corner = { left: Math.round(width * 0.18), top: Math.round(before.info.height * 0.13), width: Math.round(width * 0.15), height: Math.round(before.info.height * 0.15) };
    assert.deepEqual(await sharp(output).extract(corner).raw().toBuffer(), await sharp(input).extract(corner).raw().toBuffer());
    const number = (Math.round(before.info.height * 0.10) * width + Math.round(width * 0.08)) * 3;
    assert.ok(after.data[number] >= 245);
  }
});

test("unlabelled coloured and black drawings in the old cover area are preserved", async () => {
  for (const fill of ["#ed1b2f", "#000000"]) {
    const input = await sharp(Buffer.from(`<svg width="800" height="600"><rect width="800" height="600" fill="white"/><path d="M20 20 H600 L310 500 Z" fill="none" stroke="${fill}" stroke-width="20"/></svg>`)).png().toBuffer();
    const output = await renderNumberlessQuizFigure(input, { figure: "fig40" });
    assert.deepEqual((await pixels(output)).data, (await pixels(input)).data);
  }
});

test("uncertain label detection preserves the figure instead of using a fallback rectangle", async () => {
  const input = readFileSync(new URL("fixtures/quiz-figures/fig40.jpg", import.meta.url));
  const output = await renderNumberlessQuizFigure(input, { figure: "fig698" });
  assert.deepEqual((await pixels(output)).data, (await pixels(input)).data);
});

test("figure delivery stays in the shared API and returns the correct lossless media type", async () => {
  assert.equal(QUIZ_FIGURE_PRESENTATION_VERSION, "numberless-v2");
  await assert.rejects(renderNumberlessQuizFigure(Buffer.from("not-an-image")));
  const api = source("../api/asset.js");
  assert.match(api, /figurePresentation:\s*QUIZ_FIGURE_PRESENTATION_VERSION/u);
  assert.match(api, /selectedAsset\.figurePresentation === QUIZ_FIGURE_PRESENTATION_VERSION/u);
  assert.match(api, /await renderNumberlessQuizFigure\(selectedObject\.buffer, \{ figure: selectedAsset\.figure \}\)/u);
  assert.match(api, /path: `Figure\/\$\{figure\}\.jpg`,\s*contentType: "image\/png"/u);
});

test("every figure consumer bypasses cached rectangular covers", () => {
  for (const path of ["../quiz.js", "../study-quiz.js", "../src/learning-insights.js", "../aggiungi-spiegazioni.js"]) {
    assert.match(source(path), /kind:\s*"figure"[\s\S]{0,180}presentation:\s*(?:QUIZ_FIGURE_PRESENTATION|"numberless-v2")/u, path);
    assert.doesNotMatch(source(path), /numberless-v1/u);
  }
  assert.doesNotMatch(source("../study-quiz.css"), /\.study-figure-frame::after/u);
});
