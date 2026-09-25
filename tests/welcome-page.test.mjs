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
  assert.match(css, /outline: 3px solid var\(--app-palette-primary\)/);
  assert.match(css, /min-height: 100svh; height: auto/);
  for (const asset of ['welcome-page.css?v=2-clean', 'welcome-page.js?v=2-clean']) { assert.ok(page.includes(asset)); assert.ok(worker.includes(asset)); }
});
