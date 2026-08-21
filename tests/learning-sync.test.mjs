import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

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
    addEventListener(name, callback) { listeners.set(`document:${name}`, callback); }
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
    clearTimeout() {},
    addEventListener(name, callback) { listeners.set(`window:${name}`, callback); },
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
    assert.match(page, /learning-sync\.js\?v=2/u);
  });
  assert.match(serviceWorker, /learning-sync\.js\?v=2/u);
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
