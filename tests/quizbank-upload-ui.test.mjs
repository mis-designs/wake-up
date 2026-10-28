import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Run with: node --test tests/quizbank-upload-ui.test.mjs
// No browser, credentials, real timers, network, storage writes, or backend imports.
// This DOM models focus/hidden/inert and events, not layout or audio decoding.
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const uploaderSource = read("quiz-audio-upload.js");
const popupSource = read("app-popup.js");
const studySource = read("study-quiz.js");
function section(start, end) {
  const first = studySource.indexOf(start), last = studySource.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Missing study source boundaries: ${start} / ${end}`);
  return studySource.slice(first, last);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function until(predicate, description) {
  for (let turn = 0; turn < 40 && !predicate(); turn++) await Promise.resolve();
  assert.ok(predicate(), description);
}

class Events {
  listeners = new Map();
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, properties = {}) {
    const event = { type, target: this, defaultPrevented: false, immediateStopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
      stopImmediatePropagation() { this.immediateStopped = true; }, ...properties };
    const pending = [];
    for (const handler of [...(this.listeners.get(type) || [])]) {
      pending.push(handler(event));
      if (event.immediateStopped) break;
    }
    const propertyHandler = this[`on${type}`];
    if (propertyHandler) pending.push(propertyHandler(event));
    return { event, done: Promise.all(pending) };
  }
}

function domFixture() {
  const document = new Events();
  class Element extends Events {
    constructor(tag) {
      super(); this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
      this.attributes = new Map(); this.dataset = {}; this.className = "";
      this.hidden = false; this.inert = false; this.disabled = false; this.files = [];
      this.duration = NaN; this.paused = true; this.pauseCalls = 0; this.focusCalls = 0;
      const tokens = () => new Set(this.className.split(/\s+/).filter(Boolean));
      this.classList = {
        contains: name => tokens().has(name),
        add: (...names) => { const set = tokens(); names.forEach(name => set.add(name)); this.className = [...set].join(" "); },
        remove: (...names) => { const set = tokens(); names.forEach(name => set.delete(name)); this.className = [...set].join(" "); },
        toggle: (name, force) => {
          const enabled = force ?? !tokens().has(name);
          this.classList[enabled ? "add" : "remove"](name); return enabled;
        }
      };
    }
    get isConnected() { return this === document.body || Boolean(this.parentElement?.isConnected); }
    get firstElementChild() { return this.children[0] || null; }
    get value() { return this._value || ""; }
    set value(value) { this._value = value; if (this.tagName === "INPUT" && value === "") this.files = []; }
    get textContent() { return this._text || ""; }
    set textContent(value) { this._text = String(value); this.children.forEach(child => child.remove()); }
    append(...children) { children.forEach(child => { child.remove(); child.parentElement = this; this.children.push(child); }); }
    appendChild(child) { this.append(child); return child; }
    insertBefore(child, before) { child.remove(); child.parentElement = this; this.children.splice(this.children.indexOf(before), 0, child); }
    remove() {
      if (!this.parentElement) return;
      if (this.contains(document.activeElement)) document.activeElement = document.body;
      this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      this.parentElement = null;
    }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    setAttribute(name, value = "") {
      this.attributes.set(name, String(value));
      if (name === "class") this.className = String(value);
      if (["hidden", "disabled", "inert"].includes(name)) this[name] = true;
      if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = String(value);
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); if (["hidden", "disabled", "inert"].includes(name)) this[name] = false; }
    matches(selector) {
      return selector.split(",").some(part => {
        const value = part.trim();
        if (value.startsWith(".")) return this.classList.contains(value.slice(1));
        if (value.startsWith("#")) return this.getAttribute("id") === value.slice(1);
        if (value.startsWith("[")) {
          const name = value.slice(1, -1);
          return ["hidden", "disabled", "inert"].includes(name) ? this[name] : this.attributes.has(name);
        }
        return this.tagName.toLowerCase() === value;
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) {
      const matches = [];
      const visit = node => node.children.forEach(child => {
        const parts = selector.trim().split(/\s+(?![^[]*\])/);
        const descendant = !selector.includes(",") && parts.length === 2;
        if (descendant ? child.matches(parts[1]) && child.parentElement?.closest(parts[0]) : child.matches(selector)) matches.push(child);
        visit(child);
      });
      visit(this); return matches;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getClientRects() { return this.isConnected && !this.closest("[hidden], .hidden") ? [{}] : []; }
    focus() {
      this.focusCalls++;
      if (this.getClientRects().length && !this.disabled && !this.closest("[inert]")) document.activeElement = this;
    }
    pause() { this.paused = true; this.pauseCalls++; }
    load() { this.duration = NaN; }
    set innerHTML(html) {
      // Parse only the application's fixed markup. Supplied strings go through textContent.
      const stack = [this];
      for (const token of html.match(/<\/?[\w-]+\b[^>]*>|[^<]+/g) || []) {
        if (token.startsWith("</")) { stack.pop(); continue; }
        if (!token.startsWith("<")) { stack.at(-1)._text = (stack.at(-1)._text || "") + token; continue; }
        const [, tag, attributes] = token.match(/^<([\w-]+)([^>]*)>/);
        const child = new Element(tag);
        for (const match of attributes.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) child.setAttribute(match[1], match[2] ?? "");
        stack.at(-1).append(child);
        if (!["input", "img", "br", "hr", "source"].includes(tag)) stack.push(child);
      }
    }
  }
  document.body = new Element("body"); document.activeElement = document.body; document.hidden = false;
  document.createElement = tag => new Element(tag);
  document.querySelector = selector => document.body.querySelector(selector);
  return { document, Element };
}

function fixture() {
  const { document, Element } = domFixture(), window = new Events();
  const timers = new Map(), frames = new Map(), createdUrls = [], revokedUrls = [], routes = [], tasks = [];
  let sequence = 0;
  const background = document.createElement("main"), trigger = document.createElement("button");
  const alreadyInert = document.createElement("aside"); alreadyInert.inert = true;
  background.append(trigger); document.body.append(background, alreadyInert);
  const location = { href: "https://quizbank.invalid/quizbank?scheda=2" };
  const entries = [
    { url: "https://quizbank.invalid/quizbank", state: { screen: "study" } },
    { url: "https://quizbank.invalid/quizbank?scheda=1", state: { screen: "studyChapter", chapter: 1 } },
    { url: location.href, state: { screen: "studyChapter", chapter: 2 } }
  ];
  let position = 2;
  const history = {
    get state() { return entries[position].state; },
    get length() { return entries.length; },
    pushState(state, _, url) {
      entries.splice(position + 1); entries.push({ state: structuredClone(state), url: new URL(url, location.href).href });
      position++; location.href = entries[position].url;
    },
    replaceState(state, _, url) { entries[position] = { state: structuredClone(state), url: new URL(url, location.href).href }; location.href = entries[position].url; },
    back() { tasks.push(() => history.go(-1)); },
    go(offset) {
      assert.ok(position + offset >= 0 && position + offset < entries.length, "Fixture navigation is in range");
      position += offset; location.href = entries[position].url;
      return window.emit("popstate", { state: history.state }).event;
    }
  };
  Object.assign(window, {
    setTimeout(fn, delay) { timers.set(++sequence, { fn, delay }); return sequence; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame(fn) { frames.set(++sequence, fn); return sequence; },
    cancelAnimationFrame: id => frames.delete(id)
  });
  const context = vm.createContext({ window, document, HTMLElement: Element, history, location,
    AbortController, DOMException, Uint8Array, btoa, URL: { createObjectURL(file) {
      const url = `blob:fixture-${createdUrls.length + 1}`; createdUrls.push({ url, file }); return url;
    }, revokeObjectURL: url => revokedUrls.push(url) },
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
    fetch() { assert.fail("Unexpected network access"); }
  });
  vm.runInContext(popupSource, context, { filename: "app-popup.js" });
  vm.runInContext(uploaderSource, context, { filename: "quiz-audio-upload.js" });
  window.addEventListener("popstate", () => routes.push({ url: location.href, state: structuredClone(history.state) }));
  const flushFrames = () => { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } };
  const find = selector => document.querySelector(selector);
  const h = { context, window, document, background, trigger, alreadyInert, history, location, entries,
    timers, createdUrls, revokedUrls, routes, flushFrames, find,
    get modal() { return find(".quiz-audio-upload-overlay"); },
    open(options = {}) {
      window.MagicQuizAudioUpload.open({ trigger, label: "Scheda 2 · Domanda 1", question: "Domanda di prova",
        isCurrent: () => true, save: async () => ({}), onSaved() {}, ...options });
      flushFrames();
    },
    flushBack() { assert.ok(tasks.length, "A history traversal was scheduled"); return tasks.shift()(); },
    select(overrides = {}) {
      const bytes = Uint8Array.of(1, 2, 3, 255);
      const file = { name: "spiegazione.wav", type: "audio/wav", size: bytes.length,
        arrayBuffer: async () => bytes.buffer, ...overrides };
      const input = find("input"); input.files = [file]; input._value = `C:\\fakepath\\${file.name}`;
      input.emit("change"); return file;
    },
    metadata(duration = 1.25) { const audio = find("audio"); audio.duration = duration; audio.emit("loadedmetadata"); },
    click(selector) { const node = find(selector); assert.ok(node, selector); return node.disabled ? Promise.resolve() : node.emit("click").done; },
    runTimers(delay) { for (const [id, item] of [...timers]) if (item.delay === delay) { timers.delete(id); item.fn(); } }
  };
  return h;
}

function studyFixture(h, { canUpload = true, quizbank = true } = {}) {
  const first = { id: "qb_s02_q01", question: "Domanda identica", figure: "", correct: true, number: 1 };
  const rows = [first, { ...first, id: "qb_s02_q02", number: 2 }, { ...first, id: "qb_s02_q03", question: "Altra domanda", number: 3 }];
  const list = h.document.createElement("div"); h.background.append(list);
  const controls = rows.map((row, index) => {
    const card = h.document.createElement("article"), surface = h.document.createElement("div");
    const play = h.document.createElement("button"), upload = index === 0 ? h.trigger : h.document.createElement("button");
    surface.className = "study-explanation-media hidden"; surface._uploadButton = upload;
    surface.append(play); card.append(surface, upload); list.append(card);
    return { card, surface, play, upload };
  });
  const requests = [], saves = [], toasts = [];
  let identity = "fixture-account", stopped = 0;
  Object.assign(h.context, {
    QUIZBANK_MODE: quizbank, audioObserver: null, elements: { list },
    fixtureRows: rows, fixtureCanUpload: canUpload,
    studyVideoIdentity: () => identity, stopPlayback: () => stopped++, showToast: text => toasts.push(text),
    audioApi(action, question, options) {
      const work = deferred(), call = { action, question, ...options, ...work };
      (action === "saveQuizAudio" ? saves : requests).push(call); return work.promise;
    }
  });
  // Use production state declarations too, so added availability guards retain
  // their real initialization rather than a second implementation in the test.
  vm.runInContext(section("  let currentChapter =", "  function parseSession("), h.context);
  vm.runInContext("questions = fixtureRows; currentChapter = 2; quizBankCanUploadAudio = fixtureCanUpload;", h.context);
  vm.runInContext(section("  function audioStatusKey(", "  const audioObserver =")
    + section("  function observeAudioAvailability(", "  async function playExplanation(")
    + section("  function openQuizBankAudioUpload(", "  function renderQuestions("), h.context);
  return { rows, controls, requests, saves, toasts,
    get stopped() { return stopped; },
    get requestMap() { return vm.runInContext("audioStatusRequests", h.context); },
    cache: row => h.context.cachedAudioAvailability(row),
    setIdentity(value) { identity = value; },
    navigate() { vm.runInContext("loadRequestId++;", h.context); },
    open() { h.context.openQuizBankAudioUpload(first, controls[0], h.trigger); h.flushFrames(); },
    check(index) {
      const { card, surface } = controls[index];
      h.context.observeAudioAvailability(card, rows[index], surface);
      h.context.cancelPendingAudioStatus(card);
      return card._checkStudyAudio();
    },
    captureCallbacks() {
      let options;
      const actual = h.window.MagicQuizAudioUpload;
      h.window.MagicQuizAudioUpload = { open(value) { options = value; } };
      try { h.context.openQuizBankAudioUpload(first, controls[0], h.trigger); }
      finally { h.window.MagicQuizAudioUpload = actual; }
      assert.ok(options); return options;
    }
  };
}

test("uploader mounts one labelled dialog, isolates the background, traps focus, and restores inert state", async () => {
  const h = fixture(); h.open({ question: "<img src=x onerror=bad()>" });
  const card = h.modal.firstElementChild;
  assert.equal(card.getAttribute("role"), "dialog");
  assert.equal(card.getAttribute("aria-modal"), "true");
  assert.ok(h.find(`#${card.getAttribute("aria-labelledby")}`));
  assert.equal(h.find(".quiz-audio-upload-question").textContent, "<img src=x onerror=bad()>");
  assert.equal(h.find(".quiz-audio-upload-question").children.length, 0);
  assert.equal(h.find("[data-upload-save]").disabled, true);
  assert.equal(h.document.activeElement, h.find("input"));
  assert.equal(h.background.inert, true);
  h.open(); assert.equal(h.document.body.querySelectorAll(".quiz-audio-upload-overlay").length, 1);
  h.find("[data-upload-cancel]").focus();
  const tab = h.modal.emit("keydown", { key: "Tab" }).event;
  assert.equal(tab.defaultPrevented, true); assert.equal(h.document.activeElement, h.find("[data-upload-close]"));
  h.modal.emit("keydown", { key: "Escape" });
  assert.equal(h.modal, null); assert.equal(h.background.inert, false); assert.equal(h.alreadyInert.inert, true);
  assert.equal(h.document.activeElement, h.trigger); assert.equal(h.flushBack().immediateStopped, true);
  assert.equal(h.routes.length, 0);
});

