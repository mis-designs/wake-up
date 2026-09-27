import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { localDay, nextImpression, reserveImpression } from '../offer-frequency.mjs';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const today = new Date(2026, 8, 27, 14);
test('three impressions per local calendar day; rollover and clock rollback', () => {
  assert.equal(localDay(today), '2026-09-27');
  let raw = null;
  for (let count = 1; count <= 3; count++) {
    const next = nextImpression(raw, today);
    assert.deepEqual(next, { day: '2026-09-27', count });
    raw = JSON.stringify(next);
  }
  assert.equal(nextImpression(raw, today), null);
  assert.deepEqual(nextImpression(raw, new Date(2026, 8, 28)), { day: '2026-09-28', count: 1 });
  assert.equal(nextImpression(raw, new Date(2026, 8, 26)), null);
});
test('invalid, unavailable and non-persistent storage suppress automatic ads', () => {
  for (const raw of ['', 'bad', 'null', '{}', '[]', '{"day":"2026-09-27","count":-1}', '{"day":"2026-09-27","count":0.5}', '{"day":"2026-09-27","count":4}']) assert.equal(nextImpression(raw, today), null);
  assert.equal(reserveImpression({ getItem() { throw Error('denied'); } }, today), false);
  assert.equal(reserveImpression({ getItem: () => null, setItem() {} }, today), false);
  let value = null;
  const storage = { getItem: () => value, setItem: (key, next) => { value = next; } };
  assert.equal(reserveImpression(storage, today), true);
  assert.equal(reserveImpression(storage, today), true);
  assert.equal(reserveImpression(storage, today), true);
  assert.equal(reserveImpression(storage, today), false);
});
test('Home owns study actions, not an embedded advert; Join and popup share one embed owner', () => {
  const page = read('index.html');
  const home = page.split('<div class="card hidden" id="home">')[1].split('<template id="offerPopupTemplate">')[0];
  assert.doesNotMatch(home, /iframe|home-promo|startbtn|premium-new-badge/);
  for (const route of ['showChapters()', 'showMagicDictionary()', 'showLearningStatistics()', 'showLearningErrors()']) assert.ok(home.includes(route));
  assert.match(home, /member-sponsor[^]*facebook.com\/share\/14aaeMyWJGw/);
  assert.match(home, /icons\/mg_book.svg/);
  assert.match(page, /id="joinOfferHost"/);
  assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="offerPopupTitle"/);
  assert.equal((read('home-offers.js').match(/createElement\('iframe'\)/g) || []).length, 1);
  assert.doesNotMatch(read('home-offers.js'), /setInterval|fetch\(/);
  assert.match(read('home-offers.js'), /MagicBookPopup.mount/);
  assert.match(read('home-offers.js'), /registerHistoryLayer/);
  assert.match(read('script.js'), /MagicBookOffers\?\.close\(\)/);
});
test('responsive presentation keeps installed Home separate and reuses shared tokens/assets', () => {
  const css = read('home-offers.css');
  assert.match(css, /html:not\(\.android-webview\) body.app-mode #home/);
  assert.match(css, /@media \(max-width: 740px\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1.3fr\) minmax\(0, 1fr\)/);
  assert.match(css, /var\(--welcome-accent\)/);
  assert.match(css, /z-index: var\(--layer-dialog-backdrop\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /forced-colors: active/);
  assert.match(read('android-study-shell.css'), /#home > :not\(\.native-home\)/);
});
test('Home actions use clean labels without arrows or redundant result descriptions', () => {
  const page = read('index.html');
  const home = page.split('<div class="card hidden" id="home">')[1].split('<template id="offerPopupTemplate">')[0];
  assert.doesNotMatch(home, /member-arrow|I tuoi risultati, capitolo per capitolo|Riparti dalle domande da rivedere/);
  assert.match(home, /aria-label="Magic Here: apri il libro">[\s\S]*member-open-label">Magic Here<\/span>/);
  assert.match(home, /member-open-points" aria-hidden="true"/);
  assert.doesNotMatch(home, /memberBookTitle|Un capitolo alla volta/);
  assert.ok(home.indexOf('member-cover') < home.indexOf('member-entry'));
  assert.ok(home.indexOf('member-animation') < home.indexOf('class="member-open"'));
  assert.doesNotMatch(page, /Le offerte TMM|Apri l’offerta su Canva|class="offer-source"/);
  assert.equal((page.match(/Prodotti per Te!/g) || []).length, 2);
  assert.match(home, /<span><strong>Statistiche<\/strong><\/span>/);
  assert.match(home, /<span><strong>Errori<\/strong><\/span>/);
  assert.match(home, /<strong>Dizionario<\/strong><small>Italiano · <span lang="bn">বাংলা<\/span><\/small>/);
  assert.match(read('home-offers.css'), /grid-template-columns: 48px minmax\(0, 1fr\);/);
});
test('new owners are versioned and cached without caching Canva or account data', () => {
  const page = read('index.html'), worker = read('service-worker.js');
  for (const asset of ['home-offers.css?v=7-hat', 'home-offers.js?v=6-hat']) {
    assert.ok(page.includes(asset)); assert.ok(worker.includes(asset));
  }
  assert.ok(worker.includes('/offer-frequency.mjs?v=1'));
  assert.ok(worker.includes('magicbook-pwa-v240-home-hat'));
});

test('owner-replaced Home icons use source-hash URLs, intact slots and shared web artwork', () => {
  const page = read('index.html'), worker = read('service-worker.js');
  for (const file of ['dizionario.png', 'statistiche-patente.png', 'errori-patente.png']) {
    const bytes = readFileSync(new URL(`../icons/${file}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    const revision = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const asset = `icons/${file}?v=${revision}`;
    assert.ok(page.includes(`<img src="/${asset}" alt="" width="48" height="48">`));
    assert.ok(worker.includes(`"/${asset}"`));
    if (file !== 'dizionario.png') assert.ok(read('src/learning-insights.js').includes(asset));
  }
  assert.match(read('home-offers.css'), /\.member-link img \{ width: 48px; height: 48px; object-fit: contain;/);
});
