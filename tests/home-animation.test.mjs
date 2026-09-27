import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import items from '../assets/home-animations/catalog.mjs';
const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 12);
test('Home collection matches every supplied image and cache revisions match the real bytes', () => {
  const folder = 'icons/Home Page Animation/';
  const names = readdirSync(new URL(folder, root)).filter(name => /\.(gif|svg|png|jpe?g|webp|avif|tiff?)$/i.test(name)).sort();
  assert.deepEqual(items.map(item => item.id), names, 'run npm run build:home-animations after changing the folder');
  assert.ok(items.length >= 2);
  const worker = read('service-worker.js');
  for (const item of items) {
    assert.equal(item.sourceHash, hash(readFileSync(new URL(folder + item.id, root))));
    for (const asset of [item.src, item.poster]) {
      const url = new URL(asset, 'https://fixture.local');
      const bytes = readFileSync(new URL(decodeURIComponent(url.pathname).slice(1), root));
      assert.equal(url.searchParams.get('v'), hash(bytes));
      assert.ok(worker.includes(JSON.stringify(asset)));
    }
    assert.equal(existsSync(new URL('icons/' + item.id, root)), false, 'originals moved, not duplicated');
  }
  const revision = hash(read('assets/home-animations/catalog.mjs'));
  assert.ok(read('home-animation.js').includes(`catalog.mjs?v=${revision}`));
  assert.ok(read('home-offers.js').includes(`home-animation.js?v=3-loop&art=${revision}`));
  assert.ok(read('index.html').includes(`home-offers.js?v=5-motion&art=${revision}`));
});
test('Home decoration loops while active, stays preference-aware and scoped to the browser owner', () => {
  const js = read('home-animation.js');
  assert.match(js, /catalogPromise \|\|=/);
  assert.match(js, /generation/);
  assert.match(js, /android-webview/);
  assert.match(js, /prefers-reduced-motion/);
  assert.match(js, /data-native-motion-paused/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /pagehide/);
  assert.match(js, /observer.disconnect/);
  assert.doesNotMatch(js, /4500|played/);
  assert.match(js, /setTimeout\(fail, 8000\)/, 'only loading has a deadline');
  assert.match(js, /home\.dataset\.homeMotion/);
  assert.doesNotMatch(js, /setInterval|fetch\(|\/api\//);
  assert.match(js, /slot\.replaceChildren\(image\)/, 'ready original replaces the poster');
  assert.match(js, /if \(still && visible\(\)\) slot\.replaceChildren\(still\)/, 'stopping restores the one retained poster');
  assert.doesNotMatch(js, /slot\.append\(/, 'transparent artwork must not be layered over its poster');
  assert.match(read('home-offers.js'), /retry.addEventListener\('click', \(\) => start\(true\), \{ once: true \}\)/);
});
