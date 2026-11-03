import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = name => readFileSync(new URL('../'+name, import.meta.url), 'utf8');
function setup() {
  const requests = [], notes = [];
  const document = { createElement: () => ({ children: [], disabled: false,
    setAttribute(){}, appendChild(child){ this.children.push(child); },
    addEventListener(_, callback){ this.click = callback; }, remove(){ this.removed = true; } }) };
  const context = { window: {}, document };
  vm.runInNewContext(read('quizbank-figures.js'), context);
  const image = { set src(value){requests.push(value);}, after(note){notes.push(note);} };
  return { api: context.window.MagicQuizBankFigures, image, requests, notes };
}
test('a failed figure never falls back to another catalogue; retry is explicit and successful recovery removes the warning', () => {
  const { api, image, requests, notes } = setup();
  let ready = 0;
  api.load(image, {figure:'565'}, {onReady:()=>ready++});
  assert.deepEqual(requests, ['/api/asset?kind=figure&figure=565&presentation=numberless-v2&catalog=quizbank-r2-v1']);
  image.onerror(); image.onerror();
  assert.equal(requests.length, 1); assert.equal(notes.length, 1); assert.equal(image.hidden, true);
  const button=notes[0].children[0]; button.click(); button.click();
  assert.equal(requests.length, 2); assert.ok(requests[1].startsWith(requests[0]+'&retry='));
  image.onerror(); button.click(); assert.equal(requests.length,3);
  image.onload(); assert.equal(notes[0].removed,true); assert.equal(image.hidden,false);
  assert.ok(ready > 0);
});
test('obsolete image callbacks cannot change a new question or start retry requests', () => {
  const {api,image,requests,notes}=setup();
  let active=true,ready=0;
  api.load(image,{figure:565},{onReady:()=>ready++,isCurrent:()=>active});
  const oldError=image.onerror;
  active=false; oldError(); assert.equal(notes.length,0); assert.equal(ready,0);
  api.load(image,{figure:564}); oldError(); assert.equal(notes.length,0);
  assert.equal(requests.length,2);
});
test('invalid IDs cannot escape the reviewed image directory or trigger any request', () => {
  const {api,image,requests}=setup();
  for(const figure of ['../565','https://example.com/565','fig565.jpg','',null]) {
    assert.equal(api.source(figure),''); api.load(image,{figure});
  }
  assert.equal(requests.length,0);
});
test('study and practice share exclusive R2 delivery; helper is loaded first and images are not bulk precached', () => {
  for(const [page,consumer] of [['quizbank.html','study-quiz.js'],['quiz.html','quiz.js']]) {
    const html=read(page), js=read(consumer);
    assert.ok(html.indexOf('quizbank-figures.js?') < html.indexOf(consumer+'?'));
    assert.match(js,/MagicQuizBankFigures\.load/);
    assert.doesNotMatch(js,/raw\.githubusercontent\.com\/Ed0ardo/);
  }
  assert.doesNotMatch(read('quizbank-figures.js'), /raw\.githubusercontent|assets\/quizbank-figures/);
  assert.match(read('quizbank-figures.js'), /\/api\/asset\?kind=figure/);
  assert.match(read('service-worker.js'), /url\.pathname\.startsWith\("\/api\/"\)\) return/);
});

test('retry stays outside a disabled image zoom trigger', () => {
  const {api,image,notes}=setup(); let sibling;
  image.closest=()=>({after(note){sibling=note;}});
  api.load(image,{figure:'565'}); image.onerror();
  assert.equal(notes.length,0); assert.equal(sibling.children[0].disabled,false);
});
