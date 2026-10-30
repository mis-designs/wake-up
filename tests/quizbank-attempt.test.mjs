import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { S3Client } from "@aws-sdk/client-s3";
import { neonConfig } from "@neondatabase/serverless";
import { parseQuizBank } from "../api/quizbank-catalog.mjs";
import { buildQuizBankAttempt, gradeQuizBankAttempt, normalizeQuizBankSheet, quizBankRevision } from "../lib/quizbank-attempt.mjs";

function archive() {
  return Array.from({ length: 1500 }, (_, i) => {
    const sheet = Math.floor(i / 30) + 1, number = i % 30 + 1, correct = i % 2 === 0;
    const rotated = [25, 26].includes(sheet) && number === 7;
    return { id: `qb_s${String(sheet).padStart(2, "0")}_q${String(number).padStart(2, "0")}`,
      scheda: sheet, numero_domanda: number, domanda: `Attempt fixture ${i + 1}`,
      risposta_corretta: correct, risposta: correct ? "V" : "F",
      ha_figura: rotated, numero_figura: rotated ? 546 : null };
  });
}
const sheetRows = () => parseQuizBank(archive()).sheets[24];
const answersFor = rows => rows.map(row => ({ id: row.id, answer: row.correct === true ? 1 : 0 }));
const rejects = (message, statusCode = 400) => error => error.message === message && error.statusCode === statusCode;

test("attempt projection preserves exact order/content/rotation without leaking or mutating answers", () => {
  const rows = sheetRows();
  rows[0].question_bd = "পরীক্ষা";
  rows.forEach(Object.freeze); Object.freeze(rows);
  const attempt = buildQuizBankAttempt(rows);
  assert.match(attempt.quizbankRevision, /^[a-f0-9]{64}$/);
  assert.equal(attempt.quiz.length, 30);
  rows.forEach((row, index) => {
    const { correct, ...publicRow } = row;
    assert.deepEqual(attempt.quiz[index], publicRow);
    assert.equal(typeof correct, "boolean");
    assert.notStrictEqual(attempt.quiz[index], row);
  });
  assert.equal(attempt.quiz[6].figureRotation, 90);
});

test("revision is deterministic and changes with canonical content, answer or presentation", () => {
  const rows = sheetRows(), original = quizBankRevision(rows);
  assert.equal(quizBankRevision(structuredClone(rows)), original);
  for (const change of [{ question: "Changed text" }, { correct: !rows[0].correct },
    { figure: "123" }, { figureRotation: 90 }, { question_bd: "পরীক্ষা" }]) {
    const changed = structuredClone(rows); Object.assign(changed[0], change);
    assert.notEqual(quizBankRevision(changed), original);
    assert.throws(() => gradeQuizBankAttempt(changed, { quizbankRevision: original, answers: answersFor(rows) }),
      rejects("quizbank_revision_changed", 409));
  }
});

test("grading uses Boolean canonical answers, 27/30 threshold, and explicit review answers", () => {
  const rows = sheetRows(), quizbankRevision = quizBankRevision(rows);
  for (const count of [30, 27, 26, 0]) {
    const answers = answersFor(rows).map((item, index) => ({ ...item, answer: index < count ? item.answer : 1 - item.answer,
      correct: true, correctAnswer: 1 }));
    const result = gradeQuizBankAttempt(rows, { quizbankRevision, answers });
    assert.equal(result.correct, count); assert.equal(result.wrong, 30 - count);
    assert.equal(result.totalQuestions, 30); assert.equal(result.passingScore, 27);
    assert.equal(result.passed, count >= 27); assert.equal(result.scorePercentage, Math.round(count / 30 * 100));
    assert.deepEqual(result.results, rows.map((row, index) => ({ id: row.id, correct: index < count,
      correctAnswer: row.correct === true ? 1 : 0 })));
  }
  const empty = gradeQuizBankAttempt(rows, { quizbankRevision, answers: rows.map(row => ({ id: row.id, answer: null })) });
  assert.equal(empty.correct, 0); assert.equal(empty.wrong, 30); assert.equal(empty.passed, false);
  assert.ok(empty.results.every(item => item.correct === false && [0, 1].includes(item.correctAnswer)));
});

