// Real Study/Video owners; all assets and API responses are local fixtures.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { getVideoClassCatalog } from '../api/video-class-catalog.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const repo = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(process.argv[2] || path.join(repo, 'outputs/video-session'));
fs.mkdirSync(out, { recursive: true });
const catalog = getVideoClassCatalog(), lesson = catalog.lessons[0];
const scope = '3310000000:video-session-fixture';
const savedKey = `magicbook-video-favorites-v1:${encodeURIComponent(scope)}`;
const progressKey = `magicbook-video-progress-v1:${encodeURIComponent(scope)}`;
const saved = JSON.stringify([lesson.id]);
const progress = JSON.stringify({ version: 1, items: { [lesson.id]: { duration: 60, ranges: [[0, 12]], position: 12, positionUpdatedAt: 1000, updatedAt: 1000 } } });
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const browser = await chromium.launch({ headless: true, channel: 'msedge' }), report = [];
try {
  for (const [native, width, height] of [[false, 1440, 900], [false, 375, 812], [true, 375, 812]]) {
    for (const mode of ['resume', 'logout', 'account-change', 'device-change', 'silent-change', 'failure-retry', 'leave-pending']) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block', ...(native ? { userAgent: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 MagicBookViewer/1.3 MagicBookVideo/1' } : {}) });
      const pending = [], errors = [], missing = [];
      let reads = 0, frames = 0;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname.includes('youtube')) { frames++; return route.fulfill({ status: 503, body: '' }); }
        if (url.hostname !== 'video.local') return route.fulfill({ status: 503, body: '' });
        if (url.pathname === '/api/quiz' && url.searchParams.get('action') === 'getVideoClasses') {
          reads++;
          const status = await new Promise(resolve => pending.push(resolve));
          return route.fulfill({ status, json: status === 200 ? { ok: true, catalog } : { error: 'fixture_failure' } }).catch(() => {});
        }
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, available: false } });
        const relative = url.pathname.startsWith('/studia-quiz') ? 'study-quiz.html' : decodeURIComponent(url.pathname).slice(1);
        const file = path.resolve(repo, relative);
        if (!file.startsWith(repo) || !mime[path.extname(file)] || !fs.existsSync(file)) { missing.push(relative); return route.fulfill({ status: 404, body: '' }); }
        return route.fulfill({ contentType: mime[path.extname(file)], body: fs.readFileSync(file) });
      });
      await context.addInitScript(({ savedKey, progressKey, saved, progress }) => {
        localStorage.setItem('user_session', JSON.stringify({ phone: '3310000000', deviceId: 'video-session-fixture', accessToken: 'fixture' }));
        localStorage.setItem(savedKey, saved); localStorage.setItem(progressKey, progress);
        let hash = 2166136261; for (const c of '3310000000') { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); }
        localStorage.setItem(`magicbook.wordLearning.v1.${(hash >>> 0).toString(36)}`, JSON.stringify({ lastCompletedAt: Date.now() }));
        window.__MAGICBOOK_DISABLE_SCREEN_PROTECTION__ = true;
      }, { savedKey, progressKey, saved, progress });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      const alert = page.getByRole('heading', { name: 'Accedi di nuovo alle lezioni' });
      const snapshot = () => page.evaluate(({ savedKey, progressKey }) => ({ saved: localStorage.getItem(savedKey), progress: localStorage.getItem(progressKey), keys: Object.keys(localStorage).filter(k => /^magicbook-video-(favorites|progress)/.test(k)).sort() }), { savedKey, progressKey });
      const lifecycle = () => page.evaluate(() => {
        for (let i = 0; i < 3; i++) {
          window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
          window.__magicBookVideoActive = false; window.dispatchEvent(new Event('magicbook:video-activity'));
          window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
          delete document.hidden;
          document.dispatchEvent(new Event('visibilitychange'));
          window.__magicBookVideoActive = true; window.dispatchEvent(new Event('magicbook:video-activity'));
          window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
          const session = JSON.parse(localStorage.getItem('user_session'));
          session.accessToken = `renewed-fixture-${i}`;
          localStorage.setItem('user_session', JSON.stringify(session));
          for (const key of ['user_session', 'accessToken', 'unrelated-preference']) window.dispatchEvent(new StorageEvent('storage', { key }));
        }
      });
      try {
        const requested = page.waitForRequest(r => r.url().includes('action=getVideoClasses'));
        await page.goto('http://video.local/studia-quiz?view=videos', { waitUntil: 'domcontentloaded' });
        await requested; await page.locator('.vc-loading').waitFor();
        const original = await snapshot();
        await lifecycle();
        assert.equal(await alert.count(), 0, `${mode}: normal lifecycle cannot expire a pending same-account route`);
        assert.equal(await page.locator('.vc-loading').count(), 1);
        assert.equal(reads, 1);
        assert.deepEqual(await snapshot(), original);
        if (['logout', 'account-change', 'device-change', 'silent-change'].includes(mode)) {
          await page.evaluate(mode => {
            if (mode === 'logout') localStorage.removeItem('user_session');
            else {
              const session = JSON.parse(localStorage.getItem('user_session'));
              if (mode === 'device-change') session.deviceId = 'another-device'; else session.phone = '3390000000';
              localStorage.setItem('user_session', JSON.stringify(session));
            }
            if (mode !== 'silent-change') window.dispatchEvent(new StorageEvent('storage', { key: 'user_session' }));
          }, mode);
          pending[0](200);
          await alert.waitFor();
          assert.equal(await page.locator('.vc-group, .vc-play, iframe').count(), 0, 'late private data is discarded');
          assert.equal(reads, 1);
          assert.deepEqual(await snapshot(), original, 'real account changes never erase/migrate saved records');
        } else if (mode === 'leave-pending') {
          await page.locator('#study-back').click(); await page.locator('#study-hub').waitFor({ state: 'visible' });
          pending[0](200);
          await lifecycle();
          assert.equal(await alert.count(), 0);
          const requestedAgain = page.waitForRequest(r => r.url().includes('action=getVideoClasses'));
          await page.locator('.vc-hub-video').click(); await requestedAgain;
          await lifecycle(); pending[1](200);
          await page.locator('.vc-group').first().waitFor(); assert.equal(reads, 2);
        } else {
          if (mode === 'failure-retry') {
            pending[0](503);
            await page.getByRole('heading', { name: 'Le lezioni non si sono caricate' }).waitFor();
            await lifecycle(); assert.equal(await alert.count(), 0); assert.equal(reads, 1);
            const retried = page.waitForRequest(r => r.url().includes('action=getVideoClasses'));
            await page.getByRole('button', { name: 'Riprova', exact: true }).click(); await retried;
            await lifecycle(); pending[1](200);
          } else pending[0](200);
          await page.locator('.vc-group').first().waitFor();
          await lifecycle();
          assert.equal(await alert.count(), 0);
          assert.equal(await page.locator('.vc-group').count(), 27);
          assert.equal(await page.locator('[data-favorite-count]').textContent(), '1');
          await page.locator('.vc-favorites').click();
          await page.locator('.vc-lesson-link').click();
          assert.match(await page.locator('.vc-play').textContent(), /Riprendi da 0:12/);
          assert.equal(await page.locator('.vc-progress-value').textContent(), '20%');
          await lifecycle(); assert.equal(await alert.count(), 0);
          assert.equal(reads, mode === 'failure-retry' ? 2 : 1);
          assert.deepEqual(await snapshot(), original, 'lifecycle and token renewal preserve favorites/checkpoint bytes');
          if (mode === 'resume') await page.screenshot({ path: path.join(out, `${native ? 'android' : 'web'}-${width}-resume.png`), fullPage: true });
        }
        assert.equal(frames, 0, 'no provider request before explicit play');
        assert.deepEqual(errors, []); assert.deepEqual(missing, []);
        report.push({ native, width, mode, reads, frames, passed: true });
        console.log('PASS', native ? 'Android fixture' : 'web', width, mode);
      } finally { for (const release of pending) release(200); await context.close(); }
    }
  }
} finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
