import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { audioContentSignature, createAudioCatalog, quizAudioCatalog } from "../api/quiz-audio-catalog.mjs";
import identityTools from "../quiz-audio-identity.cjs";

const base = { id: "chapter", chapter: 1, question: "Il segnale indica una curva.", figure: "fig37", correct: 1 };
const exam = { ...base, id: "exam", chapter: 0 };
const request = row => ({ questionId: row.id, question: row.question, figure: row.figure });

test("exact chapter and Exam duplicates share one recording, including canonical figure aliases", () => {
  const alias = { ...exam, figure: "Figure/fig037.jpg" };
  const catalog = createAudioCatalog([base, alias]);
  assert.equal(catalog.resolve(request(base)).quizKey, catalog.resolve(request(alias)).quizKey);
  assert.equal(catalog.resolve(request(base)).quizKey, identityTools.getQuizAudioIdentity(base.question, base.figure).quizKey);
});

test("different text, punctuation, case, answer, figure, and absent figure never share audio", () => {
  for (const difference of [
    { question: "Il segnale indica una curva?" }, { question: "IL segnale indica una curva." },
    { question: "Il segnale non indica una curva." }, { correct: 0 }, { figure: "fig38" }, { figure: "" }
  ]) {
    const other = { ...exam, ...difference };
    const catalog = createAudioCatalog([base, other]);
    assert.notEqual(catalog.resolve(request(base)).quizKey, catalog.resolve(request(other)).quizKey, JSON.stringify(difference));
    assert.equal(catalog.resolve(request(other)).legacySafe, false);
  }
});

test("unknown or stale IDs and mismatched figures fail before storage access", () => {
  const catalog = createAudioCatalog([base, exam]);
  for (const difference of [{ questionId: "missing" }, { figure: "fig38" }, { figure: "" }, { question: "altro" }]) {
    assert.throws(() => catalog.resolve({ ...request(exam), ...difference }), /quiz_audio_catalog_mismatch/);
  }
});

test("answer conflicts require an ID and identical Exam-only duplicates share their isolated key", () => {
  const other = { ...exam, id: "other" };
  const catalog = createAudioCatalog([exam, other]);
  assert.equal(catalog.resolve(request(exam)).quizKey, catalog.resolve(request(other)).quizKey);
  assert.equal(catalog.resolve(request(exam)).legacySafe, false);
  const conflict = createAudioCatalog([base, { ...exam, correct: 0 }]);
  assert.throws(() => conflict.resolve({ question: base.question, figure: base.figure }), /quiz_audio_catalog_mismatch/);
});

test("all 868 real questions resolve; every shared identity has exactly one content signature", () => {
  const groups = new Map();
  for (const row of quizAudioCatalog.rows) {
    const identity = quizAudioCatalog.resolve(request(row));
    if (!groups.has(identity.quizKey)) groups.set(identity.quizKey, new Set());
    groups.get(identity.quizKey).add(audioContentSignature(row));
  }
  assert.equal(quizAudioCatalog.rows.length, 868);
  assert.equal(quizAudioCatalog.rows.filter(row => Number(row.chapter) === 0).length, 80);
  assert.ok([...groups.values()].every(signatures => signatures.size === 1));
});

test("ordinary playback never bypasses ambiguous legacy protection or searches another figure", async () => {
  const source = readFileSync(new URL("../api/quiz.js", import.meta.url), "utf8");
  const find = source.slice(source.indexOf("async function findQuizAudioRow("), source.indexOf("async function getCanonicalQuizAudioCandidates("));
  const resolve = source.slice(source.indexOf("async function resolveQuizAudioRow("), source.indexOf("function verifyQuizAudioIdentityToken("));
  const calls = [];
  const catalog = createAudioCatalog([base, { ...exam, figure: "fig38" }]);
  const context = vm.createContext({
    quizAudioCatalog: catalog,
    getQuizAudioRow: async key => { calls.push(key); return key.startsWith("q_") ? { quiz_key: key } : null; },
    isLegacyQuizAudioAmbiguous: () => true
  });
  vm.runInContext(find + resolve, context);
  const result = await context.resolveQuizAudioRow(request({ ...exam, figure: "fig38" }));
  assert.equal(result.result.row, null);
  assert.equal(calls.length, 1);
  calls.length = 0;
  const legacy = await context.findQuizAudioRow({ quizKey: "q2_test", legacyQuizKey: "q_old", legacySafe: true });
  assert.equal(legacy.row, null);
  assert.equal(legacy.requiresReview, true);
});

test("Admin audio catalog includes Exam 80; learners cannot fetch answers or start uploads", async () => {
  process.env.SESSION_SECRET = "exam-audio-test-secret";
  process.env.GAS_ACCESS_URL = "https://access.invalid";
  process.env.GAS_SECRET = "test-secret";
  const { default: handler } = await import(`../api/quiz.js?exam-audio=${Date.now()}`);
  const phone = "1234567890", deviceId = "device_exam80";
  async function call(action, role, extra = {}) {
    const encoded = Buffer.from(JSON.stringify({ phone, deviceId, purpose: "access", role, exp: Date.now() + 60_000 })).toString("base64url");
    const token = `${encoded}.${crypto.createHmac("sha256", process.env.SESSION_SECRET).update(encoded).digest("base64url")}`;
    const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: "POST", headers: { authorization: `Bearer ${token}` }, body: { action, phone, deviceId, ...extra } }, res);
    return res;
  }
  const admin = await call("getAdminAudioCatalog", "admin");
  assert.equal(admin.statusCode, 200);
  assert.equal(admin.body.quiz.length, 868);
  assert.equal(admin.body.quiz.filter(row => Number(row.chapter) === 0).length, 80);
  for (const row of admin.body.quiz) assert.equal(row.audioIdentity.quizKey, quizAudioCatalog.resolve(request(row)).quizKey);
  assert.equal((await call("getMagicBookCatalog", "admin")).body.quiz.length, 788);
  assert.equal((await call("getAdminAudioCatalog", "user")).statusCode, 403);
  assert.equal((await call("createQuizAudioUpload", "user", { ...request(exam), quizAudioIdentityVersion: 2 })).statusCode, 403);
  assert.equal((await call("createQuizAudioUpload", "admin", { ...request(exam), quizAudioIdentityVersion: 2 })).statusCode, 409);
});
