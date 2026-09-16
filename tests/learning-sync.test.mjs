import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { LEARNING_SYNC_SERVER_CONFIG } from "../api/learning-sync.mjs";

const source = readFileSync(new URL("../learning-sync.js", import.meta.url), "utf8");
const quizSource = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const quizPage = readFileSync(new URL("../quiz.html", import.meta.url), "utf8");
const homePage = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const studyPage = readFileSync(new URL("../study-quiz.html", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");

function loadLearningSyncRuntime() {
  const scheduled = [];
  const listeners = new Map();
  let uuid = 0;
  const localValues = new Map();
  const document = {
    readyState: "loading",
    visibilityState: "visible",
    addEventListener(name, callback) { listeners.set(`document:${name}`, callback); },
    removeEventListener(name, callback) { if (listeners.get(`document:${name}`) === callback) listeners.delete(`document:${name}`); }
  };
  const window = {
    crypto: {
      randomUUID() {
        uuid += 1;
        return `00000000-0000-4000-8000-${String(uuid).padStart(12, "0")}`;
      }
    },
    document,
    indexedDB: null,
    location: { hostname: "example.test" },
    localStorage: {
      getItem(key) { return localValues.get(key) ?? null; },
      setItem(key, value) { localValues.set(key, String(value)); }
    },
    navigator: { onLine: true },
    setTimeout(callback, delay) {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    clearTimeout(id) { if (scheduled[id - 1]) scheduled[id - 1].cancelled = true; },
    addEventListener(name, callback) { listeners.set(`window:${name}`, callback); },
    removeEventListener(name, callback) { if (listeners.get(`window:${name}`) === callback) listeners.delete(`window:${name}`); },
    dispatchEvent() {},
    fetch: null
  };
  const context = vm.createContext({
    AbortController,
    Array,
    CustomEvent: class CustomEvent { constructor(name, options) { this.type = name; this.detail = options?.detail; } },
    Date,
    Error,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    Uint8Array,
    console,
    globalThis: window,
    window
  });
  vm.runInContext(source, context, { filename: "learning-sync.js" });
  return { window, scheduled, listeners, api: window.MagicBookLearningSync };
}

test("insights backup survives a new outbox when IndexedDB is unavailable", async () => {
  const { api } = loadLearningSyncRuntime();
  const first = new api.__testing.LearningOutbox({ indexedDb: null });
  assert.equal(await first.setInsightsCache('3310000000', { success: true, marker: 42 }), true);
  const reopened = new api.__testing.LearningOutbox({ indexedDb: null });
  const cache = await reopened.getInsightsCache('3310000000');
  assert.equal(cache.model.marker, 42);
  assert.equal(cache.storage, 'localStorage');
  assert.equal(await reopened.getInsightsCache('3320000000'), null);
});

test("saved snapshot does not wait for a blocked IndexedDB open", async () => {
  const { api } = loadLearningSyncRuntime();
  const first = new api.__testing.LearningOutbox({ indexedDb: null });
  await first.setInsightsCache('3310000000', { success: true, marker: 42 });
  const reopened = new api.__testing.LearningOutbox({ indexedDb: { open() { assert.fail('snapshot should be immediately readable'); } } });
  assert.equal((await reopened.getInsightsCache('3310000000')).model.marker, 42);
});

test("blocked/quota-limited storage remains explicitly temporary, without deleting answers", async () => {
  const { api, window } = loadLearningSyncRuntime();
  window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  const outbox = new api.__testing.LearningOutbox({ indexedDb: null });
  assert.equal(await outbox.setInsightsCache('3310000000', { success: true }), false);
  assert.equal((await outbox.getInsightsCache('3310000000')).storage, 'memory');
  assert.equal(await new api.__testing.LearningOutbox({ indexedDb: null }).getInsightsCache('3310000000'), null);
});

test("oversized snapshots and corrupt backup cannot break loading", async () => {
  const { api, window } = loadLearningSyncRuntime();
  const outbox = new api.__testing.LearningOutbox({ indexedDb: null });
  assert.equal(await outbox.setInsightsCache('3310000000', { text: 'a'.repeat(512_000) }), false);
  window.localStorage.setItem(`${api.config.insightsBackupPrefix}3320000000`, '{broken');
  assert.equal(await outbox.getInsightsCache('3320000000'), null);
});

test("an old IndexedDB connection closes on version changes", async () => {
  const { api } = loadLearningSyncRuntime();
  let request, closed = 0;
  const database = { close() { closed++; } };
  const outbox = new api.__testing.LearningOutbox({ indexedDb: { open() { request = { result: database }; return request; } } });
  const opening = outbox.open(); request.onsuccess();
  await opening;
  database.onversionchange();
  assert.equal(closed, 1); assert.equal(outbox.databasePromise, null);
});

test("a late success after a blocked upgrade does not leave a leaked connection", async () => {
  const { api } = loadLearningSyncRuntime();
  let request, closed = 0;
  const outbox = new api.__testing.LearningOutbox({ indexedDb: { open() { request = { result: { close() { closed++; } } }; return request; } } });
  const opening = outbox.open(); request.onblocked();
  await assert.rejects(opening, /indexeddb_upgrade_blocked/);
  request.onsuccess(); assert.equal(closed, 1);
});

function response(status, body, headers = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return normalizedHeaders.get(String(name).toLowerCase()) || null; } },
    async json() { return body; }
  };
}

