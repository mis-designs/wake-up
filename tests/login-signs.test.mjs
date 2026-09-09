import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LOGIN_SIGNS, SIGN_HOLD_MS, signEntrance, signAssetUrl } from "../login-signs.mjs";

test("login uses real dictionary meanings and existing catalog figures without quiz answers", () => {
  const dictionary = JSON.parse(readFileSync(new URL("../data/patente/quiz-help-runtime-v2.json", import.meta.url), "utf8"));
  const catalog = JSON.parse(readFileSync(new URL("../api/_quiz-bank.json", import.meta.url), "utf8"));
  assert.equal(LOGIN_SIGNS.length, 3);
  for (const sign of LOGIN_SIGNS) {
    const original = dictionary.words[sign.wordId][1];
    assert.ok(sign.meaning === original || sign.meaning === original.split(" / ")[0]);
    assert.ok(catalog.quiz.some(q => q.figure === sign.figure));
    assert.deepEqual(Object.keys(sign).sort(), ["figure", "meaning", "title", "wordId"]);
    const url = new URL(signAssetUrl(sign), "https://local.invalid");
    assert.equal(url.pathname, "/api/asset");
    assert.equal(url.searchParams.get("figure"), sign.figure);
    assert.equal(url.searchParams.get("presentation"), "numberless-v2");
    assert.equal(url.searchParams.get("kind"), "figure");
  }
});

test("entrance variation is deterministic, small and has a readable resting interval", () => {
  assert.ok(SIGN_HOLD_MS >= 4000);
  const variants = new Set();
  for (let step = 0; step < 24; step++) {
    const v = signEntrance(step);
    variants.add(JSON.stringify(v));
    assert.ok(Math.abs(v.angle) <= 3 && Math.abs(v.x) <= 7 && Math.abs(v.y) <= 12);
    assert.deepEqual(v, signEntrance(step + 4));
  }
  assert.equal(variants.size, 4);
});
