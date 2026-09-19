import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  getExplanationFigureFromObjectKey,
  getExplanationFiguresFromObjectKeys,
  explanationListingMatchesAssets,
  explanationFilesFromObjects,
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

test("only a listing of the image-serving bucket/account can prove absence", () => {
  const config = { BOOK_R2_BUCKET: "figures", BOOK_R2_ACCOUNT_ID: "account",
    EXPLANATION_R2_BUCKET: "figures", EXPLANATION_R2_ACCOUNT_ID: "account" };
  assert.equal(explanationListingMatchesAssets(config), true);
  assert.equal(explanationListingMatchesAssets({ ...config, EXPLANATION_R2_BUCKET: "audio" }), false);
  assert.equal(explanationListingMatchesAssets({ ...config, EXPLANATION_R2_ACCOUNT_ID: "another-account" }), false);
  assert.equal(explanationListingMatchesAssets({}), false);
  assert.equal(explanationListingMatchesAssets({ BOOK_R2_BUCKET: "figures", BOOK_R2_ACCOUNT_ID: "account",
    QUIZ_AUDIO_R2_BUCKET: "figures", QUIZ_AUDIO_R2_ACCOUNT_ID: "account" }), true);
});

test("figure aliases are grouped under the same canonical figure", () => {
  assert.equal(normalizeExplanationFigureKey("fig20"), "fig20");
  assert.equal(normalizeExplanationFigureKey("Fig-020.jpg"), "fig20");
  assert.equal(normalizeExplanationFigureKey("/img_sign/20.png"), "fig20");
  assert.equal(normalizeExplanationFigureKey(""), "");
});

function listingFixture(page) {
  const source = readFileSync(new URL("../api/quiz.js", import.meta.url), "utf8");
  const start = source.indexOf("async function listExplanationFigures()");
  const end = source.indexOf("async function readQuizAudioObject(", start);
  let calls = 0, respond = page;
  const context = vm.createContext({
    EXPLANATION_R2_BUCKET: "fixture", EXPLANATION_FIGURES_CACHE_TTL_MS: 300_000,
    explanationFiguresCache: { expiresAt: 0, figures: [] }, explanationFiguresLoading: null,
    getExplanationFiguresFromObjectKeys, explanationFilesFromObjects,
    ListObjectsV2Command: class { constructor(input) { this.input = input; } },
    getExplanationStorage: () => ({ send: async command => { calls++; return respond(command.input); } })
  });
  vm.runInContext(source.slice(start, end), context);
  return { load: () => vm.runInContext("listExplanationFigures()", context), calls: () => calls,
    respond: callback => { respond = callback; } };
}

test("explanation listing shares pagination work and caches only a completed listing", async () => {
  const h = listingFixture(({ ContinuationToken }) => ContinuationToken
    ? { Contents: [{ Key: "explanations/fig2.webp" }], IsTruncated: false }
    : { Contents: [{ Key: "explanations/fig1.png" }], IsTruncated: true, NextContinuationToken: "page2" });
  const results = await Promise.all([h.load(), h.load()]);
  assert.deepEqual(results[0], ["fig1", "fig2"]);
  assert.deepEqual(results[1], results[0]);
  assert.equal(h.calls(), 2);
  await h.load(); assert.equal(h.calls(), 2);
});

test("incomplete or looping storage pagination cannot become a complete negative listing", async () => {
  for (const NextContinuationToken of [undefined, "same-page"]) {
    const h = listingFixture(() => ({ Contents: [], IsTruncated: true, NextContinuationToken }));
    await assert.rejects(h.load(), /incomplete_explanation_listing/);
    assert.ok(h.calls() <= 2, "no unbounded pagination loop");
    h.respond(() => ({ Contents: [{ Key: "explanations/fig1.png" }], IsTruncated: false }));
    assert.deepEqual(await h.load(), ["fig1"], "failure releases single-flight without caching absence");
  }
});
