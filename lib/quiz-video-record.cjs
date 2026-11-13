'use strict';
const { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
function makeRecords(send, fail) {
  async function read(id, signal) {
    try {
      const result = await send(GetObjectCommand, { Key: `${id.prefix}/current.json` }, signal);
      if (result.ContentLength > 16384) throw fail('video_record_invalid', 503);
      const value = JSON.parse(await result.Body.transformToString());
      const validKey = key => typeof key === 'string' && new RegExp(`^${id.prefix}/[a-f0-9-]{36}\\.mp4$`).test(key);
      const validThumbnail = key => typeof key === 'string' && new RegExp(`^${id.prefix}/cover-[a-f0-9-]{36}\\.jpg$`).test(key);
      if (value.thumbnail && (!validThumbnail(value.thumbnail.objectKey) || value.thumbnail.mime !== 'image/jpeg' || !Number.isSafeInteger(value.thumbnail.width) || value.thumbnail.width < 1 || value.thumbnail.width > 1600 || !Number.isSafeInteger(value.thumbnail.height) || value.thumbnail.height < 1 || value.thumbnail.height > 1600 || !Number.isSafeInteger(value.thumbnail.bytes) || value.thumbnail.bytes < 1 || value.thumbnail.bytes > 1048576)) throw fail('video_record_invalid', 503);
      if (value.retiredThumbnailKey && (!validThumbnail(value.retiredThumbnailKey) || (value.retiredThumbnailKey === value.thumbnail?.objectKey && !value.deleted))) throw fail('video_record_invalid', 503);
      if (value.key !== id.key || !validKey(value.objectKey) || !result.ETag
        || (value.retiredObjectKey && (!validKey(value.retiredObjectKey) || (value.retiredObjectKey === value.objectKey && value.deleted !== true)))) throw fail('video_record_invalid', 503);
      return { value, etag: result.ETag };
    } catch (error) {
      if (error.name !== 'NoSuchBucket' && (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)) return null;
      throw error;
    }
  }
  async function write(id, value, etag, signal) {
    const Body = JSON.stringify(value);
    if (Buffer.byteLength(Body) > 16384) throw fail('video_record_invalid', 503);
    const result = await send(PutObjectCommand, { Key: `${id.prefix}/current.json`, Body, ContentType: 'application/json', CacheControl: 'no-store', ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }) }, signal);
    return result.ETag ? { value, etag: result.ETag } : read(id, signal);
  }
  async function cleanup(id, record, signal) {
    if (!record?.value.retiredObjectKey && !record?.value.retiredThumbnailKey) return record;
    for (const key of [record.value.retiredObjectKey, record.value.retiredThumbnailKey].filter(Boolean)) await send(DeleteObjectCommand, { Key: key }, signal);
    const { retiredObjectKey, retiredThumbnailKey, ...value } = record.value;
    try { return await write(id, value, record.etag, signal); }
    catch (error) {
      if (![409, 412].includes(error.$metadata?.httpStatusCode)) throw error;
      const latest = await read(id, signal);
      if (latest && !latest.value.retiredObjectKey && !latest.value.retiredThumbnailKey && latest.value.thumbnail?.objectKey === value.thumbnail?.objectKey && latest.value.objectKey === value.objectKey && latest.value.deleted === value.deleted) return latest;
      throw fail('video_changed', 409);
    }
  }
  return { read, write, cleanup };
}
module.exports = { makeRecords };