test("same-base Back is consumed, while forwarding into a stale modal marker reaches the route", () => {
  const h = fixture(); h.open();
  assert.equal(h.history.go(-1).immediateStopped, true);
  assert.equal(h.modal, null); assert.equal(h.routes.length, 0);
  assert.equal(h.history.go(1).immediateStopped, false);
  assert.equal(h.history.state.quizAudioUpload, undefined);
  assert.equal(h.routes.length, 1); assert.equal(h.routes[0].state.chapter, 2);
});

test("same-base Back preserves a selected file until explicit discard", async () => {
  const h = fixture(); h.open(); h.select(); h.metadata();
  assert.equal(h.history.go(-1).immediateStopped, true);
  assert.ok(h.modal); assert.equal(h.find(".quiz-audio-upload-discard").hidden, false);
  assert.equal(h.document.activeElement, h.find("[data-upload-keep]")); assert.equal(h.routes.length, 0);
  await h.click("[data-upload-keep]"); assert.equal(h.document.activeElement, h.find("[data-upload-save]"));
  await h.click("[data-upload-close]"); await h.click("[data-upload-discard]");
  assert.equal(h.modal, null); assert.equal(h.flushBack().immediateStopped, true);
  assert.equal(h.routes.length, 0); assert.equal(h.revokedUrls.length, 1);
});

