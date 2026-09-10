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
  const root = { setTimeout, clearTimeout, localStorage: { getItem: key => storage.get(key) }, navigator: { onLine: !offline },
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

test("expired learning token renews through canonical auth and retries once", async () => {
  const h = harness({ response: async (_, options) => options.headers.Authorization === 'Bearer token-a'
    ? { ok: false, status: 401, json: async () => ({ error: 'token_expired' }) }
    : { ok: true, status: 200, json: async () => model } });
  let renewals = 0;
  h.root.ensureAccessToken = async options => {
    assert.equal(options.force, true); renewals++;
    h.storage.set('accessToken', 'token-renewed'); return true;
  };
  const result = await h.read();
  assert.equal(result.model, model);
  assert.equal(renewals, 1);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1][1].headers.Authorization, 'Bearer token-renewed');
});

test("stalled local reads and writes cannot block online learning data", async () => {
  const h = harness();
  h.root.setTimeout = callback => setTimeout(callback, 5);
  for (const name of ['getInsightsCache', 'getLocalEvents', 'setInsightsCache']) {
    h.root.MagicBookLearningSync[name] = () => new Promise(() => {});
  }
  const result = await Promise.race([h.read(), new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('local_storage_blocked')), 500); timer.unref();
  })]);
  assert.equal(result.model, model);
});

test("concurrent dock and screen expiry share one renewal without infinite retry", async () => {
  const h = harness({ response: async () => ({ ok: false, status: 401, json: async () => ({ error: 'token_expired' }) }) });
  let renewals = 0;
  h.root.ensureAccessToken = async () => { renewals++; await new Promise(resolve => setTimeout(resolve, 10)); return true; };
  await Promise.all([assert.rejects(h.read(), /progress_auth_required/), assert.rejects(h.read(), /progress_auth_required/)]);
  assert.equal(renewals, 1);
  assert.equal(h.calls.length, 4);
  assert.equal(h.writes.length, 0);
});

test("non-expiry authorization failures do not attempt token renewal", async () => {
  const h = harness({ response: async () => ({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) }) });
  h.root.ensureAccessToken = () => { assert.fail('must not renew invalid identity'); };
  await assert.rejects(h.read(), /progress_auth_required/);
  assert.equal(h.calls.length, 1);
});

test("account or device changes during renewal cannot retry or write previous data", async () => {
  for (const session of [
    { phone: '3320000000', deviceId: 'fixture', accessToken: 'other' },
    { phone: '3310000000', deviceId: 'other-device', accessToken: 'other' }
  ]) {
    const h = harness({ response: async () => ({ ok: false, status: 401, json: async () => ({ error: 'token_expired' }) }) });
    h.root.ensureAccessToken = async () => { h.storage.set('user_session', JSON.stringify(session)); return true; };
    await assert.rejects(h.read(), { name: 'AbortError' });
    assert.equal(h.calls.length, 1); assert.equal(h.writes.length, 0);
  }
});

test("leaving during a stalled renewal cancels the learning read", async () => {
  const h = harness({ response: async () => ({ ok: false, status: 401, json: async () => ({ error: 'token_expired' }) }) });
  const controller = new AbortController();
  h.root.ensureAccessToken = () => { queueMicrotask(() => controller.abort()); return new Promise(() => {}); };
  await assert.rejects(h.read({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(h.calls.length, 1); assert.equal(h.writes.length, 0);
});
