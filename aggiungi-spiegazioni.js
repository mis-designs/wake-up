const API = "/api/quiz";
const $ = id => document.getElementById(id);
const ADD_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 8V16M8 12H16M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
const MIC_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="2" width="8" height="13" rx="4" stroke="currentColor" stroke-width="2"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
const SAVE_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h12l2 2v16H5V3Z" stroke="currentColor" stroke-width="2"/><path d="M8 3v6h8V3M8 21v-7h8v7" stroke="currentColor" stroke-width="2"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const RENEW_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const state = { chapters: [], selected: null, audioKeys: new Set(), query: "", filter: "all", inline: null, activeQuestionId: null, playing: null };
let dialogResolver = null;
const DRAFT_DB = "magicph-quiz-audio-drafts";

function credentials() {
  let session = null;
  try { session = JSON.parse(localStorage.getItem("user_session") || localStorage.getItem("session") || "null"); } catch (_) { session = null; }
  return {
    phone: session?.phone || localStorage.getItem("phone") || "",
    deviceId: session?.deviceId || localStorage.getItem("deviceId") || "",
    accessToken: session?.accessToken || localStorage.getItem("accessToken") || ""
  };
}

function isAdmin() {
  try {
    const session = JSON.parse(localStorage.getItem("user_session") || localStorage.getItem("session") || "null");
    return session?.role === "admin";
  } catch (_) { return false; }
}

async function api(action, payload = {}) {
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(credentials().accessToken ? { Authorization: `Bearer ${credentials().accessToken}` } : {}) },
    body: JSON.stringify({ action, ...credentials(), ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `api_${response.status}`);
  return data;
}

function normalize(text) {
  return String(text || "").normalize("NFKC").toLocaleLowerCase("it-IT").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

async function keyFor(text) {
  const bytes = new TextEncoder().encode(normalize(text));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `q_${[...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("")}`;
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function showMessage(text, type = "") {
  const el = $("audioAdminMessage");
  if (!el) return;
  el.textContent = text || "";
  el.className = `audio-admin-message${type ? ` ${type}` : ""}`;
}

function openDialog({ title, text, confirmLabel = "Continua", cancelLabel = "Annulla", danger = false, error = "" }) {
  const dialog = $("audioAdminDialog");
  $("audioAdminDialogTitle").textContent = title;
  $("audioAdminDialogText").textContent = text;
  $("audioAdminDialogCancel").textContent = cancelLabel;
  $("audioAdminDialogConfirm").textContent = confirmLabel;
  $("audioAdminDialogConfirm").classList.toggle("danger", Boolean(danger));
  const details = $("audioAdminDialogDetails");
  details.classList.toggle("hidden", !error);
  $("audioAdminDialogCode").textContent = error ? String(error) : "";
  dialog.classList.remove("hidden");
  return new Promise(resolve => { dialogResolver = resolve; });
}

function closeDialog(value) {
  $("audioAdminDialog")?.classList.add("hidden");
  if (dialogResolver) { const resolve = dialogResolver; dialogResolver = null; resolve(Boolean(value)); }
}

async function showProblem(title, text, error) {
  await openDialog({ title, text, confirmLabel: "Chiudi", cancelLabel: "", error: error?.message || error || "" });
}

function openDraftDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("indexeddb_unavailable"));
    const request = indexedDB.open(DRAFT_DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("drafts")) request.result.createObjectStore("drafts", { keyPath: "key" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
  });
}

async function putDraft(item) {
  if (!item?.blob) return;
  try {
    const db = await openDraftDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction("drafts", "readwrite").objectStore("drafts").put({ key: item.key, blob: item.blob, durationMs: item.elapsed, savedAt: Date.now() });
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
    db.close();
  } catch (_) { /* La registrazione resta nel pannello corrente. */ }
}

async function getDraft(key) {
  try {
    const db = await openDraftDb();
    const result = await new Promise((resolve, reject) => {
      const request = db.transaction("drafts", "readonly").objectStore("drafts").get(key);
      request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
    });
    db.close(); return result;
  } catch (_) { return null; }
}

async function deleteDraft(key) {
  try {
    const db = await openDraftDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction("drafts", "readwrite").objectStore("drafts").delete(key);
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
    db.close();
  } catch (_) { /* Nothing to clean up. */ }
}

