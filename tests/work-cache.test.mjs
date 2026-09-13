import test from "node:test";
import assert from "node:assert/strict";
import { createWorkCache } from "../lib/bounded-work-cache.mjs";
import { audioLookupKeys, selectAudioRow } from "../lib/quiz-audio-lookup.mjs";

test("in-flight duplicate work is shared, then fresh work is allowed without retaining data", async () => {
  const cache = createWorkCache();
  let calls = 0;
  let finish;
  const first = cache.run("same", () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const second = cache.run("same", () => { calls++; });
  await Promise.resolve();
  assert.equal(first, second);
  finish("audio");
  assert.deepEqual(await Promise.all([first, second]), ["audio", "audio"]);
  assert.equal(calls, 1);
  await cache.run("same", () => { calls++; return "updated"; });
  assert.equal(calls, 2);
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0, pending: 0 });
});

test("watermark work cache is bounded by bytes, entries and TTL", async () => {
  let now = 0;
  const cache = createWorkCache({ maxEntries: 2, maxBytes: 6, ttlMs: 100, now: () => now, sizeOf: v => v.length });
  await cache.run("a", () => "aaa");
  await cache.run("b", () => "bbb");
  assert.equal(await cache.run("a", () => assert.fail("cache miss")), "aaa");
  await cache.run("c", () => "ccc");
  assert.deepEqual(cache.stats(), { entries: 2, bytes: 6, pending: 0 });
  assert.equal(await cache.run("b", () => "new"), "new");
  now = 101;
  assert.equal(await cache.run("b", () => "upd"), "upd");
  assert.equal(cache.stats().entries, 1);
  await cache.run("large", () => "too-large-to-store");
  assert.equal(cache.stats().bytes, 3);
});

test("failed loads release pending keys and never poison future attempts", async () => {
  const cache = createWorkCache({ maxEntries: 2, maxBytes: 10, ttlMs: 100 });
  await assert.rejects(cache.run("x", () => { throw new Error("upstream"); }), /upstream/);
  assert.equal(cache.stats().pending, 0);
  assert.equal(await cache.run("x", () => "recovered"), "recovered");
});

test("in-flight bookkeeping remains bounded even under unique-key pressure", async () => {
  const cache = createWorkCache({ maxPending: 1 });
  let finish;
  const first = cache.run("a", () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  assert.equal(await cache.run("b", () => "second"), "second");
  assert.equal(cache.stats().pending, 1);
  finish("first");
  await first;
  assert.equal(cache.stats().pending, 0);
});

test("batched audio lookup preserves priority, safe legacy rules and ambiguity protection", () => {
  const id = { quizKey: "current", previousQuizKeys: ["previous"], legacyQuizKey: "legacy", legacySafe: true };
  const row = quiz_key => ({ quiz_key, audio_key: `${quiz_key}.webm` });
  assert.deepEqual(audioLookupKeys(id), ["current", "previous", "legacy"]);
  assert.equal(selectAudioRow(id, [row("legacy"), row("current"), row("previous")], () => true).matchedQuizKey, "current");
  assert.equal(selectAudioRow(id, [row("legacy"), row("previous")], () => true).matchedQuizKey, "previous");
  assert.equal(selectAudioRow(id, [row("legacy")], () => true).row, null);
  assert.equal(selectAudioRow(id, [row("legacy")], () => true).requiresReview, true);
  assert.equal(selectAudioRow(id, [row("legacy")], () => false).row.audio_key, "legacy.webm");
  assert.deepEqual(audioLookupKeys({ ...id, legacySafe: false }), ["current", "previous"]);
  assert.equal(selectAudioRow({ ...id, legacySafe: false }, [row("legacy")], () => false).row, null);
});