for (const selected of [false, true]) {
  for (const sameUrl of [false, true]) {
    test(`multi-entry Back reaches its route (selected=${selected}, same URL/different state=${sameUrl})`, () => {
      const h = fixture();
      if (sameUrl) h.entries[1].url = h.location.href;
      h.open(); if (selected) { h.select(); h.metadata(); }
      assert.equal(h.history.go(-2).immediateStopped, false);
      assert.equal(h.modal, null); assert.equal(h.history.state.chapter, 1);
      assert.equal(h.history.length, 4, "A mismatch must not push the modal onto the destination");
      assert.equal(h.routes.length, 1); assert.equal(h.routes[0].state.chapter, 1);
      assert.equal(h.background.inert, false);
    });
  }
}

test("programmatic close consumes only its scheduled base-state traversal", () => {
  const h = fixture(); h.open(); h.window.MagicQuizAudioUpload.close();
  // Another traversal wins before the pending history.back task is dispatched.
  assert.equal(h.history.go(-2).immediateStopped, false);
  assert.equal(h.routes.length, 1); assert.equal(h.routes[0].state.chapter, 1);
});

test("file validation rejects empty, oversized and unsupported selections without an upload", async t => {
  for (const [file, pattern] of [[{ size: 0 }, /vuoto/i], [{ size: 3 * 1024 * 1024 + 1 }, /3 MB/], [{ name: "test.txt" }, /formato/i]]) {
    await t.test(JSON.stringify(file), () => {
      const h = fixture(); h.open(); h.select(file);
      assert.equal(h.find("[data-upload-save]").disabled, true);
      assert.equal(h.find("input").getAttribute("aria-invalid"), "true");
      assert.match(h.find("#quizAudioUploadStatus").textContent, pattern); assert.equal(h.createdUrls.length, 0);
    });
  }
});

