const { test } = require('node:test'), assert = require('node:assert/strict');
const { storageFixture } = require('./fixtures/video-r2.cjs');
const { makeService, runRequest, identity } = require('../lib/quiz-video.cjs');
const { CHUNK_BYTES } = require('../lib/quiz-video-relay.cjs');
const row = { question: 'La carreggiata non comprende le piste ciclabili', figure: '', correct: 1 };
function fixture(bytes = 11 * 1024 * 1024) {
  const f = storageFixture(), body = Buffer.alloc(bytes, 42); body.write('ftyp', 4);
  let clock = Date.now();
  const service = makeService({ storage: f.storage, bucket: 'bucket', secret: 'fixture', sign: f.sign, now: () => clock });
  const call = (action, data = {}, extra = {}) => runRequest({ action, row, master: true, owner: 'fixture', data, ...extra }, () => service);
  const start = () => call('createQuizVideoUpload', { bytes, duration: 30, mime: 'video/mp4', transport: 'relay' });
  const chunk = (ticket, index) => call('uploadQuizVideoChunk', { uploadToken: ticket.uploadToken, chunkIndex: index, chunkBase64: body.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).toString('base64') });
  return { ...f, body, call, start, chunk, expire: () => { clock += 16 * 60 * 1000; } };
}
test('relay rebuilds exact bytes, uses valid R2 parts, publishes once and removes temporary halves', async () => {
  const f = fixture(), ticket = await f.start(); assert.equal(ticket.chunkBytes, CHUNK_BYTES);
  for (let index = 0; index < Math.ceil(f.body.length / CHUNK_BYTES); index++) {
    const result = await f.chunk(ticket, index); assert.deepEqual(result, { received: true, nextChunk: index + 1 });
  }
  const result = await f.call('confirmQuizVideoUpload', ticket); assert.equal(result.saved, true);
  const key = new URL(result.url).pathname.slice('/r2/'.length);
  assert.deepEqual(f.objects.get(key).body, f.body); assert.equal(f.uploads.size, 0);
  assert.equal([...f.objects.keys()].some(k => k.startsWith('xyz3d/pending/')), false);
  const count = f.calls.length;
  assert.equal((await f.call('confirmQuizVideoUpload', ticket)).url, result.url);
  assert.equal(f.calls.length, count + 1, 'confirmation replay only reads the committed association');
  await assert.rejects(f.chunk(ticket, 0), /video_already_exists/);
  await assert.rejects(f.start(), /video_already_exists/);
});
test('missing parts cannot publish; a lost part response resumes without reuploading acknowledged chunks', async () => {
  const f = fixture(6 * 1024 * 1024), ticket = await f.start();
  await f.chunk(ticket, 0);
  await assert.rejects(f.call('confirmQuizVideoUpload', ticket), /video_upload_incomplete/);
  f.afterWrite = null;
  // Simulate a response lost after R2 accepted the part.
  let lost = true;
  f.storage.send = ((send) => async (...args) => { const result = await send(...args); if (args[0].constructor.name === 'UploadPartCommand' && lost) { lost = false; throw new Error('lost_response'); } return result; })(f.storage.send);
  await assert.rejects(f.chunk(ticket, 1), /lost_response/);
  await f.chunk(ticket, 1); await f.chunk(ticket, 2);
  assert.equal((await f.call('confirmQuizVideoUpload', ticket)).saved, true);
  assert.equal(f.calls.filter(c => c.name === 'CreateMultipartUploadCommand').length, 1);
  assert.equal(f.calls.filter(c => c.name === 'PutObjectCommand' && c.key.endsWith('.first')).length, 1);
});
test('lost complete response can be reconciled from HEAD without a second completion', async () => {
  const f = fixture(64), ticket = await f.start(); await f.chunk(ticket, 0);
  let lost = true;
  f.storage.send = ((send) => async (...args) => { const result = await send(...args); if (args[0].constructor.name === 'CompleteMultipartUploadCommand' && lost) { lost = false; throw new Error('lost_complete'); } return result; })(f.storage.send);
  await assert.rejects(f.call('confirmQuizVideoUpload', ticket), /lost_complete/);
  assert.equal((await f.call('confirmQuizVideoUpload', ticket)).saved, true);
  assert.equal(f.calls.filter(c => c.name === 'CompleteMultipartUploadCommand').length, 1);
});
test('every relay chunk enforces master, ticket owner/identity/expiry and exact chunk bounds', async () => {
  const f = fixture(64), ticket = await f.start();
  const payload = { uploadToken: ticket.uploadToken, chunkIndex: 0, chunkBase64: f.body.toString('base64') };
  for (const extra of [{ master: false }, { owner: 'other' }, { row: { ...row, correct: 0 } }, { row: { ...row, figure: '2' } }]) await assert.rejects(f.call('uploadQuizVideoChunk', payload, extra), /master_admin_required|video_upload_invalid/);
  for (const overrides of [{ chunkIndex: -1 }, { chunkIndex: 1 }, { chunkIndex: 0.5 }, { chunkBase64: 'a'.repeat(4) }, { chunkBase64: '!'.repeat(payload.chunkBase64.length) }, { uploadToken: ticket.uploadToken + 'x' }]) await assert.rejects(f.call('uploadQuizVideoChunk', { ...payload, ...overrides }), /video_chunk_invalid|video_upload_invalid/);
  f.expire(); await assert.rejects(f.chunk(ticket, 0), /video_upload_expired/);
  assert.equal(f.calls.filter(c => c.name === 'UploadPartCommand').length, 0);
});
test('write permission is verified by relay creation and returns a specific safe error', async () => {
  const f = fixture(64); f.storage.send = async command => {
    if (command.constructor.name === 'GetObjectCommand') throw Object.assign(new Error('private'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
    throw Object.assign(new Error('private credential details'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
  };
  await assert.rejects(f.start(), e => e.message === 'video_storage_denied' && e.statusCode === 409);
});
test('direct uploads keep their existing efficient path and advertise recovery support', async () => {
  const f = fixture(64), ticket = await f.call('createQuizVideoUpload', { bytes: 64, duration: 30, mime: 'video/mp4' });
  assert.equal(ticket.relaySupported, true); assert.equal(f.calls.length, 1);
  f.put(new URL(ticket.uploadUrl).pathname.slice('/r2/'.length), f.body);
  assert.equal((await f.call('confirmQuizVideoUpload', ticket)).saved, true);
  assert.equal(f.calls.some(c => /Multipart|UploadPart/.test(c.name)), false);
  assert.ok(f.objects.has(identity(row).prefix + '/current.json'));
});
test('chunk JSON remains under the Vercel request limit at the largest legal chunk', () => {
  assert.ok(Buffer.byteLength(JSON.stringify({ video: { chunkBase64: Buffer.alloc(CHUNK_BYTES).toString('base64'), uploadToken: 'x'.repeat(4096) }, question: 'x'.repeat(1500), accessToken: 'x'.repeat(4096) })) < 4_500_000);
});
