import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../android-webview-mode.js', import.meta.url), 'utf8');
const androidChrome = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36';
const androidWebView = 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36';

function initialize(userAgent, {readyState = 'loading', stylesheetReady = true} = {}) {
  const classes = new Set();
  const events = new Map();
  const stylesheetEvents = new Map();
  const meta = new Map();
  const root = {classList: {add: name => classes.add(name)}, dataset: {}};
  let computedStyleReads = 0;
  const document = {
    documentElement: root, readyState,
    addEventListener(name, callback) { events.set(name, callback); },
    querySelector(selector) {
      if (selector.startsWith('meta')) return {setAttribute: (key,value) => meta.set(key,value)};
      return {sheet: stylesheetReady ? {} : null, addEventListener(name,callback) { stylesheetEvents.set(name,callback); }};
    }
  };
  vm.runInNewContext(source, {
    document, navigator: {userAgent},
    getComputedStyle() { computedStyleReads++; return {getPropertyValue: () => ' #076AE0 '}; }
  });
  return {classes,events,stylesheetEvents,meta,root,get computedStyleReads() {return computedStyleReads;}};
}

// Representative synthetic UAs: these tests exercise the classifier, not Meta's live browser.
for (const [name, userAgent] of [
  ['Chrome Android', androidChrome],
  ['generic Android WebView', androidWebView],
  ['Facebook Android in-app browser', `${androidWebView} [FB_IAB/FB4A;FBAV/fixture]`],
  ['Messenger Android in-app browser', `${androidWebView} [FBAN/Orca-Android;FBAV/fixture]`],
  ['Instagram Android in-app browser', `${androidWebView} Instagram fixture Android`],
  ['Firefox Android', 'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0'],
  ['desktop Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36'],
  ['missing user agent', undefined],
  ['empty user agent', ''],
  ['unrelated product prefix', `${androidWebView} NotMagicBookViewer/1.1`],
  ['unrelated product suffix', `${androidWebView} MagicBookViewerExtra/1.1`],
  ['unversioned product mention', `${androidWebView} MagicBookViewer`],
  ['non-Android marker', 'Mozilla/5.0 (iPhone) MagicBookViewer/1.1']
]) {
  test(`${name} keeps the ordinary web presentation`, () => {
    const result = initialize(userAgent);
    assert.equal(result.classes.has('android-webview'), false);
    assert.equal(result.root.dataset.appPalette, undefined);
    assert.equal(result.events.size, 0);
    assert.equal(result.computedStyleReads, 0);
  });
}

for (const [name,userAgent] of [
  ['current Android app', `${androidWebView} MagicBookViewer/1.1`],
  ['app without the generic wv flag', `${androidChrome} MagicBookViewer/1.1`],
  ['future versioned app', `${androidWebView} MagicBookViewer/2.10.3`],
  ['app token followed by another product', `${androidWebView} MagicBookViewer/1.1 Extra/2`]
]) {
  test(`${name} activates the installed-app presentation before CSS`, () => {
    const result = initialize(userAgent);
    assert.equal(result.classes.has('android-webview'), true);
    assert.equal(result.root.dataset.appPalette, 'aura-fluid');
    assert.equal(typeof result.events.get('DOMContentLoaded'), 'function');
    result.events.get('DOMContentLoaded')();
    assert.equal(result.meta.get('content'), '#076AE0');
  });
}

test('the app still syncs theme color on a cold stylesheet load', () => {
  const result = initialize(`${androidWebView} MagicBookViewer/1.1`, {stylesheetReady: false});
  result.events.get('DOMContentLoaded')();
  assert.equal(typeof result.stylesheetEvents.get('load'), 'function');
  result.stylesheetEvents.get('load')();
  assert.equal(result.computedStyleReads, 2);
  assert.equal(result.meta.get('content'), '#076AE0');
});

test('an already-ready app document syncs the theme without waiting for another event', () => {
  const result = initialize(`${androidWebView} MagicBookViewer/1.1`, {readyState: 'complete'});
  assert.equal(result.events.size, 0);
  assert.equal(result.meta.get('content'), '#076AE0');
});
