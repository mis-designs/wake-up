import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const sources = Object.fromEntries(["quiz", "study-quiz"].map(name =>
  [name, readFileSync(new URL(`../${name}.js`, import.meta.url), "utf8")]));
const code = "quizbank_content_changed_refresh_required";
const noop = () => {};
function install(context, owner, names) {
  const source = owner === "study-quiz" ? sources[owner].replace(/^  /gm, "") : sources[owner];
  for (const name of names) {
    const fn = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, "m"));
    assert.ok(fn, name); vm.runInContext(fn[0], context);
  }
}
const row = (token = "content-A") => ({ id: "qb_s01_q01", question: "Synthetic question", figure: "546", sourceRevision: "a".repeat(64), audioIdentityToken: token });

test("practice forwards the displayed row token for status, blob, playback and upload", async () => {
  const calls = [];
  const context = vm.createContext({ QUIZBANK_MODE: true, QUIZ_API: "/api/quizbank", Blob,
    QuizAudioIdentity: { normalizeFigure: value => value, VERSION: 2 },
    getQuizPhone: () => "fixture", getQuizDeviceId: () => "fixture", getQuizAccessToken: () => "fixture",
    fetchQuizBankResource: async (url, options) => {
      const payload = JSON.parse(options.body); calls.push({ url, payload });
      return payload.action === "getQuizAudioBlob" ? new Response("audio", { headers: { "Content-Type": "audio/wav" } }) : Response.json({ available: true });
    }
  });
  install(context, "quiz", ["requestSharedAudio", "requestSharedAudioBlob", "quizAudioAdminApi"]);
  await context.requestSharedAudio("getQuizAudioStatus", row());
  await context.requestSharedAudio("getQuizAudioPlayback", row());
  await context.requestSharedAudioBlob(row());
  await context.quizAudioAdminApi("saveQuizAudio", row(), { audioBase64: "fixture" });
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ url, payload }) => url === "/api/quizbank" && payload.audioIdentityToken === "content-A"));
});

test("practice rejects a refresh conflict once per notice without clearing answers or retrying", async () => {
  const calls = [], notices = [], answers = [{ id: row().id, answer: 1 }];
  const context = vm.createContext({ QUIZBANK_MODE: true, AbortController, Response, DOMException,
    quizbankRequests: new Set(), quizbankContentNoticeShown: false, quizBankIdentityMatches: () => true,
    setTimeout: () => 1, clearTimeout: noop, saveQuizAccessToken: noop, answers,
    showMessage: (...args) => notices.push(args), handleQuizAccessError: () => assert.fail("not an auth error"),
    fetch: async (...args) => { calls.push(args); return Response.json({ error: code }, { status: 409 }); }
  });
  install(context, "quiz", ["fetchQuizBankResource"]);
  for (let i = 0; i < 2; i++) await assert.rejects(context.fetchQuizBankResource("/api/quizbank"),
    error => error.message === code && error.retryable === false);
  assert.equal(calls.length, 2); assert.equal(notices.length, 1);
  assert.match(notices[0][1], /Ricarica/); assert.deepEqual(context.answers, answers);
  assert.equal(context.quizbankRequests.size, 0);
});

test("practice IT/BN/translated TTS forward tokens and cannot reuse audio across content generations", async () => {
  const calls = [];
  const context = vm.createContext({ QUIZBANK_MODE: true, AbortController, setTimeout: () => 1, clearTimeout: noop,
    italianAudioCache: new Map(), bengaliAudioCache: new Map(), italianTtsRequest: null, bengaliTtsRequest: null,
    cancelQuizTtsRequest: noop, window: {},
    buildQuizApiUrl: (action, args) => `/api/quizbank?${new URLSearchParams({ action, ...args })}`,
    fetchQuizJson: async url => { calls.push(new URL(url, "https://fixture.invalid")); return { audio: "fixture", translation: "পরীক্ষা" }; }
  });
  install(context, "quiz", ["fetchItalianAudio", "fetchBengaliAudio"]);
  await context.fetchItalianAudio("Synthetic", "same-id-it", row().id, "content-A");
  await context.fetchItalianAudio("Synthetic", "same-id-it", row().id, "content-A");
  await context.fetchItalianAudio("Synthetic", "same-id-it", row().id, "content-B");
  await context.fetchBengaliAudio(row(), "same-id-bn");
  await context.fetchBengaliAudio(row(), "same-id-bn");
  await context.fetchBengaliAudio(row("content-B"), "same-id-bn");
  await context.fetchBengaliAudio({ ...row("content-C"), question_bd: "পরীক্ষা" }, "same-id-bn");
  assert.deepEqual(calls.map(url => url.searchParams.get("action")),
    ["getItalianAudio", "getItalianAudio", "getBengaliAudio", "getBengaliAudio", "getTTS"]);
  assert.deepEqual(calls.map(url => url.searchParams.get("audioIdentityToken")),
    ["content-A", "content-B", "content-A", "content-B", "content-C"]);
});

