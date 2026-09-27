// Actual app routes, local assets and mocked services. No production/provider traffic.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const repo = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const phone = '393310000000';
const token = 'test.' + Buffer.from(JSON.stringify({ phone, role: 'user', exp: 2208988800 })).toString('base64url') + '.fixture';
const reports = [];
async function fixture(width, height, native = false, mode = '') {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block',
    ...(native ? { userAgent: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 MagicBookViewer/1.3' } : {}) });
  const reads = [], errors = [];
  let frames = 0, held = null;
  await ctx.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.hostname === 'www.canva.com') {
      frames++;
      if (mode === 'slow') return new Promise(resolve => { held = () => { route.abort().catch(() => {}); resolve(); }; });
      if (mode === 'error') return route.abort();
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="it"><body style="margin:0;background:#fff;font:16px Arial;padding:24px;color:#102419"><p>OFFERTA — FIXTURE LOCALE</p><p>Riquadro Canva simulato per il test, nessuna richiesta esterna.</p><a href="#">Dettagli</a></body></html>' });
    }
    if (u.hostname !== 'home.local') return route.fulfill({ status: 503, body: '' });
    if (u.pathname.startsWith('/api/')) {
      reads.push(u.pathname + u.search);
      if (u.pathname === '/api/getPages') return route.fulfill({ json: { success: true, role: 'user', accessToken: token, accessTokenExpiresAt: Date.now() + 86400000, expiry: '2035-01-01', pages: [], totalPages: 0 } });
      return route.fulfill({ json: { success: true, items: [], words: [], figures: [] } });
    }
    if (mode === 'book-error' && u.pathname === '/icons/mg_book.svg') return route.fulfill({ status: 404, body: '' });
    let name = decodeURIComponent(u.pathname).replace(/^\//, '');
    if (!path.extname(name)) name = 'index.html';
    const file = path.join(repo, name);
    if (name.includes('..') || !fs.existsSync(file) || !mime[path.extname(file)]) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] });
  });
  await ctx.addInitScript(({ phone, token, mode }) => {
    if (location.hostname !== 'home.local') return;
    window.__MAGICBOOK_DISABLE_SCREEN_PROTECTION__ = true;
    if (localStorage.getItem('fixtureSeeded')) return;
    const session = { phone, deviceId: 'fixture-device-001', role: 'user', accessToken: token, accessTokenExpiresAt: Date.now() + 86400000, expiry: '2035-01-01', lastValid: Date.now() };
    for (const [k, v] of Object.entries({ fixtureSeeded: 'true', client_auth_reset_version: '2026-04-device-reset-1', user_session: JSON.stringify(session), session: JSON.stringify(session), loggedIn: 'true', phone, deviceId: session.deviceId, accessToken: token, accessTokenExpiresAt: session.accessTokenExpiresAt, whatsapp_group_joined_or_clicked: 'true', ['whats_new_popup_show_count:mobile-ui-2026-08:' + phone]: '3' })) localStorage.setItem(k, String(v));
    let hash = 2166136261;
    for (const c of phone) { hash ^= c.codePointAt(0); hash = Math.imul(hash, 16777619); }
    localStorage.setItem('magicbook.wordLearning.v1.' + (hash >>> 0).toString(36), JSON.stringify({ lastCompletedAt: Date.now() }));
    if (mode === 'blocked') localStorage.setItem('magicbook.offerNotice.v1', 'invalid');
    if (mode === 'priority') localStorage.removeItem('whatsapp_group_joined_or_clicked');
  }, { phone, token, mode });
  const page = await ctx.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { ctx, page, reads, errors, frames: () => frames, release: () => held?.() };
}
const count = page => page.evaluate(() => JSON.parse(localStorage.getItem('magicbook.offerNotice.v1')).count);
try {
  for (const [width, height, native] of [[320,568,false], [375,812,false], [740,360,false], [768,1024,false], [1440,900,false], [1920,1080,false], [375,812,true]]) {
    if (process.env.QA_FAILURES_ONLY) continue;
    if (process.env.QA_WIDTH && Number(process.env.QA_WIDTH) !== width) continue;
    const f = await fixture(width, height, native), { page } = f;
    await page.goto('http://home.local/home', { waitUntil: 'networkidle' });
    await page.locator('#offerPopupOverlay').waitFor({ timeout: 6000 }).catch(async error => {
      console.log(JSON.stringify({ errors: f.errors, state: await page.evaluate(() => ({ route: location.pathname, home: document.getElementById('home').className, module: !!window.MagicBookOffers, hidden: document.hidden, phone: !!window.getCurrentSessionPhone?.(), blocking: window.hasVisibleBlockingPopup?.(), news: window.isWhatsNewPopupAllowed?.(), whatsapp: window.isWhatsAppGroupPopupAllowed?.(), dialogs: [...document.querySelectorAll('[role=dialog]')].filter(el => el.getClientRects().length).map(el => el.id), storage: localStorage.getItem('magicbook.offerNotice.v1') })) }));
      throw error;
    });
    assert.equal(await count(page), 1);
    assert.equal(f.frames(), 1, 'one provider document per offer opening');
    assert.equal(await page.locator('#home iframe').count(), 0);
    const box = await page.locator('.offer-dialog').boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, JSON.stringify(box));
    assert.ok((await page.locator('.offer-dialog .offer-embed').boundingBox()).width >= 260, 'poster stays readable; short screens scroll inside the dialog');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'offer-close');
    assert.equal(await page.locator('#home').evaluate(el => el.inert), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'offer-join');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'offer-close');
    await page.screenshot({ path: path.join(out, `${native ? 'native' : 'web'}-${width}-offer.png`) });
    const beforeCloseReads = f.reads.length;
    await page.keyboard.press('Escape');
    await page.locator('#offerPopupOverlay').waitFor({ state: 'detached' });
    assert.equal(new URL(page.url()).pathname, '/home');
    assert.equal(f.reads.length, beforeCloseReads, 'closing does not reload business data');
    assert.equal(await page.locator('#home').evaluate(el => el.inert), false);
    assert.equal(await page.locator('.member-home').isVisible(), !native);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    if (!native) {
      assert.ok(await page.locator('.member-open').isVisible());
      assert.equal(await page.locator('.member-link').count(), 3);
      assert.equal(await page.locator('.member-arrow').count(), 0);
      assert.deepEqual(await page.locator('.member-link small').allTextContents(), ['Italiano · বাংলা']);
      assert.deepEqual(await page.locator('.member-link strong').allTextContents(), ['Dizionario', 'Statistiche', 'Errori']);
      const icons = await page.locator('.member-link img').evaluateAll(images => images.map(img => ({
        path: new URL(img.currentSrc).pathname, version: new URL(img.currentSrc).searchParams.get('v'),
        decoded: img.complete && img.naturalWidth > 0, width: img.getBoundingClientRect().width,
        height: img.getBoundingClientRect().height, fit: getComputedStyle(img).objectFit
      })));
      assert.deepEqual(icons.map(icon => icon.path), ['/icons/dizionario.png', '/icons/statistiche-patente.png', '/icons/errori-patente.png']);
      assert.ok(icons.every(icon => icon.decoded && icon.version && icon.width === 48 && icon.height === 48 && icon.fit === 'contain'));
      assert.equal(await page.locator('.member-open').innerText(), 'Apri il libro');
      assert.ok(await page.locator('.member-open').evaluate(el => el === document.activeElement));
      assert.ok(await page.locator('.member-open, .member-link, .member-offers-link, .member-sponsor').evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 44)));
      await page.screenshot({ path: path.join(out, `web-${width}-home.png`), fullPage: true });
      await page.locator('.member-open').click();
      await page.waitForURL('**/magic-book');
      await page.goBack();
      await page.locator('#home:not(.hidden)').waitFor();
      assert.equal(await page.locator('#offerPopupOverlay').count(), 0);
      assert.equal(f.frames(), 1);
      await page.locator('.member-offers-link').click();
    } else {
      await page.evaluate(() => showJoinScreen());
    }
    await page.waitForURL('**/join');
    await page.locator('#joinOfferHost iframe').waitFor();
    await page.locator('#joinOfferHost .offer-loading').waitFor({ state: 'detached' });
    assert.equal(f.frames(), 2, 'Join creates one fresh embed, no hidden second iframe');
    assert.equal(await count(page), 1, 'manual Join never consumes the automatic quota');
    assert.deepEqual(await page.locator('.join-package-price strong').allTextContents(), ['10€','20€','40€']);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    if (width === 375 || width === 1440) await page.screenshot({ path: path.join(out, `${native ? 'native' : 'web'}-${width}-join.png`), fullPage: true });
    await page.goBack();
    await page.locator('#home:not(.hidden)').waitFor();
    assert.equal(await page.locator('#joinOfferHost iframe').count(), 0);
    assert.equal(await page.locator('#offerPopupOverlay').count(), 0);
    if (width === 375 && !native) {
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('#offerPopupOverlay').waitFor();
      assert.equal(await count(page), 2);
      await page.goBack();
      await page.locator('#offerPopupOverlay').waitFor({ state: 'detached' });
      await page.goForward();
      assert.equal(await page.locator('#offerPopupOverlay').count(), 0);
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('#offerPopupOverlay').waitFor();
      assert.equal(await count(page), 3);
      await page.locator('[data-offer-join]').click();
      await page.waitForURL('**/join');
      assert.equal(await page.locator('#offerPopupOverlay').count(), 0);
      await page.goBack();
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('#offerPopupOverlay').count(), 0, 'fourth visit is capped');
      assert.equal(await count(page), 3);
      await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
      assert.ok(await page.locator('.member-open').isVisible());
      await page.emulateMedia({ forcedColors: 'none' });
      await page.evaluate(() => document.documentElement.style.zoom = '2');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
    assert.deepEqual(f.errors, []);
    reports.push({ width, height, native, providerDocuments: f.frames(), errors: f.errors, passed: true });
    console.log(`PASS ${width}x${height} native=${native}: Home/Join, modal, focus, history, requests`);
    await f.ctx.close();
  }
  for (const mode of ['slow', 'error', 'book-error', 'blocked', 'priority']) {
    const f = await fixture(375, 812, false, mode), { page } = f;
    await page.goto('http://home.local/home', { waitUntil: 'domcontentloaded' });
    await page.locator('#home:not(.hidden)').waitFor();
    if (mode === 'blocked' || mode === 'priority') {
      if (mode === 'priority') await page.locator('#whatsappGroupPopupOverlay').waitFor();
      await page.waitForFunction(() => Boolean(window.MagicBookOffers));
      assert.equal(await page.locator('#offerPopupOverlay').count(), 0);
      assert.equal(f.frames(), 0);
    } else {
      await page.locator('#offerPopupOverlay').waitFor();
      if (mode === 'slow') {
        await page.locator('.offer-loading .magic-loading-indicator__image').waitFor();
        const size = await page.locator('.offer-loading .magic-loading-indicator__image').boundingBox();
        assert.ok(size.width >= 64 && size.width <= 88);
        await page.locator('.offer-loading').filter({ hasText: 'impiegando più tempo' }).waitFor({ timeout: 15000 });
        assert.equal(f.frames(), 1, 'timeout never retries automatically');
      }
      assert.ok(await page.locator('.offer-dialog .offer-source').isVisible());
      await page.locator('.offer-close').click();
      await page.locator('#offerPopupOverlay').waitFor({ state: 'detached' });
      f.release();
      if (mode === 'book-error') {
        await page.locator('.member-book-fallback:not([hidden])').waitFor();
        assert.ok(await page.locator('.member-open').isVisible());
      }
    }
    assert.deepEqual(f.errors, []);
    reports.push({ mode, providerDocuments: f.frames(), passed: true });
    console.log(`PASS failure/recovery ${mode}`);
    await f.ctx.close();
  }
} finally {
  fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(reports, null, 2));
  await browser.close();
}
