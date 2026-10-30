import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../quiz.js", import.meta.url), "utf8");
// Like quiz-safari-audio-play: execute complete top-level functions, with only
// their browser dependencies replaced. Regex is extraction, not an assertion.
function functionSource(name) {
  const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, "m"));
  assert.ok(match, `Missing function ${name}`);
  return match[0];
}
const plain = value => JSON.parse(JSON.stringify(value));
const noop = () => {};
const revision = "a".repeat(64);
function rows(sheet = 25) {
  return Array.from({ length: 30 }, (_, i) => ({
    id: `qb_s${String(sheet).padStart(2, "0")}_q${String(i + 1).padStart(2, "0")}`,
    question: `Fixture ${i + 1}`, figure: i === 6 ? "546" : "", figureRotation: i === 6 ? 90 : 0
  }));
}

function fixture(path = "/quiz?source=quizbank&scheda=25") {
  const url = new URL(path, "https://practice.invalid"), calls = [], events = [], reviews = [], results = [], errors = [], dialogs = [];
  const context = vm.createContext({ URLSearchParams, URL, console: { log: noop, warn: noop, error: (...args) => errors.push(args) },
    window: { location: { pathname: url.pathname, search: url.search, href: url.href }, MagicBookLearningSync: {
      generateEventId: () => "session-fixture", enqueueAnswer: async value => events.push(plain(value)),
      saveLocalReview: value => reviews.push(plain(value)) } },
    document: { visibilityState: "visible", querySelector: () => ({ setAttribute: noop }) },
    sessionStorage: { getItem: () => "" },
    QUIZ_MODE_CONFIG: { default: { title: "Quiz", timerMinutes: 20 }, exam30: {}, exam80: {} },
    quiz: [], answers: [], current: 0, isFinishing: false, quizAccessErrorHandled: false,
    quizMode: "default", quizSessionToken: "", quizSessionTokenExpiresAt: 0,
    quizDurationMinutes: 20, quizbankRevision: "", lastQuizSet: null,
    learningSessionId: "old-session", learningQuestionVisibleAt: 1, learningQuestionWasHidden: false,
    timerInterval: 1, timerExpiryPending: false, isAdmin: false,
    getQuizPhone: () => "39111111111", getQuizDeviceId: () => "practice_device", getQuizSessionToken: () => "trial-token",
    createQuizDrawId: () => "fixture-draw", getElapsedQuizSeconds: () => 12,
    syncNativeQuizSection: noop, saveQuizAccessToken: noop, setQuizTitle: noop,
    showLoading: noop, hideLoading: noop, buildProgressBar: noop, showQuestion: noop,
    startTimer: () => { context.timerStarts++; }, timerStarts: 0,
    clearInterval: noop, schedulePendingTimerExpiry: noop, normalizeQuizResult: value => value,
    async showConfirm(...args) { dialogs.push(args); return false; },
    async showMessage(...args) { dialogs.push(args); },
    async showResult(value) { results.push(plain(value)); return "close"; },
    rifaiScheda: () => { context.restarts++; }, restarts: 0,
    async fetchQuizJson(requestUrl, options = {}) {
      calls.push({ url: requestUrl, options, body: options.body ? JSON.parse(options.body) : null });
      if (options.method === "POST") {
        if (context.submitError) throw new Error(context.submitError);
        return { correct: 29, wrong: 1, totalQuestions: 30, passed: true,
          results: context.quiz.map(q => ({ id: q.id, correct: true, correctAnswer: 1 })) };
      }
      return structuredClone(context.response);
    }
  });
  context.response = { quiz: rows(Number(url.searchParams.get("scheda")) || 25), quizbankRevision: revision,
    canUploadAudio: false, isAdmin: false, timerMinutes: 20, quizSessionToken: "qb-token", quizSessionTokenExpiresAt: 123456 };
  // Execute the real route constants rather than duplicate source detection.
  vm.runInContext(source.slice(0, source.indexOf("function syncQuizViewportHeight")), context);
  const api = source.match(/^const QUIZ_API = .*;$/m);
  assert.ok(api); vm.runInContext(api[0], context);
  for (const name of ["getQuizRouteInfo", "getRequestedQuizMode", "getQuizModeConfig", "isExamQuizMode",
    "getQuizLoadErrorMessage", "buildQuizApiUrl", "returnToBook", "getLearningQuizMode",
    "beginLearningQuizSession", "queueLearningAnswer", "allAnswered", "loadQuiz", "finishQuiz"]) {
    vm.runInContext(functionSource(name), context);
  }
  return { context, calls, events, reviews, results, errors, dialogs };
}

