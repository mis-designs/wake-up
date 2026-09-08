import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/learning-insights.js", import.meta.url), "utf8");
const model = { success: true, summary: { quizCoveragePct: 40 }, journey: {}, insight: {}, chapters: Array(25).fill({}), plan: [], errors: { figures: [], questions: [], words: [], topics: [], recovered: [] } };
function harness({ offline = false, cache = null, response } = {}) {
  const storage = new Map([['user_session', JSON.stringify({ phone: '3310000000', deviceId: 'fixture', accessToken: 'token-a' })]]);
  const writes = [];
  const calls = [];
  const root = { localStorage: { getItem: key => storage.get(key) }, navigator: { onLine: !offline },
    MagicBookLearningSync: { getInsightsCache: async () => cache, getLocalEvents: async () => [], setInsightsCache: async (...args) => writes.push(args) },
    fetch: async (...args) => { calls.push(args); return response ? response(...args) : { ok: true, status: 200, json: async () => model }; }
  };
  vm.runInNewContext(source, { window: root, DOMException, AbortController });
  return { root, storage, writes, calls, read: root.MagicBookLearningInsights.readProgress };
}

test("dock progress shares authenticated POST and user-scoped cache", async () => {
  const h = harness();
  const signal = new AbortController().signal;
  const result = await h.read({ signal });
  assert.equal(result.model, model);
  assert.equal(h.calls[0][0], '/api/learning-insights');
  assert.equal(h.calls[0][1].headers.Authorization, 'Bearer token-a');
  assert.equal(h.calls[0][1].cache, 'no-store');
  assert.equal(h.calls[0][1].signal, signal);
  assert.equal(h.writes[0][0], '3310000000');
});

test("offline progress is explicitly cached; no cache is not zero", async () => {
  const h = harness({ offline: true, cache: { model } });
  let preview;
  const result = await h.read({ onCached: value => { preview = value; } });
  assert.equal(result.cached, true);
  assert.equal(preview.model, model);
  assert.equal(h.calls.length, 0);
  await assert.rejects(harness({ offline: true }).read(), /progress_offline/);
});

test("late response after account change cannot return or persist data", async () => {
  let release;
  const h = harness({ response: () => new Promise(resolve => { release = resolve; }) });
  const pending = h.read();
  await new Promise(resolve => setImmediate(resolve));
  h.storage.set('user_session', JSON.stringify({ phone: '3320000000', deviceId: 'other', accessToken: 'token-b' }));
  release({ ok: true, status: 200, json: async () => model });
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(h.writes.length, 0);
});

test("expired session cannot fall back silently to stale private progress", async () => {
  const h = harness({ cache: { model }, response: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
  await assert.rejects(h.read(), /progress_auth_required/);
  assert.equal(h.writes.length, 0);
});

test("aborted progress never fetches or writes", async () => {
  const h = harness();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(h.read({ signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(h.calls.length, 0);
  assert.equal(h.writes.length, 0);
});
