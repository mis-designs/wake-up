/* Classic shared script. Load QuizAudioIdentity, MagicBookPopup and
 * MagicAudioFocus first; load the canonical Bangla font CSS alongside this CSS.
 *
 * createButton({ question, availableKeys = window.MagicQuizTheoryKeys,
 *   request(action, language, signal), isCurrent?(), cacheScope?: string | () => string })
 * returns an initially hidden HTMLButtonElement. Availability accepts Set,
 * array, Map or an own-property hash index, keyed ONLY by identity.quizKey.
 * The adapter binds question/auth to request; this module never fetches itself.
 * Text: { theory: { id, correct_answer: boolean, focus_it, explanation: {it,bn} } }
 * Audio: { audio: base64, mimeType } OR { clips: [{audio: base64, mimeType}] }.
 * Text is plain text, never HTML. No autoplay until an explicit audio action.
 *
 * Call reset() synchronously at logout/account replacement (also supported via
 * magicbook:logout), then recreate buttons for the new account. A scope
 * callback is checked while open and after awaits.
 * Without a nonempty scope the cache is private to that opening and cleared on
 * close. Cache has fixed 5-minute TTL, LRU limits of 36 text / 8 audio entries.
 * destroyButton(button) detaches handlers; caller owns DOM removal.
 * close({restoreFocus = true}?) closes the active dialog; reset() also clears
 * caches. No persistence, transport, auth, font download or page adapter here.
 */
