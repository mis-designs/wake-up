import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
const helpers = source.slice(source.indexOf("  function audioStatusKey("), source.indexOf("  const audioObserver ="));
const observer = source.slice(source.indexOf("  function observeAudioAvailability("), source.indexOf("  async function playExplanation("));

function fixture() {
  const pending = [], timers = new Map();
  let id = 0, now = 1000;
  const context = vm.createContext({
    AbortController, DOMException,
    Date: { now: () => now }, STUDY_AUDIO_STATUS_TTL_MS: 300000, STUDY_AUDIO_STATUS_MAX_ENTRIES: 128,
    audioStatusRequests: new Map(), audioStatusCache: new Map(), pendingAudioStatusChecks: new Map(),
    audioObserver: null, STUDY_AUDIO_STATUS_DELAY_MS: 400,
    fingerprint: () => assert.fail("fixture has an id"),
    window: { setTimeout(fn) { const key = ++id; timers.set(key, fn); return key; }, clearTimeout: key => timers.delete(key) },
    audioApi: (_action, question, { signal }) => new Promise((resolve, reject) => pending.push({ resolve, reject, signal, question }))
  });
  vm.runInContext(helpers + observer, context);
  const reset = () => vm.runInContext("resetAudioObservation()", context);
  function card(questionId = "cap1_q1") {
    const target = {}, changes = [];
    const button = { dataset: {}, classList: { toggle: (...args) => changes.push(args), remove() {}, add: (...args) => changes.push(args) } };
    context.target = target; context.question = { id: questionId }; context.button = button;
    vm.runInContext("observeAudioAvailability(target, question, button)", context);
    return { check: () => target._checkStudyAudio(), changes, button };
  }
  return { context, pending, timers, reset, card, advance: ms => { now += ms; } };
}

test("study audio: simultaneous checks share one request and successful results are reused", async () => {
  const h = fixture(), first = h.card(), second = h.card();
  const a = first.check(), b = second.check();
  assert.equal(h.pending.length, 1);
  h.pending[0].resolve({ available: true });
  await Promise.all([a, b]);
  assert.equal(first.button.dataset.audioState, "ready");
  assert.equal(second.button.dataset.audioState, "ready");
  await first.check();
  assert.equal(h.pending.length, 1);
  assert.equal(h.context.audioStatusRequests.size, 0);
  h.reset(); assert.equal(h.timers.size, 0);
});

test("chapter exit aborts obsolete checks without caching or painting late responses", async () => {
  const h = fixture(), card = h.card();
  const work = card.check();
  h.reset();
  assert.equal(h.pending[0].signal.aborted, true);
  assert.equal(h.context.audioStatusRequests.size, 0);
  assert.equal(h.timers.size, 0);
  h.pending[0].resolve({ available: true });
  await work;
  assert.equal(card.changes.length, 0);
  assert.equal(h.context.audioStatusCache.size, 0);
  const retry = card.check();
  assert.equal(h.pending.length, 2);
  h.pending[1].resolve({ available: false, temporaryUnavailable: true });
  await retry;
  assert.equal(h.context.audioStatusCache.size, 0);
  assert.equal(card.button.dataset.audioState, "retry");
  assert.deepEqual(card.changes.at(-1), ["hidden", false]);
});

test("chapter 17: transient status failures keep both players usable with no automatic retries", async () => {
  for (const failure of ["temporary", "network", "timeout", "malformed"]) {
    const h = fixture();
    const cards = [h.card("cap17_q20"), h.card("cap17_q21")];
    const work = cards.map(card => card.check());
    assert.equal(h.pending.length, 2);
    for (const pending of h.pending) {
      if (failure === "temporary") pending.resolve({ available: false, temporaryUnavailable: true });
      else if (failure === "malformed") pending.resolve({ ok: true });
      else pending.reject(failure === "timeout" ? new DOMException("Timed out", "TimeoutError") : new TypeError("Failed to fetch"));
    }
    await Promise.all(work);
    for (const card of cards) {
      assert.equal(card.button.dataset.audioState, "retry");
      assert.deepEqual(card.changes.at(-1), ["hidden", false]);
    }
    assert.equal(h.pending.length, 2, "no retry/fan-out from a failed status check");
    assert.equal(h.context.audioStatusCache.size, 0);
    h.reset();
    assert.equal(h.timers.size, 0);
  }
});

test("a late network rejection after leaving does not restore a cancelled player", async () => {
  const h = fixture(), card = h.card();
  const work = card.check();
  h.reset();
  h.pending[0].reject(new TypeError("Failed to fetch"));
  await work;
  assert.equal(card.changes.length, 0);
  assert.equal(h.context.audioStatusCache.size, 0);
});