test("metadata, replacement and removal control readiness and release obsolete previews", () => {
  const h = fixture(); h.open(); const file = h.select({ name: "<script>test</script>.wav", size: 3 * 1024 * 1024 });
  assert.equal(h.find("input").files[0], file, "Selecting a file must preserve the native picker selection");
  assert.equal(h.find("[data-upload-filename]").children.length, 0);
  assert.equal(h.find("[data-upload-save]").disabled, true);
  const obsoleteMetadata = h.find("audio").onloadedmetadata;
  h.select(); h.find("audio").duration = 2; obsoleteMetadata();
  assert.equal(h.find("[data-upload-save]").disabled, true, "The previous file cannot validate its replacement");
  h.metadata(); assert.equal(h.find("[data-upload-save]").disabled, false);
  h.find("[data-upload-remove]").emit("click");
  assert.equal(h.find("input").value, ""); assert.equal(h.find(".quiz-audio-upload-selection").hidden, true);
  assert.equal(h.find("[data-upload-save]").disabled, true); assert.equal(h.document.activeElement, h.find("input"));
  assert.equal(h.revokedUrls.length, 2); assert.equal(h.timers.size, 0);
});

test("invalid, unreadable or timed-out metadata cannot enable uploading", async t => {
  for (const duration of [0, NaN, Infinity, 3601]) await t.test(String(duration), () => {
    const h = fixture(); h.open(); h.select(); h.metadata(duration);
    assert.equal(h.find("[data-upload-save]").disabled, true);
    assert.equal(h.find("input").getAttribute("aria-invalid"), "true");
  });
  for (const failure of ["error", "timeout"]) await t.test(failure, () => {
    const h = fixture(); h.open(); h.select();
    if (failure === "error") h.find("audio").emit("error"); else h.runTimers(8000);
    assert.equal(h.find("[data-upload-save]").disabled, true);
    assert.match(h.find("#quizAudioUploadStatus").textContent, /non riesco a leggere/i);
  });
});