function queueRecord(index, now, overrides = {}) {
  return {
    event_id: `ans_${String(index).padStart(20, "0")}`,
    event_type: "answer_event",
    user_id: "3331112222",
    payload: {
      quiz_id: `q${index}`,
      user_answer: index % 2,
      answered_at: new Date(now - 1000 + index).toISOString(),
      session_id: "ses_1234567890123456"
    },
    status: "pending",
    created_at: now + index,
    updated_at: now + index,
    retry_count: 0,
    last_attempt_at: 0,
    next_retry_at: 0,
    last_error: "",
    ...overrides
  };
}

function createHarness({ fetchImpl, now = 1_800_000_000_000, random = () => 0.5 } = {}) {
  const runtime = loadLearningSyncRuntime();
  let currentTime = now;
  const { LearningOutbox, LearningSyncManager } = runtime.api.__testing;
  const outbox = new LearningOutbox({ indexedDb: null, now: () => currentTime });
  const manager = new LearningSyncManager({
    outbox,
    fetchImpl,
    getAuthContext: () => ({
      userId: "3331112222",
      deviceId: "device_learning_123",
      accessToken: "signed-access-token"
    }),
    now: () => currentTime,
    random
  });
  manager.initialized = true;
  return {
    ...runtime,
    outbox,
    manager,
    now: () => currentTime,
    setNow(value) { currentTime = value; }
  };
}

async function seed(outbox, count, now, start = 1) {
  const records = [];
  for (let index = 0; index < count; index += 1) {
    records.push(await outbox.add(queueRecord(start + index, now)));
  }
  return records;
}

