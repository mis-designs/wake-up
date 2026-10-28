import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('quiz-audio-recorder.js');
const quizSource = read('quiz.js');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

class Element {
  constructor() {
    this.listeners = new Map(); this.attributes = new Map(); this.classes = new Set(['hidden']);
    this.isConnected = true; this.disabled = false; this.hidden = false; this.focused = 0;
    this.classList = {
      add: value => this.classes.add(value), remove: value => this.classes.delete(value),
      contains: value => this.classes.has(value),
      toggle: (value, on = !this.classes.has(value)) => on ? this.classes.add(value) : this.classes.delete(value)
    };
  }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn({ preventDefault() {}, stopPropagation() {}, ...event }); }
  click() { if (!this.disabled) this.emit('click'); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key); }
  removeAttribute(key) { this.attributes.delete(key); if (key === 'src') this.src = ''; }
  focus() { this.focused++; }
  closest() { return this.hidden || this.classes.has('hidden') ? this : null; }
  pause() { this.paused = true; }
  load() {}
  remove() { this.isConnected = false; }
}

function fixture(options = {}) {
  const win = new Element(), doc = new Element(), root = new Element();
  const controls = Object.fromEntries(['start', 'start-label', 'pause', 'save', 'status', 'time', 'preview', 'close'].map(name => [name, new Element()]));
  root.querySelector = selector => controls[selector.match(/data-recorder="([^"]+)"/)[1]];
  const trigger = new Element(); trigger.classes.clear();
  const timers = new Map(), urls = new Set(), recorders = [], calls = [], saved = [];
  let timerId = 0, urlId = 0, now = 1000, microphoneCalls = 0;
  const track = { stopped: 0, stop() { this.stopped++; } };
  const stream = { getTracks: () => [track] };
  class Recorder {
    static isTypeSupported(type) { return options.supported ? options.supported.includes(type) : type === 'audio/webm;codecs=opus'; }
    constructor(media, config) {
      this.stream = media; this.config = config; this.mimeType = config.mimeType || 'audio/mp4'; this.state = 'inactive'; recorders.push(this);
    }
    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    data(text = 'audio') { this.ondataavailable?.({ data: new Blob([text], { type: this.mimeType }) }); }
    requestData() { if (!options.manualData) queueMicrotask(() => this.data()); }
    stop() {
      this.state = 'inactive';
      if (!options.manualStop) queueMicrotask(() => { this.data('tail'); this.onstop?.(); });
    }
  }
  Object.assign(win, {
    isSecureContext: true, MediaRecorder: Recorder,
    navigator: { mediaDevices: { getUserMedia() { microphoneCalls++; return options.permission?.promise || Promise.resolve(stream); } } },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay, interval: false }); return id; },
    setInterval(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay, interval: true }); return id; },
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id)
  });
  doc.hidden = false;
  doc.createElement = () => {
    const wrapper = new Element();
    Object.defineProperty(wrapper, 'innerHTML', { set(value) { wrapper.markup = value; wrapper.firstElementChild = root; } });
    return wrapper;
  };
  const context = vm.createContext({ window: win, document: doc, Blob, AbortController, DOMException,
    Date: { now: () => now }, URL: { createObjectURL() { const value = 'blob:' + ++urlId; urls.add(value); return value; }, revokeObjectURL: value => urls.delete(value) } });
  vm.runInContext(source, context);
  const container = { child: null, querySelector() { return this.child; }, appendChild(child) { this.child = child; } };
  const createOptions = { ...(options.mounted ? { container } : { root }),
    save: async (payload, signal) => { calls.push({ payload, signal }); return options.save ? options.save(payload, signal) : { ok: true }; },
    onSaved: (result, detail) => saved.push({ result, detail }),
    isCurrent: options.isCurrent || (() => true), maxBytes: options.maxBytes, returnFocus: options.returnFocus };
  const controller = win.MagicQuizAudioRecorder.create(createOptions);
  const question = { id: 'fixture' };
  controller.open({ trigger, question });
  return { win, doc, root, controls, trigger, timers, urls, track, stream, recorders, calls, saved, controller, question, container, createOptions,
    get microphoneCalls() { return microphoneCalls; },
    advance(ms) { now += ms; for (const timer of [...timers.values()]) if (timer.interval) timer.fn(); },
    timeout(delay) { for (const [id, timer] of [...timers]) if (!timer.interval && timer.delay === delay) { timers.delete(id); timer.fn(); } },
    async record() { controls.start.click(); await flush(); },
    async pause() { controls.pause.click(); await flush(); },
    async save() { controls.save.click(); await flush(); }
  };
}