test("one pending save sends exact bytes, locks controls and closes on success", async () => {
  const h = fixture(), work = deferred(), calls = []; let saved = 0;
  h.open({ save: (payload, signal) => { calls.push({ payload, signal }); return work.promise; }, onSaved: () => saved++ });
  h.select(); h.metadata(); const saving = h.click("[data-upload-save]");
  await until(() => calls.length === 1, "The save request starts");
  await h.click("[data-upload-save]"); assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.audioBase64, "AQID/w=="); assert.equal(calls[0].payload.audioMimeType, "audio/wav");
  assert.equal(calls[0].payload.audioDurationMs, 1250);
  for (const selector of ["input", "[data-upload-remove]", "[data-upload-save]"]) assert.equal(h.find(selector).disabled, true);
  assert.equal(h.find("[data-upload-save]").getAttribute("aria-busy"), "true");
  work.resolve({ ok: true }); await saving;
  assert.equal(saved, 1); assert.equal(h.modal, null); assert.equal(h.revokedUrls.length, 1);
  assert.equal(h.window.listeners.get("beforeunload").size, 0); assert.equal(h.flushBack().immediateStopped, true);
});

test("network failure preserves the same file for an explicit, single retry", async () => {
  const h = fixture(), payloads = []; let saved = 0;
  h.open({ save: async payload => { payloads.push(payload); if (payloads.length === 1) throw new TypeError("Network failed"); }, onSaved: () => saved++ });
  const file = h.select(); h.metadata(); await h.click("[data-upload-save]");
  assert.equal(payloads.length, 1); assert.equal(h.find("input").files[0], file);
  assert.equal(h.find("[data-upload-save]").disabled, false); assert.match(h.find("#quizAudioUploadStatus").textContent, /riprova/i);
  await h.click("[data-upload-save]"); assert.equal(payloads.length, 2);
  assert.equal(payloads[0].audioBase64, payloads[1].audioBase64); assert.equal(saved, 1);
});

