import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getFigureDetail, normalizeFigureId } from '../figure-catalog.mjs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

// Execute the real viewer AND popup dispatcher. Only browser primitives are mocked:
// layout is deterministic, history.back is asynchronous, and mutations are delivered
// in batches. This verifies DOM ownership/URL assignments, not browser image caching.
function fixture({ quizbank = true } = {}) {
  const observers = [], requests = [], routeCalls = [], frames = new Map(), backQueue = [];
  let frameId = 0, doc;
  const location = new URL('https://example.test/quizbank?scheda=5');
  class Target {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, fn, options = {}) {
      const list = this.listeners.get(type) || [];
      list.push(fn); this.listeners.set(type, list);
      options.signal?.addEventListener('abort', () => this.removeEventListener(type, fn), { once: true });
    }
    removeEventListener(type, fn) {
      this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== fn));
    }
    fire(type, init = {}) {
      const event = { type, target: this, preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; }, ...init };
      for (const fn of [...(this.listeners.get(type) || [])]) {
        fn(event); if (event.stopped) break;
      }
      this['on' + type]?.(event);
      return event;
    }
  }
  function mutation(target, type, extra = {}) {
    for (const observer of observers) for (const [root, options] of observer.roots) {
      if (target !== root && !(options.subtree && root.contains(target))) continue;
      if (!options[type]) continue;
      if (type === 'attributes' && options.attributeFilter && !options.attributeFilter.includes(extra.attributeName)) continue;
      observer.pending.push({ target, type, addedNodes: [], ...extra }); break;
    }
  }
  class Element extends Target {
    constructor(tag) {
      super(); this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
      this.attrs = new Map(); this.inert = false; this.disabled = false; this.hidden = false;
      this.scrollTop = this.scrollLeft = 0; this.scrollHeight = this.clientHeight = 100;
      this.scrollWidth = this.clientWidth = 100;
      this.style = { setProperty(name, value) { this[name] = value; },
        removeProperty(name) { delete this[name]; } };
      this.classList = {
        contains: value => this.className.split(/\s+/).includes(value),
        add: (...values) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...values])].join(' '); },
        remove: (...values) => { this.className = this.className.split(/\s+/).filter(value => !values.includes(value)).join(' '); }
      };
    }
    get className() { return this.getAttribute('class') || ''; }
    set className(value) { this.setAttribute('class', value); }
    get id() { return this.getAttribute('id') || ''; }
    get firstElementChild() { return this.children[0] || null; }
    get isConnected() { return this === doc?.documentElement || Boolean(this.parentElement?.isConnected); }
    setAttribute(name, value) { this.attrs.set(name, String(value)); mutation(this, 'attributes', { attributeName: name }); }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    removeAttribute(name) { this.attrs.delete(name); mutation(this, 'attributes', { attributeName: name }); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part.includes('>')) {
          const [parent, child] = part.split('>').map(value => value.trim());
          return this.matches(child) && Boolean(this.parentElement?.matches(parent));
        }
        if (part === '[inert]') return this.inert;
        if (part === '[hidden]') return this.hidden || this.attrs.has('hidden');
        if (part.startsWith('.')) return this.classList.contains(part.slice(1));
        if (part.startsWith('#')) return this.id === part.slice(1);
        return this.tagName.toLowerCase() === part;
      });
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
    querySelectorAll(selector) {
      return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    insert(node, index) {
      node.remove(); this.children.splice(index, 0, node); node.parentElement = this;
      mutation(this, 'childList', { addedNodes: [node] });
    }
    append(...nodes) { for (const node of nodes) this.insert(node, this.children.length); }
    appendChild(node) { this.append(node); return node; }
    before(node) { this.parentElement.insert(node, this.parentElement.children.indexOf(this)); }
    after(node) { this.parentElement.insert(node, this.parentElement.children.indexOf(this) + 1); }
    replaceWith(node) { this.before(node); this.remove(); }
    remove() {
      if (!this.parentElement) return;
      const parent = this.parentElement; parent.children.splice(parent.children.indexOf(this), 1);
      this.parentElement = null; mutation(parent, 'childList');
    }
    focus() { if (!this.closest('[inert]')) doc.activeElement = this; }
    scrollTo({ top, left }) { this.scrollTop = top; this.scrollLeft = left; }
    getBoundingClientRect() {
      return this instanceof Image
        ? { x: 40, y: 300, width: this.closest('.is-sheet-flipping') ? 2 : 160, height: 120 }
        : { x: 100, y: 80, width: 800, height: 600 };
    }
    getClientRects() { return this.closest('[hidden], .hidden') ? [] : [this.getBoundingClientRect()]; }
    set innerHTML(html) {
      // Parse the authored dialog structure instead of substituting a test dialog.
      for (const child of [...this.children]) child.remove();
      const stack = [this];
      for (const token of html.matchAll(/<\/?[a-z][^>]*>/gi)) {
        const value = token[0];
        if (value.startsWith('</')) { stack.pop(); continue; }
        const tag = value.match(/^<(\w+)/)[1], node = doc.createElement(tag);
        for (const attr of value.matchAll(/([\w-]+)="([^"]*)"/g)) node.setAttribute(attr[1], attr[2]);
        stack.at(-1).append(node);
        if (!value.endsWith('/>')) stack.push(node);
      }
    }
  }
  class Image extends Element {
    constructor() { super('img'); this.complete = true; this.naturalWidth = 800; this.naturalHeight = 600; }
    get src() { return new URL(this.getAttribute('src') || '', location.href).href; }
    set src(value) { this.setAttribute('src', value); }
    setAttribute(name, value) { if (name === 'src') requests.push(String(value)); super.setAttribute(name, value); }
  }
  class Observer {
    constructor(callback) { this.callback = callback; this.roots = []; this.pending = []; observers.push(this); }
    observe(root, options) { this.roots.push([root, options]); }
    disconnect() { this.roots = []; this.pending = []; }
  }
  doc = { documentElement: new Element('html'), body: new Element('body'), createElement: tag => tag === 'img' ? new Image() : new Element(tag) };
  doc.documentElement.append(doc.body);
  const surface = new Element('main'), scroller = new Element('section'), frame = new Element('div');
  frame.className = 'study-figure-frame';
  scroller.scrollHeight = 900; scroller.clientHeight = 300; scroller.scrollTop = 73; scroller.scrollLeft = 9;
  const image = new Image(); image.className = 'study-figure';
  image.src = '/api/asset?kind=figure&figure=40&presentation=numberless-v2' + (quizbank ? '&catalog=quizbank-r2-v2' : '');
  const priorInert = new Element('aside'); priorInert.inert = true;
  doc.body.append(surface, priorInert); surface.append(scroller); scroller.append(frame); frame.append(image);
  const win = new Target();
  Object.assign(win, { scrollX: 11, scrollY: 420,
    scrollTo({ left, top }) { this.scrollX = left; this.scrollY = top; },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); } });
  const entries = [{ url: 'https://example.test/quizbank', state: { screen: 'catalog' } },
    { url: location.href, state: { screen: 'sheet', sheet: 5 } }];
  let cursor = 1;
  const history = {
    scrollRestoration: 'auto',
    get state() { return entries[cursor].state; },
    pushState(state, unused, url) {
      entries.splice(cursor + 1); entries.push({ state: { ...state }, url: new URL(url, location.href).href });
      cursor++; location.href = entries[cursor].url;
    },
    replaceState(state, unused, url) { entries[cursor] = { state: { ...state }, url: new URL(url, location.href).href }; location.href = entries[cursor].url; },
    back() { backQueue.push(() => traverse(-1)); }
  };
  function traverse(delta) {
    assert.ok(cursor + delta >= 0 && cursor + delta < entries.length, 'valid mocked history destination');
    cursor += delta; location.href = entries[cursor].url;
    win.fire('popstate', { state: history.state });
  }
  const context = { window: win, document: doc, location, history, navigator: { onLine: true },
    Element, HTMLElement: Element, HTMLImageElement: Image, MutationObserver: Observer,
    URL, AbortController, getFigureDetail, normalizeFigureId, fetch() { throw new Error('viewer must not fetch'); } };
  Object.defineProperties(context, { scrollX: { get: () => win.scrollX }, scrollY: { get: () => win.scrollY } });
  vm.createContext(context);
  vm.runInContext(read('app-popup.js'), context, { filename: 'app-popup.js' });
  // Only replace the module import; all runtime behavior remains the production code.
  vm.runInContext(read('figure-detail.js').replace(/^import[^\n]+\n/, ''), context, { filename: 'figure-detail.js' });
  win.addEventListener('popstate', () => routeCalls.push(location.href));
  const trigger = image.parentElement;
  function flush() {
    for (let turn = 0; turn < 30; turn++) {
      const pending = observers.filter(observer => observer.pending.length);
      if (!pending.length) return;
      for (const observer of pending) observer.callback(observer.pending.splice(0));
    }
    assert.fail('mutation observers failed to settle');
  }
  function focusFrame() {
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(); }
  }
  const viewer = win.MagicBookFigureDetail;
  return { image, trigger, surface, scroller, frame, priorInert, document: doc, window: win,
    history, location, requests, routeCalls, entries, viewer, traverse, flush,
    flushBack() { while (backQueue.length) backQueue.shift()(); flush(); },
    open() { trigger.fire('click'); flush(); focusFrame(); },
    overlay: () => doc.body.querySelector('.figure-detail-overlay') };
}