function figureUrl(figure) {
  const value = String(figure || "").trim();
  if (!value || ["0", "false", "null", "undefined"].includes(value.toLowerCase())) return "";
  return `/api/asset?kind=figure&figure=${encodeURIComponent(value)}`;
}

function answerBadge(value) {
  const badge = document.createElement("span");
  const isTrue = value === true || ["1", "true", "vero", "v", "yes"].includes(String(value || "").trim().toLowerCase());
  badge.className = `audio-admin-answer-badge ${isTrue ? "is-true" : "is-false"}`;
  badge.textContent = isTrue ? "V" : "F";
  badge.title = isTrue ? "Risposta corretta: Vero" : "Risposta corretta: Falso";
  return badge;
}

function iconButton(kind, label, icon) {
  const button = document.createElement("button");
  button.type = "button"; button.className = `audio-admin-icon ${kind}`; button.setAttribute("aria-label", label); button.title = label; button.innerHTML = icon;
  return button;
}

function chapterName(chapter, index) {
  return chapter.name || `Capitolo ${String(index + 1).padStart(2, "0")}`;
}

function chapterProgress(chapter) {
  const done = chapter.questions.filter(question => state.audioKeys.has(question.quizKey)).length;
  return { done, total: chapter.questions.length, percent: chapter.questions.length ? Math.round(done / chapter.questions.length * 100) : 0 };
}

function renderChapters() {
  const root = $("audioAdminChapters");
  root.replaceChildren();
  state.chapters.forEach((chapter, index) => {
    const progress = chapterProgress(chapter);
    const button = document.createElement("button");
    button.type = "button"; button.className = "audio-admin-chapter";
    const title = document.createElement("strong"); title.textContent = `${String(index + 1).padStart(2, "0")} · ${chapterName(chapter, index)}`;
    const count = document.createElement("small"); count.textContent = `${progress.done} di ${progress.total} audio · ${progress.percent}%`;
    const bar = document.createElement("span"); bar.className = "audio-admin-progress"; const fill = document.createElement("i"); fill.style.width = `${progress.percent}%`; bar.append(fill);
    button.append(title, count, bar); button.addEventListener("click", () => openChapter(index)); root.append(button);
  });
  const total = state.chapters.reduce((sum, chapter) => sum + chapter.questions.length, 0);
  const done = state.chapters.reduce((sum, chapter) => sum + chapterProgress(chapter).done, 0);
  $("audioAdminGlobalProgress").textContent = `${done} di ${total} spiegazioni aggiunte · ${total ? Math.round(done / total * 100) : 0}%`;
}

function openChapter(index) {
  state.selected = index; state.query = ""; state.filter = "all"; state.activeQuestionId = null; closeInline();
  $("audioAdminChapters").classList.add("hidden"); $("audioAdminQuestions").classList.remove("hidden"); renderChapter();
  history.replaceState({}, "", `/aggiungi-spiegazioni?capitolo=${index + 1}`);
}

function closeChapter() {
  state.selected = null; state.activeQuestionId = null; closeInline(); $("audioAdminQuestions").classList.add("hidden"); $("audioAdminChapters").classList.remove("hidden"); renderChapters(); history.replaceState({}, "", "/aggiungi-spiegazioni");
}

function visibleQuestions() {
  const chapter = state.chapters[state.selected];
  if (!chapter) return [];
  return chapter.questions.filter(question => {
    const textMatch = !state.query || normalize(question.question).includes(normalize(state.query));
    const hasAudio = state.audioKeys.has(question.quizKey);
    return textMatch && (state.filter === "all" || (state.filter === "available" && hasAudio) || (state.filter === "missing" && !hasAudio));
  });
}

