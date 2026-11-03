import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { S3Client } from "@aws-sdk/client-s3";
import { neonConfig } from "@neondatabase/serverless";
import { parseQuizBank, quizBankContentToken, matchesQuizBankContentToken,
  quizBankStorageIdentity } from "../api/quizbank-catalog.mjs";
import { quizBankRevision, gradeQuizBankAttempt } from "../lib/quizbank-attempt.mjs";

// No credentials, private questions or network services are used by these fixtures.
Object.assign(process.env, {
  SESSION_SECRET: "content-safety-fixture-secret", GAS_ACCESS_URL: "https://access.invalid/", GAS_SECRET: "fixture",
  QUIZ_GAS_URL: "https://content-tts.invalid/", QUIZ_PROXY_SECRET: "fixture",
  ADMIN_PHONE_NUMBERS: "39123456789", QUIZBANK_ACCESS_MODE: "separate",
  DATABASE_URL: "postgresql://test:test@unit-test.neon.tech/test",
  QUIZBANK_R2_ACCOUNT_ID: "content-fixture", QUIZBANK_R2_BUCKET: "content-archive",
  quiz_bank_access_key_id: "fixture", quiz_bank_secret_access_key: "fixture",
  QUIZ_AUDIO_R2_ACCOUNT_ID: "audio-fixture", QUIZ_AUDIO_R2_BUCKET: "content-audio",
  QUIZ_AUDIO_R2_ACCESS_KEY_ID: "fixture", QUIZ_AUDIO_R2_SECRET_ACCESS_KEY: "fixture"
});
const { default: handler } = await import("../api/quizbank.js");
const phone = "39123456789", deviceId = "content_safety_device";
const changedCode = "quizbank_content_changed_refresh_required";
function archive() {
  return Array.from({ length: 1500 }, (_, i) => {
    const sheet = Math.floor(i / 30) + 1, number = i % 30 + 1;
    return { id: `qb_s${String(sheet).padStart(2, "0")}_q${String(number).padStart(2, "0")}`,
      scheda: sheet, numero_domanda: number, domanda: `Content safety fixture ${i}`,
      risposta: "V", risposta_corretta: true, ha_figura: i === 0,
      numero_figura: i === 0 ? 546 : null, figureRotation: 0 };
  });
}
function accessToken() {
  const body = Buffer.from(JSON.stringify({ phone, deviceId, role: "admin", purpose: "access", exp: Date.now() + 60000 })).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url")}`;
}
function upload() {
  const bytes = Buffer.alloc(46);
  bytes.write("RIFF"); bytes.writeUInt32LE(38, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(8000, 28);
  bytes.writeUInt16LE(1, 32); bytes.writeUInt16LE(8, 34); bytes.write("data", 36); bytes.writeUInt32LE(2, 40);
  return { audioBase64: bytes.toString("base64"), audioMimeType: "audio/wav" };
}
function fixture(t) {
  const state = { archive: archive(), archiveReads: 0, audioReads: 0, databaseCalls: 0, upstreamCalls: 0 };
  process.env.QUIZBANK_R2_KEY = crypto.randomUUID();
  t.mock.method(S3Client.prototype, "send", async command => {
    if (command.input.Bucket !== "content-archive") {
      state.audioReads++;
      assert.fail("unexpected audio object access");
    }
    assert.equal(command.constructor.name, "GetObjectCommand");
    state.archiveReads++;
    return { Body: Readable.from([Buffer.from(JSON.stringify(state.archive))]) };
  });
  const prior = neonConfig.fetchFunction;
  t.after(() => { neonConfig.fetchFunction = prior; });
  neonConfig.fetchFunction = async () => {
    state.databaseCalls++;
    return Response.json({ command: "SELECT", rowCount: 0, fields: [], rows: [] });
  };
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(new URL(url).hostname, "content-tts.invalid", "no unmocked transports");
    state.upstreamCalls++;
    return Response.json({ audio: "SUQzZml4dHVyZQ==", translation: "পরীক্ষা" });
  });
  state.call = async (action, params = {}) => {
    const method = ["catalog", "getStudyQuiz", "getQuiz", "getItalianAudio", "getBengaliAudio", "getTTS"].includes(action) ? "GET" : "POST";
    const req = { method, headers: { authorization: `Bearer ${accessToken()}` },
      [method === "GET" ? "query" : "body"]: { action, phone, deviceId, chapters: "1", ...params } };
    const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; } };
    await handler(req, res);
    return res;
  };
  state.replace = mutate => { mutate(state.archive); process.env.QUIZBANK_R2_KEY = crypto.randomUUID(); };
  return state;
}
const actions = ["getItalianAudio", "getBengaliAudio", "getTTS", "getQuizAudioStatus",
  "getQuizAudioBlob", "getQuizAudioPlayback", "saveQuizAudio"];
