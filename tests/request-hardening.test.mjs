import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const phone = '39123456789', removedPhone = '39987654321', deviceId = 'fixture_device';
Object.assign(process.env, {
  SESSION_SECRET: 'security-fixture', ADMIN_PHONE_NUMBERS: phone,
  GAS_ACCESS_URL: 'https://access.invalid', GAS_SECRET: 'fixture', GAS_ADMIN_KEY: 'fixture',
  QUIZ_GAS_URL: 'https://quiz.invalid', QUIZ_PROXY_SECRET: 'fixture',
  BOOK_R2_BUCKET: 'fixture', BOOK_R2_ACCOUNT_ID: 'fixture',
  BOOK_R2_ACCESS_KEY_ID: 'fixture', BOOK_R2_SECRET_ACCESS_KEY: 'fixture'
});
const { default: admin, verifyAdminToken } = await import('../api/admin.js');
const { default: auth } = await import('../api/auth.js');
const { default: pages } = await import('../api/getPages.js');
const { default: quiz } = await import('../api/quiz.js');
const sign = payload => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return encoded + '.' + crypto.createHmac('sha256', process.env.SESSION_SECRET).update(encoded).digest('base64url');
};
const session = (who = phone, role = 'admin') => ({ phone: who, sessionPhone: who, deviceId,
  accessToken: sign({ purpose: 'access', phone: who, deviceId, role, exp: Date.now() + 60000 }) });
async function call(handler, body, headers = {}) {
  const res = { code: 200, headers: {}, setHeader(k,v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: 'POST', body, headers }, res);
  return res;
}
test('revoked admin token cannot read or mutate accounts, or upload/delete audio', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ success: true }); });
  for (const action of ['list', 'create', 'update', 'delete', 'reset_devices']) {
    const res = await call(admin, { ...session(removedPhone), action });
    assert.equal(res.code, 403, action); assert.equal(res.body.error, 'admin_required');
  }
  for (const action of ['saveQuizAudio', 'createQuizAudioUpload', 'deleteQuizAudio', 'getQuizAudioAdminOverview']) {
    const res = await call(quiz, { ...session(removedPhone), action });
    assert.equal(res.code, 403, action); assert.equal(res.body.error, 'admin_forbidden');
  }
  assert.equal(calls, 0, 'rejected sessions never reach external services');
});
test('current admin still lists users once; ordinary users cannot gain admin rights', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ success: true, list: [] }); });
  const res = await call(admin, { ...session(), action: 'list' });
  assert.equal(res.code, 200); assert.equal(res.body.success, true); assert.equal(calls, 1);
  const denied = await call(admin, { ...session(phone, 'user'), action: 'delete' });
  assert.equal(denied.code, 403); assert.equal(calls, 1);
});
test('quiz session refresh preserves current roles and downgrades removed administrators without extra reads', async t => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('valid token needs no remote read'); });
  for (const [who, role, expected] of [[phone,'admin','admin'],[removedPhone,'admin','user'],[phone,'user','user']]) {
    const res = await call(quiz, { ...session(who, role), action: 'refreshQuizSession' });
    assert.equal(res.code, 200);
    assert.equal(JSON.parse(Buffer.from(res.body.quizSessionToken.split('.')[0], 'base64url')).role, expected);
    assert.equal(res.headers['cdn-cache-control'], 'no-store');
    assert.equal(res.headers['vercel-cdn-cache-control'], 'no-store');
  }
});
test('malformed and oversized JSON is rejected before contacting any service', async t => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('invalid body contacted upstream'); });
  for (const handler of [admin, auth, pages]) {
    for (const body of ['{', 'null', '[]', '7', '"text"', [], 7]) {
      const res = await call(handler, body); assert.equal(res.code, 400, JSON.stringify(body));
    }
    for (const body of [' '.repeat(17000) + '{}', { text: 'a'.repeat(17000) }]) {
      assert.equal((await call(handler, body)).code, 413);
    }
    assert.equal((await call(handler, {}, { 'content-length': '20000' })).code, 413);
  }
});
test('signed malformed claims fail closed without throwing', () => {
  for (const claims of [null, [], { purpose:'access', phone, deviceId, role:'admin', exp:'never' }]) {
    assert.equal(verifyAdminToken(sign(claims), phone, deviceId).ok, false);
  }
});
