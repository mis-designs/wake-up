import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  getExplanationAssetCandidates,
  normalizeExplanationFigure,
  normalizeFigureAssetName
} from "../api/asset.js";
import { getAdminItalianQuestionText } from "../api/quiz.js";

test("quiz figure paths always resolve to the canonical Cloudflare basename", () => {
  for (const value of [37, "37", "fig37", "Fig-037.jpg", "Figure/fig37.jpg", "/img_sign/37.png"]) {
    assert.equal(normalizeFigureAssetName(value), "fig37");
  }
});

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

test("quiz data flows never read the database explanation column", () => {
  const apiSource = fs.readFileSync(new URL("../api/quiz.js", import.meta.url), "utf8");
  const gasSource = fs.readFileSync(new URL("../quiz_gas.js", import.meta.url), "utf8");

  assert.doesNotMatch(apiSource, /getExplanationMappedValue|applyExplanationAvailabilityByFigure/);
  assert.doesNotMatch(gasSource, /q\.explanations|columns\.explanations|figuresWithExplanation/);
});

test("admin explanation cards can play only canonical Italian quiz questions", () => {
  const clientSource = fs.readFileSync(new URL("../aggiungi-spiegazioni.js", import.meta.url), "utf8");
  const apiSource = fs.readFileSync(new URL("../api/quiz.js", import.meta.url), "utf8");

  assert.equal(getAdminItalianQuestionText("cap1_q1"), "La carreggiata non comprende le piste ciclabili");
  assert.equal(getAdminItalianQuestionText("missing-question"), "");
  assert.match(clientSource, /getAdminItalianQuestionAudio/);
  assert.match(clientSource, /<span>Italiano<\/span>/);
  assert.doesNotMatch(clientSource, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.match(
    apiSource,
    /action === "getAdminItalianQuestionAudio"[\s\S]*?requireQuizAudioAccess\(\{ phone, deviceId, accessToken, adminOnly: true \}\)/
  );
  assert.match(apiSource, /getAdminItalianQuestionText\(questionId\)/);
});

test("the admin explanations page uses the supplied full-page background", () => {
  const htmlSource = fs.readFileSync(new URL("../aggiungi-spiegazioni.html", import.meta.url), "utf8");
  const cssSource = fs.readFileSync(new URL("../aggiungi-spiegazioni.css", import.meta.url), "utf8");

  assert.match(htmlSource, /aggiungi-spiegazioni\.css\?v=10-shared-gif-loader/u);
  assert.match(cssSource, /url\("icons\/sec_explain_bg_image\.png"\)/u);
  assert.match(cssSource, /background-size:\s*cover/u);
  assert.match(cssSource, /background-attachment:\s*fixed/u);
});
