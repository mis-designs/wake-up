(function exposeQuizAudioUpload(root) {
  "use strict";
  const MAX_BYTES = 3 * 1024 * 1024;
  let active = null;
  let consumingBack = false;

  function close({ fromHistory = false, restoreFocus = true } = {}) {
    const state = active;
    if (!state) return;
    active = null;
    state.closed = true;
    state.controller?.abort();
    state.disposePreview();
    root.removeEventListener("beforeunload", state.beforeUnload);
    state.unmount({ restoreFocus: restoreFocus && !state.returnFocus });
    if (restoreFocus && state.returnFocus) {
      const target = state.returnFocus();
      if (target?.isConnected && !target.closest("[inert]")) target.focus({ preventScroll: true });
    }
    if (!fromHistory && history.state?.quizAudioUpload === state.historyKey) {
      consumingBack = { url: state.sourceUrl, state: state.sourceState };
      history.back();
    }
  }

  function open({ trigger, label, question, save, isCurrent, onSaved, onConflict, returnFocus }) {
    if (active || consumingBack || !root.MagicBookPopup || !isCurrent()) return;
    const overlay = document.createElement("div");
    overlay.className = "quiz-audio-upload-overlay";
    // Fixed application markup only; supplied question/file names use textContent.
    overlay.innerHTML = `<section class="quiz-audio-upload-card" role="dialog" aria-modal="true" aria-labelledby="quizAudioUploadTitle" aria-describedby="quizAudioUploadContext" tabindex="-1">
      <header><div><p id="quizAudioUploadContext"></p><h2 id="quizAudioUploadTitle">Carica spiegazione audio</h2></div><button type="button" data-upload-close aria-label="Chiudi caricamento audio">×</button></header>
      <div class="quiz-audio-upload-body">
        <p class="quiz-audio-upload-question"></p>
        <p id="quizAudioUploadHelp">Scegli un file MP3, M4A, WAV, OGG o WebM, fino a 3 MB. Controlla l’anteprima prima di caricarlo.</p>
        <label class="quiz-audio-upload-label" for="quizAudioUploadFile">File della spiegazione</label>
        <input id="quizAudioUploadFile" type="file" accept=".mp3,.m4a,.mp4,.wav,.ogg,.webm,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm" aria-describedby="quizAudioUploadHelp quizAudioUploadStatus">
        <div class="quiz-audio-upload-selection" hidden><p data-upload-filename></p><audio controls preload="metadata" aria-label="Anteprima della spiegazione"></audio><button type="button" data-upload-remove>Rimuovi file</button></div>
        <p id="quizAudioUploadStatus" role="status" aria-live="polite"></p>
        <div class="quiz-audio-upload-discard" hidden><p>Chiudere senza caricare? Il file originale resta sul dispositivo.</p><button type="button" data-upload-keep>Continua</button><button type="button" data-upload-discard>Chiudi senza caricare</button></div>
      </div>
      <footer><button type="button" data-upload-cancel>Annulla</button><button type="button" data-upload-save class="magic-loading-control" disabled><span>Carica audio</span></button></footer>
    </section>`;
    const find = selector => overlay.querySelector(selector);
    const card = overlay.firstElementChild;
    const fileInput = find("input"), preview = find("audio"), selection = find(".quiz-audio-upload-selection");
    const status = find("#quizAudioUploadStatus"), submit = find("[data-upload-save]"), cancel = find("[data-upload-cancel]");
    const remove = find("[data-upload-remove]"), discard = find(".quiz-audio-upload-discard");
    find("#quizAudioUploadContext").textContent = label;
    find(".quiz-audio-upload-question").textContent = question;
    const state = { closed: false, file: null, url: "", ready: false, saving: false, controller: null,
      validation: 0, previewTimer: 0, historyKey: `audio-${Date.now()}`,
      sourceUrl: location.href, sourceState: JSON.stringify(history.state), returnFocus };
    const current = () => !state.closed && active === state && isCurrent();
    function message(text, error = false) {
      status.textContent = text;
      status.classList.toggle("is-error", error);
    }
    function paint() {
      fileInput.disabled = state.saving;
      remove.disabled = state.saving;
      submit.disabled = state.saving || !state.ready;
      submit.classList.toggle("is-loading", state.saving);
      submit.setAttribute("aria-busy", String(state.saving));
      cancel.textContent = state.saving ? "Interrompi attesa" : "Annulla";
      selection.hidden = !state.file;
    }
    state.disposePreview = () => {
      state.validation++;
      clearTimeout(state.previewTimer);
      preview.onloadedmetadata = preview.onerror = null;
      preview.pause(); preview.removeAttribute("src"); preview.load();
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = "";
    };
    function clearFile({ resetInput = true } = {}) {
      state.disposePreview(); state.file = null; state.ready = false;
      if (resetInput) fileInput.value = "";
      fileInput.removeAttribute("aria-invalid");
      discard.hidden = true; message(""); paint();
    }
    function dismiss() {
      if (state.saving) {
        state.controller?.abort();
        return;
      }
      if (state.file) {
        discard.hidden = false;
        find("[data-upload-keep]").focus();
      } else close();
    }
    state.dismiss = dismiss;
    state.beforeUnload = event => {
      if (state.file) { event.preventDefault(); event.returnValue = ""; }
    };
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      clearFile({ resetInput: false });
      if (!file) return;
      let error = "";
      if (!file.size) error = "Il file è vuoto. Scegli un’altra registrazione.";
      else if (file.size > MAX_BYTES) error = "Il file supera 3 MB. Scegli una registrazione più piccola.";
      else if (!/\.(mp3|m4a|mp4|wav|ogg|webm)$/i.test(file.name)) error = "Formato non supportato. Usa MP3, M4A, WAV, OGG o WebM.";
      if (error) { fileInput.setAttribute("aria-invalid", "true"); message(error, true); return; }
      state.file = file;
      state.url = URL.createObjectURL(file);
      find("[data-upload-filename]").textContent = `${file.name} · ${(file.size / 1024 / 1024).toLocaleString("it-IT", { maximumFractionDigits: 2 })} MB`;
      const version = ++state.validation;
      message("Controllo l’anteprima…");
      function invalidPreview() {
        if (!current() || version !== state.validation) return;
        clearTimeout(state.previewTimer);
        state.ready = false;
        fileInput.setAttribute("aria-invalid", "true");
        message("Non riesco a leggere questo audio. Prova un file MP3 valido, di durata inferiore a un’ora.", true);
        paint();
      }
      preview.onloadedmetadata = () => {
        if (!current() || version !== state.validation) return;
        if (!Number.isFinite(preview.duration) || preview.duration <= 0 || preview.duration > 3600) { invalidPreview(); return; }
        clearTimeout(state.previewTimer);
        state.ready = true;
        message("File pronto. Ascolta l’anteprima, poi premi Carica audio."); paint();
      };
      preview.onerror = invalidPreview;
      state.previewTimer = setTimeout(invalidPreview, 8000);
      preview.src = state.url; paint();
    });
    remove.addEventListener("click", () => { if (!state.saving) { clearFile(); fileInput.focus(); } });
    cancel.addEventListener("click", dismiss);
    find("[data-upload-close]").addEventListener("click", dismiss);
    find("[data-upload-keep]").addEventListener("click", () => { discard.hidden = true; submit.focus(); });
    find("[data-upload-discard]").addEventListener("click", () => close());
    submit.addEventListener("click", async () => {
      if (state.saving || !state.ready || !current()) return;
      state.saving = true; discard.hidden = true; preview.pause();
      state.controller = new AbortController();
      message("Caricamento in corso…"); paint();
      try {
        const bytes = new Uint8Array(await state.file.arrayBuffer());
        if (state.controller.signal.aborted || !current()) throw new DOMException("Cancelled", "AbortError");
        let binary = "";
        for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
        await save({ audioBase64: btoa(binary), audioMimeType: state.file.type,
          audioDurationMs: Math.round(preview.duration * 1000) }, state.controller.signal);
        if (!current()) { if (active === state) close({ restoreFocus: false }); return; }
        close({ restoreFocus: false }); onSaved();
      } catch (error) {
        if (!current()) { if (active === state) close({ restoreFocus: false }); return; }
        const code = String(error?.message || "");
        if (code === "quiz_audio_already_exists") {
          onConflict?.();
          state.ready = false;
          message("È già presente una spiegazione audio: non è stata sostituita. Chiudi per ascoltarla.", true);
        } else if (["quiz_audio_requires_review", "quiz_audio_requires_repair", "quiz_audio_upload_conflict"].includes(code)) {
          state.ready = false;
          message("L’associazione di questo audio richiede una verifica prima di aggiungere una registrazione. Nessun audio è stato sostituito.", true);
        } else if (/invalid_audio|unsupported_audio|audio_too_large/.test(code)) {
          state.ready = false; fileInput.setAttribute("aria-invalid", "true");
          message("Il file non è un audio valido oppure supera 3 MB. Scegli un’altra registrazione.", true);
        } else {
          message("Non posso confermare il caricamento. Il file resta selezionato: riprova con lo stesso file. Un audio già salvato non verrà sostituito.", true);
        }
      } finally {
        if (current()) { state.saving = false; paint(); }
      }
    });
    document.body.append(overlay);
    state.unmount = root.MagicBookPopup.mount(overlay, {
      focusable: () => overlay.querySelectorAll("button, input, audio"), initialFocus: fileInput,
      returnFocus: trigger, bodyClass: "quiz-audio-upload-open", onDismiss: dismiss
    });
    active = state;
    root.addEventListener("beforeunload", state.beforeUnload);
    try { history.pushState({ ...history.state, quizAudioUpload: state.historyKey }, "", location.href); } catch { /* X/Escape remain available. */ }
  }

  root.MagicBookPopup?.registerHistoryLayer(() => {
    if (consumingBack) {
      const ownNavigation = location.href === consumingBack.url && JSON.stringify(history.state) === consumingBack.state;
      consumingBack = false;
      return ownNavigation;
    }
    if (active) {
      if (location.href !== active.sourceUrl || JSON.stringify(history.state) !== active.sourceState) {
        close({ fromHistory: true, restoreFocus: false });
        return false;
      }
      if (active.file || active.saving) {
        history.pushState({ ...history.state, quizAudioUpload: active.historyKey }, "", location.href);
        active.dismiss();
      } else close({ fromHistory: true });
      return true;
    }
    if (history.state?.quizAudioUpload) {
      const { quizAudioUpload, ...previous } = history.state;
      history.replaceState(previous, "", location.href);
      return false;
    }
    return false;
  });
  root.addEventListener("pagehide", () => close({ fromHistory: true, restoreFocus: false }));
  document.addEventListener("visibilitychange", () => { if (document.hidden) document.querySelector(".quiz-audio-upload-card audio")?.pause(); });
  root.MagicQuizAudioUpload = Object.freeze({ open, close });
})(window);
