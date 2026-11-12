const test = require('node:test');
const assert = require('node:assert/strict');
const { storageConfig, runRequest, makeService } = require('../lib/quiz-video.cjs');
const row = { question: 'La carreggiata non comprende le piste ciclabili', correct: 1, figure: '' };
const keys = prefix => ({ [prefix + '_ACCOUNT_ID']: 'account', [prefix + '_ACCESS_KEY_ID']: 'access', [prefix + '_SECRET_ACCESS_KEY']: 'secret' });

test('storage credentials remain complete, scoped groups', () => {
  const expected = { account: 'account', accessKeyId: 'access', secretAccessKey: 'secret', bucket: 'magicbook-assets' };
  assert.deepEqual(storageConfig({ ...keys('BOOK_R2'), BOOK_R2_BUCKET: 'magicbook-assets' }), expected);
  assert.throws(() => storageConfig({ ...keys('BOOK_R2'), BOOK_R2_BUCKET: 'private-books' }), /not_configured/);
  assert.throws(() => storageConfig(keys('BOOK_R2')), /not_configured/);
  assert.throws(() => storageConfig({ R2_ACCOUNT_ID: 'a', EXPLANATION_R2_ACCESS_KEY_ID: 'b', QUIZ_AUDIO_R2_SECRET_ACCESS_KEY: 'c' }), /not_configured/);
  assert.throws(() => storageConfig({ ...keys('R2'), QUIZ_VIDEO_R2_ACCOUNT_ID: 'partial' }), /not_configured/);
  assert.deepEqual(storageConfig({ ...keys('QUIZ_AUDIO_R2'), QUIZ_AUDIO_R2_BUCKET: 'wrong', ...keys('BOOK_R2'), BOOK_R2_BUCKET: 'magicbook-assets' }), expected);
  assert.equal(storageConfig({ ...keys('QUIZ_VIDEO_R2'), QUIZ_VIDEO_R2_BUCKET: 'explicit-video' }).bucket, 'explicit-video');
});

test('verified master retains upload action when storage cannot be inspected', async () => {
  for (const [error, code] of [
    [new Error('video_storage_not_configured'), 'video_storage_not_configured'],
    [Object.assign(new Error('private details'), { name: 'AccessDenied' }), 'video_storage_denied'],
    [Object.assign(new Error('private details'), { name: 'NoSuchBucket' }), 'video_storage_bucket_missing'],
    [new Error('private endpoint failure'), 'video_storage_unavailable']
  ]) {
    const result = await runRequest({ action: 'getQuizVideo', row, master: true }, () => { throw error; });
    assert.deepEqual(result, { available: false, availability: 'unknown', canUpload: true, error: code });
    assert.equal(JSON.stringify(result).includes('private'), false);
    for (const master of [false, undefined]) await assert.rejects(runRequest({ action: 'getQuizVideo', row, master }, () => { throw error; }), e => e === error);
    for (const action of ['createQuizVideoUpload', 'uploadQuizVideoChunk', 'confirmQuizVideoUpload']) await assert.rejects(runRequest({ action, row, master: true }, () => { throw error; }), e => error.name === 'AccessDenied' ? e.message === 'video_storage_denied' && e.statusCode === 409 : e === error);
  }
});

test('validation, cancellation and successful results retain their meanings', async () => {
  const factory = () => async () => ({ available: false, canUpload: true });
  assert.deepEqual(await runRequest({ action: 'getQuizVideo', row, master: true }, factory), { available: false, canUpload: true });
  await assert.rejects(runRequest({ action: 'getQuizVideo', row: {}, master: true }, factory), /video_question_unavailable/);
  await assert.rejects(runRequest({ action: 'getQuizVideo', row: { question: 'No answer' }, master: true }, factory), /video_answer_unavailable/);
  const error = Object.assign(new Error('cancelled'), { name: 'AbortError' });
  await assert.rejects(runRequest({ action: 'getQuizVideo', row, master: true }, () => { throw error; }), e => e === error);
});

test('missing bucket is not interpreted as an absent video', async () => {
  const storage = { send: async () => { throw Object.assign(new Error('NoSuchBucket'), { name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } }); } };
  const service = makeService({ storage, bucket: 'fixture', secret: 'fixture' });
  const result = await runRequest({ action: 'getQuizVideo', row, master: true }, () => service);
  assert.equal(result.error, 'video_storage_bucket_missing');
  assert.equal(result.availability, 'unknown');
});
