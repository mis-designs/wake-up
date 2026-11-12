'use strict';
const crypto = require('node:crypto');
const error = (name, status) => Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });
function storageFixture() {
  const objects = new Map(), uploads = new Map(), calls = [];
  const object = (body, mime) => ({ body: Buffer.from(body), mime, etag: '"' + crypto.createHash('md5').update(body).digest('hex') + '"' });
  const state = { objects, uploads, calls, denyWrites: false, afterWrite: null };
  state.storage = { async send(command, options = {}) {
    options.abortSignal?.throwIfAborted();
    const x = command.input, name = command.constructor.name;
    calls.push({ name, key: x.Key, part: x.PartNumber });
    if (state.denyWrites && !['GetObjectCommand', 'HeadObjectCommand', 'ListPartsCommand'].includes(name)) throw error('AccessDenied', 403);
    let obj = objects.get(x.Key), upload = uploads.get(x.UploadId), response = {};
    if (name === 'GetObjectCommand' || name === 'HeadObjectCommand') {
      if (!obj) throw error('NoSuchKey', 404);
      if (x.IfMatch && x.IfMatch !== obj.etag) throw error('PreconditionFailed', 412);
      const body = x.Range ? obj.body.subarray(0, 32) : obj.body;
      return { ContentLength: obj.body.length, ContentType: obj.mime, ETag: obj.etag,
        Body: { transformToString: async () => body.toString(), transformToByteArray: async () => body } };
    }
    if (name === 'PutObjectCommand') {
      if (x.IfNoneMatch === '*' && obj) throw error('PreconditionFailed', 412);
      if (x.IfMatch && x.IfMatch !== obj?.etag) throw error('PreconditionFailed', 412);
      objects.set(x.Key, object(x.Body, x.ContentType));
      response = { ETag: objects.get(x.Key).etag };
    } else if (name === 'CreateMultipartUploadCommand') {
      const id = crypto.randomUUID(); uploads.set(id, { key: x.Key, mime: x.ContentType, parts: new Map() }); response = { UploadId: id };
    } else if (['UploadPartCommand', 'ListPartsCommand', 'CompleteMultipartUploadCommand'].includes(name)) {
      if (!upload || upload.key !== x.Key) throw error('NoSuchUpload', 404);
      if (name === 'UploadPartCommand') {
        const part = object(x.Body); upload.parts.set(x.PartNumber, part); response = { ETag: part.etag };
      } else if (name === 'ListPartsCommand') {
        response = { IsTruncated: false, Parts: [...upload.parts].sort((a, b) => a[0] - b[0]).map(([PartNumber, p]) => ({ PartNumber, ETag: p.etag, Size: p.body.length })) };
      } else {
        const parts = x.MultipartUpload.Parts.map(({ PartNumber, ETag }, i, all) => {
          const p = upload.parts.get(PartNumber);
          if (!p || p.etag !== ETag || (i < all.length - 1 && p.body.length < 5 * 1024 * 1024)) throw error('InvalidPart', 400);
          return p.body;
        });
        objects.set(x.Key, object(Buffer.concat(parts), upload.mime)); uploads.delete(x.UploadId);
      }
    } else if (name === 'CopyObjectCommand') {
      const source = objects.get(x.CopySource.slice(x.Bucket.length + 1));
      if (!source || source.etag !== x.CopySourceIfMatch) throw error('PreconditionFailed', 412);
      objects.set(x.Key, object(source.body, x.ContentType));
    } else if (name === 'DeleteObjectCommand') objects.delete(x.Key);
    else if (name === 'DeleteObjectsCommand') for (const item of x.Delete.Objects) objects.delete(item.Key);
    else throw new Error('Unsupported fixture command ' + name);
    await state.afterWrite?.(name, x);
    return response;
  } };
  state.put = (key, body, mime = 'video/mp4') => objects.set(key, object(body, mime));
  state.sign = async (_storage, command) => 'https://qa.local/r2/' + command.input.Key;
  return state;
}
module.exports = { storageFixture };
