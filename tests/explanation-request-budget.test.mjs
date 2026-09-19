import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
const start = source.indexOf("let explanationFiguresExpiresAt =");
const end = source.indexOf("function getFigureKey(", start);
assert.ok(start > 0 && end > start);
const implementation = source.slice(start, end);
const storageKey = "magicbook_explanation_figures_v2";
const settle = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };

function fixture(options = {}) {
  let now = 100_000;
  const storage = options.storage || new Map();
  const listeners = new Map(), timers = new Map();
  const calls = { manifest: 0, head: [], paints: 0 };
  let timerId = 0;
  const context = vm.createContext({
    AbortController, Map, Set, Promise,
    Date: class extends Date { static now() { return now; } },
    EXPLANATION_FIGURES_CACHE_KEY: storageKey, EXPLANATION_AVAILABILITY_TTL_MS: 60_000,
    EXPLANATION_EXTENSIONS: ["png", "webp", "jpg", "jpeg"], TRIAL_MODE: options.trial || false,
    quizAccessErrorHandled: false, quiz: [{ figure: "fig1" }], current: 0,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    window: { addEventListener: (name, callback) => listeners.set(name, callback) },
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    getNormalizedFigureKey: question => question?.figure || "",
    updateExplanationButton: () => { calls.paints++; },
    buildQuizApiUrl: () => "/api/quiz?action=getExplanationFigures",
    buildExplanationImageUrl: (figure, value, ext) => `${figure}.${ext}`,
    fetchQuizJson: async (...args) => {
      calls.manifest++;
      return options.manifest ? options.manifest(...args) : { figures: [], complete: true };
    },
    fetch: async (url, init) => {
      calls.head.push(url);
      return options.head ? options.head(url, init) : { ok: false, status: 404 };
    }
  });
  vm.runInContext(implementation, context);
  const run = expression => vm.runInContext(expression, context);
  return {
    calls, timers, storage, context,
    refresh: () => run("refreshExplanationFigures()"),
    check: key => run(`checkExplanationFigure(${JSON.stringify(key)})`),
    advance: ms => { now += ms; },
    visit(key) {
      context.quiz = [{ figure: key }];
      listeners.get("magicbook:quiz-question-change")();
      run("checkCurrentExplanationFigure(quiz[current])");
    },
    event: (name, event = {}) => listeners.get(name)?.(event),
    size: () => run("explanationProbeCache.size")
  };
}

test("30 questions with a complete empty listing: one listing and zero speculative HEADs", async () => {
  const h = fixture();
  await Promise.all(Array.from({ length: 30 }, () => h.refresh()));
  for (let i = 1; i <= 30; i++) { h.visit(`fig${i}`); await settle(); }
  assert.equal(h.calls.manifest, 1);
  assert.equal(h.calls.head.length, 0, "previous eager scan could send 30 x 4 probes");
  assert.equal(h.timers.size, 0);
  assert.doesNotMatch(source, /checkQuizExplanationFigures/);
  const home = readFileSync(new URL("../script.js", import.meta.url), "utf8");
  assert.doesNotMatch(home, /warmExplanationFiguresCache|action: "getExplanationFigures"/);
});

test("fresh complete listing is reused across page visits, then refreshed after 60 seconds", async () => {
  const first = fixture({ manifest: async () => ({ figures: ["fig2"], complete: true }) });
  await first.refresh();
  const next = fixture({ storage: first.storage });
  next.visit("fig3"); await settle();
  assert.equal(next.calls.manifest, 0);
  assert.equal(next.calls.head.length, 0);
  assert.equal(await next.check("fig2"), true);
  next.advance(60_001);
  await next.refresh();
  assert.equal(next.calls.manifest, 1);
});

test("questions without figures never request explanation availability", async () => {
  const h = fixture();
  for (let i = 0; i < 30; i++) h.visit("");
  await settle();
  assert.equal(h.calls.manifest, 0);
  assert.equal(h.calls.head.length, 0);
  const load = source.slice(source.indexOf("async function loadQuiz()"), source.indexOf("async function loadQuiz()") + 1700);
  assert.doesNotMatch(load, /refreshExplanationFigures/);
});

