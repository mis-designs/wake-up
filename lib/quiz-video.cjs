'use strict';
const crypto = require('node:crypto');
const { getQuizAudioIdentity } = require('../quiz-audio-identity.cjs');
const { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { CHUNK_BYTES, createRelay } = require('./quiz-video-relay.cjs');
const { makeRecords } = require('./quiz-video-record.cjs');
const { makeThumbnails } = require('./quiz-video-thumbnail.cjs');
const ACTIONS = new Set(['getQuizVideo', 'createQuizVideoUpload', 'uploadQuizVideoChunk', 'confirmQuizVideoUpload', 'deleteQuizVideo', 'cleanupQuizVideo', 'saveQuizVideoThumbnail', 'deleteQuizVideoThumbnail']);
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
  const relay = createRelay(send, fail), records = makeRecords(send, fail);
  const thumbnails = makeThumbnails({ send, records, fail, now, uuid });
  const signToken = value => {
    const body = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
  };
  function readToken(token, key, owner) {
    if (typeof token !== 'string' || token.length > 8192) throw fail('video_upload_invalid');
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
  return async function handle({ action, row, master = false, owner = '', data = {}, signal }) {
    if (!ACTIONS.has(action)) throw fail('invalid_action');
    if (action !== 'getQuizVideo' && !master) throw fail('master_admin_required', 403);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail('video_upload_invalid');
    signal?.throwIfAborted();
    const id = identity(row), stored = await records.read(id, signal);
    const active = record => record && record.value.deleted !== true;
    const describe = async (record, extra = {}) => {
      const result = active(record) ? { available: true, url: await sign(storage, new GetObjectCommand({ Bucket: bucket, Key: record.value.objectKey }), { expiresIn: 15 * 60 }), bytes: record.value.bytes, duration: record.value.duration } : { available: false };
      if (active(record) && record.value.thumbnail) {
        const { objectKey, width, height, bytes, mime } = record.value.thumbnail;
        result.thumbnail = { url: await sign(storage, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn: 15 * 60 }), width, height, bytes, mime };
      }
      return { ...result, ...extra, canUpload: master === true, ...(master ? {
        revision: record?.etag || null, cleanupPending: Boolean(record?.value.retiredObjectKey || record?.value.retiredThumbnailKey),
        archive: { bucket, prefix: id.prefix + '/', metadataKey: id.prefix + '/current.json', objectKey: active(record) ? record.value.objectKey : null, thumbnailKey: active(record) ? record.value.thumbnail?.objectKey || null : null },
        fileName: active(record) ? record.value.fileName || '' : '', originalBytes: record?.value.originalBytes,
        compression: record?.value.compression, updatedAt: record?.value.updatedAt || record?.value.createdAt
      } : {}) };
    };
    const assertRevision = record => { if (data.expectedRevision !== (record?.etag || null)) throw fail('video_changed', 409); };
    if (action === 'getQuizVideo') return describe(stored);
    if (['saveQuizVideoThumbnail', 'deleteQuizVideoThumbnail'].includes(action)) {
      const updated = await thumbnails({ action, id, stored, data, signal });
      return describe(updated, { thumbnailSaved: action === 'saveQuizVideoThumbnail', thumbnailRemoved: action === 'deleteQuizVideoThumbnail' });
    }
    if (action === 'cleanupQuizVideo') {
      assertRevision(stored);
      return describe(await records.cleanup(id, stored, signal), { cleaned: true });
    }
    if (action === 'deleteQuizVideo') {
      if (!/^[a-f0-9-]{36}$/.test(data.operationId || '')) throw fail('video_upload_invalid');
      let tombstone = stored;
      if (stored?.value.deleted !== true || stored.value.deleteId !== data.operationId) {
        assertRevision(stored);
        if (!active(stored)) return describe(stored, { removed: true });
        if (stored.value.retiredObjectKey || stored.value.retiredThumbnailKey) throw fail('video_cleanup_required', 409);
        const value = { ...stored.value, deleted: true, deleteId: data.operationId, deletedAt: new Date(now()).toISOString(), retiredObjectKey: stored.value.objectKey, ...(stored.value.thumbnail ? { retiredThumbnailKey: stored.value.thumbnail.objectKey } : {}) };
        try { tombstone = await records.write(id, value, stored.etag, signal); }
        catch (error) {
          if (![409, 412].includes(error.$metadata?.httpStatusCode)) throw error;
          tombstone = await records.read(id, signal);
          if (!tombstone?.value.deleted || tombstone.value.deleteId !== data.operationId) throw fail('video_changed', 409);
        }
      }
      tombstone = await records.cleanup(id, tombstone, signal);
      return describe(tombstone, { removed: true });
    }
    if (action === 'createQuizVideoUpload') {
      if (stored?.value.retiredObjectKey || stored?.value.retiredThumbnailKey) throw fail('video_cleanup_required', 409);
      if (active(stored) && data.expectedRevision == null) throw fail('video_already_exists', 409);
      if (data.expectedRevision != null || active(stored)) assertRevision(stored);
      const meta = uploadMetadata(data);
      const fileName = String(data.fileName || '').replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim().slice(0, 160);
      const originalBytes = Number(data.originalBytes ?? meta.bytes);
      if (!Number.isSafeInteger(originalBytes) || originalBytes < meta.bytes || originalBytes > MAX_BYTES) throw fail('video_size_invalid');
      const compression = ['compressed', 'lossless', 'original_better', 'compression_unavailable', 'compression_timeout', 'original_selected'].includes(data.compression) ? data.compression : 'unspecified';
      const value = { ...meta, fileName, originalBytes, compression, key: id.key, owner, id: uuid(), baseRevision: stored?.etag || null, expires: now() + 15 * 60 * 1000 };
      const pendingKey = `xyz3d/pending/${id.key}/${value.id}.mp4`;
      if (data.transport === 'relay') {
        value.relayUploadId = await relay.begin(pendingKey, signal);
        return { transport: 'relay', chunkBytes: CHUNK_BYTES, uploadToken: signToken(value), mime: meta.mime };
      }
      return { uploadUrl: await sign(storage, new PutObjectCommand({ Bucket: bucket, Key: pendingKey, ContentType: meta.mime, ContentLength: meta.bytes }), { expiresIn: 15 * 60 }), uploadToken: signToken(value), mime: meta.mime, relaySupported: true };
    }
    const value = readToken(data.uploadToken, id.key, owner);
    if (active(stored) && stored.value.uploadId === value.id) {
      if (action === 'uploadQuizVideoChunk') throw fail('video_already_exists', 409);
      // A repeated confirmation also finishes a previously interrupted cleanup.
      let result = stored;
      if (stored.value.retiredObjectKey || stored.value.retiredThumbnailKey) result = await records.cleanup(id, stored, signal).catch(() => stored);
      return describe(result, { saved: true });
    }
    if ((value.baseRevision || null) !== (stored?.etag || null)) throw fail('video_changed', 409);
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
      await relay.complete(value, pendingKey, signal); head = await send(HeadObjectCommand, { Key: pendingKey }, signal);
    }
    if (Number(head.ContentLength) !== value.bytes || head.ContentType !== 'video/mp4' || !head.ETag) throw fail('video_file_mismatch', 409);
    const first = await send(GetObjectCommand, { Key: pendingKey, Range: 'bytes=0-31', IfMatch: head.ETag }, signal);
    const bytes = Buffer.from(await first.Body.transformToByteArray());
    if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw fail('video_file_invalid');
    signal?.throwIfAborted();
    const objectKey = `${id.prefix}/${value.id}.mp4`;
    await send(CopyObjectCommand, { Key: objectKey, CopySource: `${bucket}/${pendingKey}`, CopySourceIfMatch: head.ETag,
      ContentType: 'video/mp4', CacheControl: 'public, max-age=31536000, immutable', MetadataDirective: 'REPLACE' }, signal);
    const record = { key: id.key, objectKey, uploadId: value.id, bytes: value.bytes, duration: value.duration,
      question: row.question ?? row.q, answer: [true, 1, '1'].includes(row.correct ?? row.a), figure: row.figure ?? row.img ?? '',
      questionId: String(row.id ?? ''), fileName: value.fileName || '', originalBytes: value.originalBytes || value.bytes,
      compression: value.compression || 'unspecified', createdAt: stored?.value.createdAt || new Date(now()).toISOString(), updatedAt: new Date(now()).toISOString(),
      ...(active(stored) ? { retiredObjectKey: stored.value.objectKey, ...(stored.value.thumbnail ? { thumbnail: stored.value.thumbnail } : {}) } : {}) };
    let published;
    try { published = await records.write(id, record, value.baseRevision, signal); }
    catch (error) {
      if (![409, 412].includes(error.$metadata?.httpStatusCode)) throw error;
      const winner = await records.read(id, signal);
      if (winner?.value.objectKey !== objectKey) await send(DeleteObjectCommand, { Key: objectKey }, signal).catch(() => {});
      if (!active(winner) || winner.value.uploadId !== value.id) throw fail('video_changed', 409);
      return describe(winner, { saved: true });
    }
    await send(DeleteObjectCommand, { Key: pendingKey }, signal).catch(() => {});
    if (value.relayUploadId) await relay.cleanup(value, pendingKey, signal).catch(() => {});
    if (published.value.retiredObjectKey) published = await records.cleanup(id, published, signal).catch(() => published);
    return describe(published, { saved: true });
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
