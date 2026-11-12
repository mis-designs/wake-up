const { test } = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { makeService, identity, ACTIONS } = require('../lib/quiz-video.cjs');
const { storageFixture } = require('./fixtures/video-r2.cjs');
const row = { id: 'quiz-1', question: 'Il veicolo può transitare?', correct: true, figure: 'fig1.png' };
function fixture() {
  const f = storageFixture(), service = makeService({ storage: f.storage, bucket: 'fixture', secret: 'test', sign: f.sign });
  f.run = (action, data = {}, extra = {}) => service({ action, row, master: true, owner: 'admin', data, ...extra });
  f.start = (data = {}) => f.run('createQuizVideoUpload', { bytes: 64, mime: 'video/mp4', duration: 30, fileName: 'Video originale.mp4', originalBytes: 128, compression: 'lossless', ...data });
  f.upload = ticket => { const b = Buffer.alloc(64); b.write('ftyp', 4); f.put(new URL(ticket.uploadUrl).pathname.slice('/r2/'.length), b); };
  f.confirm = ticket => f.run('confirmQuizVideoUpload', { uploadToken: ticket.uploadToken });
  f.publish = async data => { const ticket = await f.start(data); f.upload(ticket); return f.confirm(ticket); };
  f.metadataKey = identity(row).prefix + '/current.json';
  f.record = () => JSON.parse(f.objects.get(f.metadataKey).body);
  return f;
}
test('all mutations require master before any storage request; public lookups never disclose archive metadata', async () => {
  const f = fixture();
  for (const action of [...ACTIONS].filter(x => x !== 'getQuizVideo')) await assert.rejects(f.run(action, {}, { master: false }), /master_admin_required/);
  assert.equal(f.calls.length, 0);
  const master = await f.publish();
  const count = f.calls.length, publicResult = await f.run('getQuizVideo', {}, { master: false });
  assert.equal(f.calls.length - count, 1); assert.equal(publicResult.available, true); assert.equal(publicResult.archive, undefined); assert.equal(publicResult.revision, undefined);
  assert.equal(master.archive.prefix, identity(row).prefix + '/');
  assert.equal(f.record().question, row.question); assert.equal(f.record().fileName, 'Video originale.mp4'); assert.equal(f.record().answer, true);
});
test('replacement keeps current video until verified commit, then deletes exactly the old file', async () => {
  const f = fixture(), old = await f.publish(), oldKey = f.record().objectKey;
  const ticket = await f.start({ expectedRevision: old.revision, fileName: 'Versione 2.mp4' });
  assert.equal((await f.run('getQuizVideo')).url, old.url); assert.ok(f.objects.has(oldKey));
  f.upload(ticket); const offset = f.calls.length, next = await f.confirm(ticket), operations = f.calls.slice(offset);
  assert.equal(next.saved, true); assert.notEqual(next.url, old.url); assert.equal(next.cleanupPending, false);
  assert.equal(f.objects.has(oldKey), false); assert.equal(f.record().fileName, 'Versione 2.mp4');
  assert.ok(operations.findIndex(c => c.name === 'PutObjectCommand' && c.key === f.metadataKey) < operations.findIndex(c => c.name === 'DeleteObjectCommand' && c.key === oldKey));
  assert.equal([...f.objects.keys()].filter(k => k.endsWith('.mp4')).length, 1);
  assert.equal(operations.filter(c => c.name === 'PutObjectCommand').length, 2); // commit + cleanup, no fan-out
  const before = f.calls.length; assert.equal((await f.confirm(ticket)).url, next.url);
  assert.equal(f.calls.length - before, 1); // repeated confirmation only reads metadata
});
test('failed replacement leaves old video untouched; concurrent revision cannot overwrite the winner', async () => {
  const f = fixture(), old = await f.publish(), a = await f.start({ expectedRevision: old.revision }), b = await f.start({ expectedRevision: old.revision });
  await assert.rejects(f.confirm(a), /video_upload_not_received/); assert.equal((await f.run('getQuizVideo')).url, old.url);
  f.upload(a); f.upload(b); const winner = await f.confirm(a);
  await assert.rejects(f.confirm(b), /video_changed/); assert.equal((await f.run('getQuizVideo')).url, winner.url);
  await assert.rejects(f.start({ expectedRevision: old.revision }), /video_changed/);
});
test('removal is idempotent, deletes the file, retains a tombstone, and rejects old upload tickets', async () => {
  const f = fixture(), old = await f.publish(), late = await f.start({ expectedRevision: old.revision }); f.upload(late);
  const oldKey = f.record().objectKey, data = { expectedRevision: old.revision, operationId: crypto.randomUUID() };
  const result = await f.run('deleteQuizVideo', data);
  assert.equal(result.removed, true); assert.equal(result.available, false); assert.equal(result.cleanupPending, false); assert.ok(!f.objects.has(oldKey)); assert.equal(f.record().deleted, true);
  assert.equal((await f.run('getQuizVideo', {}, { master: false })).available, false);
  const before = f.calls.length; assert.equal((await f.run('deleteQuizVideo', data)).removed, true); assert.equal(f.calls.length - before, 1);
  await assert.rejects(f.confirm(late), /video_changed/);
  const next = await f.publish({ expectedRevision: result.revision }); assert.equal(next.available, true);
  await assert.rejects(f.run('deleteQuizVideo', data), /video_changed/); assert.equal((await f.run('getQuizVideo')).url, next.url);
});
test('lost delete response reconciles with same operation ID without repeating publication or deleting a new video', async () => {
  const f = fixture(), old = await f.publish(), data = { expectedRevision: old.revision, operationId: crypto.randomUUID() };
  let lost = false;
  f.afterWrite = async (name, x) => { if (name === 'PutObjectCommand' && x.Key === f.metadataKey && !lost) { lost = true; throw Error('connection_lost'); } };
  await assert.rejects(f.run('deleteQuizVideo', data), /connection_lost/); assert.equal(f.record().deleted, true);
  assert.equal((await f.run('deleteQuizVideo', data)).removed, true); assert.equal([...f.objects.keys()].filter(k => k.endsWith('.mp4')).length, 0);
});
test('interrupted old-file cleanup is explicit and retryable, with no further uploads until cleanup', async () => {
  const f = fixture(), old = await f.publish(), oldKey = f.record().objectKey, originalSend = f.storage.send;
  f.storage.send = async (...args) => { if (args[0].constructor.name === 'DeleteObjectCommand' && args[0].input.Key === oldKey) throw Error('temporary_failure'); return originalSend(...args); };
  const next = await f.publish({ expectedRevision: old.revision });
  assert.equal(next.available, true); assert.equal(next.cleanupPending, true); assert.ok(f.objects.has(oldKey));
  await assert.rejects(f.start({ expectedRevision: next.revision }), /video_cleanup_required/);
  f.storage.send = originalSend;
  const result = await f.run('cleanupQuizVideo', { expectedRevision: next.revision });
  assert.equal(result.cleaned, true); assert.equal(result.cleanupPending, false); assert.ok(!f.objects.has(oldKey)); assert.equal(result.url, next.url);
});
test('legacy metadata remains playable and manageable without scanning or migration', async () => {
  const f = fixture(), id = identity(row), objectKey = `${id.prefix}/${crypto.randomUUID()}.mp4`;
  f.put(f.metadataKey, JSON.stringify({ key: id.key, objectKey, bytes: 64, duration: 30 }), 'application/json'); f.put(objectKey, Buffer.alloc(64));
  const result = await f.run('getQuizVideo'); assert.equal(result.available, true); assert.equal(result.archive.objectKey, objectKey); assert.equal(f.calls.length, 1);
  await f.run('deleteQuizVideo', { expectedRevision: result.revision, operationId: crypto.randomUUID() }); assert.ok(!f.objects.has(objectKey));
});
test('tampered retired paths cannot delete outside the quiz folder', async () => {
  const f = fixture(), old = await f.publish(), value = { ...f.record(), retiredObjectKey: 'books/private.pdf' };
  f.put(f.metadataKey, JSON.stringify(value), 'application/json');
  const before = f.calls.length; await assert.rejects(f.run('cleanupQuizVideo', { expectedRevision: old.revision }), /video_record_invalid/);
  assert.equal(f.calls.slice(before).some(c => c.name === 'DeleteObjectCommand'), false);
});
test('two simultaneous replacement commits have one winner and remove only the losing copy', async () => {
  const f = fixture(), old = await f.publish();
  const a = await f.start({ expectedRevision: old.revision }), b = await f.start({ expectedRevision: old.revision }); f.upload(a); f.upload(b);
  const send = f.storage.send; let waiting = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  f.storage.send = async (...args) => {
    const command = args[0];
    if (command.constructor.name === 'PutObjectCommand' && command.input.IfMatch === old.revision) { if (++waiting === 2) release(); await gate; }
    return send(...args);
  };
  const results = await Promise.allSettled([f.confirm(a), f.confirm(b)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /video_changed/);
  const current = f.record(); assert.ok(f.objects.has(current.objectKey));
  assert.equal([...f.objects.keys()].filter(k => k.startsWith(identity(row).prefix) && k.endsWith('.mp4')).length, 1);
});