test("review-required is terminal for the selected file and points to review, not retry", async () => {
  const h = fixture(); let saves = 0, conflicts = 0;
  h.open({ save: async () => { saves++; throw new Error("quiz_audio_requires_review"); }, onConflict: () => conflicts++ });
  h.select(); h.metadata(); await h.click("[data-upload-save]");
  assert.equal(h.find("[data-upload-save]").disabled, true); assert.equal(conflicts, 0);
  assert.match(h.find("#quizAudioUploadStatus").textContent, /verifica/i);
  assert.match(h.find("#quizAudioUploadStatus").textContent, /nessun audio è stato sostituito/i);
  assert.doesNotMatch(h.find("#quizAudioUploadStatus").textContent, /riprova con lo stesso file/i);
  await h.click("[data-upload-save]"); assert.equal(saves, 1);
  assert.equal(h.find("input").disabled, false); assert.equal(h.find("[data-upload-remove]").disabled, false);
});

test("server validation failure requires another file before retry", async () => {
  const h = fixture(); h.open({ save: async () => { throw new Error("invalid_audio_type"); } });
  h.select(); h.metadata(); await h.click("[data-upload-save]");
  assert.equal(h.find("[data-upload-save]").disabled, true); assert.equal(h.find("input").getAttribute("aria-invalid"), "true");
  h.select(); h.metadata(); assert.equal(h.find("[data-upload-save]").disabled, false);
});

test("cancel aborts the pending save and allows deliberate recovery", async () => {
  const h = fixture(); let signal, saved = 0;
  h.open({ save: (_, incoming) => { signal = incoming; return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true })); }, onSaved: () => saved++ });
  h.select(); h.metadata(); const saving = h.click("[data-upload-save]");
  await until(() => signal, "Save receives a cancellation signal");
  await h.click("[data-upload-cancel]"); await saving;
  assert.equal(signal.aborted, true); assert.equal(saved, 0); assert.ok(h.modal);
  assert.equal(h.find("[data-upload-save]").disabled, false);
});

test("navigation during file reading or a late save cannot publish stale success", async t => {
  for (const stage of ["file", "save"]) await t.test(stage, async () => {
    const h = fixture(), work = deferred(); let current = true, calls = 0, saved = 0;
    h.open({ isCurrent: () => current, save: () => { calls++; return work.promise; }, onSaved: () => saved++ });
    h.select(stage === "file" ? { arrayBuffer: () => work.promise } : {}); h.metadata();
    const saving = h.click("[data-upload-save]");
    if (stage === "save") await until(() => calls === 1, "Save starts before navigation");
    current = false; work.resolve(stage === "file" ? new ArrayBuffer(4) : { ok: true }); await saving;
    assert.equal(saved, 0); assert.equal(h.modal, null); assert.equal(calls, stage === "file" ? 0 : 1);
  });
});

test("backgrounding pauses preview; page exit cleans up without traversing history", () => {
  const h = fixture(); h.open(); h.select(); h.metadata();
  const audio = h.find("audio"); audio.paused = false; h.document.hidden = true; h.document.emit("visibilitychange");
  assert.equal(audio.paused, true); assert.equal(h.window.emit("beforeunload").event.defaultPrevented, true);
  h.window.emit("pagehide"); assert.equal(h.modal, null); assert.equal(h.revokedUrls.length, 1);
  assert.equal(h.window.listeners.get("beforeunload").size, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.history.state.chapter, 2); assert.equal(h.routes.length, 0);
});

test("study integration gates opening on the server capability, QuizBank mode and current identity", async t => {
  for (const reason of ["capability", "mode", "identity", "detached"]) await t.test(reason, () => {
    const h = fixture(), s = studyFixture(h, { canUpload: reason !== "capability", quizbank: reason !== "mode" });
    if (reason === "identity") s.setIdentity("");
    if (reason === "detached") h.trigger.remove();
    s.open(); assert.equal(h.modal, null); assert.equal(s.saves.length, 0);
  });
  const h = fixture(), s = studyFixture(h); s.open(); assert.ok(h.modal); assert.equal(s.stopped, 1);
});

