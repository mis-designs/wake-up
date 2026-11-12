'use strict';
const { CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
// 2.5 MiB becomes <3.5 MiB of JSON, below Vercel's 4.5 MB request limit.
// Two browser chunks form one R2 part (minimum 5 MiB except the final part).
const CHUNK_BYTES = 5 * 1024 * 1024 / 2, PART_BYTES = CHUNK_BYTES * 2;
function createRelay(send, fail) {
  const halfKey = (key, part) => `${key}.part-${part}.first`;
  async function begin(key, signal) {
    const result = await send(CreateMultipartUploadCommand, { Key: key, ContentType: 'video/mp4' }, signal);
    if (typeof result.UploadId !== 'string' || !result.UploadId || result.UploadId.length > 2048) throw fail('video_storage_unavailable', 503);
    return result.UploadId;
  }
  async function chunk(value, key, data, signal) {
    const index = data.chunkIndex, count = Math.ceil(value.bytes / CHUNK_BYTES);
    if (!Number.isSafeInteger(index) || index < 0 || index >= count) throw fail('video_chunk_invalid');
    const expected = Math.min(CHUNK_BYTES, value.bytes - index * CHUNK_BYTES);
    if (typeof data.chunkBase64 !== 'string' || data.chunkBase64.length !== 4 * Math.ceil(expected / 3)
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.chunkBase64)) throw fail('video_chunk_invalid');
    const body = Buffer.from(data.chunkBase64, 'base64');
    if (body.length !== expected) throw fail('video_chunk_invalid');
    const part = Math.floor(index / 2) + 1;
    if (index % 2 === 0 && index + 1 < count) {
      await send(PutObjectCommand, { Key: halfKey(key, part), Body: body, ContentType: 'application/octet-stream', CacheControl: 'no-store' }, signal);
    } else {
      let payload = body;
      if (index % 2 === 1) {
        let first;
        try { first = await send(GetObjectCommand, { Key: halfKey(key, part) }, signal); }
        catch (error) { if (error.$metadata?.httpStatusCode === 404) throw fail('video_upload_incomplete', 409); throw error; }
        if (Number(first.ContentLength) !== CHUNK_BYTES) throw fail('video_chunk_invalid');
        const firstBytes = Buffer.from(await first.Body.transformToByteArray());
        if (firstBytes.length !== CHUNK_BYTES) throw fail('video_chunk_invalid');
        payload = Buffer.concat([firstBytes, body]);
      }
      await send(UploadPartCommand, { Key: key, UploadId: value.relayUploadId, PartNumber: part, Body: payload, ContentLength: payload.length }, signal);
      // Keep the first half until publication: a lost response can safely repeat
      // this exact part on the user's next click, without restarting the upload.
    }
    return { received: true, nextChunk: index + 1 };
  }
  async function complete(value, key, signal) {
    const result = await send(ListPartsCommand, { Key: key, UploadId: value.relayUploadId, MaxParts: 1000 }, signal);
    const parts = result.Parts || [], count = Math.ceil(value.bytes / PART_BYTES);
    if (result.IsTruncated || parts.length !== count || parts.some((part, i) => part.PartNumber !== i + 1 || !part.ETag
      || Number(part.Size) !== Math.min(PART_BYTES, value.bytes - i * PART_BYTES))) throw fail('video_upload_incomplete', 409);
    await send(CompleteMultipartUploadCommand, { Key: key, UploadId: value.relayUploadId,
      MultipartUpload: { Parts: parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })) } }, signal);
  }
  async function cleanup(value, key, signal) {
    // One bounded cleanup; at most 26 temporary first halves at 128 MiB.
    const count = Math.floor((Math.ceil(value.bytes / CHUNK_BYTES)) / 2);
    if (!count || signal?.aborted) return;
    await send(DeleteObjectsCommand, { Delete: { Objects: Array.from({ length: count }, (_, i) => ({ Key: halfKey(key, i + 1) })), Quiet: true } }, signal);
  }
  return { begin, chunk, complete, cleanup };
}
module.exports = { CHUNK_BYTES, PART_BYTES, createRelay };