test("manual playback after a failed status makes the player ready and caches the recording", async () => {
  const h = fixture(), card = h.card("cap17_q21");
  const check = card.check();
  h.pending[0].resolve({ available: false, temporaryUnavailable: true });
  await check;
  let plays = 0, downloads = 0;
  const classes = { add() {}, remove() {} };
  Object.assign(h.context, {
    pendingExplanation: null, explanationRequestId: 0, activePlayback: null, audioFocus: null,
    cancelPendingExplanation() {}, stopStudyTts() {},
    fetchExplanationBlob: async () => { downloads++; return { blob: { size: 100 }, durationMs: 1000 }; },
    startExplanationAudio: async () => { plays++; },
    URL: { createObjectURL: () => "blob:local-audio" }, showToast: () => assert.fail("playback succeeded")
  });
  vm.runInContext(source.slice(source.indexOf("  async function playExplanation("), source.indexOf("  async function fetchExplanationBlob(")), h.context);
  const controls = { surface: card.button, root: { classList: classes },
    play: { setAttribute() {}, removeAttribute() {} }, key: "explanation:cap17_q21" };
  await h.context.playExplanation({ id: "cap17_q21" }, controls);
  assert.equal(plays, 1);
  assert.equal(downloads, 1);
  assert.equal(card.button.dataset.audioState, "ready");
  assert.equal(card.button.title, "");
  assert.equal(h.context.cachedAudioAvailability({ id: "cap17_q21" }), true);
  assert.equal(h.pending.length, 1, "manual play does not issue another status request");
  assert.equal(controls.play.disabled, false);
});

test("manual playback fallback is bounded at three reads and navigation stops it immediately", async () => {
  const calls = [];
  const controller = new AbortController();
  const context = vm.createContext({
    audioApi: async action => {
      calls.push(action);
      if (action === "getQuizAudioBlob") throw new DOMException("Timed out", "TimeoutError");
      return { audioUrl: "https://fixture.invalid/audio", durationMs: 1000 };
    },
    createTimedAudioRequest: () => ({ signal: controller.signal, cleanup() {} }),
    fetch: async () => { calls.push("object"); return { ok: true, blob: async () => ({ size: 100 }) }; }
  });
  vm.runInContext(source.slice(source.indexOf("  async function fetchExplanationBlob("), source.indexOf("  function filterQuestions(")), context);
  assert.equal((await context.fetchExplanationBlob({ id: "cap17_q21" })).blob.size, 100);
  assert.deepEqual(calls, ["getQuizAudioBlob", "getQuizAudioPlayback", "object"]);
  calls.length = 0;
  context.audioApi = async action => { calls.push(action); throw new DOMException("Cancelled", "AbortError"); };
  await assert.rejects(context.fetchExplanationBlob({ id: "cap17_q21" }), { name: "AbortError" });
  assert.deepEqual(calls, ["getQuizAudioBlob"]);
});

test("confirmed missing/review audio stays hidden; chapter navigation reuses only fresh statuses", async () => {
  const h = fixture(), card = h.card("cap17_q21");
  const first = card.check();
  h.pending[0].resolve({ available: false, requiresReview: true });
  await first;
  assert.equal(card.button.dataset.audioState, "unavailable");
  assert.deepEqual(card.changes.at(-1), ["hidden", true]);
  h.reset();
  const returned = h.card("cap17_q21");
  await returned.check();
  assert.equal(h.pending.length, 1, "repeated navigation inside TTL does not refetch");
  h.advance(300000);
  const refresh = returned.check();
  assert.equal(h.pending.length, 2, "negative cache expires so newly available recordings can appear");
  h.pending[1].resolve({ available: true });
  await refresh;
  assert.equal(returned.button.dataset.audioState, "ready");
  assert.deepEqual(returned.changes.at(-1), ["hidden", false]);
});

test("study status cache is bounded and successful playback replaces an old negative entry", () => {
  const h = fixture();
  for (let i = 0; i < 140; i++) h.context.cacheAudioAvailability({ id: `cap17_q${i}` }, false);
  assert.equal(h.context.audioStatusCache.size, 128);
  assert.equal(h.context.cachedAudioAvailability({ id: "cap17_q0" }), undefined);
  h.context.cacheAudioAvailability({ id: "cap17_q21" }, true);
  assert.equal(h.context.cachedAudioAvailability({ id: "cap17_q21" }), true);
  h.advance(300000);
  assert.equal(h.context.cachedAudioAvailability({ id: "cap17_q21" }), undefined);
});

test("request deadlines are retryable timeouts, while navigation remains a silent cancellation", () => {
  const timers = new Map();
  let id = 0;
  const context = vm.createContext({ AbortController, DOMException, STUDY_AUDIO_REQUEST_TIMEOUT_MS: 12000,
    window: { setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout: key => timers.delete(key) } });
  vm.runInContext(source.slice(source.indexOf("  function createTimedAudioRequest("), source.indexOf("  async function audioApi(")), context);
  const timeout = context.createTimedAudioRequest();
  timers.get(1)();
  assert.equal(timeout.signal.reason.name, "TimeoutError");
  timeout.cleanup();
  const parent = new AbortController();
  const cancelled = context.createTimedAudioRequest(parent.signal);
  parent.abort();
  assert.equal(cancelled.signal.reason.name, "AbortError");
  cancelled.cleanup();
  assert.equal(timers.size, 0);
});

test("BFCache return restores observation without refetching the chapter", () => {
  const resume = source.slice(source.indexOf('window.addEventListener("pageshow"'), source.indexOf('document.addEventListener("visibilitychange"'));
  assert.match(resume, /event.persisted && currentChapter/);
  assert.match(resume, /audioObserver.observe\(card\)/);
  assert.doesNotMatch(resume, /openChapter|fetch\(/);
});
