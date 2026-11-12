const { test } = require('node:test');
const assert = require('node:assert/strict');
const { S3Client } = require('@aws-sdk/client-s3');
const video = require('../lib/quiz-video.cjs');

test('production presigner does not sign the checksum of an empty body for browser uploads', async t => {
  const names = ['QUIZ_VIDEO_R2_ACCOUNT_ID', 'QUIZ_VIDEO_R2_ACCESS_KEY_ID', 'QUIZ_VIDEO_R2_SECRET_ACCESS_KEY', 'QUIZ_VIDEO_R2_BUCKET', 'SESSION_SECRET'];
  const previous = names.map(name => process.env[name]);
  names.forEach(name => { process.env[name] = 'fixture'; });
  t.after(() => names.forEach((name, i) => previous[i] === undefined ? delete process.env[name] : process.env[name] = previous[i]));
  let reads = 0;
  t.mock.method(S3Client.prototype, 'send', async command => {
    assert.equal(command.constructor.name, 'GetObjectCommand'); reads++;
    throw Object.assign(new Error('missing'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
  });
  const result = await video.configuredService()({ action: 'createQuizVideoUpload', row: { question: 'La carreggiata non comprende le piste ciclabili', correct: 1, figure: '' }, master: true, owner: 'fixture', data: { bytes: 1024, mime: 'video/mp4', duration: 38 } });
  const url = new URL(result.uploadUrl);
  assert.equal(reads, 1);
  assert.equal(url.searchParams.has('x-amz-checksum-crc32'), false);
  assert.equal(url.searchParams.has('x-amz-sdk-checksum-algorithm'), false);
  assert.match(url.searchParams.get('X-Amz-SignedHeaders'), /content-length/);
  assert.ok(url.searchParams.has('X-Amz-Signature'));
  assert.equal(url.searchParams.get('X-Amz-Expires'), '900');
  assert.ok(result.uploadToken);
});
