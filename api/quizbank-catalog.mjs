import crypto from "node:crypto";
import { createRequire } from "node:module";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createWorkCache } from "../lib/bounded-work-cache.mjs";
import identityTools from "../quiz-audio-identity.cjs";
import { audioContentSignature, quizAudioCatalog, quizAudioLegacyRegistry } from "./quiz-audio-catalog.mjs";

const require = createRequire(import.meta.url);
const reference = require("./quizbank-audio-references.json");
const verifiedSignatures = new Set(reference.signatures);
const magicRows = new Map(quizAudioCatalog.rows.map(row => [audioContentSignature(row), row]));
const MAX_BYTES = 4 * 1024 * 1024;
const cache = createWorkCache({ maxEntries: 1, maxPending: 1, maxBytes: MAX_BYTES,
  ttlMs: 5 * 60_000, sizeOf: value => value.bytes });
const invalid = () => Object.assign(new Error("quizbank_invalid_archive"), { statusCode: 503 });

export function quizBankConfig(env = process.env) {
  return {
    accountId: env.QUIZBANK_R2_ACCOUNT_ID || env.quiz_bank_account_id || env.BOOK_R2_ACCOUNT_ID || env.QUIZ_AUDIO_R2_ACCOUNT_ID,
    accessKeyId: env.quiz_bank_access_key_id || env.QUIZBANK_R2_ACCESS_KEY_ID,
    secretAccessKey: env.quiz_bank_secret_access_key || env.QUIZBANK_R2_SECRET_ACCESS_KEY,
    bucket: env.QUIZBANK_R2_BUCKET || "quizbank",
    key: env.QUIZBANK_R2_KEY || "magic_book_quiz_bank_50_schede_completo.json"
  };
}

export const signatureHash = row => crypto.createHash("sha256").update(audioContentSignature(row)).digest("hex");

export function quizBankAudioIdentity(row) {
  const magicRow = magicRows.get(audioContentSignature(row));
  if (magicRow) return quizAudioCatalog.identityFor(magicRow);
  // All Books shares the v2 identity scheme. Only exact text + figure + answer
  // proven against the source catalogue may reuse that key. Never guess by id.
  if (!verifiedSignatures.has(signatureHash(row))) return null;
  const identity = identityTools.getQuizAudioIdentity(row.question, row.figure);
  const group = quizAudioLegacyRegistry.collisions?.[identity.legacyQuizKey];
  const conflicts = group?.candidates?.some(candidate => candidate.figureKey === identity.figureKey
    && candidate.correctValues?.some(answer => answer !== row.correct));
  if (conflicts) return null;
  // Text-only recordings cannot prove which figure was explained.
  return { ...identity, previousQuizKeys: [], legacySafe: false };
}

export function parseQuizBank(source) {
  if (!Array.isArray(source) || source.length !== 1500) throw invalid();
  const byId = new Map();
  const sheets = Array.from({ length: 50 }, () => []);
  for (const item of source) {
    if (!item || typeof item !== "object") throw invalid();
    const sheet = item.scheda, number = item.numero_domanda;
    const id = `qb_s${String(sheet).padStart(2, "0")}_q${String(number).padStart(2, "0")}`;
    if (!Number.isInteger(sheet) || sheet < 1 || sheet > 50 || !Number.isInteger(number) || number < 1 || number > 30
      || item.id !== id || byId.has(id) || typeof item.domanda !== "string" || !item.domanda.trim() || item.domanda.length > 1500
      || typeof item.risposta_corretta !== "boolean" || typeof item.ha_figura !== "boolean"
      || item.risposta !== (item.risposta_corretta ? "V" : "F")
      || (item.ha_figura ? !Number.isInteger(item.numero_figura) || item.numero_figura < 1 || item.numero_figura > 9999
        : item.numero_figura !== null)) throw invalid();
    const row = { id, sheet, number, question: item.domanda, correct: item.risposta_corretta,
      figure: item.ha_figura ? String(item.numero_figura) : "",
      // These two PDF occurrences show the bus bay horizontally, unlike the catalogue.
      figureRotation: ["qb_s25_q07", "qb_s26_q07"].includes(id) && item.numero_figura === 546 ? 90 : 0 };
    const canonical = magicRows.get(audioContentSignature(row));
    if (canonical?.question_bd) row.question_bd = canonical.question_bd;
    row.explanationMapped = Boolean(quizBankAudioIdentity(row));
    byId.set(id, row);
    sheets[sheet - 1].push(row);
  }
  if (sheets.some(rows => rows.length !== 30)) throw invalid();
  sheets.forEach(rows => rows.sort((a, b) => a.number - b.number));
  return { sheets, byId };
}

export async function loadQuizBank(config = quizBankConfig()) {
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    throw Object.assign(new Error("quizbank_not_configured"), { statusCode: 503 });
  }
  const cacheKey = crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");
  return cache.run(cacheKey, async () => {
    const client = new S3Client({ region: "auto", forcePathStyle: true, maxAttempts: 1,
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
    const controller = new AbortController();
    let body;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort(); body?.destroy?.();
        reject(Object.assign(new Error("quizbank_archive_unavailable"), { statusCode: 503 }));
      }, 12_000);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const object = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: config.key }), { abortSignal: controller.signal });
        body = object.Body;
        if (!body || object.ContentLength > MAX_BYTES) throw invalid();
        const chunks = []; let bytes = 0;
        for await (const chunk of body) {
          bytes += chunk.byteLength;
          if (bytes > MAX_BYTES || controller.signal.aborted) throw invalid();
          chunks.push(Buffer.from(chunk));
        }
        const bank = parseQuizBank(JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "")));
        return { ...bank, bytes };
      })()]);
    } catch (error) {
      controller.abort();
      if (error.message === "quizbank_invalid_archive") throw error;
      throw Object.assign(new Error("quizbank_archive_unavailable"), { statusCode: 503 });
    } finally { clearTimeout(timer); body?.destroy?.(); client.destroy(); }
  });
}
