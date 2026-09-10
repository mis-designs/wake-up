import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const script = read('quiz.js'), html = read('quiz.html'), help = read('quiz-help.js');
function classes(...initial) {
  const set = new Set(initial);
  return {contains:key=>set.has(key),add:(...keys)=>keys.forEach(key=>set.add(key)),remove:(...keys)=>keys.forEach(key=>set.delete(key)),toggle:(key,on)=>on?set.add(key):set.delete(key)};
}
function source(name, end) { return script.slice(script.indexOf(`function ${name}`), script.indexOf(end, script.indexOf(`function ${name}`))); }

test('live Quiz has text-only answers, labelled X, and detail before keyword buttons', () => {
  assert.match(html,/class="quiz-page quiz-focus"/);
  for(const id of ['vero','falso']) {
    const button = html.match(new RegExp(`<button id="${id}"[^>]*>[\\s\\S]*?</button>`))[0];
    assert.doesNotMatch(button,/<img|<svg/);
    assert.match(button,/aria-pressed="false"/);
  }
  assert.doesNotMatch(html,/id="quiz-audio-artwork"/);
  assert.match(html,/data-help-close aria-label="Chiudi traduzione">\s*<svg/);
  assert.ok(html.indexOf('id="quiz-help-translation-text"') < html.indexOf('id="quiz-help-word-detail"'));
  assert.ok(html.indexOf('id="quiz-help-word-detail"') < html.indexOf('id="quiz-help-words"'));
  assert.match(help,/addEventListener\("magicbook:quiz-question-change", close\)/);
  assert.match(help,/new MutationObserver\(\(\) => \{\s*if \(!workspace.classList.contains\("hidden"\)\) close\(\)/);
  assert.match(script,/function showQuestion\(\) \{[\s\S]*?dispatchEvent\(new Event\("magicbook:quiz-question-change"\)\)/);
});

test('answered status and current question remain independent, with semantic state', () => {
  const dots = Array.from({length:4},()=>({classList:classes(),attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},scrollIntoView(o){this.scroll=o;}}));
  const ctx = vm.createContext({current:0, answers:[{answer:0},{answer:1},{answer:null}], document:{querySelectorAll:()=>dots},window:{matchMedia:()=>({matches:true})}});
  vm.runInContext(source('updateProgressBar','function updateFinishButtonState'),ctx);
  ctx.updateProgressBar();
  assert.ok(dots[0].classList.contains('progress-dot--answered'));
  assert.ok(dots[0].classList.contains('progress-dot--current'));
  assert.equal(dots[0].attrs['aria-current'],'step');
  assert.match(dots[0].attrs['aria-label'],/risposta data/);
  assert.ok(dots[2].classList.contains('progress-dot--unanswered'));
  assert.ok(dots[3].classList.contains('progress-dot--unanswered'));
  assert.equal(dots[0].scroll.behavior,'instant');
  ctx.current=2; ctx.updateProgressBar();
  assert.equal(dots[0].attrs['aria-current'],undefined);
  assert.ok(dots[0].classList.contains('progress-dot--answered'));
  assert.equal(dots[2].attrs['aria-current'],'step');
});

function backFixture(native) {
  const root = classes(...(native?['android-webview']:[]));
  const body = classes(), modal = {classList:classes('hidden')};
  const listeners = {}, events = [], closes = [];
  let helpOpen = false, exits = 0, focus = 0, pushes = 0;
  const history = {state:null,pushState(state){this.state=state;pushes++;}};
  const ctx=vm.createContext({history,location:{href:'https://fixture.invalid/quiz'},Event,
    document:{documentElement:{classList:root},body:{classList:body},getElementById:()=>({getAttribute:()=>String(!helpOpen)})},
    window:{addEventListener:(n,fn)=>listeners[n]=fn,dispatchEvent:e=>events.push(e.type)},
    modal,modalCancel:{style:{display:'block'}},modalConfirm:{focus(){focus++;}},explanationModal:{classList:classes('hidden')},
    closeModal:r=>closes.push(r),closeExplanation(){},exitQuiz:()=>{exits++;}
  });
  vm.runInContext(source('installNativeQuizBack','installNativeQuizBack();'),ctx);
  return {ctx,root,body,modal,history,listeners,events,closes,openHelp(){helpOpen=true;},get exits(){return exits;},get pushes(){return pushes;},get focus(){return focus;}};
}

test('Android Back guard is never installed in ordinary browsers',()=>{
  const f=backFixture(false);f.ctx.installNativeQuizBack();
  assert.equal(f.pushes,0);assert.equal(f.listeners.popstate,undefined);
  assert.equal(f.root.contains('native-quiz-back-ready'),false);
});
test('Android Back closes inline help before requesting quiz exit',()=>{
  const f=backFixture(true);f.ctx.installNativeQuizBack();
  assert.equal(f.pushes,1);assert.ok(f.root.contains('native-quiz-back-ready'));
  f.listeners.popstate();assert.equal(f.exits,1);
  f.openHelp();f.listeners.popstate();
  assert.equal(f.exits,1);assert.deepEqual(f.events,['magicbook:quiz-help-close']);
});
test('Android Back respects loading and existing cancellable/noncancellable dialogs',()=>{
  const f=backFixture(true);f.ctx.installNativeQuizBack();
  f.body.add('loading-open');f.listeners.popstate();assert.equal(f.exits,0);
  f.body.remove('loading-open');f.modal.classList.remove('hidden');f.listeners.popstate();
  assert.deepEqual(f.closes,[false]);assert.equal(f.exits,0);
  f.ctx.modalCancel.style.display='none';f.listeners.popstate();
  assert.deepEqual(f.closes,[false]);assert.equal(f.focus,1);
});
test('exit confirmation ignores duplicate activation and cancellation keeps the quiz',async()=>{
  let resolve, requests=0, leaves=0;
  const ctx=vm.createContext({document:{body:{classList:classes()}},showConfirm:()=>{requests++;return new Promise(r=>resolve=r);},stopAllAudio(){},returnToBook(){leaves++;}});
  const start=script.indexOf('let exitQuizPending = false;');
  const end=script.indexOf('// Android delegates Back',start);
  vm.runInContext(script.slice(start,end),ctx);
  const first=ctx.exitQuiz();await ctx.exitQuiz();assert.equal(requests,1);
  resolve(false);await first;assert.equal(leaves,0);
  const retry=ctx.exitQuiz();assert.equal(requests,2);resolve(true);await retry;assert.equal(leaves,1);
});
test('the compact player and shapes are limited to the live Quiz variant',()=>{
  const css=read('mystyle.css'),audio=read('audio-player-ui.css');
  assert.match(audio,/\.quiz-page\.quiz-focus \.quiz-audio-explanation \{[^}]*min-height: 44px; height: 44px/);
  assert.match(css,/\.quiz-page\.quiz-focus \.progress-dot \{\s*flex: 0 0 44px/);
  assert.match(css,/\.quiz-page\.quiz-focus #prev-btn \{ grid-column: 4; grid-row: 1;/);
  assert.match(css,/\.quiz-page\.quiz-focus #next-btn \{ grid-column: 4; grid-row: 2;/);
  assert.match(css,/native-chapter-clover\.svg/);assert.match(css,/native-action-scallop\.svg/);
  assert.match(css,/#question\[aria-expanded="true"\] \{ flex-grow: 0;/);
});

test('compact reading density preserves touch targets and adjustable translation sizes',()=>{
  const css=read('mystyle.css'),helpCss=read('quiz-help.css');
  assert.match(css,/\.quiz-page\.quiz-focus \.progress-dot \{[^}]*width: 44px; height: 44px;[^}]*font: 400 16px\/1/s);
  assert.match(css,/\.quiz-page\.quiz-focus \.progress-dot::before \{[^}]*inset: 5px;[^}]*pointer-events: none/s);
  assert.match(css,/\.quiz-page\.quiz-focus #progress \{[^}]*min-height: 50px/s);
  assert.match(css,/--quiz-question-flow-gap: 6px;\s*padding: clamp\(10px, 2.6vw, 20px\)/);
  assert.match(helpCss,/\.quiz-help-close\.magic-glass-chip \{[^}]*width: 44px; height: 44px/s);
  assert.match(helpCss,/\.quiz-help-close svg \{ width: 18px; height: 18px;/);
  assert.match(helpCss,/font-size: clamp\(1.05rem, 2.5vw, 1.2rem\); line-height: 1.5/);
  assert.match(helpCss,/html\[data-reader-size="large"\] \.quiz-help-translation-text \{ font-size: 1.32rem/);
  assert.match(helpCss,/html\[data-reader-size="xlarge"\] \.quiz-help-translation-text \{ font-size: 1.46rem/);
  assert.match(helpCss,/\.quiz-help-words \{[^}]*margin-top: 10px/s);
});
