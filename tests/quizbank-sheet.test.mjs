import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../quizbank-sheet.js', import.meta.url), 'utf8');
test('Search preserves typing drafts and IME composition until explicit submit; Clear restores focus', () => {
  const f = fixture(); let searches = 0, focused = false;
  const target = () => ({ listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; }, fire(name, data = {}) { const event = { preventDefault() { this.prevented = true; }, ...data }; this.listeners[name]?.(event); return event; } });
  const input = { ...target(), value: '', focus() { focused = true; } }, form = target(), clear = { ...target(), hidden: true };
  f.helper.bindSearch(form, input, clear, () => { searches++; clear.hidden = !input.value; });
  for (const draft of ['s', 'sicurezza', 'sicurezza distanza']) { input.value = draft; input.fire('input'); }
  assert.equal(searches, 0); assert.equal(input.value, 'sicurezza distanza'); assert.equal(focused, false); assert.equal(clear.hidden, false);
  input.fire('compositionstart'); assert.equal(input.fire('keydown', { key: 'Enter', isComposing: true }).prevented, true);
  form.fire('submit'); assert.equal(searches, 0);
  input.fire('compositionend'); assert.equal(form.fire('submit').prevented, true); assert.equal(searches, 1);
  clear.fire('click'); assert.equal(searches, 2); assert.equal(input.value, ''); assert.equal(clear.hidden, true); assert.equal(focused, true);
});

test('QuizBank submitted search matches all words in any order and preserves original question order', () => {
  const study = fs.readFileSync(new URL('../study-quiz.js', import.meta.url), 'utf8');
  const filter = study.slice(study.indexOf('  function filterQuestions()'), study.indexOf('  function hideVideoSurfaces()'));
  const rows = ['La distanza di sicurezza è importante', 'Il segnale di precedenza', 'La sicurezza dipende dalla distanza'].map(text => ({ dataset: { search: text }, classList: { toggle(name, value) { this.hidden = value; } } }));
  const elements = { search: { value: 'sicurezza distanza' }, list: { querySelectorAll: () => rows }, count: {}, emptySearch: { classList: { toggle() {} } } };
  const clear = {}; let url;
  const run = vm.runInNewContext(filter + '; filterQuestions;', { elements, questions: rows, QUIZBANK_MODE: true, normalize: s => s.toLowerCase().trim(), document: { getElementById: () => clear }, URL, location: { href: 'https://example.test/quizbank?scheda=5' }, history: { state: {}, replaceState(a,b,path) { url = path; } } });
  run(); assert.deepEqual(rows.map(r => !r.classList.hidden), [true, false, true]); assert.equal(elements.count.textContent, '2 di 3 domande'); assert.match(url, /q=sicurezza\+distanza/);
  elements.search.value = ''; run(); assert.ok(rows.every(r => !r.classList.hidden)); assert.equal(url, '/quizbank?scheda=5');
});
function fixture() {
  let now = 100000, nextId = 0, intersection;
  const timers = new Map();
  const target = () => ({ listeners: new Map(), addEventListener(name, cb) { this.listeners.set(name, cb); }, removeEventListener(name) { this.listeners.delete(name); } });
  const reduced = { ...target(), matches: false }, forced = { ...target(), matches: false };
  const document = { ...target(), hidden: false, documentElement: { hasAttribute: () => false }, querySelectorAll: () => [],
    createElement: tag => ({ tag, children: [], attributes: {}, className: '', textContent: '', setAttribute(name, value) { this.attributes[name] = value; }, appendChild(node) { this.children.push(node); }, append(...nodes) { this.children.push(...nodes); } }) };
  const frames = Array.from({ length: 5 }, () => ({ marks: new Set(), hidden: false, loaded: true,
    getBoundingClientRect: () => ({ height: 120 }), closest() { return this.hidden; },
    querySelector() { return { complete: this.loaded, naturalWidth: this.loaded ? 100 : 0, hidden: false }; },
    get classList() { return { add: name => this.marks.add(name), remove: name => this.marks.delete(name) }; } }));
  const container = { ...target(), recorder: false, closest: () => false, querySelectorAll: () => frames, querySelector() { return this.recorder; } };
  const window = { ...target(), matchMedia: query => query.includes('reduced') ? reduced : forced,
    setTimeout(cb, delay) { const id = ++nextId; timers.set(id, { cb, at: now + delay }); return id; }, clearTimeout: id => timers.delete(id),
    IntersectionObserver: class { constructor(cb) { intersection = cb; } observe() {} disconnect() { intersection = () => {}; } } };
  vm.runInNewContext(source, { window, document, MutationObserver: class { observe() {} disconnect() {} }, Date: { now: () => now } });
  function advance(ms) { const end = now + ms; for (;;) { const pending = [...timers].sort((a,b) => a[1].at-b[1].at)[0]; if (!pending || pending[1].at > end) break; now = pending[1].at; timers.delete(pending[0]); pending[1].cb(); } now = end; }
  const reveal = () => intersection(frames.map(target => ({ target, isIntersecting: true, intersectionRatio: 1 })));
  return { window, document, container, frames, reduced, forced, timers, advance, reveal,
    revealTarget: (target, ratio) => intersection([{ target, isIntersecting: ratio > 0, intersectionRatio: ratio }]), helper: window.MagicQuizBankSheet };
}

