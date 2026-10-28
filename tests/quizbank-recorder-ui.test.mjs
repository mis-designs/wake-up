import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// node --test tests/quizbank-recorder-ui.test.mjs
// Exercise the production Study adapter, not the recorder implementation.
// No module loading, microphone, real timers, network or storage writes.
const source = readFileSync(new URL("../study-quiz.js", import.meta.url), "utf8");
function section(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Missing Study boundaries: ${start} / ${end}`);
  return source.slice(first, last);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function until(predicate, description) {
  for (let turn = 0; turn < 40 && !predicate(); turn++) await Promise.resolve();
  assert.ok(predicate(), description);
}

function fixture({ mode = true, capability = true, identity = "fixture-account" } = {}) {
  const document = { activeElement: null };
  class Element {
    constructor(className = "") {
      this.className = className; this.children = []; this.parentElement = null;
      this.dataset = {}; this.hidden = false; this.focusCalls = 0;
      const tokens = () => new Set(this.className.split(/\s+/).filter(Boolean));
      this.classList = {
        contains: name => tokens().has(name),
        add: (...names) => { const set = tokens(); names.forEach(name => set.add(name)); this.className = [...set].join(" "); },
        remove: (...names) => { const set = tokens(); names.forEach(name => set.delete(name)); this.className = [...set].join(" "); },
        toggle: (name, force) => {
          const enabled = force ?? !tokens().has(name);
          this.classList[enabled ? "add" : "remove"](name); return enabled;
        }
      };
    }
    get isConnected() { return this === document.body || Boolean(this.parentElement?.isConnected); }
    append(...children) { children.forEach(child => { child.remove(); child.parentElement = this; this.children.push(child); }); }
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      this.parentElement = null;
    }
    closest(selector) { return this.classList.contains(selector.slice(1)) ? this : this.parentElement?.closest(selector) || null; }
    querySelector(selector) {
      for (const child of this.children) {
        if (child.classList.contains(selector.slice(1))) return child;
        const found = child.querySelector(selector); if (found) return found;
      }
      return null;
    }
    focus() { this.focusCalls++; document.activeElement = this; }
  }
  document.body = new Element(); document.activeElement = document.body;
  const first = { id: "qb_s02_q01", question: "Domanda identica.", figure: "25", correct: true, number: 1 };
  const rows = [first, { ...first, id: "qb_s02_q02", number: 2 },
    { ...first, id: "qb_s02_q03", question: "Altra domanda.", number: 3 },
    { ...first, id: "qb_s02_q04", figure: "26", number: 4 },
    { ...first, id: "qb_s02_q05", correct: false, number: 5 },
    { ...first, id: "qb_s02_q06", question: "Domanda identica?", number: 6 }];
  const list = new Element(); document.body.append(list);
  const controls = rows.map(() => {
    const card = new Element("study-question-card"), main = new Element("study-question-main");
    const surface = new Element("study-explanation-media hidden"), play = new Element(), trigger = new Element();
    surface._uploadButton = trigger;
    surface.append(play); main.append(surface, trigger); card.append(main); list.append(card);
    return { card, main, surface, play, trigger };
  });
  const recorders = [], requests = [], saves = [], toasts = [], timers = new Map();
  let timerId = 0, stopped = 0;
  const window = {
    setTimeout(fn, delay) { const key = ++timerId; timers.set(key, { fn, delay }); return key; },
    clearTimeout: key => timers.delete(key),
    MagicQuizAudioRecorder: {
      create(callbacks) {
        const recorder = { callbacks, opened: [], destroyed: 0,
          open(options) { this.opened.push(options); }, destroy() { this.destroyed++; } };
        recorders.push(recorder); return recorder;
      }
    }
  };
  const context = vm.createContext({ window, document, AbortController, DOMException, Uint8Array, btoa,
    QUIZBANK_MODE: mode, audioObserver: null, elements: { list }, fixtureRows: rows, fixtureCapability: capability,
    studyVideoIdentity: () => identity, stopPlayback: () => stopped++, showToast: message => toasts.push(message),
    fingerprint: () => assert.fail("fixture rows always have trusted ids"),
    fetch: () => assert.fail("unexpected network access"),
    navigator: { mediaDevices: { getUserMedia: () => assert.fail("unexpected microphone access") } },
    audioApi(action, question, options) {
      const call = { action, question, ...options, ...deferred() };
      (action === "saveQuizAudio" ? saves : requests).push(call);
      return call.promise;
    }
  });
  vm.runInContext(section("  let currentChapter =", "  function parseSession("), context);
  vm.runInContext("questions = fixtureRows; currentChapter = 2; quizBankCanUploadAudio = fixtureCapability;", context);
  vm.runInContext(section("  function audioStatusKey(", "  const audioObserver =")
    + section("  function observeAudioAvailability(", "  async function playExplanation(")
    + section("  function closeQuizBankAudioRecorder(", "  function renderQuestions("), context);
  return { context, document, window, rows, controls, recorders, requests, saves, toasts, timers,
    get stopped() { return stopped; },
    get requestMap() { return vm.runInContext("audioStatusRequests", context); },
    cache: index => context.cachedAudioAvailability(rows[index]),
    setIdentity(value) { identity = value; },
    setCapability(value) { context.fixtureCapability = value; vm.runInContext("quizBankCanUploadAudio = fixtureCapability;", context); },
    navigate() { vm.runInContext("loadRequestId++;", context); },
    open(index = 0) {
      context.openQuizBankAudioRecorder(rows[index], controls[index], controls[index].trigger);
      return recorders.at(-1)?.callbacks;
    },
    close: () => context.closeQuizBankAudioRecorder(),
    reset: () => context.resetAudioObservation(),
    check(index) {
      const { card, surface } = controls[index];
      context.observeAudioAvailability(card, rows[index], surface);
      context.cancelPendingAudioStatus(card);
      return card._checkStudyAudio();
    }
  };
}

function recording(type = "audio/webm;codecs=opus", bytes = Uint8Array.of(0, 1, 2, 3, 255)) {
  return { blob: new Blob([bytes], { type }), mimeType: type, durationMs: 1250 };
}
const isAbort = error => error.name === "AbortError";

test("opening requires QuizBank mode, server capability, account identity and an attached trigger", async t => {
  for (const reason of ["mode", "capability", "identity", "detached", "container", "module"]) {
    await t.test(reason, () => {
      const f = fixture({ mode: reason !== "mode", capability: reason !== "capability", identity: reason === "identity" ? "" : "account" });
      if (reason === "detached") f.controls[0].trigger.remove();
      if (reason === "container") f.controls[0].main.className = "other-container";
      if (reason === "module") delete f.window.MagicQuizAudioRecorder;
      f.open(); assert.equal(f.recorders.length, 0); assert.equal(f.saves.length + f.requests.length, 0);
    });
  }
  const f = fixture(), callbacks = f.open();
  assert.equal(callbacks.container, f.controls[0].main);
  assert.equal(callbacks.maxBytes, 3 * 1024 * 1024);
  assert.equal(callbacks.isCurrent(), true); assert.equal(f.stopped, 1);
  assert.equal(f.recorders[0].opened.length, 1);
  assert.equal(f.recorders[0].opened[0].question, f.rows[0]);
  assert.equal(f.recorders[0].opened[0].trigger, f.controls[0].trigger);
  assert.equal(callbacks.returnFocus(), f.controls[0].trigger);
  f.controls[0].trigger.hidden = true;
  assert.equal(callbacks.returnFocus(), f.controls[0].play);
});

test("opening another recorder destroys its predecessor; explicit close is idempotent", () => {
  const f = fixture(); f.open(); f.open(1);
  assert.equal(f.recorders.length, 2); assert.equal(f.recorders[0].destroyed, 1);
  assert.equal(f.recorders[1].destroyed, 0); assert.equal(f.stopped, 2);
  f.close(); f.close(); assert.equal(f.recorders[1].destroyed, 1);
  assert.equal(f.saves.length + f.requests.length, 0);
});

test("sheet reset destroys the recorder and cancels existing status work without late painting", async () => {
  const f = fixture(); f.open();
  const checking = f.check(1); f.reset();
  assert.equal(f.recorders[0].destroyed, 1); assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.requestMap.size, 0); assert.equal(f.timers.size, 0);
  f.requests[0].resolve({ available: true }); await checking;
  assert.equal(f.cache(1), undefined); assert.equal(f.controls[1].surface.dataset.audioState, undefined);
});

test("WebM/MP4 saves emit exact binary base64, actual MIME, duration, same signal and a 30s budget", async t => {
  for (const type of ["audio/webm;codecs=opus", "audio/mp4"]) await t.test(type, async () => {
    const f = fixture(), callbacks = f.open(), controller = new AbortController();
    // Cross the adapter's 32768-byte chunk boundary and include non-ASCII bytes.
    const bytes = Uint8Array.from({ length: 65_539 }, (_, index) => index % 256);
    const pending = callbacks.save(recording(type, bytes), controller.signal);
    await until(() => f.saves.length === 1, "one explicit save reaches audioApi");
    const request = f.saves[0];
    assert.equal(request.action, "saveQuizAudio"); assert.equal(request.question, f.rows[0]);
    assert.equal(request.signal, controller.signal); assert.equal(request.timeoutMs, 30_000);
    assert.deepEqual({ ...request.payload }, { audioBase64: Buffer.from(bytes).toString("base64"),
      audioMimeType: type, audioDurationMs: 1250 });
    assert.doesNotMatch(request.payload.audioBase64, /^data:/);
    assert.equal(f.requests.length, 0, "save does not probe status or request a direct-PUT URL");
    const result = { ok: true, created: true }; request.resolve(result);
    assert.equal(await pending, result);
    assert.equal(f.saves.length, 1); assert.equal(f.toasts.length, 0, "only onSaved commits UI state");
  });
});

for (const change of ["navigation", "identity", "capability", "detached", "abort"]) {
  test(`stale recording bytes cannot start a write after ${change}`, async () => {
    const f = fixture(), callbacks = f.open(), controller = new AbortController(), read = deferred();
    const pending = callbacks.save({ ...recording(), blob: { arrayBuffer: () => read.promise } }, controller.signal);
    const rejected = assert.rejects(pending, isAbort);
    if (change === "navigation") f.navigate();
    if (change === "identity") f.setIdentity("different-account");
    if (change === "capability") f.setCapability(false);
    if (change === "detached") f.controls[0].trigger.remove();
    if (change === "abort") controller.abort();
    read.resolve(Uint8Array.of(1, 2).buffer); await rejected;
    assert.equal(f.saves.length, 0); assert.equal(f.requests.length, 0); assert.equal(f.toasts.length, 0);
  });
}

test("same-account/same-question callbacks remain stale after a new sheet generation reopens the recorder", async () => {
  const f = fixture(), obsolete = f.open();
  f.navigate(); const current = f.open();
  assert.equal(f.recorders[0].destroyed, 1);
  assert.equal(obsolete.isCurrent(), false); assert.equal(current.isCurrent(), true);
  await assert.rejects(obsolete.save(recording(), new AbortController().signal), isAbort);
  obsolete.onSaved();
  assert.equal(f.cache(0), undefined); assert.equal(f.cache(1), undefined);
  assert.equal(f.toasts.length, 0); assert.equal(f.controls[0].play.focusCalls, 0);
  assert.equal(f.saves.length, 0);
  current.onSaved(); assert.equal(f.cache(0), true); assert.equal(f.toasts.length, 1);
});

test("late successful writes do not publish stale UI/cache/focus after navigation", async () => {
  const f = fixture(), callbacks = f.open(), controller = new AbortController();
  const pending = callbacks.save(recording(), controller.signal);
  await until(() => f.saves.length === 1, "save is in flight");
  f.navigate(); f.saves[0].resolve({ ok: true }); await pending;
  // Deliberately invoke the captured callback even though a real destroyed recorder would suppress it.
  callbacks.onSaved();
  assert.equal(f.saves.length, 1); assert.equal(f.cache(0), undefined); assert.equal(f.cache(1), undefined);
  assert.equal(f.toasts.length, 0); assert.equal(f.controls[0].play.focusCalls, 0);
  assert.equal(f.controls[0].trigger.hidden, false);
});

test("successful save updates only exact content/figure/answer duplicates and aborts only matching statuses", async () => {
  const f = fixture(), callbacks = f.open();
  const checking = f.rows.map((_, index) => f.check(index));
  callbacks.onSaved();
  for (let index = 0; index < f.rows.length; index++) {
    const matching = index < 2;
    assert.equal(f.requests[index].signal.aborted, matching);
    assert.equal(f.requestMap.has(f.rows[index].id), !matching);
    assert.equal(f.cache(index), matching ? true : undefined);
    f.requests[index].resolve({ available: false });
  }
  await Promise.all(checking);
  for (let index = 0; index < f.rows.length; index++) {
    const matching = index < 2;
    assert.equal(f.controls[index].surface.dataset.audioState, matching ? "ready" : "unavailable");
    assert.equal(f.controls[index].trigger.hidden, matching); assert.equal(f.cache(index), matching);
  }
  assert.equal(f.document.activeElement, f.controls[0].play);
  assert.equal(f.toasts.length, 1); assert.equal(f.requests.length, f.rows.length, "no status refresh fan-out");
});

for (const outcome of ["missing", "temporary", "rejected"]) {
  test(`committed availability wins after a ${outcome} status has removed its abort handle`, async () => {
    const f = fixture(), callbacks = f.open(), checking = f.check(1);
    if (outcome === "rejected") f.requests[0].reject(new TypeError("Failed to fetch"));
    else f.requests[0].resolve({ available: false, ...(outcome === "temporary" ? { temporaryUnavailable: true } : {}) });
    await until(() => !f.requestMap.has(f.rows[1].id), "request finally has removed its abort handle");
    assert.equal(f.controls[1].surface.dataset.audioState, undefined, "observer has not painted yet");
    callbacks.onSaved();
    assert.equal(f.requests[0].signal.aborted, false, "save can no longer abort this completed request");
    await checking;
    assert.equal(f.cache(1), true); assert.equal(f.controls[1].surface.dataset.audioState, "ready");
    assert.equal(f.controls[1].surface.classList.contains("hidden"), false);
    assert.equal(f.controls[1].trigger.hidden, true);
  });
}

test("already-existing audio is a terminal conflict that restores the confirmed player, not an overwrite", async () => {
  const f = fixture(), callbacks = f.open(), controller = new AbortController();
  const checking = [f.check(0), f.check(2)];
  const pending = callbacks.save(recording(), controller.signal);
  const rejection = assert.rejects(pending, error => error.retryable === false && /già presente/.test(error.message)
    && /Nessun audio è stato sostituito/.test(error.message));
  await until(() => f.saves.length === 1, "save starts");
  f.saves[0].reject(new Error("quiz_audio_already_exists")); await rejection;
  assert.equal(f.cache(0), true); assert.equal(f.controls[0].surface.dataset.audioState, "ready");
  assert.equal(f.controls[0].trigger.hidden, true); assert.equal(callbacks.returnFocus(), f.controls[0].play);
  assert.equal(f.requests[0].signal.aborted, true); assert.equal(f.requests[1].signal.aborted, false);
  assert.equal(f.requestMap.has(f.rows[0].id), false); assert.equal(f.requestMap.has(f.rows[2].id), true);
  f.requests.forEach(request => request.resolve({ available: false })); await Promise.all(checking);
  assert.equal(f.cache(0), true); assert.equal(f.saves.length, 1, "no replacement/retry API is attempted");
  assert.equal(f.toasts.length, 0, "conflict is not reported as a successful new recording");
});

test("repair/review/ambiguous conflicts and bad audio are terminal, never evidence of a playable recording", async t => {
  for (const [code, message] of [["quiz_audio_requires_repair", /verifica/], ["quiz_audio_requires_review", /verifica/],
    ["quiz_audio_upload_conflict", /verifica/], ["invalid_audio_type", /non valida/],
    ["invalid_audio_base64", /non valida/], ["audio_too_large", /3 MB/]]) {
    await t.test(code, async () => {
      const f = fixture(), callbacks = f.open();
      const pending = callbacks.save(recording(), new AbortController().signal);
      const rejection = assert.rejects(pending, error => error.retryable === false && message.test(error.message));
      await until(() => f.saves.length === 1, "save starts"); f.saves[0].reject(new Error(code)); await rejection;
      assert.equal(f.cache(0), undefined); assert.equal(f.controls[0].surface.dataset.audioState, undefined);
      assert.equal(f.controls[0].trigger.hidden, false); assert.equal(callbacks.returnFocus(), f.controls[0].trigger);
      assert.equal(f.requests.length, 0); assert.equal(f.saves.length, 1); assert.equal(f.toasts.length, 0);
    });
  }
});

test("transport/service failures permit an explicit retry of identical bytes with no automatic retry", async t => {
  for (const error of [new TypeError("Failed to fetch"), new Error("service_unavailable"), new DOMException("Timed out", "TimeoutError")]) {
    await t.test(error.message, async () => {
      const f = fixture(), callbacks = f.open(), controller = new AbortController(), audio = recording();
      const pending = callbacks.save(audio, controller.signal);
      const rejection = assert.rejects(pending, error => error.retryable === true && /riprova con Salva/.test(error.message));
      await until(() => f.saves.length === 1, "save starts"); f.saves[0].reject(error); await rejection;
      assert.equal(f.saves.length, 1); assert.equal(f.toasts.length, 0); assert.equal(f.cache(0), undefined);
      const retry = callbacks.save(audio, controller.signal);
      await until(() => f.saves.length === 2, "explicit retry starts");
      assert.deepEqual({ ...f.saves[1].payload }, { ...f.saves[0].payload });
      f.saves[1].resolve({ ok: true, idempotent: true }); await retry; callbacks.onSaved();
      assert.equal(f.saves.length, 2); assert.equal(f.cache(0), true); assert.equal(f.toasts.length, 1);
    });
  }
});

test("late conflict/error after cancellation or identity/capability/navigation change cannot paint or change retry policy", async t => {
  for (const change of ["abort", "identity", "capability", "navigation", "detached"]) await t.test(change, async () => {
    const f = fixture(), callbacks = f.open(), controller = new AbortController();
    const pending = callbacks.save(recording(), controller.signal), original = new Error("quiz_audio_already_exists");
    const rejection = assert.rejects(pending, error => error === original);
    await until(() => f.saves.length === 1, "save starts");
    if (change === "abort") controller.abort();
    if (change === "identity") f.setIdentity("other-account");
    if (change === "capability") f.setCapability(false);
    if (change === "navigation") f.navigate();
    if (change === "detached") f.controls[0].trigger.remove();
    f.saves[0].reject(original); await rejection;
    assert.equal(f.cache(0), undefined); assert.equal(f.controls[0].surface.dataset.audioState, undefined);
    assert.equal(f.toasts.length, 0); assert.equal(f.controls[0].play.focusCalls, 0);
    assert.equal(f.saves.length, 1);
  });
});