test("grading rejects malformed, missing, duplicate, reordered and foreign submissions", () => {
  const rows = sheetRows(), quizbankRevision = quizBankRevision(rows);
  const bad = [null, {}, [], answersFor(rows).slice(1), [...answersFor(rows), answersFor(rows)[0]], new Array(30)];
  for (const value of [true, false, "0", "1", "", 2, -1, undefined, NaN, {}, []]) {
    const answers = answersFor(rows); answers[0].answer = value; bad.push(answers);
  }
  for (const mutate of [a => a[0] = null, a => delete a[0].answer, a => a[0] = [],
    a => a[0].id = "qb_s01_q01", a => a[0].id = "cap1_q1", a => a[0].id = 1,
    a => a[1] = a[0], a => a.reverse()]) {
    const answers = answersFor(rows); mutate(answers); bad.push(answers);
  }
  for (const answers of bad) assert.throws(() => gradeQuizBankAttempt(rows, { quizbankRevision, answers }),
    rejects("quizbank_invalid_answers"));
  for (const revision of [undefined, null, "", "forged", {}, "a".repeat(65)]) {
    assert.throws(() => gradeQuizBankAttempt(rows, { quizbankRevision: revision, answers: answersFor(rows) }),
      rejects("quizbank_invalid_revision"));
  }
});

test("sheet selection and malformed trusted rows fail closed", () => {
  for (const value of [1, "01", " 25 ", 50]) assert.equal(normalizeQuizBankSheet(value), Number(value));
  for (const value of [undefined, null, true, [1], {}, "", "1,2", "1e1", "0x10", 0, 51, 1.5]) {
    assert.throws(() => normalizeQuizBankSheet(value), rejects("quizbank_invalid_sheet"));
  }
  for (const mutate of [r => r.pop(), r => r.reverse(), r => r[0].correct = 1,
    r => r[1] = r[0], r => delete r[0]]) {
    const rows = sheetRows(); mutate(rows);
    assert.throws(() => quizBankRevision(rows), rejects("quizbank_invalid_archive", 503));
  }
});

