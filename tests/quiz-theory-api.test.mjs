import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { records, fixtureRequire, loadTheoryModule, readProductFile } from "./quiz-theory-fixture.mjs";

Object.assign(process.env, {
  SESSION_SECRET: "theory-test-only", GAS_ACCESS_URL: "https://access.invalid/", GAS_SECRET: "fixture",
  QUIZ_GAS_URL: "https://tts.invalid/", QUIZ_PROXY_SECRET: "fixture", ADMIN_PHONE_NUMBERS: "",
  QUIZBANK_ACCESS_MODE: "separate", QUIZBANK_R2_ACCOUNT_ID: "fixture",
  QUIZBANK_R2_BUCKET: "theory-fixture", quiz_bank_access_key_id: "fixture", quiz_bank_secret_access_key: "fixture"
});
const { S3Client } = fixtureRequire("@aws-sdk/client-s3");
const { default: magic, serveQuizTheory } = await loadTheoryModule("api/quiz.js");
const { default: quizbank } = await loadTheoryModule("api/quizbank.js");
const { default: trial } = await loadTheoryModule("api/trial.js");
const { default: enabledTrial } = await loadTheoryModule("api/trial.js", { enableTrial: true });
const localRows = JSON.parse(readProductFile("api/_quiz-bank.json")).quiz;
const row = localRows.find(item => item.question === records[0].question_it);
assert.ok(row);
const phone = "1234567890", deviceId = "theory_fixture_device", trialId = "trial_fixture_device_12345";
function token(purpose = "quiz", claims = {}) {
  const payload = Buffer.from(JSON.stringify({ phone, deviceId, purpose, role: "user", exp: Date.now() + 60000, ...claims })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}`;
}
const body = (action = "getQuizTheory", extra = {}) => ({ action, phone, deviceId, questionId: String(row.id),
  question: row.question, figure: String(row.figure ?? ""), ...extra });
async function call(handler, data, { session = token(), access = token("access"), method = "POST", aborted = false } = {}) {
  const req = { method, aborted, headers: { "x-quiz-session": session, authorization: `Bearer ${access}` },
    [method === "GET" ? "query" : "body"]: data };
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await handler(req, res); return res;
}
function fixture(t, { grant = 1, mutate } = {}) {
  const state = { gas: [], archive: 0 };
  process.env.QUIZBANK_R2_KEY = crypto.randomUUID();
  t.mock.method(globalThis, "fetch", async url => {
    const parsed = new URL(url); state.gas.push(parsed);
    if (parsed.hostname === "access.invalid") return Response.json({ success: true, Quiz_bank: grant });
    assert.equal(parsed.hostname, "tts.invalid", "all network is mocked");
    return Response.json({ audio: Buffer.from("ID3fixture-audio").toString("base64") });
  });
  t.mock.method(S3Client.prototype, "send", async () => {
    state.archive++;
    const archive = Array.from({ length: 1500 }, (_, i) => ({
      id: `qb_s${String(Math.floor(i / 30) + 1).padStart(2, "0")}_q${String(i % 30 + 1).padStart(2, "0")}`,
      scheda: Math.floor(i / 30) + 1, numero_domanda: i % 30 + 1,
      domanda: i === 0 ? row.question : `Offline fixture ${i}`, risposta: i === 0 && !Boolean(row.correct) ? "F" : "V",
      risposta_corretta: i === 0 ? Boolean(row.correct) : true, ha_figura: false, numero_figura: null
    }));
    mutate?.(archive);
    return { Body: Readable.from([Buffer.from(JSON.stringify(archive))]) };
  });
  state.access = token("access", { nonce: crypto.randomUUID() });
  return state;
}
test("Magic requires quiz-purpose proof bound to phone/device before theory or TTS", async t => {
  const f = fixture(t);
  for (const session of ["", "forged", token("access"), token("quizbank"), token("trial"),
    token("quiz", { exp: Date.now() - 1 }), token("quiz", { deviceId: "other_device" })]) {
    for (const action of ["getQuizTheory", "getQuizTheoryAudio"]) {
      assert.equal((await call(magic, body(action, { language: "bn" }), { session })).statusCode, 401);
    }
  }
  assert.equal(f.gas.length, 0); assert.equal(f.archive, 0);
});
test("one Magic text request returns one sanitized theory, never caller correctness", async t => {
  const f = fixture(t);
  const result = await call(magic, body("getQuizTheory", { correct: !row.correct, correct_answer: !row.correct, text: "caller text" }));
  assert.equal(result.statusCode, 200);
  assert.deepEqual(Object.keys(result.body), ["theory"]);
  assert.deepEqual(Object.keys(result.body.theory).sort(), ["correct_answer", "explanation", "focus_it", "id"]);
  assert.equal(result.body.theory.correct_answer, Boolean(row.correct));
  assert.equal(result.body.theory.explanation.bn, records[0].explanation.bn);
  for (const key of ["Cache-Control", "CDN-Cache-Control", "Vercel-CDN-Cache-Control"]) assert.match(result.headers[key], /no-store/);
  assert.equal(f.gas.length, 0);
});
test("unknown IDs, stale question/figure and malformed shapes cannot select theory", async t => {
  const f = fixture(t);
  for (const [extra, status] of [[{ questionId: "missing" }, 404], [{ question: "different" }, 409],
    [{ figure: "12" }, 409], [{ question: {} }, 400], [{ questionId: [row.id] }, 400]]) {
    assert.equal((await call(magic, body("getQuizTheory", extra))).statusCode, status);
  }
  assert.equal(f.gas.length, 0);
});
test("theory audio reads exact server Italian once and word-chunked Bengali, never caller text", async t => {
  const f = fixture(t);
  for (const language of ["it", "bn"]) {
    f.gas.length = 0;
    const result = await call(magic, body("getQuizTheoryAudio", { language, text: "ATTACKER", correct: !row.correct }));
    assert.equal(result.statusCode, 200); assert.equal(result.body.language, language);
    assert.equal(result.body.clips.length, f.gas.length);
    assert.ok(f.gas.length >= 1 && f.gas.length <= 3);
    assert.equal(f.gas.map(url => url.searchParams.get("text")).join(" "), records[0].explanation[language].trim().replace(/\s+/g, " "));
    for (const url of f.gas) {
      assert.equal(url.searchParams.get("action"), language === "bn" ? "getTTS" : "getItalianAudio");
      if (language === "bn") assert.ok(url.searchParams.get("text").length <= 180);
    }
    if (language === "it") assert.equal(f.gas.length, 1);
  }
});
test("invalid languages and aborted requests spend zero TTS requests", async t => {
  const f = fixture(t);
  for (const language of [undefined, "en", "bn-IT", {}, ["bn"]]) {
    assert.equal((await call(magic, body("getQuizTheoryAudio", { language }))).statusCode, 400);
  }
  assert.equal((await call(magic, body("getQuizTheoryAudio", { language: "bn" }), { aborted: true })).statusCode, 499);
  assert.equal(f.gas.length, 0);
});
test("closing a fully-read POST response stops remaining speech chunks and detaches listeners", async t => {
  const record = records.find(item => item.explanation.bn.length > 180);
  const canonical = localRows.find(item => item.question === record.question_it);
  assert.ok(canonical);
  const req = new EventEmitter(), res = new EventEmitter();
  let requests = 0;
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(new URL(url).hostname, "tts.invalid"); requests++;
    res.emit("close"); // req.aborted remains unset after the POST body was read.
    return Response.json({ audio: Buffer.from("ID3fixture-audio").toString("base64") });
  });
  await assert.rejects(serveQuizTheory(body("getQuizTheoryAudio", {
    questionId: canonical.id, question: canonical.question, figure: "", language: "bn"
  }), canonical, req, res), error => error.statusCode === 499);
  assert.equal(requests, 1);
  assert.equal(req.listenerCount("aborted"), 0); assert.equal(res.listenerCount("close"), 0);
});
test("failed or malformed upstream audio does not become successful content or retry", async t => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(new URL(url).hostname, "tts.invalid"); requests++;
    return Response.json({ error: "provider_unavailable", audio: "<html>not audio</html>" });
  });
  assert.equal((await call(magic, body("getQuizTheoryAudio", { language: "bn" }))).statusCode, 503);
  assert.equal(requests, 1);
});
test("initial Magic and QuizBank practice responses do not acquire theory or answers", async t => {
  const f = fixture(t);
  for (const [handler, params] of [[magic, { action: "getQuiz", phone, deviceId, chapters: "1" }],
    [quizbank, { action: "getQuiz", phone, deviceId, chapters: "1" }]]) {
    const result = await call(handler, params, { access: f.access, method: "GET" });
    assert.equal(result.statusCode, 200);
    for (const item of result.body.quiz) for (const key of ["correct", "correct_answer", "theory", "explanation", "theory_id"]) {
      assert.equal(Object.hasOwn(item, key), false, key);
    }
  }
});
test("QuizBank denial happens before archive/TTS even with forged role/client flags", async t => {
  const f = fixture(t, { grant: 0 });
  const result = await call(quizbank, body("getQuizTheory", { questionId: "qb_s01_q01", Quiz_bank: 1, role: "admin" }), { access: f.access });
  assert.equal(result.statusCode, 403); assert.equal(f.archive, 0);
  assert.equal(f.gas.filter(url => url.hostname === "tts.invalid").length, 0);
});
test("QuizBank requires current row HMAC for text and audio, including after archive replacement", async t => {
  const f = fixture(t);
  const sheet = await call(quizbank, { action: "getStudyQuiz", phone, deviceId, chapters: "1" }, { access: f.access, method: "GET" });
  assert.equal(sheet.statusCode, 200);
  const q = sheet.body.quiz[0];
  for (const action of ["getQuizTheory", "getQuizTheoryAudio"]) {
    const data = body(action, { questionId: q.id, language: "bn" });
    for (const audioIdentityToken of ["", "qbct1_" + "0".repeat(64), sheet.body.quiz[1].audioIdentityToken]) {
      assert.equal((await call(quizbank, { ...data, audioIdentityToken }, { access: f.access })).statusCode, 409);
    }
    assert.equal((await call(quizbank, { ...data, audioIdentityToken: q.audioIdentityToken }, { access: f.access })).statusCode, 200);
  }
  const changed = fixture(t, { mutate: rows => { rows[0].domanda += " changed"; } });
  assert.equal((await call(quizbank, body("getQuizTheory", { questionId: q.id, audioIdentityToken: q.audioIdentityToken }), { access: changed.access })).statusCode, 409);
});
test("disabled trial stays410; dormant text is issued-ID scoped and audio remains Premium", async t => {
  const f = fixture(t);
  const trialToken = token("trial", { trialId, chapter: "1", ids: [row.id], audioIds: [row.id], textHashes: [] });
  const data = body("getQuizTheory", { trialId, trialToken });
  assert.equal((await call(trial, data)).statusCode, 410);
  assert.equal((await call(enabledTrial, data)).statusCode, 200);
  assert.equal((await call(enabledTrial, { ...data, questionId: "cap1_q2" })).statusCode, 403);
  assert.equal((await call(enabledTrial, { ...data, trialToken: token("quiz") })).statusCode, 401);
  assert.equal((await call(enabledTrial, { ...data, trialToken: token("trial", { trialId, chapter: "2", ids: [row.id] }) })).statusCode, 403);
  assert.equal((await call(enabledTrial, { ...data, action: "getQuizTheoryAudio", language: "bn" })).statusCode, 403);
  assert.equal(f.gas.length, 0); assert.equal(f.archive, 0);
});
test("private JSON has literal and clean-route guards; SW caches only public theory assets", () => {
  const config = JSON.parse(readProductFile("vercel.json"));
  for (const route of ["/api/_quiz-theory.json", "/api/_quiz-theory"]) {
    assert.equal(config.rewrites.find(rule => rule.source === route)?.destination, "/api/quiz?action=privateQuizTheory");
  }
  const worker = readProductFile("service-worker.js");
  assert.doesNotMatch(worker, /_quiz-theory\.json/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)\) return/);
  for (const file of ["quiz.html", "study-quiz.html", "quizbank.html"]) {
    const html = readProductFile(file);
    assert.ok(html.indexOf("quiz-theory-index.js") < html.indexOf("quiz-theory.js"));
    assert.ok(html.indexOf("app-popup.js") < html.indexOf("quiz-theory.js"));
  }
});
