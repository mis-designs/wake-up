(function(root) {
  'use strict';
  const bindings = new Set(), cache = new Map();
  let active = null, epoch = 0, pendingBack = false;
  const icon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="4" stroke="currentColor" stroke-width="1.8"/><path d="m10 8 6 4-6 4Z" fill="currentColor"/></svg>';
  const uploadIcon = '<span class="quiz-video-upload-icon" aria-hidden="true"></span>';
  const bytes = value => `${(value / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`;
  const messages = {
    video_size_invalid: 'Scegli un video MP4 fino a 128 MB.', video_mp4_required: 'Scegli un video in formato MP4.',
    video_unreadable: 'Il video non si apre oppure supera 10 minuti. Prova un MP4 compatibile.',
    video_already_exists: 'Un video è già stato salvato per questa domanda. Riapri per visualizzarlo.',
    video_storage_not_configured: 'Archivio video non configurato. Collega le credenziali R2 al bucket magicbook-assets.',
    video_storage_denied: 'Accesso all’archivio video negato. Verifica i permessi di lettura e scrittura del bucket magicbook-assets.',
    video_storage_bucket_missing: 'Il bucket dell’archivio video non è disponibile. Verifica la configurazione R2.',
    video_storage_unavailable: 'Non riesco a verificare l’archivio video. Riprova prima di caricare.',
    admin_forbidden: 'Il caricamento è riservato al master admin.',
    master_admin_required: 'Accedi di nuovo con il codice master per caricare video.',
    video_question_unavailable: 'Questa domanda deve essere verificata prima di collegare un video.',
    video_answer_unavailable: 'La risposta corretta deve essere verificata prima di collegare un video.',
    video_upload_expired: 'La sessione di caricamento è scaduta. Riapri e seleziona il video.',
    video_file_mismatch: 'Il file ricevuto non è completo. Riapri e riprova il caricamento.'
  };
  function current(binding) {
    try { return binding.epoch === epoch && binding.button.isConnected && binding.options.isCurrent(); } catch { return false; }
  }
  function scope(binding) { return typeof binding.options.cacheScope === 'function' ? binding.options.cacheScope() : binding.options.cacheScope; }
  function admin(binding) { return binding.canUpload === true; }
  function cacheKey(binding) { return `${scope(binding) || ''}:${binding.options.question.question}:${binding.options.question.figure || ''}`; }
  function getCached(binding) {
    const key = cacheKey(binding), entry = cache.get(key);
    if (!entry || entry.expires <= Date.now()) { cache.delete(key); return null; }
    return entry.value;
  }
  function remember(binding, value) {
    if (typeof value.canUpload === 'boolean') binding.canUpload = value.canUpload;
    cache.set(cacheKey(binding), { value, expires: Date.now() + 60000 });
    while (cache.size > 80) cache.delete(cache.keys().next().value);
  }
  async function lookup(binding) {
    const cached = getCached(binding); if (cached) return cached;
    if (!binding.lookup) binding.lookup = request(binding, 'getQuizVideo').then(result => {
      if (current(binding)) remember(binding, result); return result;
    }).finally(() => { binding.lookup = null; });
    return binding.lookup;
  }
  async function request(binding, action, extra = {}, outerSignal) {
    if (!current(binding)) throw new DOMException('Aborted', 'AbortError');
    const controller = new AbortController(); binding.controllers.add(controller);
    const cancel = () => controller.abort(); outerSignal?.addEventListener('abort', cancel, { once: true });
    if (outerSignal?.aborted) cancel();
    const timer = setTimeout(cancel, 25000);
    try {
      const result = await binding.options.request(action, extra, controller.signal);
      controller.signal.throwIfAborted();
      if (!current(binding)) throw new DOMException('Aborted', 'AbortError');
      return result;
    } finally { clearTimeout(timer); outerSignal?.removeEventListener('abort', cancel); binding.controllers.delete(controller); }
  }
  function close({ restoreFocus = true, fromHistory = false } = {}) {
    const state = active; if (!state) return;
    active = null; state.controller.abort(); state.video.pause(); state.video.removeAttribute('src'); state.video.load();
    for (const url of state.urls) URL.revokeObjectURL(url);
    if (state.audioToken) void root.MagicAudioFocus?.completeTransient(state.audioToken, { resume: false });
    state.unmount?.({ restoreFocus });
    if (!fromHistory && history.state?.quizVideo === state.historyId) { pendingBack = true; history.back(); }
  }
  function reset() {
    epoch++; close({ restoreFocus: false }); cache.clear();
    for (const binding of [...bindings]) destroyButton(binding.button);
  }
  function destroyButton(button) {
    const binding = [...bindings].find(item => item.button === button); if (!binding) return;
    if (active?.binding === binding) close({ restoreFocus: false });
    binding.observer?.disconnect(); for (const controller of binding.controllers) controller.abort();
    button.removeEventListener('click', binding.click); bindings.delete(binding);
  }
  function stopForPlayback(state) {
    if (state.audioToken && root.MagicAudioFocus?.isCurrent(state.audioToken)) return;
    state.binding.options.onOpen?.();
    state.audioToken = root.MagicAudioFocus?.beginTransient({ key: 'quiz-explanation-video', stop: () => state.video.pause() });
  }
  function node(tag, text, cls) { const element = document.createElement(tag); if (text) element.textContent = text; if (cls) element.className = cls; return element; }
  function report(state, text) { if (active === state) state.status.textContent = text; }
  function failMessage(error) { return messages[error.message] || 'Operazione non confermata. Controlla la connessione e riprova.'; }
  function directUpload(url, blob, signal, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      const finish = error => { signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
      xhr.open('PUT', url); xhr.timeout = 10 * 60 * 1000; xhr.setRequestHeader('Content-Type', 'video/mp4');
      xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(100 * event.loaded / event.total)); };
      xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? null : new Error('video_upload_failed'));
      xhr.onerror = xhr.ontimeout = () => finish(new Error('video_upload_failed'));
      xhr.onabort = () => finish(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) return finish(new DOMException('Aborted', 'AbortError'));
      xhr.send(blob);
    });
  }
  async function open(binding) {
    close({ restoreFocus: false });
    if (!current(binding)) return;
    binding.options.onOpen?.();
    const overlay = node('div', '', 'quiz-video-overlay'), dialog = node('section', '', 'quiz-video-dialog');
    const header = node('header'), title = node('h2', 'Spiegazione video'), exit = node('button', '×', 'quiz-video-close');
    exit.type = 'button'; exit.setAttribute('aria-label', 'Chiudi video'); exit.onclick = () => close();
    const titleId = 'quiz-video-title'; title.id = titleId; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', titleId);
    header.append(title, exit);
    const question = node('p', binding.options.question.question, 'quiz-video-question');
    const video = node('video'); video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.hidden = true;
    const status = node('p', 'Caricamento…', 'quiz-video-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    dialog.append(header, question, video, status); overlay.append(dialog); document.body.append(overlay);
    const state = { binding, overlay, dialog, video, status, urls: [], controller: new AbortController(), historyId: crypto.randomUUID() };
    active = state;
    history.pushState({ ...(history.state || {}), quizVideo: state.historyId }, '');
    state.unmount = root.MagicBookPopup.mount(overlay, { returnFocus: binding.button, bodyClass: 'quiz-video-open', onDismiss: () => close(), initialFocus: exit,
      focusable: () => dialog.querySelectorAll('button, input, video') });
    video.addEventListener('play', () => stopForPlayback(state));
    video.addEventListener('error', () => report(state, 'Video non disponibile. Chiudi e riapri per riprovare.'));
    try {
      const result = await lookup(binding);
      if (active !== state) return; remember(binding, result);
      if (result.error) throw new Error(result.error);
      if (result.available) { video.src = result.url; video.hidden = false; report(state, 'Premi play per ascoltare la spiegazione.'); return; }
      if (!admin(binding)) { report(state, 'Nessun video disponibile per questa domanda.'); return; }
      uploadForm(state);
    } catch (error) {
      if (active !== state) return;
      report(state, failMessage(error));
      const retry = node('button', 'Riprova'); retry.onclick = async () => {
        retry.disabled = true;
        try {
          const result = await request(binding, 'getQuizVideo', {}, state.controller.signal);
          if (active !== state) return; remember(binding, result);
          if (result.error) throw new Error(result.error);
          retry.remove();
          if (result.available) { video.src = result.url; video.hidden = false; report(state, 'Premi play per ascoltare la spiegazione.'); }
          else if (admin(binding)) uploadForm(state);
          else report(state, 'Nessun video disponibile per questa domanda.');
        } catch (error) { report(state, failMessage(error)); retry.disabled = false; }
      }; dialog.append(retry);
    }
  }
  function uploadForm(state) {
    const { dialog, binding, controller, video } = state;
    const label = node('label', 'Carica un video MP4', 'quiz-video-upload-label');
    const input = node('input'); input.type = 'file'; input.accept = 'video/mp4,.mp4'; label.append(input);
    const originalLabel = node('label', '', 'quiz-video-original'); const original = node('input'); original.type = 'checkbox'; originalLabel.append(original, node('span', 'Usa il file originale')); originalLabel.hidden = true;
    const actions = node('div', '', 'quiz-video-actions'), save = node('button', 'Carica video', 'quiz-video-save'); save.disabled = true;
    actions.append(save); dialog.append(label, originalLabel, actions);
    let prepared, file, busy = false, uploadToken = '';
    report(state, 'Il video sarà condiviso con le stesse domande negli altri libri.');
    const showPreview = () => {
      if (active !== state || !prepared) return;
      video.pause(); const blob = original.checked ? new Blob([file], { type: 'video/mp4' }) : prepared.blob;
      for (const url of state.urls) URL.revokeObjectURL(url); state.urls.length = 0;
      const url = URL.createObjectURL(blob); state.urls.push(url); video.src = url; video.hidden = false;
      report(state, `${bytes(file.size)} → ${bytes(blob.size)}. Controlla l’anteprima prima di caricare.${prepared.reason === 'compression_unavailable' ? ' Ottimizzazione non disponibile: conservato l’originale.' : ''}`);
    };
    original.onchange = showPreview;
    input.onchange = async () => {
      if (busy || active !== state || !input.files[0]) return;
      file = input.files[0]; busy = true; input.disabled = true; save.disabled = true; originalLabel.hidden = true;
      try {
        prepared = await root.QuizVideoOptimizer.optimize(file, { signal: controller.signal, progress: text => report(state, text) });
        if (active !== state) return;
        original.checked = false; originalLabel.hidden = !prepared.compressed; showPreview(); save.disabled = false;
      } catch (error) { if (active === state) report(state, failMessage(error)); }
      finally { busy = false; if (active === state) input.disabled = false; }
    };
    save.onclick = async () => {
      if (busy || !prepared || active !== state || !admin(binding)) return;
      busy = true; save.disabled = input.disabled = original.disabled = true; video.pause();
      try {
        if (!uploadToken) {
          cache.delete(cacheKey(binding));
          const blob = original.checked ? new Blob([file], { type: 'video/mp4' }) : prepared.blob;
          report(state, 'Preparazione del caricamento…');
          const created = await request(binding, 'createQuizVideoUpload', { bytes: blob.size, mime: 'video/mp4', duration: prepared.duration }, controller.signal);
          uploadToken = created.uploadToken;
          await directUpload(created.uploadUrl, blob, controller.signal, value => report(state, `Caricamento ${value}%`));
        }
        report(state, 'Verifica del salvataggio…');
        const saved = await request(binding, 'confirmQuizVideoUpload', { uploadToken }, controller.signal);
        if (active !== state) return;
        remember(binding, saved); binding.button.innerHTML = icon + '<span>Video</span>';
        label.remove(); originalLabel.remove(); actions.remove(); video.src = saved.url;
        report(state, 'Video salvato. Disponibile per la stessa domanda, risposta e figura.');
      } catch (error) {
        if (active !== state) return;
        if (error.message === 'video_upload_not_received') uploadToken = '';
        report(state, failMessage(error));
        // Keep an uncertain PUT/finalize ticket: the next click checks the same object, never reuploads blindly.
        save.textContent = uploadToken ? 'Verifica salvataggio' : 'Riprova caricamento';
        save.disabled = false; input.disabled = original.disabled = Boolean(uploadToken);
      } finally { busy = false; }
    };
  }
  function createButton(options) {
    const button = node('button', '', 'quiz-video-button'); button.type = 'button'; button.hidden = true; button.innerHTML = icon + '<span>Video</span>';
    button.setAttribute('aria-label', 'Spiegazione video');
    const binding = { button, options, epoch, controllers: new Set() }; bindings.add(binding);
    binding.click = () => { if (!button.hidden && active?.binding !== binding && current(binding)) void open(binding); }; button.addEventListener('click', binding.click);
    const update = async () => {
      if (!current(binding)) return;
      try {
        const result = await lookup(binding);
        if (!current(binding)) return; remember(binding, result);
        const available = result.available === true && typeof result.url === 'string' && /^https?:\/\//.test(result.url);
        button.hidden = !available && !admin(binding);
        button.innerHTML = (available ? icon : uploadIcon) + `<span>${available ? 'Video' : 'Carica video'}</span>`;
        button.setAttribute('aria-label', available ? 'Spiegazione video' : 'Carica spiegazione video');
      } catch (_) { if (current(binding)) button.hidden = true; }
    };
    binding.observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { binding.observer.disconnect(); void update(); }
    });
    // The action is hidden until verified. Observe its visible host instead.
    queueMicrotask(() => { if (bindings.has(binding) && button.isConnected) binding.observer.observe(button.parentElement); });
    return button;
  }
  root.MagicBookPopup?.registerHistoryLayer(() => {
    if (pendingBack) { pendingBack = false; return true; }
    if (!active) return false;
    if (history.state?.quizVideo === active.historyId) return true;
    close({ fromHistory: true }); return true;
  });
  root.addEventListener('pagehide', reset);
  root.addEventListener('magicbook:logout', reset);
  root.addEventListener('storage', () => { if ([...bindings].some(binding => !current(binding))) reset(); });
  root.addEventListener('magicbook:quiz-question-change', () => { close({ restoreFocus: false }); for (const binding of [...bindings]) { if (!current(binding)) destroyButton(binding.button); } });
  root.MagicQuizVideo = Object.freeze({ createButton, destroyButton, close, reset });
})(window);