test("existing-audio conflict restores focus to the newly available player, never the hidden trigger", async () => {
  const h = fixture(), s = studyFixture(h); s.open(); h.select(); h.metadata();
  const saving = h.click("[data-upload-save]"); await until(() => s.saves.length === 1, "Save starts");
  assert.equal(s.saves[0].action, "saveQuizAudio"); assert.equal(s.saves[0].timeoutMs, 30000);
  assert.equal(s.saves[0].question.id, s.rows[0].id);
  s.saves[0].reject(new Error("quiz_audio_already_exists")); await saving;
  assert.equal(h.trigger.hidden, true); assert.equal(s.controls[0].surface.dataset.audioState, "ready");
  assert.equal(h.find("[data-upload-save]").disabled, true); assert.equal(s.cache(s.rows[0]), true);
  await h.click("[data-upload-close]"); await h.click("[data-upload-discard]");
  assert.equal(h.modal, null); assert.equal(h.document.activeElement, s.controls[0].play);
  assert.equal(h.trigger.focusCalls, 0, "The shared popup must not attempt its original return target");
  assert.equal(h.flushBack().immediateStopped, true);
});

test("successful save aborts only matching pending statuses before painting duplicates ready", async () => {
  const h = fixture(), s = studyFixture(h), callbacks = s.captureCallbacks();
  const duplicate = s.check(1), unrelated = s.check(2);
  callbacks.onSaved();
  assert.equal(s.requests[0].signal.aborted, true); assert.equal(s.requests[1].signal.aborted, false);
  assert.equal(s.requestMap.has(s.rows[1].id), false); assert.equal(s.requestMap.has(s.rows[2].id), true);
  s.requests.forEach(request => request.resolve({ available: false })); await Promise.all([duplicate, unrelated]);
  for (const index of [0, 1]) {
    assert.equal(s.controls[index].surface.dataset.audioState, "ready");
    assert.equal(s.controls[index].upload.hidden, true); assert.equal(s.cache(s.rows[index]), true);
  }
  assert.equal(s.controls[2].surface.dataset.audioState, "unavailable");
  assert.equal(h.document.activeElement, s.controls[0].play); assert.equal(s.toasts.length, 1);
});

for (const response of [{ available: false }, { available: false, temporaryUnavailable: true }]) {
  test(`committed availability survives a response after request cleanup: ${JSON.stringify(response)}`, async () => {
    const h = fixture(), s = studyFixture(h), callbacks = s.captureCallbacks();
    const checking = s.check(1);
    s.requests[0].resolve(response);
    // Advance real microtasks until the request's finally removes its abort
    // handle, but before the awaiting observer has painted its response.
    await until(() => !s.requestMap.has(s.rows[1].id), "The status request has left the map");
    assert.equal(s.controls[1].surface.dataset.audioState, undefined, "The observer must still be waiting");
    callbacks.onSaved(); assert.equal(s.requests[0].signal.aborted, false, "No abort handle remained at save time");
    await checking;
    assert.equal(s.cache(s.rows[1]), true);
    assert.equal(s.controls[1].surface.dataset.audioState, "ready");
    assert.equal(s.controls[1].surface.classList.contains("hidden"), false);
    assert.equal(s.controls[1].upload.hidden, true);
  });
}

test("committed availability survives a rejection after request cleanup", async () => {
  const h = fixture(), s = studyFixture(h), callbacks = s.captureCallbacks();
  const checking = s.check(1);
  s.requests[0].reject(new TypeError("Failed to fetch"));
  await until(() => !s.requestMap.has(s.rows[1].id), "The rejected request has left the map");
  assert.equal(s.controls[1].surface.dataset.audioState, undefined, "The observer's catch must still be waiting");
  callbacks.onSaved();
  assert.equal(s.requests[0].signal.aborted, false, "Save could not cancel the removed request");
  await checking;
  assert.equal(s.cache(s.rows[1]), true);
  assert.equal(s.controls[1].surface.dataset.audioState, "ready");
  assert.equal(s.controls[1].surface.classList.contains("hidden"), false);
  assert.equal(s.controls[1].upload.hidden, true);
});

test("stale sheet callbacks cannot paint or move focus after navigation", () => {
  const h = fixture(), s = studyFixture(h), callbacks = s.captureCallbacks(); s.navigate();
  callbacks.onSaved(); callbacks.onConflict();
  assert.equal(s.cache(s.rows[0]), undefined); assert.equal(s.toasts.length, 0);
  assert.equal(s.controls[0].play.focusCalls, 0); assert.equal(h.trigger.hidden, false);
});