test('Bottom QUIZ pulse waits until visible and is removed when leaving the sheet', () => {
  const f = fixture(), link = f.frames[0];
  const stop = f.helper.observePractice(link);
  assert.equal(link.marks.size, 0);
  f.revealTarget(link, .4); assert.equal(link.marks.size, 0);
  f.revealTarget(link, .8); assert.ok(link.marks.has('is-pulsing'));
  stop(); assert.equal(link.marks.size, 0);
  f.revealTarget(link, 1); assert.equal(link.marks.size, 0);
  assert.equal(f.timers.size, 0);
});
test('Study renders one marked V/F solution immediately without answer buttons', () => {
  const f = fixture();
  for (const correct of [true, false]) {
    const mark = f.helper.answerMark(correct);
    assert.equal(mark.attributes['aria-label'], `Risposta corretta: ${correct ? 'Vero' : 'Falso'}`);
    const cells = mark.children;
    assert.equal(cells.length, 2);
    assert.equal(cells.filter(cell => cell.className.includes('is-marked')).length, 1);
    assert.equal(cells[correct ? 0 : 1].children[1].textContent, '×');
    assert.equal(cells[correct ? 1 : 0].children[1].textContent, '·');
    assert.ok(cells.every(cell => cell.tag === 'span' && !cell.attributes.tabindex));
  }
});
test('Figure motion is staggered, finite, and never repeats a figure', () => {
  const f = fixture(); const dispose = f.helper.observeFigures(f.container); f.reveal();
  f.advance(2999); assert.equal(f.frames.some(x => x.marks.size), false);
  f.advance(1); assert.equal(f.frames[0].marks.size, 1);
  f.advance(850); assert.equal(f.frames.some(x => x.marks.size), false);
  f.advance(23149); assert.equal(f.frames.some(x => x.marks.size), false);
  f.advance(1); assert.equal(f.frames[1].marks.size, 1);
  f.advance(24000); assert.equal(f.frames[2].marks.size, 1);
  f.advance(100000); assert.equal(f.timers.size, 0); assert.equal(f.frames[3].marks.size, 0);
  dispose(); assert.equal(f.container.listeners.size, 0); assert.equal(f.document.listeners.size, 0);
});
test('Reduced motion, high contrast, hidden page, recorder and active playback suppress flips', () => {
  for (const disable of [f => f.reduced.matches = true, f => f.forced.matches = true, f => f.document.hidden = true,
    f => f.container.recorder = true, f => f.document.querySelectorAll = () => [{ paused: false }]]) {
    const f = fixture(); disable(f); const dispose = f.helper.observeFigures(f.container); f.reveal(); f.advance(60000);
    assert.equal(f.frames.some(x => x.marks.size), false); assert.equal(f.timers.size, 0); dispose();
  }
});
test('Unloaded or filtered figures are skipped; leaving cancels pending/active motion', () => {
  const f = fixture(); f.frames[0].loaded = false; f.frames[1].hidden = true;
  const dispose = f.helper.observeFigures(f.container); f.reveal(); f.advance(3000);
  assert.equal(f.frames[2].marks.size, 1); dispose(); f.advance(60000);
  assert.equal(f.frames.some(x => x.marks.size), false); assert.equal(f.timers.size, 0);
});