test("partial, corrupt and future-dated lists cannot suppress a valid explanation", async () => {
  for (const cached of [
    { figures: [], savedAt: 100_000 },
    { complete: true, figures: [], savedAt: 200_000 },
    { complete: true, figures: ["invalid"], savedAt: 100_000 }
  ]) {
    const h = fixture({ storage: new Map([[storageKey, JSON.stringify(cached)]]), manifest: async () => ({ figures: ["fig1"] }) });
    h.visit("fig1"); await settle();
    assert.equal(h.calls.manifest, 1);
    assert.equal(h.calls.head.length, 0);
    assert.equal(h.calls.paints, 1);
  }
});

test("after failed listing and fast navigation, only the current figure is probed", async () => {
  let reject;
  const h = fixture({ manifest: () => new Promise((_, fail) => { reject = fail; }) });
  for (let i = 1; i <= 30; i++) h.visit(`fig${i}`);
  reject(new Error("offline")); await settle();
  assert.equal(h.calls.manifest, 1);
  assert.deepEqual(h.calls.head, ["fig30.png", "fig30.webp", "fig30.jpg", "fig30.jpeg"]);
  h.visit("fig30"); await settle();
  assert.equal(h.calls.head.length, 4, "negative result has a bounded TTL");
  assert.equal(h.calls.manifest, 1, "failed listing has retry backoff");
  h.advance(61_000);
  // Replace the failed service with a now-complete list: absence no longer needs probes.
  h.context.fetchQuizJson = async () => ({ figures: [], complete: true });
  h.visit("fig30"); await settle();
  assert.equal(h.calls.head.length, 4);
  assert.equal(h.timers.size, 0);
});

test("trial/offline fallback still finds each supported format, without a full-quiz scan", async () => {
  for (const ext of ["png", "webp", "jpg", "jpeg"]) {
    const h = fixture({ trial: true, head: async url => ({ ok: url.endsWith(`.${ext}`), status: url.endsWith(`.${ext}`) ? 204 : 404 }) });
    h.visit("fig1"); await settle();
    assert.equal(h.calls.manifest, 0);
    assert.equal(h.calls.paints, 1);
    assert.equal(await h.check("fig1"), true);
    assert.equal(h.storage.has(storageKey), false, "a discovered figure is not a complete listing");
  }
});

test("concurrent fallback is deduplicated; service errors do not fan out over four formats", async () => {
  const h = fixture({ trial: true, head: async () => ({ ok: false, status: 503 }) });
  await Promise.all([h.check("fig1"), h.check("fig1"), h.check("fig1")]);
  assert.equal(h.calls.head.length, 1);
  await h.check("fig1"); assert.equal(h.calls.head.length, 1);
  h.advance(10_001);
  await h.check("fig1"); assert.equal(h.calls.head.length, 2);
});

test("a listing from a different asset store or an older API cannot prove a missing explanation", async () => {
  for (const complete of [false, undefined]) {
    const h = fixture({ manifest: async () => ({ figures: [], complete }), head: async () => ({ ok: true, status: 204 }) });
    h.visit("fig1"); await settle();
    assert.equal(h.calls.manifest, 1);
    assert.deepEqual(h.calls.head, ["fig1.png"]);
    assert.equal(h.calls.paints, 1);
  }
});

test("leaving aborts requests and clears timers; BFCache return can resume current help", async () => {
  let signal;
  const h = fixture({ trial: true, head: (_, options) => {
    signal = options.signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  } });
  h.visit("fig1"); await settle();
  h.event("pagehide"); await settle();
  assert.equal(signal.aborted, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.size(), 0, "cancellation is not a negative result");
  h.visit("fig2"); await settle();
  assert.equal(h.calls.head.length, 1);
  h.event("pageshow", { persisted: true });
  assert.equal(h.calls.paints, 1);
});

test("a completed authentication failure cannot start optional asset probes", async () => {
  const h = fixture({ manifest: async () => { h.context.quizAccessErrorHandled = true; throw new Error("unauthorized"); } });
  h.visit("fig1"); await settle();
  assert.equal(h.calls.head.length, 0);
});

test("negative probe cache is bounded", async () => {
  const h = fixture({ trial: true });
  for (let i = 1; i <= 100; i++) await h.check(`fig${i}`);
  assert.equal(h.size(), 64);
  assert.equal(h.timers.size, 0);
});
