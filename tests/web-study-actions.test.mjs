import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
test('web shortcuts do not initialize inside installed Android',()=>{
  const window={document:{documentElement:{classList:{contains:()=>true}}}};
  vm.runInNewContext(read('web-study-actions.js'),{window});
  assert.equal(window.MagicBookWebStudyActions,undefined);
});
test('three ordered web actions preserve direct quiz study and video destinations',()=>{
  const html=read('index.html'), actions=html.slice(html.indexOf('<div class="lesson-actions">'),html.indexOf('<!-- MENU OVERLAY'));
  assert.ok(actions.indexOf('id="quizButton"')<actions.indexOf('id="webStudyButton"'));
  assert.ok(actions.indexOf('id="webStudyButton"')<actions.indexOf('id="webClassButton"'));
  assert.match(actions,/href="\/studia-quiz\?view=chapters"/);
  assert.match(actions,/href="\/studia-quiz\?view=videos"/);
  assert.equal((actions.match(/class="lesson-new"/g)||[]).length,1);
  assert.match(actions,/icons\/easy_video\.gif/);
  assert.match(read('web-study-actions.css'),/html:not\(\.android-webview\) #chapters #examButton/);
});
test('web adapter reuses modal, action gate, trial guards and actual Exam nodes',()=>{
  const source=read('web-study-actions.js');
  for(const pattern of [/MagicBookPopup\.mount/,/MagicBookPopup\.registerHistoryLayer/,/scheduleExclusiveAppNavigation/,/content\.append\(\.\.\.examCards\)/,/examBody\.append\(\.\.\.examCards\)/,/openTrialPaywall\('Exam'\)/,/openTrialPaywall\('Pial sir class'\)/,/\/studia-quiz\/prova-gratis/,/appActionGate\.cancel\(\)/])assert.match(source,pattern);
  assert.doesNotMatch(source,/\bfetch\s*\(|localStorage|\.cloneNode\(|\.innerHTML\s*=|\b(?:alert|confirm|prompt)\s*\(/);
});
test('animated badge is a real bounded GIF with cached static fallbacks',()=>{
  const bytes=readFileSync(new URL('../assets/new-class.gif',import.meta.url));
  assert.equal(bytes.subarray(0,6).toString(),'GIF89a');assert.ok(bytes.length<20000);
  const source=read('web-study-actions.js'), css=read('web-study-actions.css');
  assert.match(source,/setTimeout\(settle, 4000\)/);assert.match(source,/visibilitychange/);
  for(const pattern of [/prefers-reduced-motion/,/forced-colors/,/:focus-visible/,/min-height: 54px/])assert.match(css,pattern);
  for(const asset of ['web-study-actions.css?v=3-spacing','web-study-actions.js?v=1','web-action-effects.js?v=3-system-motion','icons/easy_video.gif','assets/new-class.gif','assets/easy-video-still.png']){
    assert.ok(read('service-worker.js').includes(asset));assert.ok(existsSync(new URL(`../${asset.split('?')[0]}`,import.meta.url)));
  }
});
test('liquid action decoration is isolated from Android and has no network or navigation owner',()=>{
  const window={document:{documentElement:{classList:{contains:()=>true}}}};
  const source=read('web-action-effects.js');
  vm.runInNewContext(source,{window});
  assert.doesNotMatch(source,/\bfetch\s*\(|localStorage|\.innerHTML\s*=|location\.href\s*=|\bgsap\./);
  for(const pattern of [/cancelAnimationFrame/,/IntersectionObserver/,/visibilitychange/,/webglcontextlost/,/webglcontextrestored/,/deleteProgram/,/pagehide/,/pageshow/,/page\.inert/,/1000 \/ 24/,/Math\.min\(win\.devicePixelRatio \|\| 1, 1\.5\)/])assert.match(source,pattern);
});
test('chapter shadows have reserved space and the owner-removed motion control is absent',()=>{
  for(const file of ['index.html','web-action-effects.js','web-study-actions.css'])assert.doesNotMatch(read(file),/webActionMotionToggle|web-action-motion/);
  const css=read('web-study-actions.css');
  assert.match(css,/html:not\(\.android-webview\) #chapters \.card-selector-viewport \{\s+height: 260px/);
  assert.match(css,/\.chapter-card-track \{\s+top: 24px;\s+height: 185px/);
  assert.match(css,/grid-template-rows: auto auto auto/);
  assert.match(css,/gap: clamp\(20px, 3.5dvh, 32px\)/);
});
test('liquid gradients keep white label contrast and the existing signature asset',()=>{
  const css=read('web-study-actions.css');
  const luminance=hex=>{const c=hex.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
  const stops=[...css.matchAll(/--action-(?:quiz|study)-(?:base|wave|light): (#[a-f\d]{6})/g)].map(m=>m[1]);
  assert.equal(stops.length,6);
  for(const color of stops)assert.ok(1.05/(luminance(color)+.05)>=4.5,color);
  assert.match(read('index.html'),/class="web-action-signature"[\s\S]*?src="\/icons\/mdesignstextlogo\.png"/);
  assert.match(css,/padding: 16px 12px 26px/);
  assert.match(css,/\.lesson-board \{\s+overflow: visible/);
});
