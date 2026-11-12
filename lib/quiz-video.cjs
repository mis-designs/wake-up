'use strict';
const crypto = require('node:crypto');
const { getQuizAudioIdentity } = require('../quiz-audio-identity.cjs');
const { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { CHUNK_BYTES, createRelay } = require('./quiz-video-relay.cjs');
const ACTIONS = new Set(['getQuizVideo', 'createQuizVideoUpload', 'uploadQuizVideoChunk', 'confirmQuizVideoUpload']);
const MAX_BYTES = 128 * 1024 * 1024;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
function identity(row) {
  if (!row || typeof (row.question ?? row.q) !== 'string') throw fail('video_question_unavailable', 404);
  const raw = row.correct ?? row.a;
  const answer = [true, 1, '1'].includes(raw) ? 1 : [false, 0, '0'].includes(raw) ? 0 : null;
  if (answer === null) throw fail('video_answer_unavailable', 409);
  const audio = getQuizAudioIdentity(row.question ?? row.q, row.figure ?? row.img ?? '');
  const key = crypto.createHash('sha256').update(`quiz-video-v1\x1f${audio.quizKey}\x1f${answer}`).digest('hex');
  return { key, prefix: `xyz3d/quiz-v1/${key}` };
}
function uploadMetadata(data) {
  const size = Number(data.bytes), duration = Number(data.duration);
  if (!Number.isSafeInteger(size) || size < 32 || size > MAX_BYTES) throw fail('video_size_invalid');
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600) throw fail('video_duration_invalid');
  if (data.mime !== 'video/mp4') throw fail('video_mp4_required');
  return { bytes: size, duration, mime: 'video/mp4' };
}
function makeService({ storage, bucket, secret, sign = getSignedUrl, now = Date.now, uuid = crypto.randomUUID }) {
  const send = (Command, params, signal) => storage.send(new Command({ Bucket: bucket, ...params }), { abortSignal: signal });
  const relay = createRelay(send, fail);
  const signToken = value => {
    const body = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
  };
  function readToken(token, key, owner) {
    if (typeof token !== 'string' || token.length > 4096) throw fail('video_upload_invalid');
    const [body, sig, extra] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(body || '').digest('base64url');
    if (extra || !sig || Buffer.byteLength(sig) !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw fail('video_upload_invalid');
    let value;
    try { value = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { throw fail('video_upload_invalid'); }
    if (value.key !== key || value.owner !== owner || !/^[a-f0-9-]{36}$/.test(value.id)) throw fail('video_upload_invalid');
    if (!Number.isSafeInteger(value.expires) || value.expires <= now()) throw fail('video_upload_expired', 409);
    uploadMetadata(value);
    return value;
  }
  async function current(id, signal) {
    try {
      const result = await send(GetObjectCommand, { Key: `${id.prefix}/current.json` }, signal);
      if (result.ContentLength > 4096) throw fail('video_record_invalid', 503);
      const record = JSON.parse(await result.Body.transformToString());
      if (record.key !== id.key || !new RegExp(`^${id.prefix}/[a-f0-9-]{36}\\.mp4$`).test(record.objectKey)) throw fail('video_record_invalid', 503);
      return record;
    } catch (error) {
      if (error.name !== 'NoSuchBucket' && (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)) return null;
      throw error;
    }
  }
  async function playback(record) {
    if (!record) return { available: false };
    const url = await sign(storage, new GetObjectCommand({ Bucket: bucket, Key: record.objectKey }), { expiresIn: 15 * 60 });
    return { available: true, url, bytes: record.bytes, duration: record.duration };
  }
  return async function handle({ action, row, master = false, owner = '', data = {}, signal }) {
    if (!ACTIONS.has(action)) throw fail('invalid_action');
    if (action !== 'getQuizVideo' && !master) throw fail('master_admin_required', 403);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail('video_upload_invalid');
    signal?.throwIfAborted();
    const id = identity(row);
    const existing = await current(id, signal);
    if (action === 'getQuizVideo') return { ...(await playback(existing)), canUpload: master === true };
    if (action === 'createQuizVideoUpload') {
      if (existing) throw fail('video_already_exists', 409);
      const meta = uploadMetadata(data);
      const value = { ...meta, key: id.key, owner, id: uuid(), expires: now() + 15 * 60 * 1000 };
      const pendingKey = `xyz3d/pending/${id.key}/${value.id}.mp4`;
      if (data.transport === 'relay') {
        value.relayUploadId = await relay.begin(pendingKey, signal);
        return { transport: 'relay', chunkBytes: CHUNK_BYTES, uploadToken: signToken(value), mime: meta.mime };
      }
      const uploadUrl = await sign(storage, new PutObjectCommand({ Bucket: bucket, Key: pendingKey, ContentType: meta.mime, ContentLength: meta.bytes }), { expiresIn: 15 * 60 });
      return { uploadUrl, uploadToken: signToken(value), mime: meta.mime, relaySupported: true };
    }
    const value = readToken(data.uploadToken, id.key, owner);
    if (existing) {
      if (action === 'uploadQuizVideoChunk') throw fail('video_already_exists', 409);
      if (existing.uploadId !== value.id) throw fail('video_already_exists', 409);
      return { ...(await playback(existing)), saved: true };
    }
    const pendingKey = `xyz3d/pending/${id.key}/${value.id}.mp4`;
    if (action === 'uploadQuizVideoChunk') {
      if (!value.relayUploadId) throw fail('video_upload_invalid');
      return relay.chunk(value, pendingKey, data, signal);
    }
    let head;
    try { head = await send(HeadObjectCommand, { Key: pendingKey }, signal); }
    catch (error) {
      if (error.name === 'NoSuchBucket' || !(error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)) throw error;
      if (!value.relayUploadId) throw fail('video_upload_not_received', 404);
      await relay.complete(value, pendingKey, signal);
      head = await send(HeadObjectCommand, { Key: pendingKey }, signal);
    }
    if (Number(head.ContentLength) !== value.bytes || head.ContentType !== 'video/mp4' || !head.ETag) throw fail('video_file_mismatch', 409);
    const first = await send(GetObjectCommand, { Key: pendingKey, Range: 'bytes=0-31', IfMatch: head.ETag }, signal);
    const bytes = Buffer.from(await first.Body.transformToByteArray());
    if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw fail('video_file_invalid');
    signal?.throwIfAborted();
    // A fresh immutable destination prevents a still-valid upload URL from changing a published video.
    const objectKey = `${id.prefix}/${uuid()}.mp4`;
    await send(CopyObjectCommand, { Key: objectKey, CopySource: `${bucket}/${pendingKey}`, CopySourceIfMatch: head.ETag,
      ContentType: 'video/mp4', CacheControl: 'public, max-age=31536000, immutable', MetadataDirective: 'REPLACE' }, signal);
    const record = { key: id.key, objectKey, uploadId: value.id, bytes: value.bytes, duration: value.duration, createdAt: new Date(now()).toISOString() };
    try {
      await send(PutObjectCommand, { Key: `${id.prefix}/current.json`, Body: JSON.stringify(record), ContentType: 'application/json', CacheControl: 'no-store', IfNoneMatch: '*' }, signal);
    } catch (error) {
      // Only an explicit conditional conflict permits reconciliation. No uncertain write is replayed.
      if (![409, 412].includes(error.$metadata?.httpStatusCode)) throw error;
      const winner = await current(id, signal);
      if (winner?.objectKey !== objectKey) await send(DeleteObjectCommand, { Key: objectKey }, signal).catch(() => {});
      if (!winner || winner.uploadId !== value.id) throw fail('video_already_exists', 409);
      return { ...(await playback(winner)), saved: true };
    }
    // Successful metadata commit is authoritative even if best-effort temporary cleanup fails.
    await send(DeleteObjectCommand, { Key: pendingKey }, signal).catch(() => {});
    if (value.relayUploadId) await relay.cleanup(value, pendingKey, signal).catch(() => {});
    return { ...(await playback(record)), saved: true };
  };
}
function storageConfig(env = process.env) {
  const bucket = String(env.QUIZ_VIDEO_R2_BUCKET || 'magicbook-assets').trim();
  const group = prefix => ({
    account: String(env[prefix + '_ACCOUNT_ID'] || '').trim(),
    accessKeyId: String(env[prefix + '_ACCESS_KEY_ID'] || '').trim(),
    secretAccessKey: String(env[prefix + '_SECRET_ACCESS_KEY'] || '').trim()
  });
  const complete = value => value.account && value.accessKeyId && value.secretAccessKey;
  const dedicated = group('QUIZ_VIDEO_R2');
  if (Object.values(dedicated).some(Boolean)) {
    if (!complete(dedicated)) throw fail('video_storage_not_configured', 503);
    return { ...dedicated, bucket };
  }
  // Reuse credentials as complete groups, never mix keys from different accounts.
  for (const prefix of ['EXPLANATION_R2', 'R2', 'BOOK_R2', 'QUIZ_AUDIO_R2']) {
    const value = group(prefix);
    const declaredBucket = env[prefix + '_BUCKET'] || (prefix === 'R2' ? env.R2_BUCKET_NAME : '');
    if (declaredBucket && String(declaredBucket).trim() !== bucket) continue;
    if (prefix === 'BOOK_R2' && !declaredBucket) continue;
    if (complete(value)) return { ...value, bucket };
  }
  throw fail('video_storage_not_configured', 503);
}
async function runRequest(input, serviceFactory = module.exports.configuredService) {
  identity(input.row);
  try { return await serviceFactory()(input); }
  catch (error) {
    if (input.signal?.aborted || error.name === 'AbortError') throw error;
    if (input.action !== 'getQuizVideo') {
      // An upstream storage refusal is a configuration conflict, not a revoked
      // student session. Preserve the specific code without triggering logout.
      if (['InvalidAccessKeyId', 'SignatureDoesNotMatch'].includes(error.name)) throw fail('video_storage_credentials_invalid', 409);
      if (error.name === 'AccessDenied' || error.$metadata?.httpStatusCode === 403) throw fail('video_storage_denied', 409);
      if (error.name === 'NoSuchUpload') throw fail('video_upload_expired', 409);
      throw error;
    }
    if (input.master !== true) throw error;
    const code = error.message === 'video_storage_not_configured' ? 'video_storage_not_configured'
      : error.name === 'NoSuchBucket' ? 'video_storage_bucket_missing'
      : error.name === 'AccessDenied' || error.$metadata?.httpStatusCode === 403 ? 'video_storage_denied'
      : 'video_storage_unavailable';
    // Permission was checked by the caller. A failed lookup is not proof of absence.
    return { available: false, availability: 'unknown', canUpload: true, error: code };
  }
}
let service;
function configuredService() {
  if (service) return service;
  const { account, accessKeyId, secretAccessKey, bucket } = storageConfig();
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw fail('video_storage_not_configured', 503);
  const storage = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey }, requestChecksumCalculation: 'WHEN_REQUIRED', maxAttempts: 1 });
  service = makeService({ storage, bucket, secret });
  return service;
}
module.exports = { ACTIONS, MAX_BYTES, identity, uploadMetadata, makeService, configuredService, storageConfig, runRequest };