test('QuizBank open/close preserves exact image, source handlers, inert state, focus and both scroll owners', () => {
  const f = fixture(); let loads = 0;
  const onload = () => loads++;
  f.image.onload = onload;
  const originalUrl = f.image.src;
  for (let visit = 0; visit < 3; visit++) {
    f.open();
    assert.equal(f.overlay().querySelector('img'), f.image);
    assert.equal(f.surface.inert, true);
    assert.ok(f.overlay().querySelector('.figure-detail-copy'));
    const dialog = f.overlay().firstElementChild;
    assert.equal(dialog.getAttribute('aria-label'), null);
    assert.equal(dialog.getAttribute('aria-labelledby'), 'figureDetailTitle');
    assert.equal(dialog.getAttribute('aria-describedby'), 'figureDetailBangla');
    f.window.scrollTo({ left: 99, top: 999 }); f.scroller.scrollTo({ left: 88, top: 888 });
    f.overlay().querySelector('.figure-detail-close').fire('click');
    f.flushBack();
    assert.equal(f.image.parentElement, f.trigger);
    assert.equal(f.trigger.children.length, 1);
    assert.equal(f.image.src, originalUrl);
    assert.equal(f.image.onload, onload);
    assert.equal(f.surface.inert, false);
    assert.equal(f.priorInert.inert, true);
    assert.equal(f.document.activeElement, f.trigger);
    assert.deepEqual([f.window.scrollX, f.window.scrollY, f.scroller.scrollLeft, f.scroller.scrollTop], [11, 420, 9, 73]);
    assert.equal(f.history.scrollRestoration, 'auto');
    assert.equal(f.document.body.classList.contains('figure-detail-open'), false);
  }
  f.image.fire('load');
  assert.equal(loads, 1);
  assert.equal(f.requests.length, 1, 'only the original source assignment; no reload on open or close');
  assert.deepEqual(f.routeCalls, [], 'modal dismissal must not rerender/refetch a sheet');
});

