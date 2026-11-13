'use strict';
const crypto = require('node:crypto');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const MAX_BYTES = 1024 * 1024;
async function prepareThumbnail(base64, fail) {
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw fail('thumbnail_invalid');
  const input = Buffer.from(base64, 'base64');
  if (!input.length || input.length > MAX_BYTES || input.toString('base64') !== base64) throw fail('thumbnail_invalid');
  const sharp = require('sharp');
  try {
    const image = sharp(input, { limitInputPixels: 16_000_000, failOn: 'warning' });
    const meta = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages || 1) !== 1) throw Error('format');
    const { data, info } = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_BYTES) throw Error('size');
    return { body: data, width: info.width, height: info.height, bytes: data.length, mime: 'image/jpeg', hash: crypto.createHash('sha256').update(input).digest('hex') };
  } catch { throw fail('thumbnail_invalid'); }
}
function makeThumbnails({ send, records, fail, now, uuid }) {
  return async ({ action, id, stored, data, signal }) => {
    if (!/^[a-f0-9-]{36}$/.test(data.operationId || '')) throw fail('video_upload_invalid');
    if (!stored || stored.value.deleted) throw fail('thumbnail_video_required', 409);
    const removing = action === 'deleteQuizVideoThumbnail';
    const image = removing ? null : await prepareThumbnail(data.imageBase64, fail);
    const hash = image?.hash || 'removed';
    if (stored.value.thumbnailOperationId === data.operationId) {
      if (stored.value.thumbnailOperationHash !== hash) throw fail('video_changed', 409);
      return records.cleanup(id, stored, signal).catch(() => stored);
    }
    if (data.expectedRevision !== stored.etag) throw fail('video_changed', 409);
    if (stored.value.retiredObjectKey || stored.value.retiredThumbnailKey) throw fail('video_cleanup_required', 409);
    signal?.throwIfAborted();
    // Stable for this exact operation and payload: an interrupted metadata write
    // can be retried without allocating another permanent image object.
    const digest = crypto.createHash('sha256').update(data.operationId + ':' + hash).digest('hex');
    const fileId = [digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join('-');
    const objectKey = image ? `${id.prefix}/cover-${fileId}.jpg` : null;
    if (image) {
      try { await send(PutObjectCommand, { Key: objectKey, Body: image.body, ContentType: image.mime, CacheControl: 'public, max-age=31536000, immutable', IfNoneMatch: '*' }, signal); }
      catch(error) { if (error.$metadata?.httpStatusCode !== 412) throw error; }
    }
    const value = { ...stored.value, thumbnail: image ? { objectKey, width: image.width, height: image.height, bytes: image.bytes, mime: image.mime } : null,
      thumbnailOperationId: data.operationId, thumbnailOperationHash: hash, updatedAt: new Date(now()).toISOString(),
      ...(stored.value.thumbnail ? { retiredThumbnailKey: stored.value.thumbnail.objectKey } : {}) };
    let published;
    try { published = await records.write(id, value, stored.etag, signal); }
    catch (error) {
      if (![409, 412].includes(error.$metadata?.httpStatusCode)) throw error;
      const winner = await records.read(id, signal);
      if (objectKey && winner?.value.thumbnail?.objectKey !== objectKey) await send(DeleteObjectCommand, { Key: objectKey }, signal).catch(() => {});
      if (winner?.value.deleted || winner?.value.thumbnailOperationId !== data.operationId || winner?.value.thumbnailOperationHash !== hash) throw fail('video_changed', 409);
      published = winner;
    }
    return records.cleanup(id, published, signal).catch(() => published);
  };
}
module.exports = { MAX_BYTES, prepareThumbnail, makeThumbnails };
