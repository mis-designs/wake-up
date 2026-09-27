// Isolated lifecycle/failure tests for the real Home decoration owner. Local assets only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const repo = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const reports = [];
async function fixture(mode = '') {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const reads = [], errors = [];
  let releaseCatalog;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    reads.push(url.pathname);
    if (url.hostname !== 'animation.local') return route.abort();
    if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><link rel="stylesheet" href="/homebg.css"><link rel="stylesheet" href="/home-offers.css"></head><body><div id="home"><div class="member-home"><div class="member-entry"><div class="member-animation" aria-hidden="true"></div><button class="member-open" onclick="window.opened=true">Magic Here</button></div></div></div><script type="module">import { mountHomeAnimation } from '/home-animation.js'; mountHomeAnimation(document.getElementById('home')); window.mounted=true;</script></body></html>` });
    if (url.pathname.endsWith('/catalog.mjs')) {
      if (mode === 'late') await new Promise(resolve => { releaseCatalog = resolve; });
      if (mode === 'empty') return route.fulfill({ contentType: 'text/javascript', body: 'export default [];' });
      if (mode === 'catalog-error') return route.fulfill({ status: 503, body: '' });
    }
    if (mode === 'media-error' && (url.pathname.includes('Home%20Page%20Animation') || url.pathname.endsWith('.png'))) return route.fulfill({ status: 404, body: '' });
    const file = path.join(repo, decodeURIComponent(url.pathname).slice(1));
    const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
    if (!fs.existsSync(file) || !mime[path.extname(file)]) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: mime[path.extname(file)], body: fs.readFileSync(file) });
  });
  if (mode === 'storage') await context.addInitScript(() => {
    Storage.prototype.getItem = Storage.prototype.setItem = () => { throw Error('blocked storage fixture'); };
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://animation.local/fixture', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.mounted);
  return { page, context, reads, errors, release: () => releaseCatalog?.() };
}
const asset = page => page.locator('.member-animation').getAttribute('data-asset');
const show = page => page.evaluate(() => document.getElementById('home').classList.remove('hidden'));
const hide = page => page.evaluate(() => document.getElementById('home').classList.add('hidden'));
try {
  for (const mode of ['normal', 'reduced', 'storage', 'late', 'empty', 'catalog-error', 'media-error']) {
    const f = await fixture(mode), { page } = f;
    if (mode === 'late') {
      await hide(page);
      await page.waitForFunction(() => document.getElementById('home').classList.contains('hidden'));
      f.release();
      await page.waitForLoadState('networkidle');
      assert.equal(await asset(page), null);
      assert.equal(f.reads.filter(url => url.includes('Home%20Page%20Animation') || url.endsWith('.png')).length, 0, 'late catalog cannot start hidden media');
      await show(page);
    }
    if (mode === 'empty' || mode === 'catalog-error') {
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('.member-animation img').count(), 0);
    } else {
      await page.waitForFunction(() => !!document.querySelector('.member-animation').dataset.asset);
      if (mode === 'normal') {
        await page.waitForFunction(() => document.querySelectorAll('.member-animation img').length === 2 && !document.querySelector('.member-animation img:last-child').hidden);
        const before = await page.locator('.member-open').boundingBox();
        await page.waitForFunction(() => document.querySelectorAll('.member-animation img').length === 1, undefined, { timeout: 6000 });
        assert.deepEqual(await page.locator('.member-open').boundingBox(), before, 'finite animation does not move the action');
        const first = await asset(page);
        await hide(page); await page.waitForFunction(() => !document.querySelector('.member-animation').dataset.asset);
        await show(page);
        await page.waitForFunction(first => document.querySelector('.member-animation').dataset.asset && document.querySelector('.member-animation').dataset.asset !== first, first);
        await page.waitForFunction(() => document.querySelectorAll('.member-animation img').length === 2);
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal(await page.locator('.member-animation img').count(), 1, 'background removes animated media');
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal(await page.locator('.member-animation img').count(), 1, 'foreground does not restart a completed intro');
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await asset(page), first, 'reload rotates from the stored last image');
        await page.evaluate(() => document.documentElement.setAttribute('data-native-motion-paused', ''));
        await page.waitForFunction(() => document.querySelectorAll('.member-animation img').length === 1);
      }
      if (mode === 'reduced') {
        await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('.member-animation img').count(), 1);
        assert.equal(f.reads.filter(url => url.includes('Home%20Page%20Animation')).length, 0, 'reduced mode never requests a looping original');
      }
      if (mode === 'storage') {
        const first = await asset(page);
        await hide(page); await page.waitForFunction(() => !document.querySelector('.member-animation').dataset.asset);
        await show(page);
        await page.waitForFunction(first => document.querySelector('.member-animation').dataset.asset && document.querySelector('.member-animation').dataset.asset !== first, first);
      }
      if (mode === 'media-error') {
        await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('.member-animation img:not([hidden])').count(), 0, 'no broken-image symbol or retries');
      }
    }
    await page.locator('.member-open').click();
    assert.equal(await page.evaluate(() => window.opened), true, 'artwork never blocks the real action');
    assert.equal(f.reads.filter(url => url.endsWith('/catalog.mjs')).length, mode === 'normal' ? 2 : 1, 'at most one catalog per document');
    assert.deepEqual(f.errors, []);
    reports.push({ mode, reads: f.reads, passed: true });
    console.log(`PASS Home decoration: ${mode}`);
    await f.context.close();
  }
} finally {
  fs.writeFileSync(path.join(out, 'animation-report.json'), JSON.stringify(reports, null, 2));
  await browser.close();
}