test("valid QuizBank routes load only their exact sheet and return to it", async () => {
  for (const sheet of ["01", "25", "50"]) {
    const h = fixture(`/quiz?source=quizbank&scheda=${sheet}&chapters=3&mode=exam80`);
    await h.context.loadQuiz();
    assert.deepEqual(h.errors, []);
    assert.equal(h.calls.length, 1);
    const url = new URL(h.calls[0].url, "https://practice.invalid");
    assert.equal(url.pathname, "/api/quizbank"); assert.equal(url.searchParams.get("action"), "getQuiz");
    assert.equal(url.searchParams.get("chapters"), String(Number(sheet)));
    assert.equal(url.searchParams.has("mode"), false);
    assert.equal(h.context.quiz.length, 30); assert.equal(h.context.quizbankRevision, revision);
    assert.equal(h.context.timerStarts, 1);
    h.context.returnToBook(); assert.equal(h.context.window.location.href, `/quizbank?scheda=${Number(sheet)}`);
  }
});

test("invalid QuizBank sheet routes cannot fall back to MagicBook or request any quiz", async () => {
  for (const suffix of ["", "&scheda=", "&scheda=0", "&scheda=51", "&scheda=-1", "&scheda=1.5", "&scheda=1,2", "&scheda=abc"]) {
    const h = fixture(`/quiz?source=quizbank${suffix}&chapters=1`);
    await h.context.loadQuiz();
    assert.equal(h.calls.length, 0); assert.equal(h.context.timerStarts, 0);
    assert.equal(h.context.quiz.length, 0); assert.equal(h.dialogs.length, 1);
    assert.equal(h.context.window.location.href, "/quizbank");
  }
});

test("client rejects incomplete, foreign, reordered or revision-less quiz responses", async () => {
  for (const mutate of [r => r.quiz.pop(), r => r.quiz.reverse(), r => r.quiz[0].id = "qb_s01_q01",
    r => r.quiz[1] = r.quiz[0], r => delete r.quizbankRevision]) {
    const h = fixture(); mutate(h.context.response); await h.context.loadQuiz();
    assert.equal(h.calls.length, 1); assert.equal(h.context.timerStarts, 0);
    assert.equal(h.context.quiz.length, 0); assert.equal(h.dialogs.length, 1);
  }
});

test("QuizBank submits the loaded sheet/revision/order without learning events or local reviews", async () => {
  const h = fixture(); await h.context.loadQuiz();
  assert.deepEqual(h.errors, []); assert.equal(h.context.learningSessionId, "");
  // Even a stale learning session cannot enable QuizBank enqueueing.
  h.context.learningSessionId = "stale-session"; h.context.queueLearningAnswer(1);
  h.context.answers = h.context.quiz.map((q, i) => ({ id: "untrusted-answer-id", answer: i === 29 ? null : i % 2 }));
  await h.context.finishQuiz(true);
  assert.deepEqual(h.errors, []); assert.deepEqual(h.events, []); assert.deepEqual(h.reviews, []);
  assert.equal(h.calls.length, 2);
  const submit = h.calls[1]; assert.equal(submit.url, "/api/quizbank?action=checkQuiz");
  assert.equal(submit.options.method, "POST"); assert.equal(submit.body.action, "checkQuiz");
  assert.equal(submit.body.chapters, "25"); assert.equal(submit.body.quizbankRevision, revision);
  assert.deepEqual(submit.body.answers, rows().map((q, i) => ({ id: q.id, answer: i === 29 ? null : i % 2 })));
  assert.equal(h.results.length, 1); assert.equal(h.results[0]._nonRisposte, 1);
  assert.equal(h.context.window.location.href, "/quizbank?scheda=25");
});

