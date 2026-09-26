import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const code = readFileSync(new URL('../loading-ui.js', import.meta.url), 'utf8');
function fixture() {
  const listeners = {}, windowListeners = {}, probes = [], images = []; let mounted, observing;
  const document = {
    documentElement: { dataset: {} }, baseURI: 'https://fixture.local/studia-quiz', readyState: 'complete',
    addEventListener: (name, callback) => { listeners[name] = callback; }, querySelectorAll: () => images,
  };
  class Image { constructor() { probes.push(this); } }
  class MutationObserver { constructor(callback) { mounted=callback; } observe() { observing=true; } disconnect() { observing=false; } }
  vm.runInNewContext(code, { document, Image, URL, MutationObserver, window:{addEventListener:(name,callback)=>{windowListeners[name]=callback;}} });
  const add = (src, variant='panel') => {
    let url=new URL(src,document.baseURI).href;
    const image = { get src(){return url;}, set src(value){url=new URL(value,document.baseURI).href;},
      matches: selector => selector.includes('img.') || (selector==='.magic-loading-image--button' && variant==='button') || (selector==='#quiz-loading-figure-img' && variant==='quiz'),
      closest: () => ['panel','page'].includes(variant) ? {} : null,
      toggleAttribute(name,value){this[name]=value;} };
    images.push(image); return image;
  };
  const error = image => listeners.error({ target: image });
  return { document, probes, add, error, mount:image=>mounted([{addedNodes:[image]}]), load:image=>listeners.load({target:image}), windowListeners, get observing(){return observing;} };
}
test('exactly one check for each GIF also protects CSS-only controls, without task requests', () => {
  const f = fixture();
  assert.equal(f.probes.length, 2); assert.equal(f.probes[0].src, '/icons/loading_headlight.gif');assert.equal(f.probes[1].src,'/icons/loading_backup.gif');
  assert.equal(f.document.documentElement.dataset.loadingAsset, undefined);
  f.error({ matches: () => false }); assert.equal(f.probes.length, 2);
  for(const variant of ['panel','page','quiz','inline','button']) {
    const image=f.add('/icons/loading_headlight.gif',variant);f.mount(image);
    assert.ok(image.src.endsWith(['panel','page','quiz'].includes(variant)?'loading_headlight.gif':'loading_backup.gif'));
  }
});
test('one shared fallback repairs current and later loaders without a retry loop', () => {
  const f = fixture(), first = f.add('/icons/loading_headlight.gif'); f.probes[0].onerror();
  assert.ok(first.src.endsWith('/icons/loading_backup.gif')); assert.equal(f.probes.length, 2);
  assert.equal(f.probes[1].src, '/icons/loading_backup.gif'); assert.equal(f.document.documentElement.dataset.loadingAsset, 'backup');
  const late = f.add('icons/loading_headlight.gif'); f.error(late);
  assert.ok(late.src.endsWith('/icons/loading_backup.gif')); f.probes[0].onerror(); assert.equal(f.probes.length, 2);
});
test('double image failure settles on a static mark; unrelated images cannot change it', () => {
  const f = fixture(); f.error(f.add('/icons/unrelated.png')); assert.equal(f.probes.length, 2);
  f.probes[0].onerror(); f.probes[1].onerror();
  assert.equal(f.document.documentElement.dataset.loadingAsset, 'unavailable');
  const late = f.add('/icons/loading_headlight.gif'); f.error(late);
  assert.match(late.src, /^data:image\/gif;base64,/);
  f.error(f.add('/icons/loading_backup.gif')); f.error(f.add('/icons/loading_headlight.gif')); assert.equal(f.probes.length, 2);
});
test('compact GIF failure does not disable Headlight or put an unreadable Headlight in a button', () => {
  const f=fixture(),panel=f.add('/icons/loading_headlight.gif'),button=f.add('/icons/loading_backup.gif','button');
  f.probes[1].onerror();
  assert.ok(panel.src.endsWith('loading_headlight.gif'));assert.match(button.src,/^data:image\/gif;base64,/);
  assert.equal(panel['data-loading-unavailable'],false);assert.equal(button['data-loading-unavailable'],true);
  assert.equal(f.document.documentElement.dataset.loadingCompact,'unavailable');
  const late=f.add('/icons/loading_headlight.gif','inline');f.mount(late);assert.match(late.src,/^data:image\/gif;base64,/);
});
test('late legacy sources and bfcache restoration keep the correct variant without reprobes', () => {
  const f=fixture(),button=f.add('/icons/loading_headlight.gif','button');f.load(button);assert.ok(button.src.endsWith('loading_backup.gif'));
  f.windowListeners.pagehide();assert.equal(f.observing,false);
  f.windowListeners.pageshow();assert.equal(f.observing,true);assert.equal(f.probes.length,2);
});