test('an active thumbnail flip is removed before placeholder measurement', () => {
  const f = fixture(); f.frame.classList.add('is-sheet-flipping'); f.open();
  assert.equal(f.frame.classList.contains('is-sheet-flipping'), false);
  assert.equal(f.trigger.firstElementChild.style.width, '160px', 'not the 2px edge-on width');
  assert.equal(f.trigger.firstElementChild.style.height, '120px');
});

test('ordinary Back closes only the viewer; a further Back reaches the route owner', () => {
  const f = fixture(); f.open(); f.traverse(-1); f.flush();
  assert.equal(f.overlay(), null); assert.equal(f.image.parentElement, f.trigger);
  assert.deepEqual(f.routeCalls, []); assert.equal(f.history.scrollRestoration, 'auto');
  f.traverse(-1);
  assert.deepEqual(f.routeCalls, ['https://example.test/quizbank']);
});

test('a history-menu jump out of an active viewer reaches the destination route', () => {
  const f = fixture(); f.open(); f.traverse(-2); f.flush();
  assert.equal(f.overlay(), null); assert.equal(f.image.parentElement, f.trigger);
  assert.deepEqual(f.routeCalls, ['https://example.test/quizbank']);
  assert.notEqual(f.document.activeElement, f.trigger, 'do not focus the departed sheet');
  assert.equal(f.history.scrollRestoration, 'auto');
});

test('forward to a dismissed viewer entry on the already-rendered sheet strips the marker without rerendering', () => {
  const f = fixture(); f.open(); f.traverse(-1); f.traverse(1); f.flush();
  assert.equal(f.overlay(), null);
  assert.equal(f.history.state.magicFigureDetail, undefined);
  assert.deepEqual(f.routeCalls, []);
});

test('forward history jump directly to a dismissed viewer entry must render its destination sheet', () => {
    const f = fixture(); f.open(); f.traverse(-2);
    f.routeCalls.length = 0;
    f.traverse(2); f.flush();
    assert.equal(f.overlay(), null);
    assert.equal(f.history.state.magicFigureDetail, undefined);
    assert.deepEqual(f.routeCalls, ['https://example.test/quizbank?scheda=5']);
  });

test('unrelated class mutations do not close the viewer; hiding its question closes and restores the node', () => {
  const f = fixture(); f.open();
  f.frame.classList.add('is-sheet-flipping'); f.frame.classList.remove('is-sheet-flipping'); f.flush();
  assert.ok(f.overlay());
  f.frame.classList.add('hidden'); f.flush(); f.flushBack();
  assert.equal(f.overlay(), null); assert.equal(f.image.parentElement, f.trigger);
  assert.equal(f.surface.inert, false); assert.equal(f.requests.length, 1);
});