test("API gates both actions before archive, grades transiently and preserves sessions/study", async t => {
  const secret = "quizbank-attempt-test-secret", adminPhone = "39123456789", deviceId = "attempt_test_device";
  const env = { SESSION_SECRET: secret, GAS_ACCESS_URL: "https://attempt-access.invalid/", GAS_SECRET: "fixture",
    QUIZ_GAS_URL: "https://attempt-tts.invalid/", QUIZ_PROXY_SECRET: "fixture", ADMIN_PHONE_NUMBERS: adminPhone,
    DATABASE_URL: "postgresql://test:test@unit-test.neon.tech/test", QUIZBANK_R2_ACCOUNT_ID: "attempt-fixture",
    QUIZBANK_R2_BUCKET: "attempt-archive", QUIZBANK_R2_KEY: crypto.randomUUID(),
    quiz_bank_access_key_id: "fixture", quiz_bank_secret_access_key: "fixture" };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key]; process.env[key] = value;
    t.after(() => previous === undefined ? delete process.env[key] : process.env[key] = previous);
  }
  let storageReads = 0, grant = false;
  const source = archive();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(new URL(url).hostname, "attempt-access.invalid", "no unmocked transports or persistence");
    assert.equal(JSON.parse(options.body).action, "validate");
    return Response.json({ success: true, Quiz_bank: grant ? 1 : 0 });
  });
  t.mock.method(S3Client.prototype, "send", async command => {
    assert.equal(command.constructor.name, "GetObjectCommand", "archive reads only, never writes");
    assert.equal(command.input.Bucket, "attempt-archive"); storageReads++;
    return { Body: Readable.from([Buffer.from(JSON.stringify(source))]) };
  });
  const previousFetch = neonConfig.fetchFunction;
  neonConfig.fetchFunction = async () => assert.fail("attempts must not use the database");
  t.after(() => { neonConfig.fetchFunction = previousFetch; });
  const { default: handler } = await import("../api/quizbank.js");
  const token = (phone, role = "user", purpose = "access") => {
    const payload = Buffer.from(JSON.stringify({ phone, deviceId, role, purpose, exp: Date.now() + 900_000 })).toString("base64url");
    return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
  };
  const phone = "39111111111";
  async function call(action, params = {}, { who = phone, role = "user", bearer = token(who, role), raw = false } = {}) {
    const method = action === "getQuiz" || action === "getStudyQuiz" ? "GET" : "POST";
    const body = { action, phone: who, deviceId, chapters: "25", ...params };
    const req = { method, headers: { authorization: `Bearer ${bearer}` },
      [method === "GET" ? "query" : "body"]: raw ? JSON.stringify(body) : body };
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await handler(req, res); return res;
  }
  for (const action of ["getQuiz", "checkQuiz"]) {
    assert.equal((await call(action)).statusCode, 403);
    assert.equal((await call(action, {}, { bearer: "forged" })).statusCode, 401);
    assert.equal((await call(action, {}, { bearer: token(phone, "user", "quizbank") })).statusCode, 401);
  }
  assert.equal(storageReads, 0);
  grant = true;
  assert.equal((await call("getQuiz", { chapters: "51" })).statusCode, 400);
  assert.equal((await call("checkQuiz", { chapters: [25] })).statusCode, 400);
  assert.equal(storageReads, 0);
  const loaded = await call("getQuiz"), data = loaded.body;
  assert.equal(loaded.statusCode, 200); assert.equal(data.quiz.length, 30);
  assert.equal(data.role, "user"); assert.equal(data.canUploadAudio, false); assert.equal(data.isAdmin, false);
  assert.equal(data.timerMinutes, 20); assert.equal(data.sheet, 25);
  assert.equal(data.quiz[6].figureRotation, 90);
  assert.ok(data.quiz.every(row => !Object.hasOwn(row, "correct")));
  const claims = JSON.parse(Buffer.from(data.quizSessionToken.split(".")[0], "base64url"));
  assert.equal(claims.purpose, "quizbank"); assert.equal(claims.aud, "quizbank");
  assert.ok(data.quizSessionTokenExpiresAt > Date.now());
  assert.match(loaded.headers["Cache-Control"], /private, no-store/);
  const study = await call("getStudyQuiz");
  assert.deepEqual(buildQuizBankAttempt(study.body.quiz).quiz, data.quiz);
  const answers = answersFor(study.body.quiz), payload = { quizbankRevision: data.quizbankRevision, answers };
  const graded = await call("checkQuiz", payload, { raw: true });
  assert.equal(graded.statusCode, 200); assert.equal(graded.body.correct, 30); assert.equal(graded.body.passed, true);
  assert.equal(graded.body.results[1].correctAnswer, 0);
  for (const answer of [null, "wrong"]) {
    const response = await call("checkQuiz", { ...payload, answers: answers.map(item => ({ ...item,
      answer: answer === "wrong" ? 1 - item.answer : null })) });
    assert.equal(response.statusCode, 200); assert.equal(response.body.correct, 0); assert.equal(response.body.wrong, 30);
  }
  for (const change of [{ answers: answers.slice(1) }, { answers: [...answers].reverse() },
    { answers: answers.map((item, i) => i === 0 ? { ...item, id: "qb_s01_q01" } : item) },
    { answers: answers.map((item, i) => i === 1 ? answers[0] : item) },
    { answers: answers.map(item => ({ ...item, answer: true })) }]) {
    const response = await call("checkQuiz", { ...payload, ...change });
    assert.equal(response.statusCode, 400); assert.equal(response.body.error, "quizbank_invalid_answers");
  }
  assert.equal((await call("checkQuiz", { answers })).body.error, "quizbank_invalid_revision");
  const admin = await call("getQuiz", {}, { who: adminPhone, role: "admin" });
  assert.equal(admin.body.isAdmin, true); assert.equal(admin.body.canUploadAudio, true);
  assert.equal(storageReads, 1, "attempt and study reuse the archive cache");
  grant = false;
  for (const action of ["getQuiz", "checkQuiz"]) {
    assert.equal((await call(action, payload, { who: "39222222222" })).statusCode, 403);
  }
  assert.equal(storageReads, 1, "a warmed archive cannot bypass authorization");
  grant = true;
  source[720].domanda += " corrected";
  process.env.QUIZBANK_R2_KEY = crypto.randomUUID(); // Simulate the next archive cache generation.
  const stale = await call("checkQuiz", payload);
  assert.equal(stale.statusCode, 409); assert.equal(stale.body.error, "quizbank_revision_changed");
  assert.equal(storageReads, 2);
});