test("central queue configuration uses IndexedDB, batches of 25 and a 15 second flush", () => {
  const { api } = loadLearningSyncRuntime();
  assert.equal(api.config.databaseName, "MagicBookLearningLocal");
  assert.equal(api.config.databaseVersion, 2);
  assert.equal(api.config.outboxStoreName, "learning_outbox");
  assert.equal(api.config.insightsStoreName, "learning_insights_cache");
  assert.equal(api.config.maxBatchSize, 25);
  assert.equal(api.config.flushIntervalMs, 15_000);
  assert.equal(api.config.maxConcurrentSyncs, 1);
  assert.match(source, /indexedDb\.open\(/);
  assert.match(source, /createIndex\("event_id", "event_id", \{ unique: true \}\)/);
});

test("quiz answers enter the outbox without awaiting sync and every app surface can drain it", () => {
  assert.match(quizSource, /function answer\(val\)[\s\S]*?queueLearningAnswer\(val\)/u);
  assert.match(quizSource, /void window\.MagicBookLearningSync\.enqueueAnswer\(/u);
  assert.doesNotMatch(quizSource, /await window\.MagicBookLearningSync\.enqueueAnswer\(/u);
  [quizPage, homePage, studyPage].forEach(page => {
    assert.match(page, /learning-sync\.js\?v=5-insights-backup/u);
  });
  assert.match(serviceWorker, /learning-sync\.js\?v=5-insights-backup/u);
});

test("the shared IndexedDB layer keeps learning-insight caches separated by user", async () => {
  const { api } = loadLearningSyncRuntime();
  const { LearningOutbox } = api.__testing;
  const outbox = new LearningOutbox({ indexedDb: null, now: () => 1234 });

  await outbox.setInsightsCache("3331112222", { success: true, marker: "first" });
  await outbox.setInsightsCache("3331113333", { success: true, marker: "second" });

  assert.equal((await outbox.getInsightsCache("3331112222")).model.marker, "first");
  assert.equal((await outbox.getInsightsCache("3331113333")).model.marker, "second");
});

test("TEST A: ten queued answers are sent in one batch and marked synced", async () => {
  let requests = 0;
  let sentEvents = [];
  const harness = createHarness({
    fetchImpl: async (_url, options) => {
      requests += 1;
      sentEvents = JSON.parse(options.body).events;
      return response(200, {
        accepted: sentEvents.map(event => event.event_id),
        duplicates: [],
        rejected: []
      });
    }
  });
  await seed(harness.outbox, 10, harness.now());

  await harness.manager.flush({ reason: "test" });

  assert.equal(requests, 1);
  assert.equal(sentEvents.length, 10);
  assert.ok((await harness.outbox.getAll()).every(record => record.status === "synced"));
});

test("TEST B: offline answers stay pending and sync when the browser returns online", async () => {
  let requests = 0;
  const harness = createHarness({
    fetchImpl: async (_url, options) => {
      requests += 1;
      const events = JSON.parse(options.body).events;
      return response(200, { accepted: events.map(event => event.event_id), duplicates: [], rejected: [] });
    }
  });
  await seed(harness.outbox, 10, harness.now());
  harness.window.navigator.onLine = false;

  await harness.manager.flush({ reason: "offline" });
  assert.equal(requests, 0);
  assert.ok((await harness.outbox.getAll()).every(record => record.status === "pending"));

  harness.window.navigator.onLine = true;
  await harness.manager.flush({ reason: "online" });
  assert.equal(requests, 1);
  assert.ok((await harness.outbox.getAll()).every(record => record.status === "synced"));
});

test("TEST C: a recreated manager processes events retained by the persistent outbox", async () => {
  const harness = createHarness();
  const [record] = await seed(harness.outbox, 1, harness.now());
  const { LearningSyncManager } = harness.api.__testing;
  let sentId = "";
  const recreated = new LearningSyncManager({
    outbox: harness.outbox,
    fetchImpl: async (_url, options) => {
      sentId = JSON.parse(options.body).events[0].event_id;
      return response(200, { accepted: [sentId], duplicates: [], rejected: [] });
    },
    getAuthContext: () => ({
      userId: "3331112222",
      deviceId: "device_learning_123",
      accessToken: "signed-access-token"
    }),
    now: harness.now
  });
  recreated.initialized = true;

  await recreated.flush({ reason: "reload" });

  assert.equal(sentId, record.event_id);
  assert.equal((await harness.outbox.getAll())[0].status, "synced");
});

test("TEST D: a timeout keeps the same event ID and schedules retry", async () => {
  const timeout = new Error("aborted");
  timeout.name = "AbortError";
  const harness = createHarness({ fetchImpl: async () => { throw timeout; } });
  const [record] = await seed(harness.outbox, 1, harness.now());

  await harness.manager.flush({ reason: "timeout" });

  const stored = (await harness.outbox.getAll())[0];
  assert.equal(stored.event_id, record.event_id);
  assert.equal(stored.status, "retry");
  assert.equal(stored.retry_count, 1);
  assert.ok(stored.next_retry_at > harness.now());
});

test("TEST F: HTTP 429 honors Retry-After before normal backoff", async () => {
  const harness = createHarness({
    fetchImpl: async () => response(429, { error: "server_busy" }, { "Retry-After": "30" })
  });
  await seed(harness.outbox, 1, harness.now());

  await harness.manager.flush({ reason: "429" });

  const stored = (await harness.outbox.getAll())[0];
  assert.equal(stored.status, "retry");
  assert.equal(stored.next_retry_at, harness.now() + 30_000);
});

test("TEST G: HTTP 503 uses progressive retry without deleting the event", async () => {
  const harness = createHarness({ fetchImpl: async () => response(503, { error: "busy" }) });
  await seed(harness.outbox, 1, harness.now());

  await harness.manager.flush({ reason: "503-first" });
  let stored = (await harness.outbox.getAll())[0];
  assert.equal(stored.retry_count, 1);
  assert.equal(stored.next_retry_at, harness.now() + 5_000);

  harness.setNow(stored.next_retry_at);
  await harness.manager.flush({ reason: "503-second" });
  stored = (await harness.outbox.getAll())[0];
  assert.equal(stored.retry_count, 2);
  assert.equal(stored.next_retry_at, harness.now() + 15_000);
});

test("TEST H: HTTP 400 marks events failed and retains them for diagnosis", async () => {
  const harness = createHarness({ fetchImpl: async () => response(400, { error: "invalid_payload" }) });
  await seed(harness.outbox, 1, harness.now());

  await harness.manager.flush({ reason: "400" });

  const stored = (await harness.outbox.getAll())[0];
  assert.equal(stored.status, "failed");
  assert.equal(stored.last_error, "invalid_payload");
});

test("TEST I: partial batches sync accepted and duplicate IDs but isolate invalid IDs", async () => {
  const harness = createHarness({
    fetchImpl: async (_url, options) => {
      const events = JSON.parse(options.body).events;
      return response(200, {
        accepted: events.slice(0, 18).map(event => event.event_id),
        duplicates: [events[18].event_id],
        rejected: [{ event_id: events[19].event_id, error: "invalid_event_payload" }]
      });
    }
  });
  await seed(harness.outbox, 20, harness.now());

  await harness.manager.flush({ reason: "partial" });

  const records = await harness.outbox.getAll();
  assert.equal(records.filter(record => record.status === "synced").length, 19);
  assert.equal(records.filter(record => record.status === "failed").length, 1);
});

test("TEST J: stale sending events are recovered after a restart", async () => {
  const harness = createHarness();
  const [record] = await seed(harness.outbox, 1, harness.now());
  const stored = harness.outbox.memoryRecords.get(record.local_id);
  stored.status = "sending";
  stored.last_attempt_at = harness.now() - harness.api.config.sendingStaleMs - 1;
  harness.outbox.memoryRecords.set(record.local_id, stored);

  const claimed = await harness.outbox.claimDue(25, "3331112222");

  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].event_id, record.event_id);
  assert.equal(claimed[0].status, "sending");
});

test("TEST K: one hundred rapid events produce batches of at most 25, not one request each", async () => {
  let requests = 0;
  let largestBatch = 0;
  const harness = createHarness({
    fetchImpl: async (_url, options) => {
      requests += 1;
      const events = JSON.parse(options.body).events;
      largestBatch = Math.max(largestBatch, events.length);
      return response(200, { accepted: events.map(event => event.event_id), duplicates: [], rejected: [] });
    }
  });
  await seed(harness.outbox, 100, harness.now());

  for (let batch = 0; batch < 4; batch += 1) {
    await harness.manager.flush({ reason: "load" });
  }

  assert.equal(requests, 4);
  assert.equal(largestBatch, 25);
  assert.ok((await harness.outbox.getAll()).every(record => record.status === "synced"));
});

test("backoff includes jitter and Retry-After supports HTTP dates", () => {
  const { calculateBackoffMs, parseRetryAfterMs } = loadLearningSyncRuntime().api.__testing;
  assert.equal(calculateBackoffMs(1, () => 0), 4_000);
  assert.equal(calculateBackoffMs(1, () => 1), 6_000);
  const now = Date.parse("2026-08-21T10:00:00.000Z");
  assert.equal(parseRetryAfterMs("Fri, 21 Aug 2026 10:00:45 GMT", now), 45_000);
});

test("enqueue coalesces rapid answers into one delayed flush, not one idle request per answer", async () => {
  let requests = 0;
  const h = createHarness({ fetchImpl: async (_url, options) => {
    requests++;
    return response(200, { accepted: JSON.parse(options.body).events.map(e => e.event_id) });
  } });
  for (let i = 0; i < 10; i++) await h.manager.enqueueAnswer({ quiz_id: String(i) });
  assert.equal(requests, 0);
  const work = h.scheduled.filter(t => !t.cancelled);
  assert.equal(work.length, 1);
  assert.equal(work[0].delay, 15_000);
  work[0].callback();
  for (let i = 0; i < 4; i++) await new Promise(setImmediate);
  assert.equal(requests, 1);
  assert.ok((await h.outbox.getAll()).every(e => e.status === "synced"));
});

test("a small Retry-After never resets progressive backoff", async () => {
  const h = createHarness({ fetchImpl: async () => response(503, {}, { "Retry-After": "5" }) });
  await seed(h.outbox, 1, h.now());
  for (const expected of [5_000, 15_000, 30_000]) {
    await h.manager.flush();
    const record = (await h.outbox.getAll())[0];
    assert.equal(record.next_retry_at - h.now(), expected);
    h.setNow(record.next_retry_at);
  }
});

test("empty and paused background schedulers generate no HTTP requests", async () => {
  let requests = 0;
  const h = createHarness({ fetchImpl: async () => { requests++; return response(200, {}); } });
  for (let i = 0; i < 10; i++) await h.manager.flush();
  assert.equal(requests, 0);
  await seed(h.outbox, 1, h.now());
  h.manager.pause();
  await h.manager.flush();
  assert.equal(requests, 0);
  assert.equal((await h.outbox.getAll())[0].status, "pending");
});

test("pagehide keeps an immediate final batch and pageshow restores the scheduler", async () => {
  let keepalive;
  const h = createHarness({ fetchImpl: async (_url, options) => {
    keepalive = options.keepalive;
    return response(200, { accepted: JSON.parse(options.body).events.map(e => e.event_id) });
  } });
  await seed(h.outbox, 1, h.now());
  h.manager.boundPageHide();
  for (let i = 0; i < 4; i++) await new Promise(setImmediate);
  assert.equal(keepalive, true);
  assert.equal(h.manager.paused, true);
  assert.equal(h.manager.timer, 0);
  h.manager.boundPageShow();
  assert.equal(h.manager.paused, false);
  assert.ok(h.manager.timer);
});

test("dispose removes listeners and timers, including after an in-flight timer finishes", async () => {
  const h = createHarness();
  h.manager.initialized = false;
  await h.manager.init();
  await new Promise(setImmediate);
  const callback = h.scheduled.find(t => !t.cancelled && t.delay >= 12_500).callback;
  h.manager.requestIdleFlush();
  h.manager.dispose();
  assert.equal(h.listeners.has("window:online"), false);
  assert.equal(h.listeners.has("window:pageshow"), false);
  assert.equal(h.listeners.has("window:pagehide"), false);
  assert.equal(h.listeners.has("document:visibilitychange"), false);
  await callback();
  assert.equal(h.manager.timer, 0);
  assert.equal(h.manager.idleTimer, 0);
  assert.equal(await h.manager.flush(), false);
});

test("loading the script twice preserves its singleton manager", () => {
  const h = loadLearningSyncRuntime();
  vm.runInNewContext(source, { window: h.window });
  assert.equal(h.window.MagicBookLearningSync, h.api);
});

test("sync timeout budgets are ordered upstream, Vercel, client, stale outbox claim", () => {
  const { api } = loadLearningSyncRuntime();
  const deployment = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const runtimeMs = deployment.functions["api/learning-sync.mjs"].maxDuration * 1000;
  assert.equal(LEARNING_SYNC_SERVER_CONFIG.upstreamTimeoutMs, 30000);
  assert.ok(LEARNING_SYNC_SERVER_CONFIG.upstreamTimeoutMs < runtimeMs);
  assert.ok(runtimeMs < api.config.requestTimeoutMs);
  assert.ok(api.config.requestTimeoutMs < api.config.sendingStaleMs);
});

test("a slow successful sync remains single-flight and clears the client timeout", async () => {
  let finish;
  let requests = 0;
  const h = createHarness({ fetchImpl: () => { requests++; return new Promise(resolve => { finish = resolve; }); } });
  const records = await seed(h.outbox, 1, h.now());
  const pending = h.manager.flush();
  await new Promise(setImmediate);
  const deadline = h.scheduled.find(timer => timer.delay === 40000 && !timer.cancelled);
  assert.ok(deadline);
  h.setNow(h.now() + 23000);
  assert.equal(await h.manager.flush(), false);
  assert.equal(requests, 1);
  finish(response(200, { accepted: [records[0].event_id], duplicates: [], rejected: [] }));
  await pending;
  assert.equal((await h.outbox.getAll())[0].status, "synced");
  assert.equal(deadline.cancelled, true);
  assert.equal(h.manager.requestController, null);
});