test("revision conflict preserves answers and produces no result or persistence", async () => {
  const h = fixture(); await h.context.loadQuiz();
  h.context.answers[0].answer = 1; const original = plain(h.context.answers);
  h.context.submitError = "quizbank_revision_changed";
  await h.context.finishQuiz(true);
  assert.equal(h.calls.length, 2); assert.deepEqual(plain(h.context.answers), original);
  assert.equal(h.dialogs.length, 1); assert.equal(h.results.length, 0);
  assert.equal(h.context.restarts, 0); assert.equal(h.context.isFinishing, false);
  assert.deepEqual(h.reviews, []); assert.deepEqual(h.events, []);
});

test("MagicBook route, learning enqueue and graded local review remain active", async () => {
  const h = fixture("/quiz/capitolo-3");
  h.context.response.quiz = [{ id: "cap3_q1", question: "MagicBook fixture", figure: "" }];
  await h.context.loadQuiz(); assert.deepEqual(h.errors, []);
  const url = new URL(h.calls[0].url, "https://practice.invalid");
  assert.equal(url.pathname, "/api/quiz"); assert.equal(url.searchParams.get("chapters"), "3");
  assert.equal(h.context.learningSessionId, "session-fixture");
  h.context.answers[0].answer = 1; h.context.queueLearningAnswer(1);
  await h.context.finishQuiz(true); assert.deepEqual(h.errors, []);
  assert.equal(h.events.length, 1); assert.equal(h.events[0].quiz_id, "cap3_q1");
  assert.equal(h.events[0].mode, "chapter_quiz"); assert.equal(h.reviews.length, 1);
  assert.equal(h.reviews[0].items[0].quizId, "cap3_q1");
  assert.equal(h.calls[1].url, "/api/quiz?action=checkQuiz");
  assert.equal(Object.hasOwn(h.calls[1].body, "quizbankRevision"), false);
  assert.equal(h.context.window.location.href, "/magic-book");
});