async function assertBlocked(f, row, token) {
  const before = [f.databaseCalls, f.audioReads, f.upstreamCalls];
  for (const action of actions) {
    const response = await f.call(action, { questionId: row.id, audioIdentityToken: token,
      text: "পরীক্ষা", ...(action === "saveQuizAudio" ? upload() : {}) });
    assert.equal(response.statusCode, 409, action);
    assert.equal(response.body.error, changedCode, action);
    assert.equal(response.body.refreshRequired, true);
  }
  assert.deepEqual([f.databaseCalls, f.audioReads, f.upstreamCalls], before,
    "rejection must precede audio database, object access, uploads and TTS");
}

test("Study and practice return the same signed row identity without changing grading revision or revealing answers", async t => {
  const f = fixture(t);
  f.archive.forEach(row => { row.sourceRevision = "a".repeat(64); });
  const study = await f.call("getStudyQuiz"), practice = await f.call("getQuiz");
  assert.equal(study.statusCode, 200); assert.equal(practice.statusCode, 200);
  assert.equal(practice.body.quizbankRevision, quizBankRevision(parseQuizBank(f.archive).sheets[0]));
  study.body.quiz.forEach((row, i) => {
    assert.match(row.audioIdentityToken, /^qbct1_[a-f0-9]{64}$/);
    assert.equal(row.audioIdentityToken, practice.body.quiz[i].audioIdentityToken);
    assert.equal(row.sourceRevision, "a".repeat(64));
    assert.equal(practice.body.quiz[i].sourceRevision, row.sourceRevision);
    assert.equal(Object.hasOwn(practice.body.quiz[i], "correct"), false);
  });
  assert.equal(f.archiveReads, 1);
});

test("missing, malformed, forged and another-row tokens block every row-dependent media action", async t => {
  const f = fixture(t), { body } = await f.call("getStudyQuiz"), row = body.quiz[0];
  for (const token of [undefined, "", null, {}, [], 123, "qbct1_" + "0".repeat(64), body.quiz[1].audioIdentityToken]) {
    await assertBlocked(f, row, token);
  }
  assert.equal(f.archiveReads, 1, "no retry or per-action archive fan-out");
});

test("replacing text, answer, figure or rotation at the same ID invalidates all old media/upload requests", async t => {
  const changes = [r => r.domanda += " changed", r => r.domanda += " ",
    r => { r.risposta_corretta = false; r.risposta = "F"; },
    r => r.numero_figura = 565, r => r.figureRotation = 90, r => r.sourceRevision = "a".repeat(64)];
  for (const change of changes) await t.test(String(changes.indexOf(change)), async t => {
    const f = fixture(t), old = (await f.call("getStudyQuiz")).body.quiz;
    f.replace(rows => change(rows[0]));
    await assertBlocked(f, old[0], old[0].audioIdentityToken);
    const fresh = (await f.call("getStudyQuiz")).body.quiz;
    assert.notEqual(fresh[0].audioIdentityToken, old[0].audioIdentityToken);
    assert.equal(fresh[1].audioIdentityToken, old[1].audioIdentityToken, "unmodified rows remain usable");
    const status = await f.call("getQuizAudioStatus", { questionId: fresh[0].id, audioIdentityToken: fresh[0].audioIdentityToken });
    assert.equal(status.statusCode, 200); assert.equal(status.body.available, false);
    assert.equal(f.databaseCalls, 1); assert.equal(f.archiveReads, 2);
  });
});

