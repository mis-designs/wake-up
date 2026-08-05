import test from "node:test";
import assert from "node:assert/strict";
import {
  getExplanationFigureFromObjectKey,
  getExplanationFiguresFromObjectKeys,
  normalizeExplanationFigureKey
} from "../api/quiz-explanation-availability.mjs";

test("Cloudflare explanation object names produce a canonical figure list", () => {
  assert.equal(getExplanationFigureFromObjectKey("explanations/fig022.png"), "fig22");
  assert.equal(getExplanationFigureFromObjectKey("explanations/fig22_0.webp"), "fig22");
  assert.equal(getExplanationFigureFromObjectKey("Figure/fig22.jpg"), "");
  assert.deepEqual(getExplanationFiguresFromObjectKeys([
    "explanations/fig22.png",
    "explanations/fig1_1.jpg",
    "explanations/fig022_0.webp",
    "explanations/readme.txt"
  ]), ["fig1", "fig22"]);
});

test("figure aliases are grouped under the same canonical figure", () => {
  assert.equal(normalizeExplanationFigureKey("fig20"), "fig20");
  assert.equal(normalizeExplanationFigureKey("Fig-020.jpg"), "fig20");
  assert.equal(normalizeExplanationFigureKey("/img_sign/20.png"), "fig20");
  assert.equal(normalizeExplanationFigureKey(""), "");
});
