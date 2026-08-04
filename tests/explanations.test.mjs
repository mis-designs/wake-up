import assert from "node:assert/strict";
import test from "node:test";

import { getExplanationAssetCandidates, normalizeExplanationFigure } from "../api/asset.js";

test("explanation figure names use the final fig-number format", () => {
  assert.equal(normalizeExplanationFigure("fig101"), "fig101");
  assert.equal(normalizeExplanationFigure("Fig-101"), "fig101");
  assert.equal(normalizeExplanationFigure("fig_101"), "fig101");
  assert.equal(normalizeExplanationFigure("/img_sign/101.png"), "fig101");
});

test("explanation value zero loads the new name before legacy suffixed names", () => {
  assert.deepEqual(
    getExplanationAssetCandidates("fig101", 0, "png").map(asset => asset.path),
    ["explanations/fig101.png", "explanations/fig101_0.png", "explanations/fig101_1.png"]
  );
});

test("only explanation marker zero enables an explanation asset", () => {
  assert.deepEqual(getExplanationAssetCandidates("fig101", 1, "png"), []);
  assert.deepEqual(getExplanationAssetCandidates("fig101", "", "png"), []);
  assert.deepEqual(getExplanationAssetCandidates("not-a-figure", 0, "png"), []);
});