test('shared template is exactly the authoritative static MagicBook controls with IDs namespaced as data attributes', () => {
  const template = JSON.parse(source.match(/const TEMPLATE = ("[^\n]+");/)[1]);
  const original = read('quiz.html').match(/<section id="quiz-audio-recorder"[^]*?<\/section>/)[0]
    .replace('id="quiz-audio-recorder"', 'data-recorder-root')
    .replace(/id="quiz-audio-record-([^"]+)"/g, 'data-recorder="$1"');
  assert.equal(template.replace(/\r\n/g, '\n'), original.replace(/\r\n/g, '\n'));
  assert.doesNotMatch(template, /type="file"|role="dialog"/);
  const css = read('quiz-audio-recorder.css');
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.quiz-audio-recorder-head button \{[^}]*height: 44px/);
  assert.doesNotMatch(read('mystyle.css'), /^\.quiz-audio-(?:add|recorder|record-actions)[^{]*\{/m);
  assert.match(read('quiz.html'), /quiz-audio-recorder\.js\?v=1[^]*quiz\.js\?v=90-shared-recorder/);
});

test('open is inline, focuses record, expands trigger, and does not acquire media or save', () => {
  const h = fixture();
  assert.equal(h.root.classList.contains('hidden'), false);
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(h.controls.start.focused, 1);
  assert.equal(h.microphoneCalls, 0); assert.equal(h.calls.length, 0);
  h.controller.close();
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(h.root.classList.contains('hidden'), true);
});

test('permission requests deduplicate; stale permission completion stops every track without reopening', async () => {
  const permission = deferred(), h = fixture({ permission });
  h.controls.start.click(); h.controls.start.click();
  assert.equal(h.microphoneCalls, 1);
  h.controller.close(); h.controller.open({ trigger: h.trigger, question: h.question });
  permission.resolve(h.stream); await flush();
  assert.equal(h.track.stopped, 1); assert.equal(h.recorders.length, 0);
  assert.equal(h.controls['start-label'].textContent, 'Registra');
  h.controller.destroy();
});

test('permission denial is readable and an explicit new click may retry', async () => {
  const permission = deferred(), h = fixture({ permission });
  h.controls.start.click(); permission.reject(new DOMException('Denied', 'NotAllowedError')); await flush();
  assert.match(h.controls.status.textContent, /Microfono bloccato/);
  assert.equal(h.controls.start.disabled, false); assert.equal(h.calls.length, 0);
  h.controller.destroy();
});

