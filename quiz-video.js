(function(root) {
  'use strict';
  const bindings = new Set(), cache = new Map();
  let active = null, epoch = 0, pendingBack = false;
  const icon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="4" stroke="currentColor" stroke-width="1.8"/><path d="m10 8 6 4-6 4Z" fill="currentColor"/></svg>';
  const uploadIcon = '<span class="quiz-video-upload-icon" aria-hidden="true"></span>';
  const bytes = value => `${(value / 1048576).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB`;
  const messages = {
    video_changed: 'Il video è stato modificato da un’altra sessione. Chiudi e riapri per vedere la versione aggiornata.',
    video_cleanup_required: 'Completa prima la rimozione del vecchio file.',
    compression_timeout: 'Ottimizzazione interrotta per tempo eccessivo: conservato il file originale.',
    video_upload_failed: 'Invio del video non riuscito. Controlla la connessione e la regola CORS del bucket R2. Prima di riprovare, verifica il salvataggio.',
    video_upload_timeout: 'Il caricamento ha superato il tempo massimo. Verifica il salvataggio prima di riprovare.',
    video_upload_denied: 'R2 ha rifiutato il caricamento. Verifica i permessi di scrittura e riprova con un nuovo caricamento.',
    video_upload_not_received: 'Il video non è arrivato nell’archivio. Dopo aver corretto il problema, premi Riprova caricamento.',
    video_file_invalid: 'Il file ricevuto non è un MP4 valido. Scegli un altro video.',
    video_size_invalid: 'Scegli un video MP4 fino a 128 MB.', video_mp4_required: 'Scegli un video in formato MP4.',
    video_unreadable: 'Il video non si apre oppure supera 10 minuti. Prova un MP4 compatibile.',
    video_already_exists: 'Un video è già stato salvato per questa domanda. Riapri per visualizzarlo.',
    video_storage_not_configured: 'Archivio video non configurato. Collega le credenziali R2 al bucket magicbook-assets.',
    video_storage_denied: 'Accesso all’archivio video negato. Verifica i permessi di lettura e scrittura del bucket magicbook-assets.',
    video_storage_credentials_invalid: 'Le credenziali del collegamento video non sono valide. Il video non è stato salvato.',
    video_upload_incomplete: 'Caricamento interrotto. Premi Riprendi caricamento per completarlo.',
    video_chunk_invalid: 'Una parte del video non è valida. Riapri il caricamento e seleziona il file.',
    video_upload_invalid: 'Il caricamento non è più valido. Riapri e seleziona il video.',
    invalid_request: 'La richiesta non è valida. Riapri il caricamento e seleziona il video.',
    video_storage_bucket_missing: 'Il bucket dell’archivio video non è disponibile. Verifica la configurazione R2.',
    video_storage_unavailable: 'Non riesco a verificare l’archivio video. Riprova prima di caricare.',
    admin_forbidden: 'Il caricamento è riservato al master admin.',
    master_admin_required: 'Accedi di nuovo con il codice master per caricare video.',
    video_question_unavailable: 'Questa domanda deve essere verificata prima di collegare un video.',
    video_answer_unavailable: 'La risposta corretta deve essere verificata prima di collegare un video.',
    video_upload_expired: 'La sessione di caricamento è scaduta. Premi Riprova caricamento: il file è ancora selezionato.',
    video_file_mismatch: 'Il file ricevuto non è completo. Premi Riprova caricamento.'
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
      xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? null : new Error(xhr.status === 403 ? 'video_upload_denied' : 'video_upload_failed'));
      xhr.onerror = () => finish(new Error('video_upload_failed'));
      xhr.ontimeout = () => finish(new Error('video_upload_timeout'));
      xhr.onabort = () => finish(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) return finish(new DOMException('Aborted', 'AbortError'));
      xhr.send(blob);
    });
  }
  function encodeChunk(blob, signal) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader(), abort = () => reader.abort();
      const finish = (error, value) => { signal.removeEventListener('abort', abort); error ? reject(error) : resolve(value); };
      reader.onload = () => finish(null, String(reader.result).split(',')[1]);
      reader.onerror = () => finish(new Error('video_unreadable'));
      reader.onabort = () => finish(new DOMException('Aborted', 'AbortError'));
      if (signal.aborted) return finish(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true }); reader.readAsDataURL(blob);
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
      focusable: () => dialog.querySelectorAll('button, input, select, summary, video') });
    video.addEventListener('play', () => stopForPlayback(state));
    video.addEventListener('error', () => { cache.delete(cacheKey(binding)); report(state, 'Video non disponibile. Chiudi e riapri per riprovare.'); });
    try {
      const result = await lookup(binding);
      if (active !== state) return; remember(binding, result);
      if (result.error) throw new Error(result.error);
      renderVideoState(state, result);
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
          renderVideoState(state, result);
        } catch (error) { report(state, failMessage(error)); retry.disabled = false; }
      }; dialog.append(retry);
    }
  }
  function refreshButtons(binding, result) {
    for (const other of bindings) {
      if (!current(other) || cacheKey(other) !== cacheKey(binding)) continue;
      remember(other, result);
      const available = result.available === true;
      other.button.hidden = !available && !admin(other);
      other.button.innerHTML = (available ? icon : uploadIcon) + `<span>${available ? 'Video' : 'Carica video'}</span>`;
      other.button.setAttribute('aria-label', available ? 'Spiegazione video' : 'Carica spiegazione video');
    }
  }
  function renderVideoState(state, result, message) {
    if (active !== state) return;
    state.preparation?.abort(); state.preparation = null;
    if (!state.controls) { state.controls = node('div', '', 'quiz-video-management'); state.dialog.append(state.controls); }
    state.controls.replaceChildren(); refreshButtons(state.binding, result);
    state.video.pause(); state.video.removeAttribute('src'); state.video.load();
    for (const url of state.urls) URL.revokeObjectURL(url); state.urls.length = 0;
    state.video.hidden = !result.available;
    if (result.available) state.video.src = result.url;
    report(state, message || (result.available ? 'Premi play per ascoltare la spiegazione.' : 'Nessun video disponibile per questa domanda.'));
    if (!admin(state.binding)) return;
    if (result.cleanupPending) {
      const cleanup = node('button', 'Completa rimozione', 'quiz-video-save');
      report(state, result.available ? 'Nuovo video salvato. Completa la rimozione del vecchio file.' : 'Video nascosto agli utenti. Completa la rimozione del file dall’archivio.');
      cleanup.onclick = async () => {
        cleanup.disabled = true;
        try {
          const value = await request(state.binding, 'cleanupQuizVideo', { expectedRevision: result.revision }, state.controller.signal);
          if (value.cleaned !== true) throw new Error('video_storage_unavailable');
          renderVideoState(state, value, 'Rimozione del file completata.');
        } catch (error) { cache.delete(cacheKey(state.binding)); report(state, failMessage(error)); cleanup.disabled = false; }
      };
      state.controls.append(cleanup);
    } else if (result.available) {
      const actions = node('div', '', 'quiz-video-actions');
      const replace = node('button', 'Sostituisci video'), remove = node('button', 'Rimuovi video', 'quiz-video-danger');
      replace.onclick = () => { uploadForm(state, result); state.controls.querySelector('input')?.focus(); };
      remove.onclick = () => removeVideo(state, result);
      actions.append(replace, remove); state.controls.append(actions);
    } else uploadForm(state, result);
    if (result.archive) {
      const details = node('details', '', 'quiz-video-archive'), summary = node('summary', 'Trova questo video in R2');
      const label = node('label', 'Percorso della cartella'), path = node('input'); path.readOnly = true; path.value = result.archive.prefix;
      label.append(path);
      const copy = node('button', 'Copia percorso R2');
      copy.onclick = async () => {
        try { await navigator.clipboard.writeText(path.value); report(state, 'Percorso copiato. Incollalo in “Search objects by prefix” nel bucket ' + result.archive.bucket + '.'); }
        catch { path.focus(); path.select(); report(state, 'Seleziona e copia il percorso mostrato.'); }
      };
      details.append(summary, node('p', 'Bucket: ' + result.archive.bucket), label, copy);
      details.append(node('p', 'current.json identifica la domanda e il video attuale.'));
      if (result.fileName) details.append(node('p', 'File caricato: ' + result.fileName));
      if (result.bytes) details.append(node('p', 'Dimensione salvata: ' + bytes(result.bytes) + (result.originalBytes ? ' · Originale: ' + bytes(result.originalBytes) : '')));
      state.controls.append(details);
    }
    if (message && !result.cleanupPending) report(state, message);
  }
  function removeVideo(state, previous) {
    state.video.pause(); state.controls.replaceChildren();
    const box = node('div', '', 'quiz-video-confirm');
    const text = node('p', 'Rimuovere questo video? Sarà tolto da questa stessa domanda, risposta e figura in Magic Book, All Books e Quiz Bank.');
    const actions = node('div', '', 'quiz-video-actions'), cancel = node('button', 'Annulla'), remove = node('button', 'Conferma rimozione', 'quiz-video-danger');
    const operationId = crypto.randomUUID();
    cancel.onclick = () => { renderVideoState(state, previous); state.controls.querySelector('button')?.focus(); };
    remove.onclick = async () => {
      remove.disabled = cancel.disabled = true; cache.delete(cacheKey(state.binding)); report(state, 'Rimozione del video…');
      try {
        const value = await request(state.binding, 'deleteQuizVideo', { expectedRevision: previous.revision, operationId }, state.controller.signal);
        if (value.removed !== true || value.available !== false) throw new Error('video_storage_unavailable');
        renderVideoState(state, value, 'Video rimosso dai tre sistemi. Puoi caricarne un altro.');
        state.controls.querySelector('input')?.focus();
      } catch (error) {
        report(state, failMessage(error)); remove.textContent = 'Verifica rimozione'; remove.disabled = false;
        // Keep the same operation ID after an uncertain response. A new lookup is
        // required before canceling back to a possibly deleted playback URL.
        cancel.textContent = 'Aggiorna stato'; cancel.disabled = false;
        cancel.onclick = async () => {
          cancel.disabled = true;
          try { const value = await request(state.binding, 'getQuizVideo', {}, state.controller.signal); if (value.error) throw new Error(value.error); renderVideoState(state, value); }
          catch (error) { report(state, failMessage(error)); cancel.disabled = false; }
        };
      }
    };
    actions.append(cancel, remove); box.append(text, actions); state.controls.append(box); cancel.focus();
  }

  function uploadForm(state, previous) {
    const { dialog, binding, controller, video } = state;
    state.controls.replaceChildren();
    const replacing = previous.available === true;
    const label = node('label', replacing ? 'Scegli il nuovo video MP4' : 'Carica un video MP4', 'quiz-video-upload-label');
    const input = node('input'); input.type = 'file'; input.accept = 'video/mp4,.mp4'; label.append(input);
    const originalLabel = node('label', '', 'quiz-video-original'); const original = node('input'); original.type = 'checkbox'; originalLabel.append(original, node('span', 'Usa il file originale')); originalLabel.hidden = true;
    const qualityLabel = node('label', 'Ottimizzazione', 'quiz-video-quality');
    const quality = node('select'); quality.append(new Option('Qualità originale — senza perdita', 'lossless'), new Option('File più piccolo — ricodifica ad alta qualità', 'quality')); qualityLabel.append(quality);
    const qualityHint = node('p', 'Senza perdita mantiene identici immagini e audio. Un MP4 già compresso può restare della stessa dimensione.', 'quiz-video-hint');
    const actions = node('div', '', 'quiz-video-actions'), save = node('button', replacing ? 'Sostituisci video' : 'Carica video', 'quiz-video-save'); save.disabled = true;
    const cancel = node('button', 'Annulla'); cancel.type = 'button'; cancel.onclick = () => renderVideoState(state, previous);
    actions.append(save); if (replacing) actions.append(cancel);
    state.controls.append(label, qualityLabel, qualityHint, originalLabel, actions);
    let prepared, file, busy = false, transfer = null, preferRelay = false;
    report(state, replacing ? 'Il video attuale resterà disponibile finché il nuovo non sarà salvato. La sostituzione vale nei tre sistemi.' : 'Il video sarà condiviso con la stessa domanda, risposta e figura nei tre sistemi.');
    const showPreview = () => {
      if (active !== state || !prepared) return;
      video.pause(); const blob = original.checked ? new Blob([file], { type: 'video/mp4' }) : prepared.blob;
      for (const url of state.urls) URL.revokeObjectURL(url); state.urls.length = 0;
      const url = URL.createObjectURL(blob); state.urls.push(url); video.src = url; video.hidden = false;
      const percent = Math.max(0, 100 * (file.size - blob.size) / file.size);
      const reason = original.checked ? 'File originale selezionato.' : prepared.reason === 'compression_timeout' ? messages.compression_timeout
        : prepared.reason === 'compression_unavailable' ? 'Questo dispositivo non ha completato l’ottimizzazione: conservato l’originale.'
        : !prepared.compressed ? 'Nessun risparmio utile con questa impostazione: conservato l’originale.'
        : prepared.reason === 'lossless' ? 'Immagini e audio originali, senza ricodifica.' : 'Ricodifica ad alta qualità. Controlla testi, dettagli e audio nell’anteprima.';
      report(state, `${bytes(file.size)} → ${bytes(blob.size)} (−${percent.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%). ${reason}`);
    };
    original.onchange = showPreview;
    const prepare = async () => {
      if (busy || active !== state || !input.files[0]) return;
      file = input.files[0]; prepared = null; transfer = null; busy = true; input.disabled = quality.disabled = true; save.disabled = true; originalLabel.hidden = true;
      const preparation = new AbortController(); state.preparation?.abort(); state.preparation = preparation;
      const abortPreparation = () => preparation.abort(); controller.signal.addEventListener('abort', abortPreparation, { once: true });
      try {
        prepared = await root.QuizVideoOptimizer.optimize(file, { signal: preparation.signal, mode: quality.value, progress: text => report(state, text) });
        if (active !== state || preparation.signal.aborted) return;
        original.checked = false; originalLabel.hidden = !prepared.compressed; showPreview(); save.disabled = false;
      } catch (error) { if (active === state && !preparation.signal.aborted) report(state, failMessage(error)); }
      finally { controller.signal.removeEventListener('abort', abortPreparation); busy = false; if (active === state) input.disabled = quality.disabled = false; }
    };
    input.onchange = prepare;
    quality.onchange = () => {
      qualityHint.textContent = quality.value === 'lossless' ? 'Senza perdita mantiene identici immagini e audio. Un MP4 già compresso può restare della stessa dimensione.' : 'Riduce il peso ricodificando il video. Risoluzione e audio restano invariati; non è una compressione senza perdita. Controlla l’anteprima prima di salvare.';
      void prepare();
    };
    save.onclick = async () => {
      if (busy || !prepared || active !== state || !admin(binding)) return;
      busy = true; save.disabled = input.disabled = original.disabled = quality.disabled = cancel.disabled = true; video.pause();
      try {
        const begin = async relay => {
          cache.delete(cacheKey(binding));
          const blob = original.checked ? new Blob([file], { type: 'video/mp4' }) : prepared.blob;
          report(state, 'Preparazione del caricamento…');
          const created = await request(binding, 'createQuizVideoUpload', { bytes: blob.size, mime: 'video/mp4', duration: prepared.duration, expectedRevision: previous.revision ?? null, fileName: file.name, originalBytes: file.size, compression: original.checked ? 'original_selected' : prepared.reason || (prepared.compressed ? 'compressed' : 'original_better'), ...(relay ? { transport: 'relay' } : {}) }, controller.signal);
          if (!created.uploadToken || (relay && (created.transport !== 'relay' || created.chunkBytes !== 2621440))) throw new Error('video_upload_invalid');
          transfer = { ...created, blob, nextChunk: 0 };
        };
        const relayUpload = async () => {
          const count = Math.ceil(transfer.blob.size / transfer.chunkBytes);
          while (transfer.nextChunk < count) {
            controller.signal.throwIfAborted();
            const index = transfer.nextChunk;
            report(state, `Caricamento ${Math.round(100 * index / count)}%`);
            const chunkBase64 = await encodeChunk(transfer.blob.slice(index * transfer.chunkBytes, (index + 1) * transfer.chunkBytes), controller.signal);
            const result = await request(binding, 'uploadQuizVideoChunk', { uploadToken: transfer.uploadToken, chunkIndex: index, chunkBase64 }, controller.signal);
            if (result.received !== true || result.nextChunk !== index + 1) throw new Error('video_upload_invalid');
            transfer.nextChunk = result.nextChunk;
          }
        };
        const confirm = () => {
          report(state, 'Verifica del salvataggio…');
          return request(binding, 'confirmQuizVideoUpload', { uploadToken: transfer.uploadToken }, controller.signal);
        };
        if (!transfer) {
          await begin(preferRelay);
          if (transfer.transport !== 'relay') {
            try { await directUpload(transfer.uploadUrl, transfer.blob, controller.signal, value => report(state, `Caricamento ${value}%`)); }
            catch (error) { if (controller.signal.aborted) throw error; /* Reconcile before choosing another transport. */ }
          }
        }
        if (transfer.transport === 'relay') await relayUpload();
        let saved;
        try { saved = await confirm(); }
        catch (error) {
          // Only an authoritative missing-object response permits a fresh upload.
          // Lost PUT/confirm responses never cause a blind duplicate upload.
          if (error.message !== 'video_upload_not_received' || !transfer.relaySupported) throw error;
          preferRelay = true; transfer = null;
          report(state, 'Ripresa del caricamento…');
          await begin(true); await relayUpload(); saved = await confirm();
        }
        if (saved.saved !== true || typeof saved.url !== 'string' || !/^https?:\/\//.test(saved.url)) throw new Error('video_upload_invalid');
        if (active !== state) return;
        renderVideoState(state, saved, saved.cleanupPending ? 'Nuovo video salvato. Completa la rimozione del vecchio file.' : 'Video salvato. Disponibile per la stessa domanda, risposta e figura.');
        state.controls.querySelector('button')?.focus();
      } catch (error) {
        if (active !== state) return;
        if (['video_upload_not_received', 'video_upload_expired', 'video_file_mismatch', 'video_file_invalid'].includes(error.message)) transfer = null;
        if (error.message === 'video_upload_incomplete' && transfer?.transport === 'relay') transfer.nextChunk = 0;
        const incomplete = transfer?.transport === 'relay' && transfer.nextChunk < Math.ceil(transfer.blob.size / transfer.chunkBytes);
        report(state, incomplete && !messages[error.message] ? messages.video_upload_incomplete : failMessage(error));
        save.textContent = incomplete ? 'Riprendi caricamento' : transfer ? 'Verifica salvataggio' : 'Riprova caricamento';
        save.disabled = false; input.disabled = original.disabled = quality.disabled = Boolean(transfer); cancel.disabled = false;
        if (['video_changed', 'video_cleanup_required'].includes(error.message)) { cache.delete(cacheKey(binding)); save.disabled = true; }
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
