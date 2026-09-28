// Real quiz/help/controller/CSS, all requests intercepted locally. No production traffic.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const repo = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(process.argv[2] || path.join(repo, 'outputs/desktop-help'));
fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json' };
const question = 'Il salvagente può essere segnalato con colonnine luminose a luce gialla fissa';
const bangla = 'নিরাপত্তা দ্বীপটি স্থির হলুদ বাতিযুক্ত আলোকিত খুঁটি দিয়ে চিহ্নিত করা যেতে পারে।';
const word = { italian: 'Salvagente', bangla: 'নিরাপত্তা দ্বীপ', simpleIt: 'Una zona protetta per i pedoni.', simpleBn: 'পথচারীদের জন্য একটি সুরক্ষিত স্থান।' };
const help = { questionBnStandard: bangla, words: [word, { ...word, italian: 'Colonnine', bangla: 'খুঁটি' }, { ...word, italian: 'Luce gialla', bangla: 'হলুদ আলো' }], chapter: { italian: 'Strada e veicoli', bangla: 'রাস্তা ও যানবাহন' }, topic: { italian: 'Salvagente', bangla: 'নিরাপত্তা দ্বীপ' } };
const baseline = new Map();
for (const file of ['quiz.html', 'quiz-help.js', 'quiz-help.css']) baseline.set(file, execFileSync('git', ['show', `HEAD:${file}`], { cwd: repo }));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const report = [];

