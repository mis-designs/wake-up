import test from "node:test";
import assert from "node:assert/strict";
import {
  applyExplanationAvailabilityByFigure,
  getExplanationFigureFromObjectKey,
  getExplanationFiguresFromObjectKeys,
  hasExplanationMarker,
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

test("one explanation marker enables Spiega for every quiz with the same figure", () => {
  const rows = [
    { id: "a", figure: "fig20", explanation: "presente" },
    { id: "b", figure: "fig20", explanation: "" },
    { id: "c", figure: "Fig-020", explanations: null },
    { id: "d", figure: "/img_sign/20.png" },
    { id: "e", figure: "fig21", explanations: "" }
  ];

  const result = applyExplanationAvailabilityByFigure(rows);

  assert.deepEqual(result.slice(0, 4).map(row => row.explanations), [0, 0, 0, 0]);
  assert.equal(result[4].explanations, "");
});

test("zero and every other non-empty database value are valid markers", () => {
  assert.equal(hasExplanationMarker({ explanations: 0 }), true);
  assert.equal(hasExplanationMarker({ explanation: 1 }), true);
  assert.equal(hasExplanationMarker({ Explanation: "sì" }), true);
  assert.equal(hasExplanationMarker({ explanations: "" }), false);
  assert.equal(hasExplanationMarker({ explanations: null }), false);
  assert.equal(hasExplanationMarker({ explanations: "", explanation: "presente" }), true);
});

test("figure aliases are grouped under the same canonical figure", () => {
  assert.equal(normalizeExplanationFigureKey("fig20"), "fig20");
  assert.equal(normalizeExplanationFigureKey("Fig-020.jpg"), "fig20");
  assert.equal(normalizeExplanationFigureKey("/img_sign/20.png"), "fig20");
  assert.equal(normalizeExplanationFigureKey(""), "");
});

test("rows without a marked figure remain unchanged", () => {
  const rows = [
    { id: "a", figure: "fig20", explanations: "" },
    { id: "b", figure: "fig21" },
    { id: "c", figure: "", explanation: "presente" }
  ];

  assert.equal(applyExplanationAvailabilityByFigure(rows), rows);
});
