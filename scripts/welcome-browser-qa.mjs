// Real page, isolated local assets and mocked services only. Never probes production.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const repo = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const report = [];
const phone = '3310000000';
const token = 'test.' + Buffer.from(JSON.stringify({ phone, role: 'user', exp: 2208988800 })).toString('base64url') + '.fixture';
try {
  for (const [width, height, native] of [[320,568,false], [375,812,false], [430,844,false], [740,360,false], [768,1024,false], [1440,900,false], [1920,1080,false], [375,812,true], [740,360,true]]) {
    if (process.env.QA_WIDTH && Number(process.env.QA_WIDTH) !== width) continue;
    const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', hasTouch: width < 800,
      ...(native ? { userAgent: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 MagicBookViewer/1.3' } : {}) });
    const requests = [], errors = [];
    let failBook = false;
    await ctx.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.hostname !== 'welcome.local') return route.fulfill({ status: 503, body: '' });
      if (failBook && u.pathname === '/icons/mg_book.svg') return route.fulfill({ status: 404, body: '' });
      if (u.pathname.startsWith('/api/')) {
        requests.push(u.pathname + u.search);
        if (u.pathname === '/api/getPages') return route.fulfill({ json: { success: true, role: 'user', accessToken: token, accessTokenExpiresAt: Date.now() + 86400000, expiry: '2035-01-01', pages: [], totalPages: 0 } });
        if (u.pathname === '/api/auth') return route.fulfill({ status: 503, json: { success: false, error: 'temporarily_unavailable' } });
        return route.fulfill({ json: { success: true, items: [], words: [], figures: [] } });
      }
      let name = decodeURIComponent(u.pathname).replace(/^\//, '');
      if (!path.extname(name)) name = 'index.html';
      const file = path.join(repo, name);
      if (name.includes('..') || !fs.existsSync(file) || !mime[path.extname(file)]) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] });
    });
    await ctx.addInitScript(() => {
      localStorage.setItem('client_auth_reset_version', '2026-04-device-reset-1');
      window.__MAGICBOOK_DISABLE_SCREEN_PROTECTION__ = true;
    });
    const page = await ctx.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://welcome.local/', { waitUntil: 'networkidle' });
    await page.locator('#landing:not(.hidden)').waitFor();
    assert.equal(await page.locator('#login').isVisible(), false);
    assert.equal(await page.locator('#promoAccessCard').isVisible(), false);
    assert.equal(await page.locator('#landing iframe').count(), 0);
    assert.equal(await page.locator('.welcome-action').count(), 2);
    assert.equal(await page.locator('#landing').getAttribute('data-motion'), 'running');
    assert.equal(await page.locator('#welcomeBook').evaluate(img => img.complete && img.naturalWidth > 0), true);
    const bounds = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, width: innerWidth,
      actions: Array.from(document.querySelectorAll('.welcome-action'), a => { const b = a.getBoundingClientRect(); return { height: b.height, bottom: b.bottom, width: b.width }; }),
      image: document.querySelector('#welcomeBook').getBoundingClientRect().height
    }));
    assert.ok(bounds.doc <= width + 1, JSON.stringify(bounds));
    assert.ok(bounds.actions.every(a => a.height >= 44 && a.width >= 44));
    if (height >= 568) assert.ok(bounds.actions.every(a => a.bottom <= height), JSON.stringify(bounds));
    assert.deepEqual(requests.filter(x => !x.startsWith('/api/asset')), [], 'welcome performs no business API reads');
    const shot = label => page.screenshot({ path: path.join(out, `${native ? 'native' : 'web'}-${width}-${label}.png`), fullPage: true });
    await shot('welcome');
    assert.equal(await page.locator('#welcomeMotionToggle').count(), 0);
    assert.equal(await page.locator('.welcome-footer button').count(), 0);
    await page.locator('.welcome-action--login').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/login');
    assert.equal(await page.locator('#login').isVisible(), true);
    assert.equal(await page.locator('#landing').getAttribute('data-motion'), 'paused');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'loginTitle');
    await page.locator('#user').fill('3310000000');
    await page.locator('#login .public-return').click();
    await page.waitForURL('http://welcome.local/');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'welcomeTitle');
    const readsBeforeJoin = requests.filter(x => !x.startsWith('/api/asset')).length;
    await page.locator('.welcome-action--join').click();
    await page.waitForURL('**/join');
    assert.equal(await page.locator('.join-package').count(), 3);
    assert.deepEqual(await page.locator('.join-package-price strong').allTextContents(), ['10€', '20€', '40€']);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'joinPackagesTitle');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#join').isVisible(), true);
    assert.equal(requests.filter(x => !x.startsWith('/api/asset')).length, readsBeforeJoin, 'Join and reload add no business reads');
    await page.locator('.pricing-back-btn').click();
    await page.waitForURL('http://welcome.local/');
    await page.goBack();
    assert.equal(await page.locator('#join').isVisible(), true);
    await page.goForward();
    assert.equal(await page.locator('#landing').isVisible(), true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.getElementById('landing').dataset.motion === 'paused');
    assert.equal(await page.locator('#welcomeMotionToggle').count(), 0);
    assert.equal(await page.locator('.welcome-book-float').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => document.documentElement.dataset.nativeMotionPaused = 'true');
    await page.waitForFunction(() => document.getElementById('landing').dataset.motion === 'paused');
    await page.evaluate(() => delete document.documentElement.dataset.nativeMotionPaused);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    assert.equal(await page.locator('#landing').getAttribute('data-motion'), 'paused');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
    assert.equal(await page.locator('#landing').getAttribute('data-motion'), 'running');
    if (width === 375 && !native) {
      await page.emulateMedia({ forcedColors: 'active' });
      await page.waitForFunction(() => document.getElementById('landing').dataset.motion === 'paused');
      assert.equal(await page.locator('.welcome-action').first().isVisible(), true);
      await shot('forced-colors');
      await page.emulateMedia({ forcedColors: 'none' });
      await page.evaluate(() => document.documentElement.style.zoom = '2');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.locator('.welcome-action--join').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('.welcome-action--join').isVisible());
      await shot('zoom-200');
      await page.evaluate(() => document.documentElement.style.zoom = '');
    }
    await page.goto('http://welcome.local/login', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#login').isVisible(), true);
    await shot('login');
    await page.locator('#user').fill('3310000000');
    await page.locator('.login-submit').click();
    await page.waitForFunction(() => document.querySelector('.login-submit').getAttribute('aria-busy') !== 'true');
    assert.ok(requests.some(x => x === '/api/auth'));
    assert.equal(await page.locator('#login').isVisible(), true, 'auth failure stays on recoverable login');
    await page.locator('#login .public-return').click();
    failBook = true;
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.welcome-book-fallback:not([hidden])').waitFor();
    assert.equal(await page.locator('#welcomeBook').isVisible(), false);
    assert.equal(await page.locator('.welcome-action--login').isVisible(), true);
    await shot('book-fallback');
    if (width === 375 && !native) {
      failBook = false;
      await page.evaluate(({ phone, token }) => {
        const session = { phone, deviceId: 'fixture-device-001', role: 'user', accessToken: token, accessTokenExpiresAt: Date.now() + 86400000, expiry: '2035-01-01', lastValid: Date.now() };
        for (const [k, v] of Object.entries({ user_session: JSON.stringify(session), session: JSON.stringify(session), loggedIn: 'true', phone, deviceId: session.deviceId, accessToken: token, accessTokenExpiresAt: session.accessTokenExpiresAt, whatsapp_group_joined_or_clicked: 'true', ['whats_new_popup_show_count:mobile-ui-2026-08:' + phone]: '3' })) localStorage.setItem(k, String(v));
        let hash = 2166136261;
        for (const c of phone) { hash ^= c.codePointAt(0); hash = Math.imul(hash, 16777619); }
        localStorage.setItem('magicbook.wordLearning.v1.' + (hash >>> 0).toString(36), JSON.stringify({ lastCompletedAt: Date.now() }));
      }, { phone, token });
      await page.goto('http://welcome.local/', { waitUntil: 'networkidle' });
      await page.locator('#home:not(.hidden)').waitFor();
      assert.equal(await page.locator('#landing').isVisible(), false, 'existing authenticated Home is preserved');
      assert.equal(new URL(page.url()).pathname, '/home');
    }
    assert.deepEqual(errors, []);
    report.push({ width, height, native, bounds, requests, errors, passed: true });
    console.log(`PASS ${native ? 'native' : 'web'} ${width}x${height}: welcome, routes, packages, motion, login failure, artwork failure`);
    await ctx.close();
  }
} finally {
  fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
