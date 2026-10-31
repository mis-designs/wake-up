import test from 'node:test';
import assert from 'node:assert/strict';
import { INTRO_WINDOW, introKey, readIntro, nextIntro, reserveIntro, acknowledgeIntro } from '../quizbank-intro-policy.mjs';
const now = Date.UTC(2026, 9, 31);
const memory = () => { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) }; };
test('four automatic visits maximum, without a daily reset', () => {
  let raw = null;
  for (let i = 1; i <= 4; i++) {
    const state = nextIntro(raw, now + (i - 1) * 3600000);
    assert.equal(state.count, i); assert.equal(state.firstSeen, now);
    raw = JSON.stringify(state);
  }
  assert.equal(nextIntro(raw, now + 86400000), null);
});
test('three days measured from first display; boundary and clock rollback do not restart it', () => {
  const raw = JSON.stringify(nextIntro(null, now));
  assert.ok(nextIntro(raw, now + INTRO_WINDOW - 1));
  assert.equal(nextIntro(raw, now + INTRO_WINDOW), null);
  assert.equal(nextIntro(raw, now + INTRO_WINDOW * 2), null);
  assert.equal(nextIntro(raw, now - 1), null);
});
test('acknowledging stops future visits without erasing another account preference', () => {
  const storage = memory(), a = introKey('393310000000'), b = introKey('393310000001');
  assert.notEqual(a, b); assert.ok(!a.includes('393310000000'));
  assert.equal(introKey('+39 331 0000000'), a);
  assert.equal(reserveIntro(storage, a, now), true);
  assert.equal(acknowledgeIntro(storage, a), true);
  assert.equal(reserveIntro(storage, a, now + 1), false);
  assert.equal(reserveIntro(storage, b, now + 1), true);
  assert.equal(readIntro(storage.getItem(a)).acknowledged, true);
});
test('explicit acknowledgement works even before an automatic impression', () => {
  const storage = memory(), key = introKey('393310000000');
  assert.equal(acknowledgeIntro(storage, key), true);
  assert.equal(reserveIntro(storage, key, now), false);
});
test('unavailable or silently failing storage suppresses automatic presentation', () => {
  assert.equal(reserveIntro({ getItem() { throw Error('blocked'); } }, 'key', now), false);
  assert.equal(reserveIntro({ getItem: () => null, setItem() {} }, 'key', now), false);
  assert.equal(acknowledgeIntro({ getItem() { throw Error('blocked'); } }, 'key'), false);
  assert.equal(reserveIntro(memory(), null, now), false);
});
test('malformed counters never generate unlimited popups', () => {
  for (const raw of ['', '{}', 'null', '[]', 'bad', '{"count":-1}', '{"firstSeen":null,"count":1,"acknowledged":false}', '{"firstSeen":0,"count":5,"acknowledged":false}', '{"firstSeen":0,"count":0.5,"acknowledged":false}']) assert.equal(nextIntro(raw, now), null, raw);
});
