import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { S3Client } from "@aws-sdk/client-s3";
import { parseQuizBank, quizBankConfig, loadQuizBank, quizBankAudioIdentity, quizBankStorageIdentity } from "../api/quizbank-catalog.mjs";
import { quizAudioCatalog } from "../api/quiz-audio-catalog.mjs";
import { neonConfig } from "@neondatabase/serverless";

export function fixtureRows() {
  return Array.from({ length: 1500 }, (_, i) => {
    const sheet = Math.floor(i / 30) + 1, number = i % 30 + 1;
    return { id: `qb_s${String(sheet).padStart(2, "0")}_q${String(number).padStart(2, "0")}`,
      scheda: sheet, numero_domanda: number, domanda: `Domanda di prova ${i + 1}`,
      risposta: "V", risposta_corretta: true, ha_figura: false, numero_figura: null };
  });
}

test("archive validation requires exactly 50 complete sheets with unique positions and consistent figures/answers", () => {
  const rows = fixtureRows();
  const bank = parseQuizBank(rows.reverse());
  assert.equal(bank.sheets.length, 50); assert.equal(bank.byId.size, 1500);
  assert.equal(bank.sheets[0][0].id, "qb_s01_q01");
  for (const mutate of [r => r.pop(), r => r[0] = r[1], r => r[0].risposta = "F",
    r => r[0].ha_figura = true, r => r[0].numero_figura = 25, r => r[0].id = "q1", r => r[0] = null]) {
    const copy = fixtureRows(); mutate(copy); assert.throws(() => parseQuizBank(copy), /quizbank_invalid_archive/);
  }
});

test("new lowercase Vercel keys are separate from existing book keys; only account id is shared", () => {
  const config = quizBankConfig({ quiz_bank_access_key_id: "new-id", quiz_bank_secret_access_key: "new-secret",
    BOOK_R2_ACCOUNT_ID: "same-account", BOOK_R2_ACCESS_KEY_ID: "old-id", BOOK_R2_SECRET_ACCESS_KEY: "old-secret" });
  assert.equal(config.bucket, "quizbank"); assert.equal(config.key, "magic_book_quiz_bank_50_schede_completo.json");
  assert.equal(config.accessKeyId, "new-id"); assert.equal(config.secretAccessKey, "new-secret");
  assert.equal(config.accountId, "same-account");
  assert.equal(quizBankConfig({ BOOK_R2_ACCESS_KEY_ID: "old-id" }).accessKeyId, undefined);
});

test("exact Magic Book reuse preserves identity; altered figure, punctuation or answer cannot borrow it", () => {
  const row = quizAudioCatalog.rows.find(r => r.id === "cap1_q17");
  assert.deepEqual(quizBankAudioIdentity(row), quizAudioCatalog.identityFor(row));
  assert.equal(quizBankAudioIdentity({ ...row, correct: !row.correct, question: row.question + " !!!" }), null);
  assert.equal(quizBankAudioIdentity({ ...row, figure: "9999" }), null);
  assert.deepEqual(quizBankStorageIdentity(row), quizBankAudioIdentity(row));
});

test("isolated storage identities include exact content, figure and answer, never position or legacy keys", () => {
  const row = { id: "qb_s01_q01", question: "Domanda isolata.", figure: "25", correct: true };
  const identity = quizBankStorageIdentity(row);
  assert.equal(quizBankAudioIdentity(row), null);
  assert.match(identity.quizKey, /^qb1_[a-f0-9]{64}$/);
  assert.equal(identity.legacySafe, false);
  assert.equal(identity.legacyQuizKey, undefined);
  assert.deepEqual(identity.previousQuizKeys, []);
  assert.deepEqual(quizBankStorageIdentity({ ...row, id: "qb_s50_q30" }), identity);
  assert.deepEqual(quizBankStorageIdentity({ ...row, figure: "fig025.png" }), identity);
  for (const change of [{ question: "Domanda isolata?" }, { question: "DOMANDA isolata." }, { correct: false }, { figure: "26" }, { figure: "" }]) {
    assert.notEqual(quizBankStorageIdentity({ ...row, ...change }).quizKey, identity.quizKey);
  }
});

test("R2 loads single-flight, caches validated data, retries failed work only on a new request", async t => {
  let reads = 0, fail = false;
  const rows = fixtureRows();
  t.mock.method(S3Client.prototype, "send", async () => {
    reads++; if (fail) throw new Error("Storage unavailable");
    return { Body: Readable.from([Buffer.from(JSON.stringify(rows))]) };
  });
  const config = { accountId: "fixture", accessKeyId: "fixture", secretAccessKey: "fixture", bucket: "fixture", key: "success" };
  await Promise.all(Array.from({ length: 6 }, () => loadQuizBank(config)));
  await loadQuizBank(config); assert.equal(reads, 1);
  fail = true;
  await assert.rejects(loadQuizBank({ ...config, key: "failure" }), /archive_unavailable/);
  fail = false;
  await loadQuizBank({ ...config, key: "failure" }); assert.equal(reads, 3);
});

