import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const code = readFileSync(new URL('../loading-ui.js', import.meta.url), 'utf8');
function fixture() {
  const listeners = {}, probes = [], images = [];
  const document = {
    documentElement: { dataset: {} }, baseURI: 'https://fixture.local/studia-quiz', readyState: 'complete',
    addEventListener: (name, callback) => { listeners[name] = callback; }, querySelectorAll: () => images,
  };
  class Image { constructor() { probes.push(this); } }
  vm.runInNewContext(code, { document, Image, URL });
  const add = src => { const image = { src, matches: () => true }; images.push(image); return image; };
  const error = image => listeners.error({ target: image });
  return { document, probes, add, error };
}
test('one primary probe; backup is not requested on the healthy path', () => {
  const f = fixture();
  assert.equal(f.probes.length, 1); assert.equal(f.probes[0].src, '/icons/loading_headlight.gif');
  assert.equal(f.document.documentElement.dataset.loadingAsset, undefined);
  f.error({ matches: () => false }); assert.equal(f.probes.length, 1);
});
test('one shared fallback repairs current and later loaders without a retry loop', () => {
  const f = fixture(), first = f.add('/icons/loading_headlight.gif'); f.probes[0].onerror();
  assert.equal(first.src, '/icons/loading_backup.gif'); assert.equal(f.probes.length, 2);
  assert.equal(f.probes[1].src, '/icons/loading_backup.gif'); assert.equal(f.document.documentElement.dataset.loadingAsset, 'backup');
  const late = f.add('icons/loading_headlight.gif'); f.error(late);
  assert.equal(late.src, '/icons/loading_backup.gif'); f.probes[0].onerror(); assert.equal(f.probes.length, 2);
});
test('double image failure settles on a static mark; unrelated images cannot change it', () => {
  const f = fixture(); f.error(f.add('/icons/unrelated.png')); assert.equal(f.probes.length, 1);
  f.probes[0].onerror(); f.probes[1].onerror();
  assert.equal(f.document.documentElement.dataset.loadingAsset, 'unavailable');
  const late = f.add('/icons/loading_headlight.gif'); f.error(late);
  assert.match(late.src, /^data:image\/gif;base64,/);
  f.error(f.add('/icons/loading_backup.gif')); f.error(f.add('/icons/loading_headlight.gif')); assert.equal(f.probes.length, 2);
});