function element() {
  const classes = new Set(["hidden"]);
  return { dataset: {}, setAttribute: noop, focus: noop,
    classList: { add: x => classes.add(x), contains: x => classes.has(x),
      toggle: (x, on = !classes.has(x)) => on ? classes.add(x) : classes.delete(x) } };
}
function audioFixture(quizbank = true) {
  const calls = [], opened = [], configs = [], question = rows()[0];
  class Reader {
    readAsDataURL(blob) { blob.arrayBuffer().then(bytes => {
      this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`;
      if (!this.aborted) this.onload?.();
    }); }
    abort() { this.aborted = true; }
  }
  const context = vm.createContext({ Blob, FileReader: Reader, DOMException,
    QUIZBANK_MODE: quizbank, TRIAL_MODE: false, QUIZ_API: quizbank ? "/api/quizbank" : "/api/quiz",
    quiz: [question], current: 0, isAdmin: true, inlineAudioQuestion: question, inlineAudioRecorder: null,
    quizAudioRecorder: element(), quizAudioAdminTools: element(), quizAudioAdd: element(),
    quizAudioAddPlus: element(), quizAudioAddEditIcon: element(), quizAudioEditMenu: element(),
    sharedAudioRequestId: 1, sharedAudio: { pause: noop }, audioFocus: { cancelAll: noop },
    setSharedAudioVisibility: noop, setSharedAudioVisualState: noop,
    QuizAudioIdentity: { normalizeFigure: x => x, VERSION: 2 },
    getQuizAccessToken: () => "fixture-token", getQuizPhone: () => "fixture-phone", getQuizDeviceId: () => "fixture-device",
    window: { MagicQuizAudioRecorder: { create(options) { configs.push(options); return { open: args => opened.push(args) }; } } },
    async fetch(url, options) {
      calls.push({ url, ...options, payload: options.method === "POST" ? JSON.parse(options.body) : null });
      return { ok: true, json: async () => ({ ok: true, uploadUrl: "/fixture-upload", uploadContentType: "audio/mp4" }) };
    }
  });
  context.fetchQuizBankResource = context.fetch;
  for (const name of ["updateQuizAudioAdminTool", "applySharedAudioAvailability", "openInlineAudioRecorder",
    "blobAsAudioDataUrl", "quizAudioAdminApi", "saveInlineAudioRecording"]) vm.runInContext(functionSource(name), context);
  return { context, calls, opened, configs, question,
    payload: { blob: new Blob(["audio"], { type: "audio/mp4" }), mimeType: "audio/mp4", durationMs: 1234 } };
}

test("QuizBank recording opens only for confirmed missing audio and an admin", () => {
  const h = audioFixture();
  for (const data of [{ available: true }, {}, { available: false, temporaryUnavailable: true }]) {
    h.context.applySharedAudioAvailability(data, h.question, 1); h.context.openInlineAudioRecorder();
    assert.equal(h.opened.length, 0); assert.equal(h.context.quizAudioAdminTools.classList.contains("hidden"), true);
  }
  h.context.isAdmin = false;
  h.context.applySharedAudioAvailability({ available: false }, h.question, 1); h.context.openInlineAudioRecorder();
  assert.equal(h.opened.length, 0);
  h.context.isAdmin = true;
  h.context.applySharedAudioAvailability({ available: false }, h.question, 0); h.context.openInlineAudioRecorder();
  assert.equal(h.opened.length, 0, "stale availability cannot unlock the recorder");
  h.context.applySharedAudioAvailability({ available: false }, h.question, 1); h.context.openInlineAudioRecorder();
  assert.equal(h.opened.length, 1); assert.equal(h.configs[0].maxBytes, 3 * 1024 * 1024);
  assert.equal(h.calls.length, 0, "opening does not upload");
});

test("QuizBank saves directly once with original MIME/duration and blocks MagicBook mutations", async () => {
  const h = audioFixture(), controller = new AbortController();
  await h.context.saveInlineAudioRecording(h.payload, controller.signal);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].url, "/api/quizbank");
  assert.equal(h.calls[0].payload.action, "saveQuizAudio"); assert.equal(h.calls[0].payload.questionId, h.question.id);
  assert.equal(h.calls[0].payload.audioMimeType, "audio/mp4"); assert.equal(h.calls[0].payload.audioDurationMs, 1234);
  assert.equal(h.calls[0].payload.audioBase64, "data:audio/mp4;base64,YXVkaW8=");
  assert.strictEqual(h.calls[0].signal, controller.signal);
  for (const action of ["createQuizAudioUpload", "confirmQuizAudioUpload", "deleteQuizAudio"]) {
    await assert.rejects(h.context.quizAudioAdminApi(action, h.question), /quizbank_audio_action_unavailable/);
  }
  assert.equal(h.calls.length, 1);
});

test("QuizBank oversized, cancelled and stale recordings never upload", async () => {
  for (const reason of ["size", "cancelled", "stale"]) {
    const h = audioFixture(), controller = new AbortController();
    if (reason === "size") h.payload.blob = new Blob([new Uint8Array(3 * 1024 * 1024 + 1)]);
    if (reason === "cancelled") controller.abort();
    if (reason === "stale") h.context.quiz = [{ ...h.question }];
    await assert.rejects(h.context.saveInlineAudioRecording(h.payload, controller.signal));
    assert.equal(h.calls.length, 0);
  }
});

test("MagicBook retains create/PUT/confirm recording and existing-audio edit entry", async () => {
  const h = audioFixture(false), controller = new AbortController();
  h.context.updateQuizAudioAdminTool(true); h.context.openInlineAudioRecorder();
  assert.equal(h.opened.length, 1);
  await h.context.saveInlineAudioRecording(h.payload, controller.signal);
  assert.deepEqual(h.calls.map(call => call.payload?.action || call.method), ["createQuizAudioUpload", "PUT", "confirmQuizAudioUpload"]);
  assert.equal(h.calls[0].url, "/api/quiz"); assert.equal(h.calls[1].headers["Content-Type"], "audio/mp4");
  assert.equal(h.calls[2].payload.audioDurationMs, 1234);
});

function resourceFixture(quizbank = true) {
  const calls = [], saved = [], denied = [], timers = new Map(); let nextTimer = 0;
  const context = vm.createContext({ QUIZBANK_MODE: quizbank, AbortController, DOMException, Response,
    quizbankRequests: new Set(), quizBankIdentityMatches: () => true,
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    saveQuizAccessToken: (...args) => saved.push(args), handleQuizAccessError: async code => denied.push(code),
    fetch: async (url, options) => { calls.push({ url, options }); return context.response; }
  });
  context.response = new Response("audio bytes", { headers: { "Content-Type": "audio/mp4",
    "X-Access-Token": "renewed-fixture", "X-Access-Token-Expires": "123456" } });
  vm.runInContext(functionSource("fetchQuizBankResource"), context);
  return { context, calls, saved, denied, timers };
}

test("QuizBank resource transport buffers media, captures renewed credentials and cleans deadlines", async () => {
  for (const method of ["GET", "POST"]) {
    const h = resourceFixture(), controller = new AbortController();
    const pending = h.context.fetchQuizBankResource("/api/quizbank", { method, signal: controller.signal });
    assert.equal(h.context.quizbankRequests.size, 1);
    assert.equal([...h.timers.values()][0].delay, method === "POST" ? 30000 : 15000);
    const response = await pending;
    assert.equal(await response.text(), "audio bytes"); assert.equal(response.headers.get("Content-Type"), "audio/mp4");
    assert.deepEqual(h.saved, [["renewed-fixture", 123456]]);
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].options.cache, "no-store");
    assert.equal(h.timers.size, 0); assert.equal(h.context.quizbankRequests.size, 0);
    controller.abort(); assert.equal(h.calls[0].options.signal.aborted, false, "completed request detaches parent listener");
  }
});

test("QuizBank cancellation/deadline covers body reading and auth denials never retry", async () => {
  for (const reason of ["parent", "deadline"]) {
    const h = resourceFixture(), parent = new AbortController(); let release;
    h.context.response = { status: 200, headers: {}, arrayBuffer: () => new Promise(resolve => { release = resolve; }) };
    const pending = h.context.fetchQuizBankResource("/api/quizbank", { signal: parent.signal });
    await new Promise(setImmediate);
    if (reason === "parent") parent.abort(); else [...h.timers.values()][0].fn();
    assert.equal(h.calls[0].options.signal.aborted, true);
    release(new ArrayBuffer(0)); await assert.rejects(pending, { name: "AbortError" });
    assert.equal(h.calls.length, 1); assert.equal(h.saved.length, 0);
    assert.equal(h.timers.size, 0); assert.equal(h.context.quizbankRequests.size, 0);
  }
  const h = resourceFixture(); h.context.response = Response.json({ error: "quizbank_access_denied" }, { status: 403 });
  await assert.rejects(h.context.fetchQuizBankResource("/api/quizbank"), /quizbank_access_denied/);
  assert.deepEqual(h.denied, ["quizbank_access_denied"]); assert.equal(h.calls.length, 1);
  assert.equal(h.context.quizbankRequests.size, 0); assert.equal(h.timers.size, 0);
});

test("MagicBook resource transport preserves fetch options/response and adds no deadlines", async () => {
  const h = resourceFixture(false), options = { method: "POST", cache: "default", signal: new AbortController().signal };
  const response = await h.context.fetchQuizBankResource("/api/quiz", options);
  assert.strictEqual(response, h.context.response); assert.strictEqual(h.calls[0].options, options);
  assert.equal(h.calls.length, 1); assert.equal(h.saved.length, 0); assert.equal(h.timers.size, 0);
});

test("QuizBank identity requires the current session to match both phone and device", () => {
  let session = { phone: "fixture-phone", deviceId: "fixture-device" };
  const context = vm.createContext({ getQuizSession: () => session,
    getQuizPhone: () => "fixture-phone", getQuizDeviceId: () => "fixture-device" });
  vm.runInContext(functionSource("quizBankIdentityMatches"), context);
  assert.equal(context.quizBankIdentityMatches(), true);
  for (const value of [null, {}, { phone: "other-phone", deviceId: "fixture-device" },
    { phone: "fixture-phone", deviceId: "other-device" }]) {
    session = value; assert.equal(context.quizBankIdentityMatches(), false);
  }
});

test("identity mismatch makes no request, aborts existing media and clears private quiz state", async () => {
  const h = resourceFixture(), active = new AbortController(), cleanup = [], nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: "private", src: "private",
      removeAttribute(name) { delete this[name]; }, replaceChildren() { this.textContent = ""; } });
    return nodes.get(id);
  };
  Object.assign(h.context, {
    quizBankIdentityMatches: () => false, quizAccessErrorHandled: false,
    TRIAL_MODE: false, HOME_ROUTE: "/quizbank?scheda=25", timerInterval: 123,
    clearInterval: id => cleanup.push(["timer", id]), stopAllAudio: () => cleanup.push("audio"),
    closeInlineAudioRecorder: () => cleanup.push("recorder"), resetSharedAudioPlayer: () => cleanup.push("shared"),
    resetReviewAudioPlayer: () => cleanup.push("review"), hideLoading: noop,
    setQuizTitle: title => { h.context.document.title = title; },
    italianAudioCache: new Map([["private", 1]]), bengaliAudioCache: new Map([["private", 1]]),
    sharedAudioAvailabilityCache: new Map([["private", 1]]), quiz: rows(), answers: [{ answer: 1 }],
    lastQuizSet: rows(), quizbankRevision: revision, document: { getElementById: node },
    modalReviewList: node("review"), window: { location: {}, dispatchEvent: event => cleanup.push(event.type) },
    Event, isQuizRevokedSessionError: () => false, getQuizAccessErrorMessage: code => code,
    showMessage: async (_title, code) => h.denied.push(code)
  });
  h.context.quizbankRequests.add(active);
  vm.runInContext(functionSource("handleQuizAccessError"), h.context);
  await assert.rejects(h.context.fetchQuizBankResource("/api/quizbank"), /unauthorized/);
  assert.equal(h.calls.length, 0); assert.equal(h.saved.length, 0); assert.equal(h.timers.size, 0);
  assert.equal(active.signal.aborted, true); assert.deepEqual(h.denied, ["unauthorized"]);
  assert.deepEqual(cleanup, [["timer", 123], "audio", "recorder", "shared", "review", "magicbook:quiz-help-close"]);
  assert.equal(h.context.quiz.length, 0); assert.equal(h.context.answers.length, 0);
  assert.equal(h.context.lastQuizSet, null); assert.equal(h.context.quizbankRevision, "");
  for (const key of ["italianAudioCache", "bengaliAudioCache", "sharedAudioAvailabilityCache"]) assert.equal(h.context[key].size, 0);
  for (const id of ["question", "quiz-help-question", "progress", "review"]) assert.equal(node(id).textContent, "");
  assert.equal(node("figure").src, undefined); assert.equal(h.context.window.location.href, "/quizbank?scheda=25");
  assert.equal(h.context.document.title, "Accesso riservato | QuizBank");
});

test("identity changed while reading a response discards its body and renewed credentials", async () => {
  const h = resourceFixture(); let release;
  h.context.response = { status: 200, headers: { "X-Access-Token": "previous-account-token" },
    arrayBuffer: () => new Promise(resolve => { release = resolve; }) };
  const pending = h.context.fetchQuizBankResource("/api/quizbank");
  await new Promise(setImmediate);
  h.context.quizBankIdentityMatches = () => false;
  release(new ArrayBuffer(0));
  await assert.rejects(pending, /unauthorized/);
  assert.equal(h.calls.length, 1); assert.deepEqual(h.denied, ["unauthorized"]);
  assert.equal(h.saved.length, 0); assert.equal(h.timers.size, 0); assert.equal(h.context.quizbankRequests.size, 0);
});

function helpFixture(quizbank) {
  const help = readFileSync(new URL("../quiz-help.js", import.meta.url), "utf8");
  const context = vm.createContext({ window: {}, quizIdIndex: null });
  if (quizbank !== undefined) context.QUIZBANK_MODE = quizbank;
  for (const name of ["normalize", "hash", "figureNumber", "fingerprint", "displayForm", "visibleKeywords", "usableBanglaTranslation", "decodeHelp"]) {
    const match = help.match(new RegExp(`^  function ${name}\\([^]*?^  }`, "m"));
    assert.ok(match, `Missing help function ${name}`);
    vm.runInContext(match[0], context);
  }
  return context;
}

test("QuizBank V3 help resolves the unique matching text and figure, never positional ID digits", () => {
  const h = helpFixture(true), seen = [];
  const question = { id: "qb_s25_q07", question: "La figura indica una fermata", figure: "546" };
  const data = { runtime: { quizzes: {
    "25": { question: "Un'altra domanda", figure: "546" },
    q00123: { question: question.question, figure: "546" },
    q00456: { question: question.question, figure: "547" }
  } }, resolver: { resolve(value) {
    seen.push(plain(value)); return { quizId: value.id, words: [], questionBnStandard: "সঠিক অনুবাদ" };
  } } };
  const resolved = h.decodeHelp(question, data);
  assert.equal(resolved.quizId, "q00123"); assert.equal(resolved.questionBnStandard, "সঠিক অনুবাদ");
  assert.deepEqual(seen, [{ ...question, id: "q00123" }]);
  assert.equal(question.id, "qb_s25_q07", "media/grading occurrence ID is not mutated");
  for (const variant of [{ ...question, question: "Testo senza corrispondenza" }, { ...question, figure: "548" }]) {
    assert.equal(h.decodeHelp(variant, data), null);
  }
  data.runtime.quizzes.q00999 = { question: question.question, figure: "546" };
  assert.equal(h.decodeHelp(question, data), null, "ambiguous exact content cannot choose an arbitrary translation");
  assert.equal(seen.length, 1, "unmatched/ambiguous content never reaches the ID-based resolver");
});

test("QuizBank V2 help rejects numeric-ID collisions but accepts its content fingerprint", () => {
  const h = helpFixture(true);
  const question = { id: "qb_s25_q07", question: "Domanda della scheda", figure: "546" };
  const wrong = ["q00025", "wrong-chapter", "wrong-topic", [], "wrong context"];
  const expected = ["q00123", "chapter", "topic", [], "সঠিক প্রসঙ্গ"];
  const data = { quizzes: { unrelatedFingerprint: wrong }, chapters: {}, topics: {}, words: {} };
  assert.equal(h.decodeHelp(question, data), null);
  data.quizzes[h.fingerprint(question)] = expected;
  const resolved = h.decodeHelp(question, data);
  assert.equal(resolved.quizId, "q00123"); assert.equal(resolved.contextBn, "সঠিক প্রসঙ্গ");
  assert.equal(h.decodeHelp({ ...question, figure: "547" }, data), null);
  assert.equal(h.decodeHelp({ ...question, question: "Domanda diversa" }, data), null);
});

test("MagicBook help retains resolver IDs and legacy numeric fallback when the QuizBank global is absent", () => {
  const h = helpFixture(undefined), seen = [];
  const question = { id: "q00025", question: "MagicBook question", figure: "" };
  const result = h.decodeHelp(question, { resolver: { resolve(value) {
    seen.push(value.id); return { quizId: value.id, words: [], questionBnStandard: "অনুবাদ" };
  } } });
  assert.equal(result.quizId, "q00025"); assert.deepEqual(seen, ["q00025"]);
  const legacy = h.decodeHelp({ ...question, id: "25" }, {
    quizzes: { catalogFingerprint: ["q00025", "chapter", "topic", [], "legacy context"] },
    chapters: {}, topics: {}, words: {}
  });
  assert.equal(legacy.quizId, "q00025"); assert.equal(legacy.contextBn, "legacy context");
});