test("private API: no role spoofing or unentitled user access, no R2 before authorization, one sheet per read", async t => {
  const env = { QUIZBANK_ACCESS_MODE: "separate", SESSION_SECRET: "qb-test-secret", GAS_ACCESS_URL: "https://access.invalid/", GAS_SECRET: "fixture",
    QUIZ_GAS_URL: "https://tts.invalid/", QUIZ_PROXY_SECRET: "fixture",
    DATABASE_URL: "postgresql://test:test@unit-test.neon.tech/test",
    QUIZ_AUDIO_R2_BUCKET: "test-audio", QUIZ_AUDIO_R2_ACCOUNT_ID: "test-account",
    QUIZ_AUDIO_R2_ACCESS_KEY_ID: "test-key", QUIZ_AUDIO_R2_SECRET_ACCESS_KEY: "test-secret",
    ADMIN_PHONE_NUMBERS: "39123456789", quiz_bank_access_key_id: "qb-test-key", quiz_bank_secret_access_key: "qb-test-secret",
    BOOK_R2_ACCOUNT_ID: "qb-test-account", QUIZBANK_R2_KEY: crypto.randomUUID() };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key]; process.env[key] = value;
    t.after(() => previous === undefined ? delete process.env[key] : process.env[key] = previous);
  }
  const { default: handler } = await import("../api/quizbank.js");
  let reads = 0, queries = 0, ttsText = "", accountValid = true;
  const rows = fixtureRows(), canonical = quizAudioCatalog.rows.find(row => row.id === "cap1_q17");
  Object.assign(rows[0], { domanda: canonical.question, risposta_corretta: Boolean(canonical.correct),
    risposta: canonical.correct ? "V" : "F", ha_figura: Boolean(canonical.figure),
    numero_figura: canonical.figure ? Number(String(canonical.figure).match(/\d+/)[0]) : null });
  t.mock.method(S3Client.prototype, "send", async command => {
    if (command.input.Bucket === "test-audio") return { ContentLength: 8 };
    reads++; return { Body: Readable.from([Buffer.from(JSON.stringify(rows))]) };
  });
  const previousFetch = neonConfig.fetchFunction;
  t.after(() => { neonConfig.fetchFunction = previousFetch; });
  neonConfig.fetchFunction = async (_url, options) => {
    queries++;
    const statement = JSON.parse(options.body);
    assert.match(statement.query, /ANY/);
    const identity = quizAudioCatalog.identityFor(canonical);
    const matches = statement.params[0].includes(identity.quizKey);
    return Response.json({ command: "SELECT", rowCount: 1,
      fields: ["quiz_key", "audio_key", "audio_mime_type", "audio_duration_ms"].map(name => ({ name, dataTypeID: name === "audio_duration_ms" ? 23 : 25 })),
      rows: matches ? [[identity.quizKey, "fixture.mp3", "audio/mpeg", 1200]] : [] });
  };
  t.mock.method(globalThis, "fetch", async url => {
    if (String(url).startsWith("https://tts.invalid/")) {
      ttsText = new URL(url).searchParams.get("text");
      return Response.json({ audio: Buffer.from("ID3fixture").toString("base64") });
    }
    return Response.json(accountValid ? { success: true, Quiz_bank: 0 } : { success: false, error: "unauthorized" });
  });
  const phone = "39123456789", deviceId = "quizbank_test_device";
  const token = (role, who = phone, exp = Date.now() + 60_000) => {
    const payload = Buffer.from(JSON.stringify({ phone: who, deviceId, purpose: "access", role, exp })).toString("base64url");
    return `${payload}.${crypto.createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url")}`;
  };
  async function request(params = {}, bearer = token("admin"), method = "GET") {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
    await handler({ method, headers: { authorization: `Bearer ${bearer}` },
      [method === "GET" ? "query" : "body"]: { action: "catalog", phone, deviceId, ...params } }, res);
    return res;
  }
  assert.equal((await request({ role: "admin" }, token("user"))).statusCode, 403);
  assert.equal((await request({}, "forged")).statusCode, 401);
  assert.equal((await request({ phone: "39987654321" }, token("admin", "39987654321"))).statusCode, 403);
  accountValid = false;
  assert.equal((await request({}, token("admin", phone, 1))).statusCode, 401);
  accountValid = true;
  assert.equal(reads, 0);
  const catalog = await request();
  assert.equal(catalog.statusCode, 200); assert.equal(catalog.body.sheets.length, 50);
  assert.equal(catalog.body.quiz, undefined); assert.equal(reads, 1);
  const sheet = await request({ action: "getStudyQuiz", chapters: "2" });
  assert.equal(sheet.statusCode, 200); assert.equal(sheet.body.quiz.length, 30);
  assert.equal(sheet.body.canUploadAudio, true);
  assert.equal(sheet.body.quiz[0].explanationMapped, false);
  assert.equal(sheet.body.quiz[0].id, "qb_s02_q01"); assert.ok(sheet.body.quizSessionToken);
  assert.match(sheet.headers["Cache-Control"], /private, no-store/);
  assert.equal(sheet.headers["CDN-Cache-Control"], "no-store");
  assert.equal((await request({ action: "getStudyQuiz", chapters: "51" })).statusCode, 400);
  assert.equal((await request({ action: "saveQuizAudio" }, token("admin"), "POST")).statusCode, 400);
  assert.equal((await request({ action: "getQuizAudioStatus", questionId: "qb_s01_q02", question: "spoof", figure: "25" }, token("admin"), "POST")).body.available, false);
  assert.equal(queries, 1, "unmapped content probes only its isolated identity");
  assert.equal((await request({ action: "getQuizAudioStatus", questionId: "qb_s01_q01", question: "spoof", figure: "9999" }, token("admin"), "POST")).body.available, true);
  assert.equal(queries, 2);
  assert.equal((await request({ action: "getItalianAudio", questionId: "qb_s01_q01", text: "untrusted" })).statusCode, 200);
  assert.equal(ttsText, canonical.question, "TTS must use the server's question, not arbitrary client text");
  assert.equal((await request({ action: "getQuizAudioBlob", questionId: "qb_s99_q01" }, token("admin"), "POST")).statusCode, 404);
  assert.equal(reads, 1);
  // A warmed process cache must not open the bank to an ordinary subscriber.
  assert.equal((await request({}, token("user"))).statusCode, 403); assert.equal(reads, 1);
});