test('pause waits for real data; resume excludes paused duration; final stop bytes are uploaded exactly once', async () => {
  const h = fixture({ manualData: true, manualStop: true });
  await h.record(); h.advance(1200); await h.pause();
  assert.equal(h.controls.save.disabled, true);
  h.recorders[0].data('first'); assert.equal(h.controls.save.disabled, false);
  h.advance(5000); await h.record(); h.advance(800); await h.pause(); h.recorders[0].data('second');
  h.controls.save.click(); h.controls.save.click(); await flush();
  assert.equal(h.calls.length, 0);
  h.recorders[0].data('final'); h.recorders[0].onstop(); await flush();
  assert.equal(h.calls.length, 1); assert.equal(h.saved.length, 1);
  assert.equal(await h.calls[0].payload.blob.text(), 'firstsecondfinal');
  assert.equal(h.calls[0].payload.durationMs, 2000);
  assert.equal(h.track.stopped, 1); assert.equal(h.urls.size, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
});

for (const supported of [['audio/mp4'], []]) test('Safari actual MP4 MIME survives recording and save: ' + JSON.stringify(supported), async () => {
  const h = fixture({ supported }); await h.record(); await h.pause(); await h.save();
  assert.equal(h.calls[0].payload.mimeType, 'audio/mp4');
  assert.equal(h.calls[0].payload.blob.type, 'audio/mp4');
  if (!supported.length) assert.equal(Object.hasOwn(h.recorders[0].config, 'mimeType'), false);
});

for (const terminal of [false, true]) test('save error retains preview; retry is explicit and terminal flag is respected: ' + terminal, async () => {
  const h = fixture({ save: async () => { throw Object.assign(new Error('Serve una verifica.'), { retryable: !terminal }); } });
  await h.record(); await h.pause(); await h.save();
  assert.equal(h.controls.status.textContent, 'Serve una verifica.');
  assert.equal(h.controls.preview.classList.contains('hidden'), false);
  assert.equal(h.controls.save.disabled, terminal);
  await flush(); assert.equal(h.calls.length, 1);
  await h.save(); assert.equal(h.calls.length, terminal ? 1 : 2);
  h.controller.destroy(); assert.equal(h.urls.size, 0);
});

test('3 MiB limit rejects the paused blob without any save request', async () => {
  const h = fixture({ maxBytes: 3 * 1024 * 1024, manualData: true });
  await h.record(); await h.pause(); h.recorders[0].data(new Uint8Array(3 * 1024 * 1024 + 1));
  assert.equal(h.controls.save.disabled, true); assert.match(h.controls.status.textContent, /supera 3 MB/);
  await h.save(); assert.equal(h.calls.length, 0); h.controller.destroy();
});

test('size is checked again after final recorder bytes, before calling save', async () => {
  const h = fixture({ maxBytes: 5 }); await h.record(); await h.pause();
  assert.equal(h.controls.save.disabled, false); await h.save();
  assert.equal(h.calls.length, 0); assert.equal(h.controls.save.disabled, true);
  assert.match(h.controls.status.textContent, /supera/); h.controller.destroy();
});

test('destroy aborts an in-flight save and late completion never calls onSaved or repaints', async () => {
  const pending = deferred(), h = fixture({ save: () => pending.promise, mounted: true });
  await h.record(); await h.pause(); await h.save();
  const signal = h.calls[0].signal; h.controller.destroy();
  assert.equal(signal.aborted, true); assert.equal(h.root.isConnected, false);
  pending.resolve({ ok: true }); await flush();
  assert.equal(h.saved.length, 0); assert.equal(h.urls.size, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.controller.open({}), false);
  assert.equal([...h.win.listeners.values()].reduce((sum, entries) => sum + entries.size, 0), 0);
});

test('dirty unload is guarded; cancelled close preserves recording, accepted close resolves current focus target', async () => {
  const player = new Element(); player.classes.clear();
  const h = fixture({ returnFocus: () => player });
  let prevented = 0;
  h.win.emit('beforeunload', { preventDefault: () => prevented++ }); assert.equal(prevented, 0);
  await h.record(); await h.pause();
  h.win.emit('beforeunload', { preventDefault: () => prevented++ }); assert.equal(prevented, 1);
  h.win.showConfirm = async () => false; h.controls.close.click(); await flush();
  assert.equal(h.root.classList.contains('hidden'), false);
  h.trigger.hidden = true; h.win.showConfirm = async () => true; h.controls.close.click(); await flush();
  assert.equal(player.focused, 1); assert.equal(h.trigger.focused, 0);
  assert.equal(h.root.classList.contains('hidden'), true); assert.equal(h.urls.size, 0);
});

test('late close confirmation cannot close a newly opened session', async () => {
  const answer = deferred(), h = fixture(); await h.record(); await h.pause();
  h.win.showConfirm = () => answer.promise; h.controls.close.click(); await flush();
  h.controller.open({ trigger: h.trigger, question: h.question }); answer.resolve(true); await flush();
  assert.equal(h.root.classList.contains('hidden'), false); h.controller.destroy();
});

for (const event of ['pagehide', 'popstate']) test(event + ' releases media, preview URLs, timers, and unload guard', async () => {
  const h = fixture(); await h.record(); await h.pause(); h.win.emit(event);
  assert.equal(h.track.stopped, 1); assert.equal(h.urls.size, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.win.listeners.get('beforeunload').size, 0); h.controller.destroy();
});

test('backgrounding pauses recording without saving and invalidated question cannot save', async () => {
  let current = true; const h = fixture({ isCurrent: () => current }); await h.record();
  h.doc.hidden = true; h.doc.emit('visibilitychange'); await flush();
  assert.equal(h.recorders[0].state, 'paused'); assert.equal(h.calls.length, 0);
  current = false; await h.save(); assert.equal(h.calls.length, 0); assert.equal(h.track.stopped, 1);
});

test('create reuses its root owner; only one recorder can be open per page', () => {
  const h = fixture(); assert.equal(h.win.MagicQuizAudioRecorder.create(h.createOptions), h.controller);
  const second = new Element(), nextControls = Object.fromEntries(Object.keys(h.controls).map(key => [key, new Element()]));
  second.querySelector = selector => nextControls[selector.match(/data-recorder="([^"]+)"/)[1]];
  const other = h.win.MagicQuizAudioRecorder.create({ root: second, save: async () => {} });
  other.open({}); assert.equal(h.root.classList.contains('hidden'), true);
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false'); other.destroy(); h.controller.destroy();
});

test('save timeout aborts once, preserves preview, and never retries automatically', async () => {
  const h = fixture({ save: () => new Promise(() => {}) }); await h.record(); await h.pause(); await h.save();
  h.timeout(30000); await flush();
  assert.equal(h.calls[0].signal.aborted, true); assert.equal(h.calls.length, 1);
  assert.match(h.controls.status.textContent, /Non posso confermare/);
  assert.equal(h.controls.save.disabled, false); assert.equal(h.urls.size, 1); h.controller.destroy();
});

function transportFixture(responder) {
  const question = { id: 'q1', question: 'Fixture', figure: '' }, calls = [], controller = new AbortController();
  class Reader {
    readAsDataURL(blob) { blob.arrayBuffer().then(bytes => { this.result = 'data:' + blob.type + ';base64,' + Buffer.from(bytes).toString('base64'); if (!this.aborted) this.onload?.(); }); }
    abort() { this.aborted = true; }
  }
  const context = vm.createContext({ Blob, FileReader: Reader, DOMException, QUIZ_API: '/api/quiz',
    getQuizAccessToken: () => 'fixture', getQuizPhone: () => 'fixture', getQuizDeviceId: () => 'fixture',
    QuizAudioIdentity: { normalizeFigure: value => value, VERSION: 2 },
    inlineAudioQuestion: question, quiz: [question], current: 0, isAdmin: true, TRIAL_MODE: false,
    async fetch(url, options) {
      const call = { url, ...options, payload: options.method === 'POST' ? JSON.parse(options.body) : null }; calls.push(call);
      return responder(call, calls.length, controller) || { ok: true, json: async () => ({ ok: true, uploadUrl: '/fixture-upload', uploadContentType: 'audio/mp4' }) };
    } });
  vm.runInContext(quizSource.slice(quizSource.indexOf('function blobAsAudioDataUrl('), quizSource.indexOf('quizAudioAdd?.addEventListener("click"')), context);
  const payload = { blob: new Blob(['audio'], { type: 'audio/mp4' }), mimeType: 'audio/mp4', durationMs: 1234 };
  return { calls, controller, context, run: () => context.saveInlineAudioRecording(payload, controller.signal) };
}

test('MagicBook create → PUT → confirm preserves actual MP4, signal, duration, and exactly three requests', async () => {
  const h = transportFixture(() => {}); await h.run();
  assert.deepEqual(h.calls.map(call => call.payload?.action || call.method), ['createQuizAudioUpload', 'PUT', 'confirmQuizAudioUpload']);
  assert.equal(h.calls[0].payload.audioMimeType, 'audio/mp4'); assert.equal(h.calls[1].headers['Content-Type'], 'audio/mp4');
  assert.equal(h.calls[2].payload.audioDurationMs, 1234);
  assert.ok(h.calls.every(call => call.signal === h.controller.signal));
});

for (const failAt of [2, 3]) test('MagicBook performs one MIME-correct base64 fallback after failure at request ' + failAt, async () => {
  const h = transportFixture((_call, count) => count === failAt ? { ok: false, status: 503, json: async () => ({ error: 'fixture_failure' }) } : null);
  await h.run(); const fallback = h.calls.at(-1).payload;
  assert.equal(h.calls.length, failAt + 1); assert.equal(fallback.action, 'saveQuizAudio');
  assert.equal(fallback.audioMimeType, 'audio/mp4'); assert.match(fallback.audioBase64, /^data:audio\/mp4;base64,/);
  assert.equal(fallback.audioDurationMs, 1234);
});

for (const cancelAt of [1, 2, 3]) test('MagicBook cancellation at request ' + cancelAt + ' never confirms or falls back afterwards', async () => {
  const h = transportFixture((_call, count, controller) => { if (count === cancelAt) controller.abort(); });
  await assert.rejects(h.run(), { name: 'AbortError' }); assert.equal(h.calls.length, cancelAt);
});

test('MagicBook rejected create and stale/non-admin/trial contexts cannot trigger fallback or uploads', async () => {
  const rejected = transportFixture(() => ({ ok: false, status: 403, json: async () => ({ error: 'admin_required' }) }));
  await assert.rejects(rejected.run(), /admin_required/); assert.equal(rejected.calls.length, 1);
  for (const [key, value] of [['isAdmin', false], ['TRIAL_MODE', true], ['inlineAudioQuestion', null]]) {
    const h = transportFixture(() => {}); h.context[key] = value;
    await assert.rejects(h.run(), error => error.retryable === false); assert.equal(h.calls.length, 0);
  }
});