test('a changed source closes a stale viewer without overwriting the replacement URL', () => {
  const f = fixture(); f.open();
  f.image.src = '/api/asset?kind=figure&figure=41&catalog=quizbank-r2-v2';
  f.flush(); f.flushBack();
  assert.equal(f.overlay(), null);
  assert.equal(f.image.parentElement, f.trigger);
  assert.equal(new URL(f.image.src).searchParams.get('figure'), '41');
  assert.equal(f.requests.length, 2, 'original and intentional replacement only');
});

test('standard figures retain bilingual accessible titles; failed images cannot open', () => {
  const f = fixture({ quizbank: false }); f.open();
  assert.ok(f.overlay().querySelector('.figure-detail-copy'));
  assert.equal(f.overlay().firstElementChild.getAttribute('aria-labelledby'), 'figureDetailTitle');
  f.viewer.close(); f.flushBack();
  f.image.naturalWidth = 0; f.image.fire('error');
  assert.equal(f.trigger.disabled, true);
  f.viewer.open(f.image, f.trigger);
  assert.equal(f.overlay(), null);
});


test('a pending close does not consume a different-route history jump or restore the old scroll', () => {
  const f = fixture(); f.open(); f.viewer.close();
  // The close has queued history.back(), but another traversal arrives first.
  f.window.scrollTo({ left: 25, top: 90 });
  f.scroller.scrollTo({ left: 3, top: 12 });
  f.traverse(-2); f.flush();
  assert.deepEqual(f.routeCalls, ['https://example.test/quizbank']);
  assert.deepEqual([f.window.scrollX, f.window.scrollY, f.scroller.scrollLeft, f.scroller.scrollTop], [25, 90, 3, 12]);
  assert.equal(f.history.scrollRestoration, 'auto');
  assert.equal(f.overlay(), null);
  assert.equal(f.image.parentElement, f.trigger);
  assert.equal(f.requests.length, 1);
  // A subsequent forward jump must still reach the sheet and strip its stale marker.
  f.traverse(2); f.flush();
  assert.deepEqual(f.routeCalls, ['https://example.test/quizbank', 'https://example.test/quizbank?scheda=5']);
  assert.equal(f.history.state.magicFigureDetail, undefined);
});

test('an active-viewer jump to another route leaves destination scroll to its route owner', () => {
  const f = fixture(); f.open();
  f.window.scrollTo({ left: 25, top: 90 });
  f.scroller.scrollTo({ left: 3, top: 12 });
  f.traverse(-2); f.flush();
  assert.deepEqual(f.routeCalls, ['https://example.test/quizbank']);
  assert.deepEqual([f.window.scrollX, f.window.scrollY, f.scroller.scrollLeft, f.scroller.scrollTop], [25, 90, 3, 12]);
  assert.equal(f.history.scrollRestoration, 'auto');
  assert.equal(f.image.parentElement, f.trigger);
  assert.equal(f.surface.inert, false);
});

test('outside click and Escape close the viewer but clicking the actual image does not', () => {
  for (const action of ['outside', 'escape']) {
    const f = fixture(); f.open();
    f.overlay().fire('click', { target: f.image });
    assert.ok(f.overlay());
    if (action === 'outside') f.overlay().fire('click');
    else f.overlay().fire('keydown', { key: 'Escape' });
    f.flushBack();
    assert.equal(f.overlay(), null);
    assert.equal(f.image.parentElement, f.trigger);
    assert.equal(f.requests.length, 1);
  }
});

test('source-owned rotations remain explicit without changing image pixels or its URL', () => {
  for (const owner of ['study', 'quiz']) {
    const f = fixture();
    if (owner === 'study') f.image.classList.add('quizbank-figure-rotated');
    else f.image.style.transform = 'rotate(90deg)';
    f.open();
    assert.equal(f.overlay().classList.contains('figure-detail-overlay--rotated'), true);
    assert.equal(f.requests.length, 1);
    f.viewer.close(); f.flushBack();
    assert.equal(f.image.parentElement, f.trigger);
  }
});

test('MagicBook and QuizBank use exactly the same bilingual dialog and naming source', () => {
  const standard = fixture({ quizbank: false }), bank = fixture({ quizbank: true });
  standard.open(); bank.open();
  assert.equal(standard.overlay().className, bank.overlay().className);
  for (const f of [standard, bank]) {
    assert.ok(f.overlay().querySelector('#figureDetailTitle'));
    assert.ok(f.overlay().querySelector('#figureDetailBangla'));
    assert.ok(f.overlay().querySelector('.figure-detail-close'));
    assert.equal(f.overlay().classList.contains('figure-detail-overlay--quizbank'), false);
  }
  assert.doesNotMatch(read('figure-detail.css'), /figure-detail-overlay--quizbank/);
  assert.doesNotMatch(read('figure-detail.js'), /get\('catalog'\)/);
});
