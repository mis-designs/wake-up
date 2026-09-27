import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import items from '../assets/home-animations/catalog.mjs';
const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 12);
test('Home collection publishes only the graduation cap and keeps its cache revisions current', () => {
  const folder = 'icons/Home Page Animation/';
  const names = readdirSync(new URL(folder, root)).filter(name => /^Graduation_Hat\.(gif|svg|png|jpe?g|webp|avif|tiff?)$/i.test(name)).sort().slice(0, 1);
  assert.deepEqual(items.map(item => item.id), names, 'run npm run build:home-animations after changing the folder');
  assert.equal(items.length, 1);
  assert.equal(existsSync(new URL(folder + 'trophy.svg', root)), true, 'unused original artwork is preserved');
  const worker = read('service-worker.js');
  assert.doesNotMatch(worker, /Home%20Page%20Animation\/trophy/, 'unused decorations are not precached');
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
  assert.ok(read('home-offers.js').includes(`home-animation.js?v=4-hat&art=${revision}`));
  assert.ok(read('index.html').includes(`home-offers.js?v=6-hat&art=${revision}`));
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
  assert.doesNotMatch(js, /localStorage|selectionKey|previous|Math.random/);
  assert.match(js, /items\.find\(item => \/\^Graduation_Hat/);
  assert.match(js, /setTimeout\(fail, 8000\)/, 'only loading has a deadline');
  assert.match(js, /home\.dataset\.homeMotion/);
  assert.doesNotMatch(js, /setInterval|fetch\(|\/api\//);
  assert.match(js, /slot\.replaceChildren\(image\)/, 'ready original replaces the poster');
  assert.match(js, /if \(still && visible\(\)\) slot\.replaceChildren\(still\)/, 'stopping restores the one retained poster');
  assert.doesNotMatch(js, /slot\.append\(/, 'transparent artwork must not be layered over its poster');
  assert.match(read('home-offers.js'), /retry.addEventListener\('click', \(\) => start\(true\), \{ once: true \}\)/);
});
test('Magic Here wears the original cap, uses the existing ornamental font and only the book shakes', () => {
  const css = read('home-offers.css');
  assert.match(css, /\.member-animation \{[^}]*margin-bottom: calc\(-38% - 12px\)[^}]*pointer-events: none/);
  assert.match(css, /\.member-home \.member-open-label \{[^}]*'El Messiri', Georgia, serif/);
  assert.match(css, /animation: member-book-shake 12s ease-in-out infinite; animation-play-state: paused/);
  assert.match(css, /#home\[data-home-motion="running"\] \.member-book/);
  assert.match(css, /0%, 90%, 98%, 100% \{ transform: translate\(0, 0\) rotate\(0\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.member-book \{ animation: none; transform: none/);
  assert.match(css, /@media \(forced-colors: active\) \{\s*\.member-book \{ animation: none; transform: none/);
  assert.doesNotMatch(css, /(?:body|\.member-library|\.member-entry)\s*\{[^}]*animation: member-book-shake/);
});
