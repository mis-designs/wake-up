import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../quizbank-sheet.js', import.meta.url), 'utf8');
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
  return { window, document, container, frames, reduced, forced, timers, advance, reveal, helper: window.MagicQuizBankSheet };
}
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
