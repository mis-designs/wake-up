'use strict';
const { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
function makeRecords(send, fail) {
  async function read(id, signal) {
    try {
      const result = await send(GetObjectCommand, { Key: `${id.prefix}/current.json` }, signal);
      if (result.ContentLength > 16384) throw fail('video_record_invalid', 503);
      const value = JSON.parse(await result.Body.transformToString());
      const validKey = key => typeof key === 'string' && new RegExp(`^${id.prefix}/[a-f0-9-]{36}\\.mp4$`).test(key);
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
    if (!record?.value.retiredObjectKey) return record;
    await send(DeleteObjectCommand, { Key: record.value.retiredObjectKey }, signal);
    const { retiredObjectKey, ...value } = record.value;
    try { return await write(id, value, record.etag, signal); }
    catch (error) {
      if (![409, 412].includes(error.$metadata?.httpStatusCode)) throw error;
      const latest = await read(id, signal);
      if (latest && !latest.value.retiredObjectKey && latest.value.objectKey === value.objectKey && latest.value.deleted === value.deleted) return latest;
      throw fail('video_changed', 409);
    }
  }
  return { read, write, cleanup };
}
module.exports = { makeRecords };