(function exposeQuizTheory(root) {
  'use strict';
  if (root.MagicQuizTheory) return;
  const TTL = 5 * 60 * 1000;
  const TIMEOUT = 25000;
  const bindings = new WeakMap();
  const textCache = new Map();
  const audioCache = new Map();
  let active = null;
  let serial = 0;
  let accountEpoch = 0;
  let pendingBack = null;
  let historyOwner = null;
  let unregisterHistory = null;
  let lastHref = root.location.href;

  function cacheGet(cache, key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expires <= Date.now()) { cache.delete(key); return null; }
    cache.delete(key); cache.set(key, entry);
    return entry.value;
  }
  function cachePut(cache, key, value, limit) {
    for (const [k, entry] of cache) if (entry.expires <= Date.now()) cache.delete(k);
    cache.delete(key);
    cache.set(key, { value, expires: Date.now() + TTL });
    while (cache.size > limit) cache.delete(cache.keys().next().value);
  }
  function available(index, key) {
    if (!key || !index) return false;
    if (typeof index.has === 'function') return index.has(key);
    if (Array.isArray(index)) return index.includes(key);
    return Object.prototype.hasOwnProperty.call(index, key) && index[key] !== false && index[key] != null;
  }
  function scopeOf(binding) {
    const value = typeof binding.options.cacheScope === 'function'
      ? binding.options.cacheScope() : binding.options.cacheScope;
    return typeof value === 'string' ? value : '';
  }
  function bindingCurrent(binding) {
    try { return !binding.destroyed && binding.epoch === accountEpoch && (!binding.options.isCurrent || binding.options.isCurrent() === true); }
    catch (_) { return false; }
  }
  function current(state) {
    if (active !== state) return false;
    let valid = false;
    try {
      valid = state.binding.button.isConnected && state.binding.button.getClientRects().length > 0 && bindingCurrent(state.binding)
        && root.location.href === state.href && scopeOf(state.binding) === state.scope;
    } catch (_) { /* A failing account predicate must never expose cached content. */ }
    if (!valid) close({ restoreFocus: false });
    return valid;
  }
  function abortError() { return new DOMException('Aborted', 'AbortError'); }
  async function request(state, action, language) {
    const controller = new AbortController();
    state.controllers.add(controller);
    let timedOut = false;
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = () => reject(timedOut ? new Error('timeout') : abortError()); });
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
    const timer = root.setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT);
    if (action === 'getQuizTheoryAudio') state.audioController = controller;
    try {
      // Racing the signal also settles adapters that do not honor cancellation.
      return await Promise.race([
        Promise.resolve().then(() => {
          if (controller.signal.aborted || !current(state)) throw abortError();
          return state.binding.options.request(action, language, controller.signal);
        }), aborted
      ]);
    } finally {
      root.clearTimeout(timer);
      controller.signal.removeEventListener('abort', rejectAbort);
      state.controllers.delete(controller);
      if (state.audioController === controller) state.audioController = null;
    }
  }
  function normalizeTheory(response) {
    const t = response && response.theory;
    if (!t || (typeof t.id !== 'string' && typeof t.id !== 'number') || !String(t.id).trim()
      || typeof t.correct_answer !== 'boolean'
      || typeof t.focus_it !== 'string' || !t.focus_it.trim()
      || typeof t.explanation?.it !== 'string' || !t.explanation.it.trim()
      || typeof t.explanation?.bn !== 'string' || !t.explanation.bn.trim()) throw new Error('invalid_theory');
    return { id: String(t.id), correct_answer: t.correct_answer, focus_it: t.focus_it,
      explanation: { it: t.explanation.it, bn: t.explanation.bn } };
  }
  function normalizeAudio(response) {
    const clips = Array.isArray(response?.clips) ? response.clips : [response];
    if (!clips.length || clips.length > 64) throw new Error('invalid_audio');
    let bytes = 0;
    return clips.map(clip => {
      if (typeof clip?.audio !== 'string' || !clip.audio.length
        || typeof clip.mimeType !== 'string' || !/^audio\/[\w.+-]+(?:\s*;[^\r\n]*)?$/i.test(clip.mimeType)) throw new Error('invalid_audio');
      bytes += clip.audio.length;
      if (bytes > 32 * 1024 * 1024) throw new Error('audio_too_large');
      const decoded = root.atob(clip.audio);
      if (!decoded.length) throw new Error('invalid_audio');
      const buffer = Uint8Array.from(decoded, ch => ch.charCodeAt(0));
      return new Blob([buffer], { type: clip.mimeType });
    });
  }
  const icons = {
    bulb: '<path d="M9 18h6m-5 3h4M8.1 14.5a6 6 0 1 1 7.8 0c-.9.7-.9 1.5-.9 2.5H9c0-1 0-1.8-.9-2.5Z"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    speak: '<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + icons[name] + '</svg>';
  }
  function status(state, message, retry) {
    state.status.textContent = message;
    state.retryAction = retry || null;
    state.retry.hidden = !retry;
  }
  function mediaUI(state) {
    const playing = !!state.audio && !state.audio.paused && !state.audio.ended;
    state.toggle.innerHTML = icon(playing ? 'pause' : 'play');
    state.toggle.setAttribute('aria-label', playing ? 'Metti in pausa la spiegazione' : 'Riproduci la spiegazione');
    state.toggle.disabled = !state.lang || state.audioBusy;
    for (const button of state.speakers) {
      button.setAttribute('aria-pressed', String(button.dataset.language === state.lang && (playing || state.audioBusy)));
      button.setAttribute('aria-busy', String(button.dataset.language === state.lang && state.audioBusy));
    }
    let label = state.lang ? (state.lang === 'bn' ? 'Bangla' : 'Italiano') : 'Scegli l’icona accanto alla spiegazione';
    if (state.clips?.length > 1) label += ' · Parte ' + (state.clipIndex + 1) + ' di ' + state.clips.length;
    const duration = state.audio?.duration;
    const elapsed = state.audio?.currentTime || 0;
    const known = Number.isFinite(duration) && duration > 0;
    if (state.lang) label += state.audioBusy ? ' · Caricamento…' : playing ? ' · In riproduzione' : state.audio?.ended ? ' · Terminato' : ' · In pausa';
    state.mediaLabel.textContent = label;
    // Each clip owns its duration. Never imply a cumulative duration we lack.
    state.progress.value = known ? Math.min(1, Math.max(0, elapsed / duration)) : 0;
    state.progress.setAttribute('aria-label', 'Avanzamento della parte corrente');
    state.progress.setAttribute('aria-valuetext', known ? Math.floor(elapsed) + ' di ' + Math.ceil(duration) + ' secondi' : 'Durata non ancora disponibile');
  }
  function releaseFocus(state) {
    const token = state.token;
    state.token = null;
    if (token) void root.MagicAudioFocus.completeTransient(token, { resume: false });
  }
  function disposeClip(state) {
    if (state.audio) {
      const audio = state.audio;
      state.audio = null;
      for (const name of ['onended', 'onerror', 'ontimeupdate', 'onloadedmetadata', 'ondurationchange', 'onplay', 'onpause']) audio[name] = null;
      audio.pause(); audio.removeAttribute('src'); audio.load();
    }
    if (state.url) { root.URL.revokeObjectURL(state.url); state.url = null; }
  }
  function stopAudio(state) {
    state.audioVersion++;
    state.audioController?.abort();
    state.audioBusy = false;
    disposeClip(state);
    releaseFocus(state);
    mediaUI(state);
  }
  function claimFocus(state) {
    if (state.token && root.MagicAudioFocus.isCurrent(state.token)) return;
    state.token = root.MagicAudioFocus.beginTransient({
      key: 'quiz-theory:' + state.binding.identity.quizKey,
      stop: () => {
        state.token = null;
        stopAudio(state);
        if (current(state)) status(state, 'Audio interrotto. Premi Riproduci per riascoltare.');
      }
    });
  }
  function audioFailure(state, version) {
    if (!current(state) || version !== state.audioVersion) return;
    stopAudio(state);
    status(state, 'Audio non disponibile.', () => selectAudio(state, state.lang, true));
  }
  async function playClip(state, version) {
    if (!current(state) || version !== state.audioVersion) return;
    disposeClip(state);
    const audio = new root.Audio();
    state.audio = audio;
    state.url = root.URL.createObjectURL(state.clips[state.clipIndex]);
    audio.preload = 'metadata';
    audio.src = state.url;
    const valid = () => current(state) && state.audio === audio && state.audioVersion === version;
    const update = () => { if (valid()) mediaUI(state); };
    audio.ontimeupdate = update; audio.onloadedmetadata = update; audio.ondurationchange = update;
    audio.onplay = update; audio.onpause = update;
    audio.onerror = () => { if (valid()) audioFailure(state, version); };
    audio.onended = () => {
      if (!valid()) return;
      if (state.clipIndex + 1 < state.clips.length) {
        state.clipIndex++;
        void playClip(state, version);
      } else {
        releaseFocus(state);
        mediaUI(state);
        status(state, 'Riproduzione terminata.');
      }
    };
    mediaUI(state);
    try {
      await audio.play();
      if (!valid()) audio.pause();
      else mediaUI(state);
    } catch (_) { if (valid()) audioFailure(state, version); }
  }
  async function selectAudio(state, language, reload = false) {
    if (!current(state) || !state.theory) return;
    if (!reload && state.lang === language && state.audioBusy) return;
    if (!reload && state.lang === language && state.audio && !state.audio.ended) { void toggleAudio(state); return; }
    stopAudio(state);
    state.lang = language;
    state.clips = null;
    state.clipIndex = 0;
    state.audioBusy = true;
    const version = state.audioVersion;
    claimFocus(state);
    mediaUI(state);
    status(state, 'Caricamento audio…');
    const key = JSON.stringify([state.cacheScope, state.binding.identity.quizKey, state.theory.id, language]);
    try {
      if (reload) audioCache.delete(key);
      let clips = cacheGet(audioCache, key);
      if (!clips) {
        clips = normalizeAudio(await request(state, 'getQuizTheoryAudio', language));
        if (!current(state) || state.audioVersion !== version) return;
        cachePut(audioCache, key, clips, 8);
      }
      if (!current(state) || state.audioVersion !== version) return;
      state.clips = clips;
      state.audioBusy = false;
      status(state, '');
      await playClip(state, version);
    } catch (error) {
      if (error.name !== 'AbortError') audioFailure(state, version);
    }
  }
  async function toggleAudio(state) {
    if (!current(state) || state.audioBusy || !state.lang) return;
    const audio = state.audio;
    if (!audio || audio.ended) { void selectAudio(state, state.lang); return; }
    if (!audio.paused) {
      audio.pause(); releaseFocus(state); mediaUI(state); return;
    }
    claimFocus(state);
    const version = state.audioVersion;
    try {
      await audio.play();
      if (!current(state) || state.audio !== audio || version !== state.audioVersion) audio.pause();
      else mediaUI(state);
    } catch (_) { audioFailure(state, version); }
  }
  function paragraph(state, language, text) {
    const p = document.createElement('p');
    p.className = 'quiz-theory-explanation'; p.lang = language;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'quiz-theory-speak'; button.dataset.language = language;
    button.lang = 'it';
    button.setAttribute('aria-label', 'Ascolta la spiegazione in ' + (language === 'bn' ? 'Bangla' : 'italiano'));
    button.title = button.getAttribute('aria-label');
    button.setAttribute('aria-pressed', 'false'); button.innerHTML = icon('speak');
    button.addEventListener('click', () => { void selectAudio(state, language); });
    // Keep the icon with the last word when possible, but allow very long words
    // to wrap at 320px instead of creating horizontal overflow.
    const split = text.lastIndexOf(' ');
    const tail = document.createElement('span'); tail.className = 'quiz-theory-audio-tail';
    tail.append(document.createTextNode(text.slice(split + 1) + ' '), button);
    p.append(document.createTextNode(text.slice(0, split + 1)), tail);
    state.speakers.push(button);
    return p;
  }
  async function loadTheory(state) {
    if (!current(state) || state.textBusy) return;
    state.textBusy = true;
    state.content.setAttribute('aria-busy', 'true');
    status(state, 'Caricamento spiegazione…');
    const key = JSON.stringify([state.cacheScope, state.binding.identity.quizKey]);
    try {
      let theory = cacheGet(textCache, key);
      if (!theory) {
        theory = normalizeTheory(await request(state, 'getQuizTheory', ''));
        if (!current(state)) return;
        cachePut(textCache, key, theory, 36);
      }
      if (!current(state)) return;
      state.theory = theory;
      state.title.textContent = theory.correct_answer ? 'Perché è vero?' : 'Perché è falso?';
      const focus = document.createElement('div'); focus.className = 'quiz-theory-focus';
      const label = document.createElement('small'); label.textContent = 'Il punto decisivo';
      const phrase = document.createElement('strong'); phrase.textContent = '«' + theory.focus_it + '»';
      focus.append(label, phrase);
      state.content.replaceChildren(focus, paragraph(state, 'bn', theory.explanation.bn), paragraph(state, 'it', theory.explanation.it));
      status(state, '');
    } catch (error) {
      if (current(state) && error.name !== 'AbortError') status(state,
        error.message === 'timeout' ? 'Tempo di attesa scaduto.' : 'Spiegazione non disponibile.', () => loadTheory(state));
    } finally {
      state.textBusy = false;
      state.content.setAttribute('aria-busy', 'false');
    }
  }
  function restoreScroll(snapshot) {
    if (snapshot.href === root.location.href) {
      root.scrollTo({ left: snapshot.x, top: snapshot.y, behavior: 'instant' });
      for (const item of snapshot.parents) if (item.node.isConnected) item.node.scrollTo({ left: item.left, top: item.top, behavior: 'instant' });
    }
    root.history.scrollRestoration = snapshot.mode;
  }
  function stripHistoryMarker() {
    if (!root.history.state?.magicQuizTheory) return;
    const { magicQuizTheory, ...rest } = root.history.state;
    try { root.history.replaceState(rest, '', root.location.href); } catch (_) { /* Sandboxed history. */ }
  }
  function ensureHistoryOwner() {
    if (historyOwner === root.MagicBookPopup) return;
    unregisterHistory?.();
    historyOwner = root.MagicBookPopup;
    unregisterHistory = historyOwner.registerHistoryLayer(() => {
      const sameRoute = lastHref === root.location.href;
      lastHref = root.location.href;
      if (pendingBack) {
        const snapshot = pendingBack; pendingBack = null;
        restoreScroll(snapshot);
        if (snapshot.href === root.location.href) return true;
      }
      if (active) {
        const same = active.href === root.location.href;
        close({ fromHistory: true, restoreFocus: same });
        return same;
      }
      if (root.history.state?.magicQuizTheory) { stripHistoryMarker(); return sameRoute; }
      return false;
    });
  }
  function close({ fromHistory = false, restoreFocus = true } = {}) {
    if (!active) return false;
    const state = active; active = null;
    root.clearInterval(state.watchdog); state.observer.disconnect();
    state.controllers.forEach(controller => controller.abort());
    stopAudio(state);
    state.binding.button.setAttribute('aria-expanded', 'false');
    state.binding.button.removeAttribute('aria-controls');
    state.unmount({ restoreFocus });
    restoreScroll(state.scroll);
    if (!state.scope) { textCache.clear(); audioCache.clear(); }
    if (!fromHistory && state.ownsHistory && state.href === root.location.href
      && root.history.state?.magicQuizTheory === state.id) {
      pendingBack = state.scroll;
      root.history.scrollRestoration = 'manual';
      try { root.history.back(); } catch (_) { pendingBack = null; stripHistoryMarker(); restoreScroll(state.scroll); }
    }
    return true;
  }
  function open(binding) {
    if (active || pendingBack || !bindingCurrent(binding) || !binding.button.isConnected || binding.button.hidden
      || binding.button.closest('[inert]') || !binding.identity) return;
    if (!available(binding.options.availableKeys === undefined ? root.MagicQuizTheoryKeys : binding.options.availableKeys, binding.identity.quizKey)) {
      binding.button.hidden = true; return;
    }
    let scope;
    try { scope = scopeOf(binding); } catch (_) { return; }
    ensureHistoryOwner();
    const id = 'quiz-theory-' + (++serial);
    const overlay = document.createElement('div'); overlay.className = 'quiz-theory-overlay'; overlay.tabIndex = -1;
    overlay.innerHTML = '<section class="quiz-theory-dialog" role="dialog" aria-modal="true" lang="it" tabindex="-1" id="' + id + '" aria-labelledby="' + id + '-title">'
      + '<header class="quiz-theory-header"><div><small>Capire la risposta</small><h2 class="quiz-theory-title" id="' + id + '-title">Perché?</h2></div>'
      + '<button type="button" class="quiz-theory-close" aria-label="Chiudi spiegazione" title="Chiudi spiegazione">' + icon('close') + '</button></header>'
      + '<div class="quiz-theory-content" aria-busy="true"></div>'
      + '<footer class="quiz-theory-footer"><div class="quiz-theory-media"><button type="button" class="quiz-theory-media-toggle" disabled aria-label="Riproduci la spiegazione">' + icon('play') + '</button>'
      + '<div class="quiz-theory-media-body"><div class="quiz-theory-media-label"></div><progress class="quiz-theory-progress" max="1" value="0"></progress></div></div>'
      + '<div class="quiz-theory-feedback"><span class="quiz-theory-status" role="status" aria-live="polite" aria-atomic="true"></span><button type="button" class="quiz-theory-retry" hidden>Riprova</button></div></footer></section>';
    const find = selector => overlay.querySelector(selector);
    const scroll = { href: root.location.href, x: root.scrollX, y: root.scrollY, mode: root.history.scrollRestoration, parents: [] };
    for (let node = binding.button.parentElement; node; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) scroll.parents.push({ node, top: node.scrollTop, left: node.scrollLeft });
    }
    const state = { id, binding, scope, cacheScope: scope || '@opening:' + id, href: root.location.href, scroll, overlay,
      controllers: new Set(), audioVersion: 0, audioBusy: false, audio: null, url: null, token: null, lang: '',
      speakers: [], clipIndex: 0, content: find('.quiz-theory-content'), title: find('.quiz-theory-title'),
      status: find('.quiz-theory-status'), retry: find('.quiz-theory-retry'), toggle: find('.quiz-theory-media-toggle'),
      progress: find('.quiz-theory-progress'), mediaLabel: find('.quiz-theory-media-label') };
    const closeButton = find('.quiz-theory-close');
    closeButton.addEventListener('click', () => close());
    state.retry.addEventListener('click', () => { if (current(state)) state.retryAction?.(); });
    state.toggle.addEventListener('click', () => { void toggleAudio(state); });
    document.body.append(overlay);
    state.unmount = root.MagicBookPopup.mount(overlay, {
      focusable: () => overlay.querySelectorAll('button:not([hidden])'), returnFocus: binding.button,
      bodyClass: 'quiz-theory-open', initialFocus: closeButton, onDismiss: () => close()
    });
    active = state;
    binding.button.setAttribute('aria-expanded', 'true'); binding.button.setAttribute('aria-controls', id);
    lastHref = state.href;
    try {
      root.history.pushState({ ...root.history.state, magicQuizTheory: id }, '', state.href);
      root.history.scrollRestoration = 'manual'; state.ownsHistory = true;
    } catch (_) { /* Popup dismissal still works when history is unavailable. */ }
    state.observer = new MutationObserver(() => { current(state); });
    state.observer.observe(document.body, { childList: true, subtree: true });
    // Predicates can change without DOM mutations (SPA navigation/account switch).
    state.watchdog = root.setInterval(() => { current(state); }, 250);
    mediaUI(state);
    void loadTheory(state);
  }
  function createButton(options) {
    if (!options || typeof options.request !== 'function') throw new TypeError('MagicQuizTheory requires request(action, language, signal)');
    if (!root.QuizAudioIdentity?.getIdentity || !root.MagicBookPopup?.mount || !root.MagicBookPopup?.registerHistoryLayer
      || !root.MagicAudioFocus?.beginTransient || !root.MagicAudioFocus?.completeTransient || !root.MagicAudioFocus?.isCurrent) {
      throw new Error('Load QuizAudioIdentity, MagicBookPopup and MagicAudioFocus before MagicQuizTheory.createButton');
    }
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'quiz-theory-button'; button.hidden = true; button.lang = 'it';
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Perché? কেন');
    button.innerHTML = '<span class="quiz-theory-button-label">Perché?</span>' + icon('bulb') + '<span class="quiz-theory-button-bn" lang="bn">কেন</span>';
    const binding = { button, options, identity: null, destroyed: false, epoch: accountEpoch };
    binding.click = event => { event.stopPropagation(); open(binding); };
    button.addEventListener('click', binding.click); bindings.set(button, binding);
    const question = options.question || {};
    Promise.resolve().then(() => root.QuizAudioIdentity.getIdentity(question.question || question.q, question.figure || question.img))
      .then(identity => {
        if (!bindingCurrent(binding)) return;
        binding.identity = identity;
        button.hidden = !available(options.availableKeys === undefined ? root.MagicQuizTheoryKeys : options.availableKeys, identity.quizKey);
      }).catch(() => { button.hidden = true; });
    return button;
  }
  function destroyButton(button) {
    const binding = bindings.get(button);
    if (!binding) return;
    binding.destroyed = true;
    if (active?.binding === binding) close({ restoreFocus: false });
    button.removeEventListener('click', binding.click); button.hidden = true; bindings.delete(button);
  }
  function reset() {
    accountEpoch++;
    close({ restoreFocus: false }); textCache.clear(); audioCache.clear();
  }
  root.addEventListener('magicbook:quiz-question-change', () => close({ restoreFocus: false }), { capture: true });
  root.addEventListener('magicbook:logout', reset, { capture: true });
  root.addEventListener('pagehide', () => {
    close({ fromHistory: true, restoreFocus: false });
    if (pendingBack) { restoreScroll(pendingBack); pendingBack = null; }
    stripHistoryMarker(); textCache.clear(); audioCache.clear();
  });
  root.MagicQuizTheory = Object.freeze({ createButton, destroyButton, close, reset });
})(window);
