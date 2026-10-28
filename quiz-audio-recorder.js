(function exposeQuizAudioRecorder(root) {
  "use strict";
  // Canonical inline controls from quiz.html; data attributes avoid duplicate IDs.
  const TEMPLATE = "<section data-recorder-root class=\"quiz-audio-recorder hidden\" aria-label=\"Registratore spiegazione audio\">\n                    <div class=\"quiz-audio-recorder-head\">\n                        <strong>Spiegazione audio</strong>\n                        <span data-recorder=\"time\">0:00</span>\n                        <button data-recorder=\"close\" type=\"button\" aria-label=\"Chiudi registratore\">\n                            <svg viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\"><path d=\"M6 6L18 18M18 6L6 18\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\"/></svg>\n                        </button>\n                    </div>\n                    <p data-recorder=\"status\">Premi il microfono per iniziare.</p>\n                    <audio data-recorder=\"preview\" class=\"hidden\" controls></audio>\n                    <div class=\"quiz-audio-record-actions\">\n                        <button data-recorder=\"start\" type=\"button\">\n                            <span data-recorder=\"start-icon\" class=\"quiz-recorder-icon\" aria-hidden=\"true\">\n                                <svg viewBox=\"0 0 24 24\" fill=\"none\"><rect x=\"8\" y=\"2\" width=\"8\" height=\"13\" rx=\"4\" stroke=\"currentColor\" stroke-width=\"2\"/><path d=\"M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>\n                            </span>\n                            <span data-recorder=\"start-label\">Registra</span>\n                        </button>\n                        <button data-recorder=\"pause\" type=\"button\" disabled>\n                            <span class=\"quiz-recorder-icon\" aria-hidden=\"true\">\n                                <svg viewBox=\"0 0 24 24\" fill=\"none\"><path d=\"M8 5V19M16 5V19\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\"/></svg>\n                            </span>\n                            <span>Pausa</span>\n                        </button>\n                        <button data-recorder=\"save\" type=\"button\" disabled>\n                            <span data-recorder=\"save-icon\" class=\"quiz-recorder-icon\" aria-hidden=\"true\">\n                                <svg viewBox=\"0 0 24 24\" fill=\"none\"><path d=\"M5 3H17L19 5V21H5V3Z\" stroke=\"currentColor\" stroke-width=\"2\"/><path d=\"M8 3V9H16V3M8 21V14H16V21\" stroke=\"currentColor\" stroke-width=\"2\"/></svg>\n                            </span>\n                            <span>Salva</span>\n                        </button>\n                    </div>\n                </section>";

  let active = null;
  const owners = new WeakMap();

  function mount(container) {
    if (!container) throw new TypeError("Recorder container required");
    const existing = container.querySelector(".quiz-audio-recorder");
    if (existing) return existing;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = TEMPLATE;
    const element = wrapper.firstElementChild;
    container.appendChild(element);
    return element;
  }

  function create({ container, root: suppliedRoot, save, onSaved, isCurrent = () => true,
    maxBytes = Infinity, returnFocus } = {}) {
    const element = suppliedRoot || mount(container);
    if (owners.has(element)) return owners.get(element);
    if (typeof save !== "function") throw new TypeError("Recorder save callback required");
    const find = name => element.querySelector('[data-recorder="' + name + '"], #quiz-audio-record-' + name);
    const start = find("start"), label = find("start-label"), pause = find("pause"), submit = find("save");
    const status = find("status"), time = find("time"), preview = find("preview"), dismiss = find("close");
    let state = null, destroyed = false;
    const listeners = [];
    const listen = (target, type, handler) => {
      target.addEventListener(type, handler); listeners.push(() => target.removeEventListener(type, handler));
    };
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    preview.setAttribute("aria-label", "Anteprima della spiegazione");
    const current = item => Boolean(item && state === item && !destroyed && isCurrent(item.question));
    const dirty = item => Boolean(item && (item.chunks.length || item.phase === "recording" || item.elapsed > 0));
    const elapsed = item => item.elapsed + (item.phase === "recording" ? Date.now() - item.startedAt : 0);
    const message = text => { status.textContent = text; };
    function paint(item) {
      if (!current(item)) return;
      const seconds = Math.floor(elapsed(item) / 1000);
      time.textContent = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
      label.textContent = item.phase === "recording" ? "Registrazione"
        : item.phase === "paused" ? "Riprendi" : "Registra";
      start.disabled = item.saving || item.terminal || !["ready", "paused"].includes(item.phase);
      start.classList.toggle("is-recording", item.phase === "recording");
      pause.disabled = item.saving || item.phase !== "recording";
      submit.disabled = item.saving || item.terminal || item.tooLarge || !item.blob?.size
        || !["paused", "finished"].includes(item.phase);
      submit.classList.toggle("is-saving", item.saving);
      submit.setAttribute("aria-busy", String(item.saving));
    }
    function stopTracks(item) {
      item.stream?.getTracks().forEach(track => track.stop());
      item.stream = null;
    }
    function freezeTime(item) {
      if (item.phase === "recording") item.elapsed += Date.now() - item.startedAt;
      root.clearInterval(item.timer); item.timer = 0;
    }
    function clearPreview(item) {
      preview.pause(); preview.removeAttribute("src"); preview.load();
      preview.classList.add("hidden");
      if (item.url) URL.revokeObjectURL(item.url);
      item.url = "";
    }
    function buildBlob(item) {
      if (!current(item)) return;
      const type = item.recorder?.mimeType || item.chunks[0]?.type || item.mimeType;
      item.blob = new Blob(item.chunks, { type });
      item.mimeType = item.blob.type;
      item.tooLarge = item.blob.size > maxBytes;
      clearPreview(item);
      if (item.blob.size) {
        item.url = URL.createObjectURL(item.blob);
        preview.src = item.url; preview.classList.remove("hidden");
      }
      if (item.tooLarge) message("La registrazione supera " + (maxBytes / 1024 / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + " MB. Chiudi e registra una spiegazione più breve.");
    }
    function close({ restoreFocus = false } = {}) {
      const item = state;
      if (!item) return;
      state = null;
      if (active === controller) active = null;
      item.controller?.abort();
      root.clearInterval(item.timer);
      root.clearTimeout(item.flushTimer);
      root.clearTimeout(item.saveTimer);
      item.stopReject?.(new DOMException("Cancelled", "AbortError"));
      if (item.recorder) {
        item.recorder.ondataavailable = item.recorder.onstop = item.recorder.onerror = null;
        if (item.recorder.state !== "inactive") { try { item.recorder.stop(); } catch (_) {} }
      }
      stopTracks(item); clearPreview(item);
      item.trigger?.setAttribute("aria-expanded", "false");
      element.classList.add("hidden");
      root.removeEventListener("beforeunload", beforeUnload);
      if (restoreFocus) {
        const target = returnFocus ? returnFocus({ question: item.question, trigger: item.trigger }) : item.trigger;
        if (target?.isConnected && !target.hidden && !target.closest("[inert], [hidden], .hidden")) target.focus({ preventScroll: true });
      }
    }
    function open({ trigger, question } = {}) {
      if (destroyed || !isCurrent(question)) return false;
      active?.close();
      const item = { trigger, question, chunks: [], phase: "ready", elapsed: 0, startedAt: 0,
        timer: 0, flushTimer: 0, saveTimer: 0, stream: null, recorder: null, blob: null, url: "",
        mimeType: "", saving: false, terminal: false, tooLarge: false, dismissing: false };
      state = item; active = controller;
      trigger?.setAttribute("aria-expanded", "true");
      element.classList.remove("hidden");
      message("Premi il microfono per iniziare."); paint(item);
      root.addEventListener("beforeunload", beforeUnload);
      start.focus({ preventScroll: true });
      return true;
    }
    async function requestClose() {
      const item = state;
      if (!item || item.dismissing) return;
      if (dirty(item) && typeof root.showConfirm === "function") {
        item.dismissing = true;
        try {
          const accepted = await root.showConfirm("Chiudere il registratore?",
            "La registrazione non salvata verrà eliminata.", "Chiudi", "Continua");
          if (state !== item) return;
          if (!accepted) { item.dismissing = false; start.disabled ? dismiss.focus() : start.focus(); return; }
        } catch (_) { item.dismissing = false; return; }
      }
      if (state === item) close({ restoreFocus: true });
    }
    function beforeUnload(event) {
      if (dirty(state)) { event.preventDefault(); event.returnValue = ""; }
    }
    function recorderError(item, error) {
      if (!current(item)) return;
      freezeTime(item); root.clearTimeout(item.flushTimer);
      item.stopReject?.(error || new Error("Registrazione interrotta."));
      stopTracks(item);
      item.phase = "finished"; item.terminal = true;
      message("Registrazione interrotta. Chiudi e riprova."); paint(item);
    }
    async function startRecording() {
      const item = state;
      if (!current(item)) { close(); return; }
      if (item.saving || item.terminal || !["ready", "paused"].includes(item.phase)) return;
      if (!root.isSecureContext || !root.navigator?.mediaDevices?.getUserMedia || !root.MediaRecorder) {
        message("Microfono non disponibile: apri il sito con HTTPS."); return;
      }
      preview.pause();
      if (item.phase === "paused") {
        try {
          item.recorder.resume(); item.phase = "recording"; item.startedAt = Date.now();
        } catch (error) { recorderError(item, error); return; }
      } else {
        item.phase = "permission"; message("Consenti l'accesso al microfono…"); paint(item);
        let stream;
        try {
          stream = await root.navigator.mediaDevices.getUserMedia({ audio: true });
          if (!current(item) || document.hidden) {
            stream.getTracks().forEach(track => track.stop());
            if (state === item) close();
            return;
          }
          item.stream = stream;
          const Recorder = root.MediaRecorder;
          const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"]
            .find(type => Recorder.isTypeSupported?.(type));
          item.recorder = new Recorder(stream, { audioBitsPerSecond: 64000, ...(mimeType ? { mimeType } : {}) });
          item.mimeType = item.recorder.mimeType || mimeType || "";
          item.recorder.ondataavailable = event => {
            if (!current(item)) return;
            if (event.data?.size) item.chunks.push(event.data);
            if (item.phase === "pausing") {
              root.clearTimeout(item.flushTimer); item.flushTimer = 0;
              item.phase = "paused"; buildBlob(item);
              if (!item.tooLarge) message(item.blob.size ? "In pausa. Puoi ascoltare o salvare." : "Nessun audio registrato. Premi Riprendi e riprova.");
              paint(item);
            }
          };
          item.recorder.onerror = event => recorderError(item, event.error);
          item.recorder.onstop = () => {
            if (!current(item)) return;
            root.clearTimeout(item.flushTimer); item.flushTimer = 0;
            freezeTime(item); stopTracks(item); item.phase = "finished"; buildBlob(item);
            item.stopResolve?.(); item.stopResolve = item.stopReject = null;
            paint(item);
          };
          item.recorder.start(); item.phase = "recording"; item.startedAt = Date.now();
        } catch (error) {
          stream?.getTracks().forEach(track => track.stop());
          if (!current(item)) return;
          item.stream = null; item.phase = "ready"; paint(item);
          message(error?.name === "NotAllowedError"
            ? "Microfono bloccato. Consenti l'accesso dal lucchetto del browser."
            : "Impossibile accedere al microfono.");
          return;
        }
      }
      item.timer = root.setInterval(() => {
        if (!current(item)) { close(); return; }
        paint(item);
      }, 250);
      message("Registrazione in corso…"); paint(item);
    }
    function pauseRecording() {
      const item = state;
      if (!current(item)) { close(); return; }
      if (item.saving || item.phase !== "recording") return;
      freezeTime(item); item.phase = "pausing"; paint(item);
      item.flushTimer = root.setTimeout(() => recorderError(item, new Error("audio_flush_timeout")), 10000);
      try { item.recorder.pause(); item.recorder.requestData(); }
      catch (error) { recorderError(item, error); }
    }
    function finish(item) {
      if (item.recorder.state === "inactive") { buildBlob(item); return Promise.resolve(); }
      return new Promise((resolve, reject) => {
        item.stopResolve = resolve; item.stopReject = reject;
        item.flushTimer = root.setTimeout(() => {
          item.stopResolve = item.stopReject = null;
          stopTracks(item); reject(new Error("Non riesco a completare la registrazione. Riprova."));
        }, 10000);
        try { item.recorder.stop(); } catch (error) { root.clearTimeout(item.flushTimer); reject(error); }
      });
    }
    async function saveRecording() {
      const item = state;
      if (!current(item)) { close(); return; }
      if (submit.disabled || item.saving) return;
      item.saving = true; item.controller = new AbortController();
      preview.pause(); paint(item); message("Salvataggio in corso…");
      let abortHandler;
      try {
        await finish(item);
        if (!current(item) || item.controller.signal.aborted) return;
        if (!item.blob?.size) throw Object.assign(new Error("Nessun audio registrato."), { retryable: false });
        if (item.tooLarge) return;
        const signal = item.controller.signal;
        const cancelled = new Promise((_, reject) => {
          abortHandler = () => reject(signal.reason || new DOMException("Cancelled", "AbortError"));
          signal.addEventListener("abort", abortHandler, { once: true });
        });
        item.saveTimer = root.setTimeout(() => item.controller.abort(new Error("Non posso confermare il salvataggio. Riprova.")), 30000);
        const result = await Promise.race([save({ blob: item.blob, mimeType: item.mimeType,
          durationMs: Math.round(elapsed(item)) }, signal), cancelled]);
        if (!current(item) || signal.aborted) return;
        const detail = { question: item.question, trigger: item.trigger };
        close(); onSaved?.(result, detail);
      } catch (error) {
        if (!current(item)) return;
        item.terminal = error?.retryable === false;
        message(error?.message || "Salvataggio non riuscito. Riprova.");
      } finally {
        root.clearTimeout(item.saveTimer);
        item.controller?.signal.removeEventListener("abort", abortHandler);
        if (current(item)) { item.saving = false; paint(item); }
        else if (state === item) close();
      }
    }
    const controller = { element, open, close, destroy() {
      if (destroyed) return;
      close(); destroyed = true; listeners.forEach(remove => remove()); owners.delete(element);
      if (!suppliedRoot) element.remove();
    } };
    listen(element, "click", event => event.stopPropagation());
    listen(dismiss, "click", () => { void requestClose(); });
    listen(start, "click", () => { void startRecording(); });
    listen(pause, "click", pauseRecording);
    listen(submit, "click", () => { void saveRecording(); });
    listen(element, "keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); void requestClose(); }
    });
    listen(root, "pagehide", () => close());
    listen(root, "popstate", () => close());
    listen(document, "visibilitychange", () => {
      if (document.hidden) { preview.pause(); if (state?.phase === "recording") pauseRecording(); }
    });
    owners.set(element, controller);
    return controller;
  }
  root.MagicQuizAudioRecorder = Object.freeze({ create, mount });
})(window);