function renderChapter() {
  const chapter = state.chapters[state.selected];
  if (!chapter) return;
  const root = $("audioAdminQuestions"); root.replaceChildren();
  const head = document.createElement("div"); head.className = "audio-admin-question-head";
  const title = document.createElement("h2"); title.textContent = `${String(state.selected + 1).padStart(2, "0")} · ${chapterName(chapter, state.selected)}`;
  const back = document.createElement("button"); back.type = "button"; back.className = "audio-admin-back-list"; back.textContent = "← Tutti i capitoli"; back.addEventListener("click", closeChapter); head.append(title, back);
  const toolbar = document.createElement("div"); toolbar.className = "audio-admin-toolbar";
  const search = document.createElement("input"); search.type = "search"; search.placeholder = "Cerca nella domanda"; search.value = state.query; search.addEventListener("input", () => { state.query = search.value; renderChapter(); });
  const filter = document.createElement("select"); filter.innerHTML = '<option value="all">Tutti i quiz</option><option value="missing">Da aggiungere</option><option value="available">Audio aggiunti</option>'; filter.value = state.filter; filter.addEventListener("change", () => { state.filter = filter.value; renderChapter(); }); toolbar.append(search, filter);
  const list = document.createElement("div"); list.className = "audio-admin-question-list";
  visibleQuestions().forEach((question, index) => list.append(questionRow(question, index)));
  if (!list.children.length) { const empty = document.createElement("div"); empty.className = "audio-admin-empty"; empty.textContent = "Nessun quiz corrisponde al filtro."; list.append(empty); }
  root.append(head, toolbar, list);
}

function questionRow(question, position) {
  const row = document.createElement("article"); row.className = "audio-admin-question";
  const copy = document.createElement("div"); copy.className = "audio-admin-question-copy";
  const text = document.createElement("strong"); text.textContent = `${position + 1}. ${question.question}`; copy.append(text);
  const imageSource = figureUrl(question.figure);
  if (imageSource) { const image = document.createElement("img"); image.src = imageSource; image.alt = "Figura della domanda"; image.loading = "lazy"; image.onerror = () => image.remove(); copy.append(image); }
  const actions = document.createElement("div"); actions.className = "audio-admin-actions";
  const activeId = `chapter-${state.selected}-quiz-${question.id}`;
  if (state.audioKeys.has(question.quizKey)) {
    const player = createAudioPlayer(question); const edit = iconButton("renew", "Registra di nuovo", RENEW_ICON); edit.addEventListener("click", () => beginInline(question, activeId)); actions.append(player, answerBadge(question.correct), edit);
  } else {
    const add = iconButton("add", "Aggiungi spiegazione", ADD_ICON); add.addEventListener("click", () => beginInline(question, activeId)); actions.append(answerBadge(question.correct), add);
  }
  row.append(copy, actions);
  if (state.activeQuestionId === activeId) row.append(inlineRecorder());
  return row;
}

function stopCurrentPlayer(except = null) {
  if (!state.playing || state.playing === except) return;
  state.playing.audio.pause(); state.playing.button.classList.remove("is-playing"); state.playing = null;
}

function createAudioPlayer(question) {
  const player = document.createElement("div"); player.className = "audio-admin-player"; player.setAttribute("aria-label", "Player spiegazione audio");
  const button = document.createElement("button"); button.type = "button"; button.className = "audio-admin-player-play"; button.setAttribute("aria-label", "Riproduci spiegazione");
  const progress = document.createElement("input"); progress.type = "range"; progress.min = "0"; progress.max = "100"; progress.step = "0.1"; progress.value = "0"; progress.className = "audio-admin-player-progress"; progress.setAttribute("aria-label", "Avanzamento audio");
  const speed = document.createElement("button"); speed.type = "button"; speed.className = "audio-admin-player-speed"; speed.textContent = "1×"; speed.title = "Cambia velocità";
  const audio = new Audio(); let loading = null; let speedValue = 1; let frame = 0;
  const instance = { audio, button };
  const paint = () => { const percent = audio.duration > 0 ? audio.currentTime / audio.duration * 100 : 0; progress.value = String(percent); progress.style.setProperty("--progress", `${percent}%`); };
  const stopFrame = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
  const tick = () => { paint(); if (!audio.paused && !audio.ended) frame = requestAnimationFrame(tick); };
  const load = async () => { if (audio.src) return; if (!loading) { button.classList.add("is-loading"); loading = api("getQuizAudioPlayback", { question: question.question }).then(data => { audio.src = data.audioUrl; }).finally(() => { loading = null; button.classList.remove("is-loading"); }); } return loading; };
  button.addEventListener("click", async () => { try { if (!audio.src) await load(); if (audio.paused) { stopCurrentPlayer(instance); state.playing = instance; await audio.play(); } else audio.pause(); } catch (error) { await showProblem("Audio non disponibile", "Il sito non riesce a recuperare questa spiegazione.", error); } });
  progress.addEventListener("input", () => { if (audio.duration) audio.currentTime = Number(progress.value) / 100 * audio.duration; paint(); });
  speed.addEventListener("click", () => { speedValue = [1, 1.25, 1.5, 2][([1, 1.25, 1.5, 2].indexOf(speedValue) + 1) % 4]; audio.playbackRate = speedValue; speed.textContent = `${String(speedValue).replace(".", ",")}×`; });
  audio.addEventListener("play", () => { button.classList.add("is-playing"); stopFrame(); tick(); });
  audio.addEventListener("pause", () => { button.classList.remove("is-playing"); stopFrame(); });
  audio.addEventListener("ended", () => { button.classList.remove("is-playing"); stopFrame(); progress.value = "0"; progress.style.setProperty("--progress", "0%"); if (state.playing === instance) state.playing = null; });
  audio.addEventListener("timeupdate", paint); audio.addEventListener("loadedmetadata", paint);
  player.append(button, progress, speed); return player;
}

