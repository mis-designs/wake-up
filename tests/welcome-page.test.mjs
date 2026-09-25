import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const page = read('index.html'), app = read('script.js'), css = read('welcome-page.css'), shell = read('welcome-page.js'), worker = read('service-worker.js');

test('public welcome has only Login/Join destinations and the original intact book', () => {
  const welcome = page.split('<!-- PUBLIC LANDING -->')[1].split('<main id="trialHub"')[0];
  assert.match(welcome, /id="welcomeBook" src="\/icons\/mg_book.svg" width="184" height="247"/);
  assert.match(welcome, /href="\/login" data-public-route="login"/);
  assert.match(welcome, /href="\/join" data-public-route="join"/);
  assert.equal((welcome.match(/class="welcome-action welcome-action--/g) || []).length, 2);
  assert.doesNotMatch(welcome, /welcomeMotionToggle|Pausa animazione|Riprendi animazione/);
  assert.doesNotMatch(shell, /welcomeMotionToggle|userPaused|aria-pressed/);
  assert.doesNotMatch(css, /welcomeMotionToggle|welcome-pause-icon|welcome-play-icon/);
  assert.doesNotMatch(welcome, /iframe|spline-container|onclick="showAboutScreen/);
  assert.match(page, /class="public-return" href="\/" data-public-route="welcome"/);
  assert.match(app, /const PROMO_LOGIN_ENABLED = false/);
});

test('disabled promo does not redirect the welcome; canonical router handles replace/history', () => {
  const body = app.match(/function showLandingScreen\(options = \{\}\) \{([\s\S]*?)\n\}/)[0];
  for (const replace of [false, true]) {
    const calls = [];
    const context = {
      PROMO_LOGIN_ENABLED: false, currentScreen: 'login',
      document: { getElementById: id => ({ classList: { remove: c => calls.push(['show', id, c]) } }), body: { classList: { add: c => calls.push(['body', c]) } } },
      hideAll: () => calls.push(['hideAll']), hidePromoAccessNextStep() {}, setLoginFieldInvalid() {},
      setChapterMode() {}, updateProfileUI() {}, setProfileIconVisible() {}, setLoggedOutChrome() {},
      showLoginScreen: () => assert.fail('welcome must not force login'),
      setAppRoute: (route, options) => calls.push(['route', route.screen, options.replace])
    };
    vm.runInNewContext(`${body}; showLandingScreen({replace:${replace}});`, context);
    assert.equal(context.currentScreen, 'welcome');
    assert.deepEqual(calls[0], ['hideAll']);
    assert.deepEqual(calls.at(-1), ['route', 'welcome', replace]);
  }
});

test('welcome presentation cannot introduce authentication, persistence, polling or new requests', () => {
  assert.doesNotMatch(shell, /fetch\(|localStorage|sessionStorage|setInterval|setTimeout|requestAnimationFrame|completeLogin|requestAuthAction/);
  assert.match(shell, /window\.showLandingScreen/);
  assert.match(shell, /window\.showLoginScreen/);
  assert.match(shell, /window\.showJoinScreen/);
  assert.match(shell, /event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
  assert.match(shell, /heading\.focus\(\{ preventScroll: true \}\)/);
  assert.match(shell, /book\.complete && !book\.naturalWidth/);
});

test('welcome has deterministic motion, accessible targets and shared offline assets', () => {
  for (const state of ['visibilitychange', 'pagehide', 'pageshow', 'data-native-motion-paused', 'prefers-reduced-motion', 'forced-colors']) assert.ok(shell.includes(state));
  assert.match(css, /animation-play-state: paused/);
  assert.match(css, /#landing #promoAccessCard\[hidden\] \{ display: none; \}/);
  assert.match(css, /min-height: 58px/);
  assert.match(css, /object-fit: contain/);
  assert.match(css, /#landing :is\(a, button\):focus-visible \{ outline: 3px solid var\(--welcome-accent\)/);
  assert.match(css, /min-height: 100svh; height: auto/);
  for (const asset of ['welcome-page.css?v=3-split', 'welcome-page.js?v=2-clean', 'homebg.css?v=4-welcome', 'android-app-theme.css?v=14-welcome-split']) { assert.ok(page.includes(asset)); assert.ok(worker.includes(asset)); }
});

test('web welcome owns green-on-white roles while installed Android keeps its own palette', () => {
  const palette = read('homebg.css'), native = read('android-app-theme.css');
  assert.match(palette, /--welcome-paper: #ffffff/);
  assert.match(palette, /--welcome-accent: #096228/);
  assert.doesNotMatch(native, /html\.android-webview, #login, #landing/);
  assert.match(native, /html\.android-webview #landing \{[\s\S]*?--welcome-accent: var\(--app-palette-primary\)/);
  assert.doesNotMatch(css.split('/* Quiet, explicit way back')[0].replace(/#login \.public-return:focus-visible[^\n]*/, ''), /var\(--app-palette-/);
  assert.match(css, /grid-template-areas: "heading book" "actions book"/);
  assert.match(css, /grid-template-areas: "heading" "book" "actions"/);
  assert.match(css, /grid-template-rows: auto 1fr auto/);
});

test('welcome sponsor preserves the existing Facebook destination, without a Privacy link or motion button', () => {
  const welcome = page.split('<!-- PUBLIC LANDING -->')[1].split('<main id="trialHub"')[0];
  const footer = welcome.match(/<footer class="welcome-footer">([\s\S]*?)<\/footer>/)[1];
  const loginSponsor = page.match(/class="watermark-link"[^>]*href="([^"]+)"[^>]*>[\s\S]*?class="login-watermark-logo"/);
  assert.ok(loginSponsor);
  assert.ok(footer.includes(`href="${loginSponsor[1]}"`));
  assert.match(footer, /target="_blank" rel="noopener noreferrer"/);
  assert.match(footer, /<a class="welcome-sponsor"[^>]*>\s*<img src="\/icons\/mdesignstextlogo.png"/);
  assert.doesNotMatch(footer, /Privacy|privacypolicy|<button/);
});

test('public welcome text, hints and action labels retain AA contrast', () => {
  const palette = read('homebg.css');
  const value = role => palette.match(new RegExp(`--welcome-${role}: (#[0-9a-f]{6})`))[1];
  const luminance = hex => {
    const channels = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return channels.reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  };
  for (const [foreground, background] of [['ink', 'paper'], ['muted', 'paper'], ['accent', 'paper'], ['on-accent', 'accent']]) {
    const levels = [luminance(value(foreground)), luminance(value(background))].sort((a, b) => b - a);
    assert.ok((levels[0] + .05) / (levels[1] + .05) >= 4.5, `${foreground}/${background}`);
  }
});
