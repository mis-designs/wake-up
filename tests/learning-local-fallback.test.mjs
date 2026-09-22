import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const syncSource = readFileSync(new URL("../learning-sync.js", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../src/learning-insights.js", import.meta.url), "utf8");
const owner = { userId: "3310000000", deviceId: "fixture-device", sessionId: "session-1" };
const validModel = { success: true, summary: {}, journey: {}, insight: {}, chapters: Array(25).fill({}), plan: [], errors: { figures: [], questions: [], words: [], topics: [], recovered: [] } };
const item = (quizId, correct = false) => ({ quizId, correct, question: `Domanda ${quizId}` });
function harness({ values = new Map(), offline = false } = {}) {
  values.set("user_session", JSON.stringify({ phone: owner.userId, deviceId: owner.deviceId, accessToken: "fixture-token" }));
  const calls = [];
  const timers = new Set();
  const clock = { now: Date.now() };
  class ClockDate extends Date { static now() { return clock.now; } }
  const root = {
    document: { readyState: "loading", addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
    navigator: { onLine: !offline }, location: { href: "https://fixture.test/statistiche", pathname: "/statistiche", hostname: "fixture.test" },
    indexedDB: null,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    setTimeout(fn, ms) { const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms); timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); },
    fetch: async (...args) => { calls.push(args); return { ok: false, status: 503, json: async () => ({ error: "unavailable" }) }; }
  };
  const context = vm.createContext({ window: root, document: root.document, AbortController, DOMException, URL, Date: ClockDate });
  vm.runInContext(syncSource, context);
  const sync = root.MagicBookLearningSync;
  // Local fixture, no scheduler and no live database/network.
  root.MagicBookLearningSync = { ...sync, getLocalEvents: async () => [], getInsightsCache: async () => null, setInsightsCache: async () => true, flush() {} };
  vm.runInContext(uiSource, context);
  return { root, sync, ui: root.MagicBookLearningInsights, state: root.MagicBookLearningInsights.__testing.state, calls, values, timers, clock };
}

test("local graded review survives reopening, deduplicates and isolates account/device", () => {
  const h = harness();
  assert.equal(h.sync.saveLocalReview({ ...owner, items: [item("1"), item("2", true)] }), true);
  h.sync.saveLocalReview({ ...owner, items: [item("1")] });
  assert.equal(h.sync.getLocalReview().entries.length, 2);
  const reopened = harness({ values: h.values });
  assert.equal(reopened.sync.getLocalReview().entries.length, 2);
  assert.equal(reopened.sync.getLocalReview().storage, "localStorage");
  for (const changed of [{ phone: "3320000000", deviceId: owner.deviceId }, { phone: owner.userId, deviceId: "different" }]) {
    reopened.values.set("user_session", JSON.stringify({ ...changed, accessToken: "other" }));
    assert.equal(reopened.sync.getLocalReview().entries.length, 0);
    assert.equal(reopened.sync.saveLocalReview({ ...owner, items: [item("3")] }), false);
  }
});

test("review is bounded, expires, excludes non-boolean grades and never contains credentials", () => {
  const h = harness();
  for (let i = 0; i < 5; i++) h.sync.saveLocalReview({ ...owner, sessionId: `s-${i}`, items: Array.from({ length: 80 }, (_, n) => item(String(n), true)) });
  assert.equal(h.sync.getLocalReview().entries.length, 250);
  h.sync.saveLocalReview({ ...owner, items: [{ ...item("bad"), correct: "false" }] });
  assert.equal(h.sync.getLocalReview().entries.some(entry => entry.quizId === "bad"), false);
  const raw = [...h.values.entries()].find(([key]) => key.startsWith(h.sync.config.localReviewPrefix))[1];
  assert.doesNotMatch(raw, /fixture-token|accessToken|user_answer/);
  assert.ok(raw.length * 2 <= h.sync.config.maxLocalReviewBytes);
  h.clock.now += 24 * 60 * 60_000;
  assert.equal(h.sync.getLocalReview().entries.length, 0);
});

test("quota and corrupt storage keep the session usable without touching the outbox", () => {
  const h = harness();
  h.sync.saveLocalReview({ ...owner, items: [item("old")] });
  h.root.localStorage.setItem = () => { throw new Error("quota"); };
  assert.equal(h.sync.saveLocalReview({ ...owner, items: [item("1")] }), false);
  assert.equal(h.sync.getLocalReview().storage, "memory");
  assert.equal(h.sync.getLocalReview().entries.length, 2);
  h.values.set(`${h.sync.config.localReviewPrefix}${owner.userId}:${owner.deviceId}`, "{bad json");
  assert.equal(h.sync.getLocalReview().entries.length, 2);
  assert.equal(h.calls.length, 0);
});

test("503 without cache shows actual local activity and graded errors, never invented scores", async () => {
  const h = harness();
  h.sync.saveLocalReview({ ...owner, items: [item("1"), item("2", true)] });
  const record = { event_id: "a", event_type: "answer_event", user_id: owner.userId, status: "pending", payload: { quiz_id: "9", user_answer: 1 } };
  h.root.MagicBookLearningSync.getLocalEvents = async () => [record, record, { ...record, user_id: "3320000000" }];
  await h.ui.refresh();
  assert.equal(h.state.model, null);
  assert.equal(h.state.localReport.attempts, 1);
  assert.equal(h.state.localReport.pending, 1);
  assert.equal(h.state.localReport.entries.length, 2);
  h.state.mode = "errors";
  const html = h.ui.__testing.renderLocalReport(h.state.localReport);
  assert.match(html, /Dati locali, storico parziale/);
  assert.match(html, /1 \/ 2/);
  assert.match(html, /Domanda 1/);
  assert.doesNotMatch(html, /Domanda 9|Non riesco a leggere/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.timers.size, 0);
});

test("offline and absent local history show unknown scores, not a fabricated empty server history", async () => {
  const h = harness({ offline: true });
  await h.ui.refresh();
  const html = h.ui.__testing.renderLocalReport(h.state.localReport);
  assert.match(html, /Questo non significa che tu non abbia fatto quiz/);
  assert.match(html, /Risposte corrette<\/span><strong>—/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.timers.size, 0);
});

test("unreadable local outbox is unknown and cannot block the fallback", async () => {
  const h = harness();
  h.root.MagicBookLearningSync.getLocalEvents = async () => { throw new Error("blocked"); };
  await h.ui.refresh();
  assert.equal(h.state.localReport.attempts, null);
  assert.equal(h.calls.length, 1);
});

test("valid server recovery replaces local mode; permission denial never falls back", async () => {
  for (const status of [200, 401, 403]) {
    const h = harness();
    h.root.fetch = async () => ({ ok: status === 200, status, json: async () => status === 200 ? validModel : {} });
    await h.ui.refresh();
    assert.equal(h.state.localReport, null);
    assert.equal(h.state.model, status === 200 ? validModel : null);
    assert.equal(h.timers.size, 0);
  }
});

test("late server failure after account change does not display previous private activity", async () => {
  const h = harness();
  let release;
  h.root.fetch = () => new Promise(resolve => { release = resolve; });
  const work = h.ui.refresh();
  await new Promise(resolve => setImmediate(resolve));
  h.values.set("user_session", JSON.stringify({ phone: "3320000000", deviceId: "other", accessToken: "other" }));
  h.ui.hide();
  release({ ok: false, status: 503, json: async () => ({}) });
  await work;
  assert.equal(h.state.model, null);
  assert.equal(h.timers.size, 0);
});

test("failed repeated navigation has a one-minute cooldown, explicit refresh can retry", async () => {
  const h = harness();
  await h.ui.refresh();
  await assert.rejects(h.ui.readProgress(), /cooldown/);
  await assert.rejects(h.ui.readProgress(), /cooldown/);
  assert.equal(h.calls.length, 1);
  await h.ui.refresh();
  assert.equal(h.calls.length, 2);
  h.clock.now += 60_000;
  await assert.rejects(h.ui.readProgress(), /unavailable/);
  assert.equal(h.calls.length, 3);
});

test("saved progress survives network/503 without being rewritten as fresh", async () => {
  const h = harness();
  let writes = 0;
  h.root.MagicBookLearningSync.getInsightsCache = async () => ({ model: validModel, cached_at: 123 });
  h.root.MagicBookLearningSync.setInsightsCache = async () => { writes++; };
  const result = await h.ui.readProgress();
  assert.equal(result.cached, true);
  assert.equal(result.model, validModel);
  assert.equal(writes, 0);
});

test("local question text is escaped and only the latest saved answer for a quiz is shown as wrong", () => {
  const h = harness();
  h.state.mode = "errors";
  const html = h.ui.__testing.renderLocalReport({ attempts: 0, pending: 0, entries: [
    { ...item("1"), at: Date.now() }, { ...item("1", true), at: Date.now() },
    { ...item("2"), question: '<img src=x onerror="alert(1)">', at: Date.now() }
  ] });
  assert.doesNotMatch(html, /Domanda 1|<img src=x/);
  assert.match(html, /&lt;img/);
});

test("screen deadline keeps local data and leaves no timeout or repeated automatic request", async () => {
  const h = harness();
  const schedule = h.root.setTimeout;
  h.root.setTimeout = (fn, ms) => schedule(fn, ms === 14_000 ? 5 : ms);
  h.root.fetch = async (_, { signal }) => {
    h.calls.push(1);
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true }));
  };
  await h.ui.refresh();
  assert.ok(h.state.localReport);
  assert.equal(h.state.isRefreshing, false);
  assert.equal(h.timers.size, 0);
  await assert.rejects(h.ui.readProgress(), /cooldown/);
  assert.equal(h.calls.length, 1);
});