function elapsed(item) { return item ? item.elapsed + (item.phase === "recording" ? Date.now() - item.startedAt : 0) : 0; }
function buildBlob(item) { if (!item?.chunks?.length) return null; if (item.blobUrl) URL.revokeObjectURL(item.blobUrl); item.blob = new Blob(item.chunks, { type: item.mimeType || "audio/webm" }); item.blobUrl = URL.createObjectURL(item.blob); return item.blob; }
function hasUnsaved(item) { return Boolean(item && (item.phase === "recording" || item.phase === "paused" || item.chunks.length || item.blob)); }
function updateTimer() { const timer = document.getElementById("audioInlineTimer"); if (timer) timer.textContent = formatTime(elapsed(state.inline)); }

async function beginInline(question, activeId) {
  if (state.activeQuestionId === activeId) return;
  const previous = state.inline;
  if (previous?.saving) { await showProblem("Caricamento in corso", "Attendi la fine del caricamento prima di cambiare quiz.", "upload_in_progress"); return; }
  if (hasUnsaved(previous)) {
    const accepted = await openDialog({ title: "Registrazione non salvata", text: "Hai registrato un audio che non è ancora stato salvato. Vuoi abbandonarlo e aprire il registratore nel nuovo quiz?", confirmLabel: "Abbandona e continua", cancelLabel: "Continua a modificare", danger: true });
    if (!accepted) return;
  }
  if (previous?.retryable) await deleteDraft(previous.key);
  closeInline();
  state.inline = { activeQuestionId: activeId, key: question.quizKey, question, saved: state.audioKeys.has(question.quizKey), phase: "ready", chunks: [], elapsed: 0, startedAt: 0, status: "Microfono non avviato. Premi il microfono per iniziare.", stream: null, recorder: null, blob: null, blobUrl: "", timer: null, saving: false, retryable: false };
  state.activeQuestionId = activeId; renderChapter(); void restoreDraft(state.inline);
}

async function restoreDraft(item) { const draft = await getDraft(item.key); if (state.inline !== item || !draft?.blob) return; item.blob = draft.blob; item.blobUrl = URL.createObjectURL(draft.blob); item.elapsed = Number(draft.durationMs) || 0; item.phase = "paused"; item.retryable = true; item.status = "Audio locale pronto. Premi Salva per riprovare il caricamento."; renderChapter(); }
function closeInline() { const item = state.inline; if (!item) { state.activeQuestionId = null; return; } clearInterval(item.timer); if (item.recorder && item.recorder.state !== "inactive") item.recorder.stop(); item.stream?.getTracks().forEach(track => track.stop()); if (item.blobUrl) URL.revokeObjectURL(item.blobUrl); state.inline = null; state.activeQuestionId = null; }
async function requestCloseInline() { const item = state.inline; if (!item || item.saving) return; if (hasUnsaved(item)) { const accepted = await openDialog({ title: "Registrazione non salvata", text: "Vuoi chiudere il pannello e abbandonare l'audio non salvato?", confirmLabel: "Abbandona e chiudi", cancelLabel: "Continua a modificare", danger: true }); if (!accepted) return; } if (item.retryable) await deleteDraft(item.key); closeInline(); renderChapter(); }

