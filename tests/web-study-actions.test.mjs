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
  for(const asset of ['web-study-actions.css?v=1','web-study-actions.js?v=1','icons/easy_video.gif','assets/new-class.gif','assets/easy-video-still.png']){
    assert.ok(read('service-worker.js').includes(asset));assert.ok(existsSync(new URL(`../${asset.split('?')[0]}`,import.meta.url)));
  }
});