test("finishing a real quiz stores only server-graded answered items, never trial or another account", async () => {
  const source = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
  const start = source.indexOf("async function finishQuiz(");
  const finish = source.slice(start, source.indexOf("\n}\n", start) + 2);
  for (const trial of [false, true]) {
    const h = harness();
    const context = vm.createContext({
      window: { MagicBookLearningSync: h.sync }, isFinishing: false, TRIAL_MODE: trial,
      learningSessionId: owner.sessionId, quiz: [1, 2, 3, 4].map(id => ({ id, question: `Question ${id}` })),
      answers: [{ answer: 1 }, { answer: 0 }, { answer: null }, { answer: 1 }],
      getQuizPhone: () => owner.userId, getQuizDeviceId: () => owner.deviceId, getQuizSessionToken: () => "trial-token",
      getElapsedQuizSeconds: () => 50, showLoading() {}, hideLoading() {}, lastQuizSet: [],
      fetchQuizJson: async () => ({ results: [{ id: 1, correct: true }, { id: 2, correct: false }, { id: 3, correct: false }, { id: 4 }] }),
      normalizeQuizResult: data => data, clearInterval() {}, timerInterval: 0, timerExpiryPending: false,
      showResult: async () => "close", returnToBook() {}, schedulePendingTimerExpiry() {},
      quizAccessErrorHandled: false, showMessage: () => assert.fail("grade flow must not fail"),
      console: { log() {}, warn() {}, error() {} }
    });
    vm.runInContext(finish, context);
    await vm.runInContext("finishQuiz(true)", context);
    assert.equal(h.sync.getLocalReview().entries.length, trial ? 0 : 2);
    if (!trial) assert.deepEqual(Array.from(h.sync.getLocalReview().entries, row => row.correct), [true, false]);
  }
});