test("explicit rotation follows moved content, zero overrides legacy positions, and invalid metadata is rejected", () => {
  const source = archive(); source[0].figureRotation = 90;
  const before = parseQuizBank(source).sheets[0][0];
  const target = 25 * 30 + 6;
  const destination = { id: source[target].id, scheda: source[target].scheda, numero_domanda: source[target].numero_domanda };
  source[target] = { ...source[0], ...destination };
  const moved = parseQuizBank(source).sheets[25][6];
  assert.equal(moved.figureRotation, 90);
  assert.deepEqual(quizBankStorageIdentity(before), quizBankStorageIdentity(moved), "moving does not rename audio");
  assert.notEqual(quizBankContentToken(before), quizBankContentToken(moved), "tokens bind occurrences");
  source[target].figureRotation = 0;
  assert.equal(parseQuizBank(source).sheets[25][6].figureRotation, 0);
  delete source[target].figureRotation;
  assert.equal(parseQuizBank(source).sheets[25][6].figureRotation, 0, "unknown text at old position never inherits 90 degrees");
  for (const value of [null, "90", "0", false, true, 45, 180, {}, []]) {
    source[target].figureRotation = value;
    assert.throws(() => parseQuizBank(source), /quizbank_invalid_archive/);
  }
  source[target].figureRotation = 90; source[target].ha_figura = false; source[target].numero_figura = null;
  assert.throws(() => parseQuizBank(source), /quizbank_invalid_archive/);
});

test("rotation/content guards do not change existing audio identities; signing secret is required", () => {
  const row = parseQuizBank(archive()).sheets[0][0], token = quizBankContentToken(row);
  assert.equal(matchesQuizBankContentToken(row, token), true);
  const rotated = { ...row, figureRotation: 90 };
  assert.notEqual(quizBankContentToken(rotated), token);
  assert.deepEqual(quizBankStorageIdentity(rotated), quizBankStorageIdentity(row));
  assert.equal(matchesQuizBankContentToken(rotated, token), false);
  assert.throws(() => quizBankContentToken(row, ""), /quizbank_not_configured/);
});

test("current tokens authorize row TTS while standalone word TTS remains independent of the archive", async t => {
  const f = fixture(t);
  assert.equal((await f.call("getTTS", { text: "পরীক্ষা" })).statusCode, 200);
  assert.equal(f.archiveReads, 0);
  const row = (await f.call("getStudyQuiz")).body.quiz[0];
  for (const action of ["getItalianAudio", "getBengaliAudio", "getTTS"]) {
    assert.equal((await f.call(action, { questionId: row.id, audioIdentityToken: row.audioIdentityToken, text: "পরীক্ষা" })).statusCode, 200);
  }
  assert.equal(f.upstreamCalls, 4);
});

test("optional source revision is validated and changes grading/media identity without renaming audio", () => {
  const raw = archive(), legacy = parseQuizBank(raw).sheets[0], oldRevision = quizBankRevision(legacy);
  const sourceRevision = "d3445a83769b06eee77d3a5dea0e9fbba236ac070d138578256944eead04bd89";
  raw.forEach(row => { row.sourceRevision = sourceRevision.toUpperCase(); });
  const current = parseQuizBank(raw).sheets[0];
  assert.equal(current[0].sourceRevision, sourceRevision);
  assert.notEqual(quizBankRevision(current), oldRevision);
  assert.notEqual(quizBankContentToken(current[0]), quizBankContentToken(legacy[0]));
  assert.deepEqual(quizBankStorageIdentity(current[0]), quizBankStorageIdentity(legacy[0]));
  assert.throws(() => gradeQuizBankAttempt(current, { quizbankRevision: oldRevision,
    answers: legacy.map(row => ({ id: row.id, answer: 1 })) }), error => error.statusCode === 409);
  for (const value of [null, "", "a".repeat(63), "a".repeat(65), "g".repeat(64), 1, {}, []]) {
    raw[0].sourceRevision = value;
    assert.throws(() => parseQuizBank(raw), /quizbank_invalid_archive/);
  }
  const next = structuredClone(current); next[0].sourceRevision = "b".repeat(64);
  assert.notEqual(quizBankRevision(current), quizBankRevision(next));
  assert.notEqual(quizBankContentToken(current[0]), quizBankContentToken(next[0]));
  next[0].sourceRevision = "bad";
  assert.throws(() => quizBankRevision(next), /quizbank_invalid_archive/);
});