async function fixture({ width = 1440, height = 900, native = false, touch = false, before = false, motion = 'reduce', forcedColors = 'none' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, reducedMotion: motion, forcedColors, serviceWorkers: 'block', ...(native ? { userAgent: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 MagicBookViewer/1.3' } : {}) });
  const errors = [], api = [], missing = [];
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'quiz.local') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (url.pathname === '/api/quiz') {
      const action = url.searchParams.get('action'); api.push(action);
      if (action === 'getQuiz') return route.fulfill({ json: { quiz: [{ id: 'fixture-1', question }, { id: 'fixture-2', question: 'Seconda domanda' }], quizSessionToken: 'fixture', timerMinutes: 20 } });
      if (action === 'getExplanationFigures') return route.fulfill({ json: { figures: [] } });
      if (action === 'getBengaliAudio' || action === 'getTTS') return route.fulfill({ status: 503, json: { error: 'fixture-unavailable' } });
      return route.fulfill({ json: { ok: true, available: false } });
    }
    if (url.pathname === '/api/asset') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="30" fill="#eee"/></svg>' });
    if (url.pathname === '/quizHelpRuntimeV3Loader.js') return route.fulfill({ contentType: 'text/javascript', body: `window.QuizHelpRuntimeV3={load:()=>window.fixtureLibrary||=(window.helpLoads=(window.helpLoads||0)+1,new Promise(r=>window.releaseHelp=r).then(()=>({resolver:{resolve:()=>window.fixtureHelp}})))};` });
    const file = url.pathname.startsWith('/quiz/') ? 'quiz.html' : decodeURIComponent(url.pathname).slice(1);
    const absolute = path.resolve(repo, file);
    if (!absolute.startsWith(repo) || !fs.existsSync(absolute) || !mime[path.extname(file)]) { missing.push(file); return route.fulfill({ status: 404, body: '' }); }
    return route.fulfill({ contentType: mime[path.extname(file)], body: before && baseline.has(file) ? baseline.get(file) : fs.readFileSync(absolute) });
  });
  await ctx.addInitScript(help => {
    localStorage.setItem('client_auth_reset_version', '2026-04-device-reset-1');
    localStorage.setItem('user_session', JSON.stringify({ phone: '3310000000', deviceId: 'qa', accessToken: 'fixture' }));
    let hash = 2166136261;
    for (const c of '3310000000') { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    localStorage.setItem(`magicbook.wordLearning.v1.${(hash >>> 0).toString(36)}`, JSON.stringify({ lastCompletedAt: Date.now() }));
    window.__MAGICBOOK_DISABLE_SCREEN_PROTECTION__ = true;
    window.fixtureHelp = help;
  }, help);
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://quiz.local/quiz/capitolo-1', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#question').textContent.length && !document.body.classList.contains('loading-open'));
  await page.waitForFunction(() => typeof window.releaseHelp === 'function');
  // Use the project's existing local Bangla support face in the offline fixture.
  await page.addStyleTag({ content: '@font-face{font-family:"UN Bangla";src:url("/assets/fonts/adorsho-lipi/adorsho-lipi-regular.woff2")} #timer{font-variant-numeric:tabular-nums}' });
  const panel = page.locator('#quiz-help-workspace');
  const open = () => page.locator('#question').click();
  const release = async () => {
    await page.evaluate(() => window.releaseHelp());
    await page.waitForFunction(() => document.querySelector('#quiz-help-workspace').getAttribute('aria-busy') !== 'true');
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  };
  const finish = async label => {
    assert.deepEqual(errors, [], `${label} errors`); assert.deepEqual(missing, [], `${label} missing assets`);
    report.push({ label, api, passed: true }); console.log('PASS', label); await ctx.close();
  };
  return { page, panel, open, release, finish, api, ctx };
}

try {
  for (const [width, height] of [[1024, 600], [1280, 720], [1440, 900], [1920, 1080], [1280, 420]]) {
    const f = await fixture({ width, height }); const { page, panel } = f;
    await f.open(); assert.equal(await panel.getAttribute('role'), 'dialog');
    assert.equal(await panel.getAttribute('aria-modal'), 'false');
    assert.equal(await page.locator('.quiz-container').getAttribute('inert'), null);
    const tabs = page.getByRole('tab'); assert.equal(await tabs.count(), 2);
    assert.equal(await page.getByRole('tabpanel').count(), 1);
    await tabs.nth(1).click(); await page.locator('.quiz-help-desktop-loading').waitFor({ state: 'visible' });
    const pendingBox = await panel.boundingBox(); await f.release();
    const readyBox = await panel.boundingBox(); assert.deepEqual(readyBox, pendingBox);
    assert.ok(readyBox.x >= 12 && readyBox.y >= 12 && readyBox.x + readyBox.width <= width - 12 && readyBox.y + readyBox.height <= height - 12);
    assert.equal(await page.locator('.quiz-help-word-bn').count(), 3);
    await page.screenshot({ path: path.join(out, `desktop-${width}-${height}-word-pairs.png`) });
    await page.locator('.quiz-help-word').first().click(); await page.locator('#quiz-help-word-detail').waitFor({ state: 'visible' });
    assert.match(await page.locator('#quiz-help-word-detail').textContent(), /Ascolta in Bangla/);
    if (width === 1440) {
      await page.getByRole('button', { name: 'Ascolta in Bangla' }).click();
      await page.waitForFunction(() => !document.querySelector('.quiz-help-word-audio').classList.contains('is-loading'));
      assert.equal(f.api.filter(action => action === 'getTTS').length, 1);
    }
    await tabs.nth(1).focus(); await page.keyboard.press('ArrowLeft');
    assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#quiz-help-desktop-page-1').getAttribute('inert'), '');
    assert.equal(await page.locator('#quiz-help-title').textContent(), 'Traduzione del quiz');
    assert.equal(await page.locator('.quiz-help-word').first().isVisible(), true); // offscreen but inert
    assert.equal(await page.evaluate(() => window.helpLoads), 1);
    await page.screenshot({ path: path.join(out, `desktop-${width}-${height}-translation.png`) });
    await tabs.nth(1).click(); await page.screenshot({ path: path.join(out, `desktop-${width}-${height}-words.png`) });
    await page.keyboard.press('Escape'); assert.equal(await panel.getAttribute('aria-hidden'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'question');
    await f.open(); assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true');
    // Keyboard positioning is the non-drag alternative. Pointer positioning clamps.
    const header = page.locator('.quiz-help-heading'); await header.focus();
    const oldBox = await panel.boundingBox(); await page.keyboard.press('Alt+ArrowLeft');
    assert.equal(Math.round((await panel.boundingBox()).x), Math.round(oldBox.x - 24));
    const h = await header.boundingBox(); await page.mouse.move(h.x + 20, h.y + 20); await page.mouse.down();
    await page.mouse.move(0, 0, { steps: 5 }); await page.mouse.up();
    assert.equal(Math.round((await panel.boundingBox()).x), 12); assert.equal(Math.round((await panel.boundingBox()).y), 12);
    // Non-modal background is usable; question navigation closes and cancels help.
    await page.locator('#vero').click(); assert.equal(await page.locator('#vero').getAttribute('aria-pressed'), 'true');
    await page.locator('#next-btn').click(); assert.equal(await panel.getAttribute('aria-hidden'), 'true');
    await f.finish(`desktop ${width}x${height}`);
  }
  // Compare mobile/native directly to the pre-change source: exact help DOM/style.
  for (const config of [{ width: 375, height: 812, touch: true }, { width: 844, height: 390, touch: true }, { width: 1024, height: 768, touch: true }, { width: 375, height: 812, touch: true, native: true }, { width: 1280, height: 800, native: true }]) {
    const snapshots = [];
    for (const before of [true, false]) {
      const f = await fixture({ ...config, before }); await f.open(); await f.release();
      snapshots.push(await f.panel.evaluate(node => ({ html: node.outerHTML, bounds: node.getBoundingClientRect().toJSON(), background: getComputedStyle(node).backgroundColor, position: getComputedStyle(node).position })));
      await f.page.screenshot({ path: path.join(out, `${config.native ? 'native' : 'mobile'}-${config.width}-${before ? 'before' : 'after'}.png`) });
      await f.finish(`${config.native ? 'native' : 'mobile'} ${config.width} ${before ? 'before' : 'after'}`);
    }
    assert.deepEqual(snapshots[1], snapshots[0], 'mobile/native help is unchanged');
  }
  {
    const f = await fixture(); const { page, panel } = f;
    await f.open(); await page.getByRole('tab').nth(1).click();
    await page.keyboard.press('Escape'); await f.release();
    assert.equal(await panel.getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('#quiz-help-translation-text').textContent(), '');
    await f.open(); await page.waitForFunction(() => document.querySelector('#quiz-help-workspace').getAttribute('aria-busy') === 'false');
    await page.setViewportSize({ width: 700, height: 900 });
    assert.equal(await panel.getAttribute('role'), null); assert.equal(await page.getByRole('tab').count(), 0);
    assert.equal(await page.locator('.quiz-help-word-bn').count(), 0);
    assert.match(await panel.getAttribute('class'), /quiz-help-workspace/);
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await panel.getAttribute('role'), 'dialog'); assert.equal(await page.getByRole('tab').count(), 2);
    await page.evaluate(() => { void showConfirm('Tempo scaduto', 'Continuare?'); });
    assert.equal(await panel.getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('#custom-modal').getAttribute('aria-hidden'), 'false');
    assert.equal(await page.evaluate(() => window.helpLoads), 1);
    await f.finish('stale close, cached reopen, responsive transfer, blocking modal');
  }
  for (const mode of ['long', 'empty', 'error', 'forced-colors', 'motion']) {
    const f = await fixture({ forcedColors: mode === 'forced-colors' ? 'active' : 'none', motion: mode === 'motion' ? 'no-preference' : 'reduce' });
    const { page } = f;
    if (mode === 'long') await page.evaluate(() => { window.fixtureHelp.questionBnStandard = window.fixtureHelp.questionBnStandard.repeat(35); window.fixtureHelp.words = Array.from({ length: 40 }, (_, i) => ({ ...window.fixtureHelp.words[0], italian: `Parola ${i + 1}` })); });
    if (mode === 'empty' || mode === 'error') await page.evaluate(mode => { window.fixtureHelp.words = []; if (mode === 'error') window.fixtureHelp.questionBnStandard = ''; }, mode);
    await f.open(); await f.release();
    if (mode === 'error') {
      await page.getByText('Traduzione non disponibile al momento.', { exact: true }).waitFor();
      assert.equal(f.api.filter(action => action === 'getBengaliAudio').length, 1);
      await page.keyboard.press('Escape');
      await page.evaluate(help => { window.fixtureHelp = help; }, help);
      await f.open();
      await page.waitForFunction(() => !!document.querySelector('#quiz-help-translation-text').textContent);
    }
    if (mode === 'long') assert.equal(await page.locator('#quiz-help-desktop-page-0').evaluate(node => node.scrollHeight > node.clientHeight), true);
    await page.getByRole('tab').nth(1).click();
    if (mode === 'empty') await page.getByText('Parole chiave non disponibili per questa domanda.').waitFor();
    if (mode === 'long') { await page.locator('#quiz-help-desktop-page-1').evaluate(node => { node.scrollTop = node.scrollHeight; }); assert.equal(await page.getByRole('tab').nth(1).isVisible(), true); }
    await page.screenshot({ path: path.join(out, `desktop-${mode}.png`) });
    await f.finish(mode);
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}