async function ensureStream() { const item = state.inline; if (!item) return false; if (item.stream?.active) return true; try { item.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); item.status = "Microfono pronto."; return true; } catch (error) { item.status = "Microfono bloccato: consenti il microfono dal browser."; renderChapter(); await showProblem("Microfono non disponibile", item.status, error); return false; } }
async function startRecording() { const item = state.inline; if (!item || !(await ensureStream())) return; if (item.recorder?.state === "paused") item.recorder.resume(); else { const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm"; item.mimeType = mimeType; item.recorder = new MediaRecorder(item.stream, { mimeType, audioBitsPerSecond: 64000 }); item.chunks = []; item.recorder.ondataavailable = event => { if (event.data?.size) item.chunks.push(event.data); }; item.recorder.start(); } item.phase = "recording"; item.startedAt = Date.now(); clearInterval(item.timer); item.timer = setInterval(updateTimer, 250); item.status = "Registrazione in corso…"; renderChapter(); }
async function pauseRecording() { const item = state.inline; if (!item || item.recorder?.state !== "recording") return; item.elapsed += Date.now() - item.startedAt; item.recorder.requestData(); item.recorder.pause(); item.phase = "paused"; clearInterval(item.timer); item.status = "In pausa. Puoi riprendere, ascoltare o salvare."; await new Promise(resolve => setTimeout(resolve, 100)); buildBlob(item); renderChapter(); }
async function discardDraft() { const item = state.inline; if (!item) return; const accepted = await openDialog({ title: "Eliminare la registrazione?", text: "La registrazione non salvata verrà eliminata.", confirmLabel: "Elimina", cancelLabel: "Mantieni", danger: true }); if (!accepted) return; await deleteDraft(item.key); const activeId = item.activeQuestionId; const question = item.question; closeInline(); state.inline = { activeQuestionId: activeId, key: question.quizKey, question, saved: item.saved, phase: "ready", chunks: [], elapsed: 0, startedAt: 0, status: "Registrazione eliminata.", stream: null, recorder: null, blob: null, blobUrl: "", timer: null, saving: false, retryable: false }; state.activeQuestionId = activeId; renderChapter(); }
async function renewRecording() { const item = state.inline; if (!item) return; const accepted = await openDialog({ title: "Ricominciare da capo?", text: "La registrazione attuale verrà sostituita da una nuova.", confirmLabel: "Ricomincia", cancelLabel: "Annulla" }); if (!accepted) return; await deleteDraft(item.key); const question = item.question; const activeId = item.activeQuestionId; closeInline(); state.inline = { activeQuestionId: activeId, key: question.quizKey, question, saved: item.saved, phase: "ready", chunks: [], elapsed: 0, startedAt: 0, status: "Microfono non avviato. Premi il microfono per iniziare.", stream: null, recorder: null, blob: null, blobUrl: "", timer: null, saving: false, retryable: false }; state.activeQuestionId = activeId; renderChapter(); }

async function saveInline() {
  const item = state.inline; if (!item) return; if (item.phase === "recording") await pauseRecording(); if (!item.blob) { await showProblem("Nessun audio da salvare", "Premi il microfono, registra la spiegazione e poi salva.", "audio_empty"); return; }
  item.saving = true; item.status = "Caricamento sicuro in corso…"; renderChapter();
  try {
    const created = await api("createQuizAudioUpload", { question: item.question.question });
    const upload = await fetch(created.uploadUrl, { method: "PUT", headers: { "Content-Type": item.mimeType || "audio/webm" }, body: item.blob });
    if (!upload.ok) throw new Error(`r2_upload_${upload.status}`);
    await api("confirmQuizAudioUpload", { question: item.question.question, audioDurationMs: elapsed(item) });
    await deleteDraft(item.key); state.audioKeys.add(item.key); closeInline(); renderChapters(); renderChapter();
  } catch (error) {
    await putDraft(item); item.saving = false; item.retryable = true; item.status = "Caricamento non riuscito. L'audio è ancora pronto: premi Salva per riprovare."; renderChapter(); await showProblem("Caricamento non riuscito", "La registrazione è stata conservata in questo quiz. Premi Salva per riprovare.", error);
  }
}

function inlineRecorder() {
  const item = state.inline; const panel = document.createElement("section"); panel.className = "audio-admin-inline-recorder";
  const info = document.createElement("div"); info.className = "audio-admin-inline-status"; const status = document.createElement("span"); status.textContent = item.status; const timer = document.createElement("strong"); timer.id = "audioInlineTimer"; timer.textContent = formatTime(elapsed(item)); const close = iconButton("close", "Chiudi registratore", CLOSE_ICON); close.className = "audio-admin-inline-close"; close.disabled = item.saving; close.addEventListener("click", requestCloseInline); info.append(status, timer, close);
  const controls = document.createElement("div"); controls.className = "audio-admin-inline-controls";
  const start = iconButton("record", item.phase === "paused" ? "Riprendi registrazione" : "Inizia registrazione", MIC_ICON); start.disabled = item.saving; start.addEventListener("click", startRecording);
  const pause = iconButton("pause", "Metti in pausa", PAUSE_ICON); pause.disabled = item.saving || item.phase !== "recording"; pause.addEventListener("click", pauseRecording);
  const trash = iconButton("trash", item.chunks.length ? "Elimina registrazione" : "Elimina audio salvato", TRASH_ICON); trash.disabled = item.saving || (!item.chunks.length && !item.saved); trash.addEventListener("click", () => item.chunks.length ? discardDraft() : removeSaved(item.question));
  const renew = iconButton("renew", "Ricomincia registrazione", RENEW_ICON); renew.disabled = item.saving || (!item.chunks.length && !item.blob); renew.addEventListener("click", renewRecording);
  const save = iconButton("save", item.retryable ? "Riprova caricamento" : "Salva spiegazione", SAVE_ICON); save.disabled = item.saving || (!item.blob && item.phase !== "recording"); save.addEventListener("click", saveInline); controls.append(start, pause, trash, renew, save);
  panel.append(info); if (item.blobUrl) { const preview = document.createElement("audio"); preview.controls = true; preview.src = item.blobUrl; preview.className = "audio-admin-inline-preview"; panel.append(preview); } panel.append(controls); return panel;
}

async function removeSaved(question) {
  const accepted = await openDialog({ title: "Eliminare la spiegazione?", text: "L'audio sparirà per gli utenti in entrambi i progetti.", confirmLabel: "Elimina", cancelLabel: "Annulla", danger: true }); if (!accepted) return;
  try { await api("deleteQuizAudio", { question: question.question }); state.audioKeys.delete(question.quizKey); if (state.inline?.key === question.quizKey) closeInline(); renderChapters(); renderChapter(); } catch (error) { await showProblem("Eliminazione non riuscita", "Il sito non è riuscito a eliminare l'audio.", error); }
}

$("audioAdminDialogCancel").addEventListener("click", () => closeDialog(false));
$("audioAdminDialogConfirm").addEventListener("click", () => closeDialog(true));
$("audioAdminDialog").addEventListener("click", event => { if (event.target === $("audioAdminDialog")) closeDialog(false); });

async function load() {
  if (!isAdmin()) { showMessage("Accesso admin richiesto.", "error"); return; }
  try {
    showMessage("Caricamento catalogo Magic Book…");
    const [catalog, overview] = await Promise.all([api("getMagicBookCatalog"), api("getQuizAudioAdminOverview")]);
    const rows = Array.isArray(catalog.quiz) ? catalog.quiz : [];
    if (rows.length !== 786) throw new Error(`magic_catalog_count_mismatch_${rows.length}`);
    const keys = await Promise.all(rows.map(row => keyFor(row.question)));
    state.audioKeys = new Set(overview.quizKeys || []);
    const byChapter = new Map();
    rows.forEach((row, index) => {
      const chapter = String(row.chapter ?? "").trim() || "0";
      if (!byChapter.has(chapter)) byChapter.set(chapter, []);
      byChapter.get(chapter).push({ ...row, quizKey: keys[index] });
    });
    state.chapters = [...byChapter.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([key, questions]) => ({ key, name: `Capitolo ${key}`, questions }));
    renderChapters(); showMessage("");
    const chapterParam = Number(new URLSearchParams(location.search).get("capitolo")); if (chapterParam > 0 && chapterParam <= state.chapters.length) openChapter(chapterParam - 1);
  } catch (error) { showMessage("Impossibile caricare il catalogo audio.", "error"); await showProblem("Caricamento non riuscito", "Controlla la configurazione server e la pubblicazione del catalogo Apps Script.", error); }
}

window.addEventListener("popstate", () => { const index = Number(new URLSearchParams(location.search).get("capitolo")) - 1; if (index >= 0 && index < state.chapters.length) openChapter(index); else closeChapter(); });
load();