test("practice result-review preserves the original token in both audio and translation projections", () => {
  const name = Object.keys(sources).find(name => name === "quiz");
  // Locate the review normalizer by its actual declaration, not a duplicate implementation.
  const prefix = sources[name].slice(0, sources[name].indexOf('    // Match question by ID (authoritative)'));
  const fnName = [...prefix.matchAll(/^function (\w+)\(/gm)].at(-1)[1];
  const context = vm.createContext({ QUIZBANK_MODE: true, quiz: [row()], answers: [{ answer: 1 }],
    normalizeAnswerValue: value => value, getQuestionCorrectAnswer: () => 1 });
  install(context, "quiz", [fnName, "buildAnswerReview"]);
  const items = context[fnName]({ results: [{ id: row().id, correct: true, correctAnswer: 1 }] });
  assert.equal(items[0].audioIdentityToken, "content-A");
  assert.equal(items[0].helpQuestion.audioIdentityToken, "content-A");
  for (const item of [items[0], context.buildAnswerReview({})[0]]) {
    assert.equal(item.sourceRevision, row().sourceRevision);
    assert.equal(item.helpQuestion.sourceRevision, row().sourceRevision);
  }
});

function studyFixture() {
  const calls = [], notices = [];
  const context = vm.createContext({ QUIZBANK_MODE: true, TRIAL_MODE: false, API: "/api/quizbank", Response,
    quizBankContentNoticeShown: false, session: { phone: "fixture", deviceId: "fixture" },
    window: {}, studyVideoIdentity: () => "fixture", showQuizBankError: () => assert.fail("not an auth failure"),
    createTimedAudioRequest: signal => ({ signal, cleanup: noop }), authHeaders: () => ({}),
    saveAccessToken: noop, showToast: message => notices.push(message),
    readApiResponse: response => response.json(),
    fetch: async (url, options) => {
      calls.push({ url, payload: JSON.parse(options.body) });
      return context.stale ? Response.json({ error: code }, { status: 409 }) : Response.json({ available: true });
    }
  });
  install(context, "study-quiz", ["reportQuizBankContentChanged", "audioApi", "fetchExplanationBlob", "audioStatusKey"]);
  return { context, calls, notices };
}
test("Study forwards row tokens and stale blob requests never try signed playback fallback", async () => {
  const h = studyFixture();
  for (const action of ["getQuizAudioStatus", "getQuizAudioPlayback", "saveQuizAudio"]) await h.context.audioApi(action, row());
  assert.ok(h.calls.every(call => call.payload.audioIdentityToken === "content-A"));
  h.context.stale = true;
  const before = h.calls.length;
  await assert.rejects(h.context.fetchExplanationBlob(row()), error => error.message === code && error.retryable === false);
  assert.equal(h.calls.length - before, 1);
  assert.equal(h.calls.at(-1).payload.action, "getQuizAudioBlob");
  assert.equal(h.notices.length, 1); assert.match(h.notices[0], /Ricarica/);
  assert.notEqual(h.context.audioStatusKey(row()), h.context.audioStatusKey(row("content-B")));
});

test("Study automatic translations forward tokens and isolate their cache by content", async () => {
  const calls = [];
  const context = vm.createContext({ QUIZBANK_MODE: true, TRIAL_MODE: false, API: "/api/quizbank", URLSearchParams,
    session: { phone: "fixture", deviceId: "fixture" }, ttsCache: new Map(), authHeaders: () => ({}),
    usableBanglaTranslation: value => value, fingerprint: () => assert.fail("row has id"),
    fetchStudyJson: async url => { calls.push(new URL(url, "https://fixture.invalid")); return { audio: "fixture", translation: "পরীক্ষা" }; }
  });
  install(context, "study-quiz", ["audioStatusKey", "loadAutomaticTranslation"]);
  await context.loadAutomaticTranslation(row()); await context.loadAutomaticTranslation(row());
  await context.loadAutomaticTranslation(row("content-B"));
  assert.deepEqual(calls.map(url => url.searchParams.get("audioIdentityToken")), ["content-A", "content-B"]);
});

test("Study question TTS sends its displayed token on Italian and translated Bengali requests", async () => {
  const calls = [];
  const context = vm.createContext({ QUIZBANK_MODE: true, TRIAL_MODE: false, API: "/api/quizbank", URLSearchParams,
    session: { phone: "fixture", deviceId: "fixture" }, ttsCache: new Map(), authHeaders: () => ({}),
    activeTtsPlayback: null, wordTtsRequestId: 0, fingerprint: () => assert.fail("row has id"),
    getQuestionHelp: async () => ({ translation: "পরীক্ষা", translationSource: "catalog" }),
    usableBanglaTranslation: value => value, requestTtsData: (_key, work) => work({ aborted: false }),
    beginStudyTts: key => { const playback = { key }; context.activeTtsPlayback = playback; return { playback, requestId: ++context.wordTtsRequestId }; },
    base64AudioUrl: value => value, startTtsAudio: noop,
    fetchStudyJson: async url => { calls.push(new URL(url, "https://fixture.invalid")); return { audio: "fixture" }; }
  });
  install(context, "study-quiz", ["audioStatusKey", "playTts"]);
  const card = { querySelector: () => null };
  await context.playTts(row(), "it", {}, card); context.activeTtsPlayback = null;
  await context.playTts(row(), "bn", {}, card);
  assert.deepEqual(calls.map(url => url.searchParams.get("action")), ["getItalianAudio", "getTTS"]);
  assert.ok(calls.every(url => url.searchParams.get("audioIdentityToken") === "content-A"));
});
