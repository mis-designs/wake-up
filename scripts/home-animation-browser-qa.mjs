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
  let releaseCatalog, releaseAnimation;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    reads.push(url.pathname);
    if (url.hostname !== 'animation.local') return route.abort();
    if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><link rel="stylesheet" href="/homebg.css"><link rel="stylesheet" href="/android-study-shell.css"><link rel="stylesheet" href="/home-offers.css"></head><body><div id="home"><div class="member-home"><section class="member-library"><div class="member-cover"><img class="member-book" src="/icons/mg_book.svg" alt="Magic Book"></div><div class="member-entry"><div class="member-animation" aria-hidden="true"></div><button class="member-open" onclick="window.opened=true"><span class="member-open-label">Magic Here</span></button></div></section></div></div><script type="module">import { mountHomeAnimation } from '/home-animation.js'; mountHomeAnimation(document.getElementById('home')); window.mounted=true;</script></body></html>` });
    if (url.pathname.endsWith('/catalog.mjs')) {
      if (mode === 'late') await new Promise(resolve => { releaseCatalog = resolve; });
      if (mode === 'empty') return route.fulfill({ contentType: 'text/javascript', body: 'export default [];' });
      if (mode === 'no-hat') return route.fulfill({ contentType: 'text/javascript', body: 'export default [{id:"trophy.svg",src:"/icons/trophy.svg",poster:"/trophy.png",animated:true}];' });
      if (mode === 'catalog-error') return route.fulfill({ status: 503, body: '' });
    }
    if (mode === 'media-error' && (url.pathname.includes('Home%20Page%20Animation') || url.pathname.endsWith('.png'))) return route.fulfill({ status: 404, body: '' });
    if (url.pathname.includes('Home%20Page%20Animation')) {
      if (mode === 'animation-error') return route.fulfill({ status: 404, body: '' });
      if (mode === 'slow-animation') await new Promise(resolve => { releaseAnimation = resolve; });
    }
    if (mode === 'poster-error' && url.pathname.endsWith('.png')) return route.fulfill({ status: 404, body: '' });
    const file = path.join(repo, decodeURIComponent(url.pathname).slice(1));
    if (mode === 'font-error' && url.pathname.endsWith('.ttf')) return route.fulfill({ status: 404, body: '' });
    const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
    if (!fs.existsSync(file) || !mime[path.extname(file)]) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: mime[path.extname(file)], body: fs.readFileSync(file) });
  });
  if (mode === 'storage') await context.addInitScript(() => {
    Storage.prototype.getItem = Storage.prototype.setItem = () => { throw Error('blocked storage fixture'); };
  });
  await context.addInitScript(() => {
    window.layerCounts = [];
    new MutationObserver(() => window.layerCounts.push(document.querySelectorAll('.member-animation img').length)).observe(document, { childList: true, subtree: true });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://animation.local/fixture', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.mounted);
  return { page, context, reads, errors, release: () => releaseCatalog?.(), releaseAnimation: () => releaseAnimation?.() };
}
const asset = page => page.locator('.member-animation').getAttribute('data-asset');
const show = page => page.evaluate(() => document.getElementById('home').classList.remove('hidden'));
const hide = page => page.evaluate(() => document.getElementById('home').classList.add('hidden'));
const playing = page => page.waitForFunction(() => document.querySelector('.member-animation img')?.src.includes('/icons/') && document.querySelector('.member-animation img').naturalWidth > 0);
const settled = page => page.waitForFunction(() => document.querySelector('.member-animation img')?.src.includes('/assets/home-animations/'), undefined, { timeout: 6500 });
try {
  for (const mode of ['normal', 'reduced', 'storage', 'late', 'empty', 'no-hat', 'catalog-error', 'media-error', 'animation-error', 'poster-error', 'slow-animation', 'font-error']) {
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
    if (mode === 'empty' || mode === 'no-hat' || mode === 'catalog-error') {
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('.member-animation img').count(), 0);
    } else {
      await page.waitForFunction(() => !!document.querySelector('.member-animation').dataset.asset);
      if (mode === 'normal') {
        await playing(page);
        await page.evaluate(() => document.fonts.ready);
        const motion = await page.evaluate(async () => {
          const book = document.querySelector('.member-book');
          const button = document.querySelector('.member-open');
          const shake = book.getAnimations().find(animation => animation.animationName === 'member-book-shake');
          if (!shake) throw Error('Book shake is missing');
          shake.pause();
          const frames = [];
          for (const time of [0, 5000, 10920, 11880, 22920]) {
            shake.currentTime = time;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const box = button.getBoundingClientRect();
            frames.push({ time, transform: getComputedStyle(book).transform, button: { x: box.x, y: box.y, width: box.width, height: box.height } });
          }
          shake.currentTime = 0; shake.play();
          return frames;
        });
        assert.equal(motion[0].transform, motion[1].transform, 'book rests between short shakes');
        assert.notEqual(motion[2].transform, motion[0].transform, 'book really shakes');
        assert.equal(motion[3].transform, motion[0].transform, 'book returns to the exact resting position');
        assert.equal(motion[4].transform, motion[2].transform, 'second cycle repeats the same short shake');
        assert.ok(motion.every(frame => JSON.stringify(frame.button) === JSON.stringify(motion[0].button)), 'book motion never moves the button');
        reports.push({ mode: 'book-shake-samples', frames: motion, passed: true });
        await page.waitForTimeout(900);
        await page.locator('.member-animation').screenshot({ path: path.join(out, 'hat-playing.png') });
        assert.equal(await page.locator('.member-animation img:visible').count(), 1, 'transparent animation must never reveal a second image underneath');
        const before = await page.locator('.member-open').boundingBox();
        await page.waitForTimeout(6500);
        await playing(page);
        await page.locator('.member-animation').screenshot({ path: path.join(out, 'hat-looping.png') });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await settled(page);
        assert.equal(await page.locator('.member-book').evaluate(el => getComputedStyle(el).animationName), 'none');
        await page.locator('.member-animation').screenshot({ path: path.join(out, 'hat-still.png') });
        assert.deepEqual(await page.locator('.member-open').boundingBox(), before, 'continuous animation does not move the action');
        const readsBeforeResume = f.reads.length;
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await playing(page);
        assert.equal(f.reads.length, readsBeforeResume, 'resuming reuses the same decoded image');
        const first = await asset(page);
        await hide(page); await page.waitForFunction(() => !document.querySelector('.member-animation').dataset.asset);
        await show(page);
        await page.waitForFunction(first => document.querySelector('.member-animation').dataset.asset === first, first);
        await playing(page);
        await page.waitForTimeout(1800);
        assert.equal(await page.locator('.member-animation img:visible').count(), 1, 'SVG has no poster underneath');
        await page.locator('.member-entry').screenshot({ path: path.join(out, 'hat-button-reentry.png') });
        await page.waitForTimeout(6500);
        await playing(page);
        await page.locator('.member-entry').screenshot({ path: path.join(out, 'hat-button-looping.png') });
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
        await settled(page);
        assert.equal(await page.locator('.member-book').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
        await page.locator('.member-entry').screenshot({ path: path.join(out, 'hat-button-still.png') });
        assert.equal(await page.locator('.member-animation img').count(), 1, 'background removes animated media');
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
        await playing(page);
        assert.equal(await page.locator('.member-animation img').count(), 1, 'foreground resumes the single animation');
        assert.ok(await page.evaluate(() => window.layerCounts.every(count => count <= 1)), 'both GIF and SVG always have one layer');
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await asset(page), first, 'reload retains the cap, without rotating to other artwork');
        await page.evaluate(() => document.documentElement.setAttribute('data-native-motion-paused', ''));
        await settled(page);
        assert.equal(await page.locator('.member-book').evaluate(el => getComputedStyle(el).animationName), 'none');
        await page.evaluate(() => document.documentElement.removeAttribute('data-native-motion-paused'));
        await playing(page);
        await page.emulateMedia({ forcedColors: 'active' });
        await settled(page);
        assert.equal(await page.locator('.member-book').evaluate(el => getComputedStyle(el).animationName), 'none');
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
        await page.waitForFunction(first => document.querySelector('.member-animation').dataset.asset === first, first);
      }
      if (mode === 'media-error') {
        await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('.member-animation img:not([hidden])').count(), 0, 'no broken-image symbol or retries');
      }
      if (mode === 'animation-error') {
        await page.waitForLoadState('networkidle');
        await settled(page);
        assert.equal(await page.locator('.member-animation img:visible').count(), 1, 'failed original retains only its valid still');
        assert.ok(await page.locator('.member-animation img').evaluate(img => img.naturalWidth > 0));
      }
      if (mode === 'poster-error') {
        await playing(page);
        assert.equal(await page.locator('.member-animation img:visible').count(), 1, 'valid original still works if its poster fails');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await settled(page);
        assert.equal(await page.locator('.member-animation img:visible').count(), 0, 'failed poster stays hidden when restored');
      }
      if (mode === 'slow-animation') {
        await page.waitForFunction(() => document.querySelector('.member-animation img')?.naturalWidth > 0);
        await settled(page);
        assert.equal(await page.locator('.member-animation img:visible').count(), 1, 'while loading only the poster is attached');
        f.releaseAnimation();
        await playing(page);
        assert.equal(await page.locator('.member-animation img').count(), 1, 'ready original atomically replaces the poster');
        await page.evaluate(() => { document.getElementById('home').inert = true; });
        await settled(page);
        assert.equal(await page.locator('.member-book').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
        await page.evaluate(() => { document.getElementById('home').inert = false; });
        await playing(page);
      }
    }
    assert.ok(await page.evaluate(() => window.layerCounts.every(count => count <= 1)), 'every render state attaches at most one artwork');
    assert.ok(!f.reads.some(url => /trophy/i.test(url)), 'no state falls back to a trophy');
    if (mode === 'font-error') {
      await page.waitForLoadState('networkidle');
      assert.ok(await page.locator('.member-open').evaluate(el => el.scrollWidth <= el.clientWidth), 'font fallback stays inside its usable button');
    }
    await page.locator('.member-open').click();
    assert.equal(await page.evaluate(() => window.opened), true, 'artwork never blocks the real action');
    assert.equal(f.reads.filter(url => url.endsWith('/catalog.mjs')).length, mode === 'normal' ? 2 : 1, 'at most one catalog per document');
    assert.deepEqual(f.errors, []);
    reports.push({ mode, reads: f.reads, passed: true });
    console.log(`PASS Home decoration: ${mode}`);
    await f.context.close();
  }
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    console.log(await page.evaluate(() => ({ home: document.getElementById('home')?.outerHTML, hidden: document.hidden, layers: window.layerCounts })));
  }
  throw error;
} finally {
  fs.writeFileSync(path.join(out, 'animation-report.json'), JSON.stringify(reports, null, 2));
  await browser.close();
}
