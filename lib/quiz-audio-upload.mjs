import crypto from "node:crypto";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { audioLookupKeys, selectAudioRow } from "./quiz-audio-lookup.mjs";
import { validateQuizAudioUploadMimeType } from "../api/audio-mime.mjs";

export const MAX_QUIZ_AUDIO_BYTES = 3 * 1024 * 1024;
const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const extensions = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav" };

export function decodeQuizAudioUpload({ audioBase64, audioMimeType, audioDurationMs }) {
  if (typeof audioBase64 !== "string" || !audioBase64) throw fail("invalid_audio_payload", 400);
  if (audioBase64.length > 4 * MAX_QUIZ_AUDIO_BYTES / 3 + 256) throw fail("audio_too_large_max_3mb", 413);
  let encoded = audioBase64, dataType = "";
  if (encoded.startsWith("data:")) {
    const prefix = encoded.slice(0, 256).match(/^data:(audio\/[a-z0-9.+-]+(?:;codecs=[^;,]+)?);base64,/i);
    if (!prefix) throw fail("invalid_audio_payload", 400);
    dataType = prefix[1];
    encoded = encoded.slice(prefix[0].length);
  }
  if (encoded.length > 4 * MAX_QUIZ_AUDIO_BYTES / 3) throw fail("audio_too_large_max_3mb", 413);
  if (!encoded || encoded.length % 4 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded)) throw fail("invalid_audio_payload", 400);
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.toString("base64") !== encoded) throw fail("invalid_audio_payload", 400);
  if (bytes.length > MAX_QUIZ_AUDIO_BYTES) throw fail("audio_too_large_max_3mb", 413);
  const mimeType = validateQuizAudioUploadMimeType(bytes, audioMimeType);
  if (dataType) validateQuizAudioUploadMimeType(bytes, dataType);
  const duration = Number(audioDurationMs || 0);
  if (!Number.isFinite(duration) || duration < 0) throw fail("invalid_audio_duration", 400);
  return { bytes, mimeType, durationMs: Math.min(3_600_000, Math.round(duration)) || null,
    digest: crypto.createHash("sha256").update(bytes).digest("hex") };
}

// One shared deadline, passed to both transports. A timed-out write may have
// committed: never delete its object; the same file can safely reconcile later.
async function withUploadDeadline(parentSignal, timeoutMs, work) {
  const controller = new AbortController();
  const abort = () => controller.abort(fail("quiz_audio_upload_cancelled", 503));
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(controller.signal.reason);
  controller.signal.addEventListener("abort", onAbort, { once: true });
  parentSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(fail("quiz_audio_upload_timeout", 503)), timeoutMs);
  if (parentSignal?.aborted) abort();
  try {
    return await Promise.race([aborted, Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return work(controller.signal);
    })]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

export async function saveMissingQuizAudio({ identity, upload, createdBy, signal },
  { sql, storage, bucket, isLegacyAmbiguous = () => false, invalidate = () => {}, timeoutMs = 12_000 }) {
  const { bytes, mimeType, durationMs, digest } = upload;
  const quizKey = identity.quizKey;
  const audioKey = `quiz-explanations/uploads/v1/${quizKey}/${digest}.${extensions[mimeType]}`;
  const keys = audioLookupKeys(identity);
  return withUploadDeadline(signal, timeoutMs, async abortSignal => {
    const query = (text, params) => {
      abortSignal.throwIfAborted();
      return sql.query(text, params, { fetchOptions: { signal: abortSignal } });
    };
    const readRows = () => query(`SELECT quiz_key, audio_key, audio_mime_type, audio_duration_ms
      FROM quiz_audio_explanations WHERE quiz_key = ANY($1::text[])`, [keys]);
    const sameFile = row => row?.quiz_key === quizKey && row.audio_key === audioKey && row.audio_mime_type === mimeType;
    const result = (row, created) => ({ ok: true, quizKey, available: true, created, idempotent: !created,
      mimeType: row.audio_mime_type, durationMs: row.audio_duration_ms || null });
    const headNonEmptyObject = async key => {
      abortSignal.throwIfAborted();
      if (!key) throw fail("quiz_audio_requires_repair", 409);
      let object;
      try {
        // Never use the playback availability cache to classify an upload
        // conflict: a stored association does not prove its bytes still exist.
        object = await storage.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal });
      } catch (error) {
        abortSignal.throwIfAborted();
        const code = String(error?.name || error?.Code || error?.code || "").toLowerCase();
        if (Number(error?.$metadata?.httpStatusCode || error?.statusCode) === 404 || ["nosuchkey", "notfound"].includes(code)) {
          invalidate(key);
          throw fail("quiz_audio_requires_repair", 409);
        }
        throw error;
      }
      abortSignal.throwIfAborted();
      invalidate(key);
      if (!(Number(object.ContentLength) > 0)) throw fail("quiz_audio_requires_repair", 409);
      return object;
    };
    const verifyObject = async () => {
      const object = await headNonEmptyObject(audioKey);
      if (Number(object.ContentLength) !== bytes.length || object.ContentType !== mimeType || object.Metadata?.sha256 !== digest) {
        throw fail("quiz_audio_upload_conflict", 409);
      }
    };
    const assertMissing = async rows => {
      if (!rows.length) return;
      const selected = selectAudioRow(identity, rows, isLegacyAmbiguous);
      if (selected.requiresReview) throw fail("quiz_audio_requires_review", 409);
      if (!selected.row) return;
      await headNonEmptyObject(selected.row.audio_key);
      throw fail("quiz_audio_already_exists", 409);
    };
    const before = await readRows();
    const prior = before.find(sameFile);
    if (prior) {
      await verifyObject();
      abortSignal.throwIfAborted();
      invalidate(audioKey);
      return result(prior, false);
    }
    // A dangling row is a repair case, not permission to replace an association.
    await assertMissing(before);
    abortSignal.throwIfAborted();
    try {
      await storage.send(new PutObjectCommand({ Bucket: bucket, Key: audioKey, Body: bytes,
        ContentType: mimeType, Metadata: { sha256: digest }, IfNoneMatch: "*" }), { abortSignal });
    } catch (error) {
      abortSignal.throwIfAborted();
      if (error?.$metadata?.httpStatusCode !== 412 && error?.name !== "PreconditionFailed") throw error;
      await verifyObject();
    }
    const inserted = await query(`INSERT INTO quiz_audio_explanations
      (quiz_key, audio_key, audio_mime_type, audio_duration_ms, created_by, created_at, updated_at)
      SELECT $1::text, $2::text, $3::text, $4::integer, $5::text, NOW(), NOW()
      WHERE NOT EXISTS (SELECT 1 FROM quiz_audio_explanations WHERE quiz_key = ANY($6::text[]))
      ON CONFLICT (quiz_key) DO NOTHING
      RETURNING quiz_key, audio_key, audio_mime_type, audio_duration_ms`,
    [quizKey, audioKey, mimeType, durationMs, createdBy, keys]);
    abortSignal.throwIfAborted();
    if (inserted.length) {
      invalidate(audioKey);
      return result(inserted[0], true);
    }
    // A competing INSERT can commit after our statement snapshot. Re-read in
    // a new statement to distinguish an identical retry from another recording.
    const after = await readRows();
    abortSignal.throwIfAborted();
    const winner = after.find(sameFile);
    if (winner) { invalidate(audioKey); return result(winner, false); }
    await assertMissing(after);
    throw fail("quiz_audio_upload_unavailable", 503);
  });
}
