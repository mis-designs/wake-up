const API = "/api/quiz";
const ACCESS_VALIDATION_API = "/api/getPages";
const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const $ = id => document.getElementById(id);
const ADD_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 8V16M8 12H16M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
const MIC_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="2" width="8" height="13" rx="4" stroke="currentColor" stroke-width="2"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
const SAVE_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h12l2 2v16H5V3Z" stroke="currentColor" stroke-width="2"/><path d="M8 3v6h8V3M8 21v-7h8v7" stroke="currentColor" stroke-width="2"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const RENEW_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SPEAKER_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const FILTER_OPTIONS = [
  { value: "all", label: "Tutti i quiz" },
  { value: "missing", label: "Da aggiungere" },
  { value: "available", label: "Audio aggiunti" }
];

const state = {
  chapters: [],
  selected: null,
  audioKeys: new Set(),
  legacyReviewKeys: new Set(),
  collisionRegistry: { collisions: {} },
  query: "",
  filter: "all",
  reviewOpen: false,
  inline: null,
  activeQuestionId: null,
  playing: null,
  playbackRequestId: 0,
  italianAudioCache: new Map(),
  activeHelpKey: null,
  helpRequestId: 0
};
let dialogResolver = null;
const DRAFT_DB = "magicph-quiz-audio-drafts";
let accessTokenRefreshPromise = null;

function readStoredSession() {
  try { return JSON.parse(localStorage.getItem("user_session") || localStorage.getItem("session") || "null"); }
  catch (_) { return null; }
}

function credentials() {
  const session = readStoredSession();
  return {
    phone: session?.phone || localStorage.getItem("phone") || "",
    deviceId: session?.deviceId || localStorage.getItem("deviceId") || "",
    accessToken: session?.accessToken || localStorage.getItem("accessToken") || "",
    accessTokenExpiresAt: Number(session?.accessTokenExpiresAt || localStorage.getItem("accessTokenExpiresAt") || 0)
  };
}

function isAdmin() {
  return readStoredSession()?.role === "admin";
}

function tokenExpiresAt(accessToken) {
  try {
    const encodedPayload = String(accessToken || "").split(".")[0];
    const padded = `${encodedPayload}${"=".repeat((4 - encodedPayload.length % 4) % 4)}`;
    return Number(JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/"))).exp || 0);
  } catch (_) { return 0; }
}

function persistRefreshedSession(data) {
  if (!data?.accessToken || !data?.accessTokenExpiresAt) return false;
  const current = readStoredSession() || {};
  const session = {
    ...current,
    phone: data.phone || current.phone,
    deviceId: data.deviceId || current.deviceId,
    role: data.role || current.role || "user",
    expiry: data.expiry || current.expiry,
    accessToken: data.accessToken,
    accessTokenExpiresAt: data.accessTokenExpiresAt,
    loggedIn: true,
    lastValid: Date.now()
  };
  localStorage.setItem("user_session", JSON.stringify(session));
  localStorage.setItem("phone", session.phone || "");
  localStorage.setItem("deviceId", session.deviceId || "");
  localStorage.setItem("accessToken", session.accessToken);
  localStorage.setItem("accessTokenExpiresAt", String(session.accessTokenExpiresAt));
  return session.role === "admin";
}

async function refreshAccessToken() {
  if (accessTokenRefreshPromise) return accessTokenRefreshPromise;
  accessTokenRefreshPromise = (async () => {
    const c = credentials();
    if (!c.phone || !c.deviceId || !c.accessToken) return false;
    const response = await fetch(ACCESS_VALIDATION_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.accessToken}` },
      body: JSON.stringify({ action: "validate", phone: c.phone, deviceId: c.deviceId })
    });
    const data = await response.json().catch(() => ({}));
    return response.ok && data?.success === true && persistRefreshedSession(data);
  })();
  try { return await accessTokenRefreshPromise; }
  catch (_) { return false; }
  finally { accessTokenRefreshPromise = null; }
}

async function ensureFreshAccessToken({ force = false } = {}) {
  const c = credentials();
  const expiresAt = c.accessTokenExpiresAt || tokenExpiresAt(c.accessToken);
  if (!force && c.accessToken && expiresAt > Date.now() + ACCESS_TOKEN_REFRESH_SKEW_MS) return true;
  return refreshAccessToken();
}

function isRetryableAuthFailure(response, data) {
  return [401, 403].includes(response.status)
    && ["token_expired", "unauthorized", "admin_forbidden"].includes(String(data?.error || ""));
}

async function api(action, payload = {}) {
  await ensureFreshAccessToken();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const c = credentials();
    const response = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(c.accessToken ? { Authorization: `Bearer ${c.accessToken}` } : {}) },
      body: JSON.stringify({ action, ...c, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;
    if (attempt === 0 && isRetryableAuthFailure(response, data) && await ensureFreshAccessToken({ force: true })) continue;
    const error = new Error(data?.error || `api_${response.status}`); error.status = response.status; throw error;
  }
  throw new Error("api_retry_exhausted");
}

async function apiBlob(action, payload = {}) {
  await ensureFreshAccessToken();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const c = credentials();
    const response = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(c.accessToken ? { Authorization: `Bearer ${c.accessToken}` } : {}) },
      body: JSON.stringify({ action, ...c, ...payload })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (attempt === 0 && isRetryableAuthFailure(response, data) && await ensureFreshAccessToken({ force: true })) continue;
      const error = new Error(data?.error || `api_${response.status}`); error.status = response.status; throw error;
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("empty_audio_blob");
    const mimeType = String(blob.type || "audio/webm").startsWith("audio/") ? blob.type : "audio/webm";
    return {
      blob: new Blob([blob], { type: mimeType }),
      durationMs: Number(response.headers.get("X-Audio-Duration-Ms")) || 0
    };
  }
  throw new Error("audio_blob_retry_exhausted");
}

function normalize(text) { return QuizAudioIdentity.normalizeQuestion(text); }
function questionText(question) { return String(question?.question ?? question?.q ?? ""); }
function questionFigure(question) { return question?.figure ?? question?.img ?? ""; }
function quizAudioPayload(question) {
  return {
    question: questionText(question),
    figure: QuizAudioIdentity.normalizeFigure(questionFigure(question)),
    quizAudioIdentityVersion: QuizAudioIdentity.VERSION
  };
}
function identityFor(question) { return QuizAudioIdentity.getIdentity(questionText(question), questionFigure(question)); }
function legacyCollisionCandidates(legacyQuizKey) {
  const candidates = state.collisionRegistry?.collisions?.[legacyQuizKey]?.candidates;
  return Array.isArray(candidates) ? candidates : [];
}
function isLegacyAmbiguous(legacyQuizKey) { return legacyCollisionCandidates(legacyQuizKey).length > 1; }
function isIdentityAvailable(identity) {
  return state.audioKeys.has(identity.quizKey)
    || (state.audioKeys.has(identity.legacyQuizKey) && !isLegacyAmbiguous(identity.legacyQuizKey));
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
  const done = chapter.questions.filter(question => isIdentityAvailable(question.identity)).length;
  return { done, total: chapter.questions.length, percent: chapter.questions.length ? Math.round(done / chapter.questions.length * 100) : 0 };
}

function renderChapters() {
  const root = $("audioAdminChapters");
  root.replaceChildren();
  root.append(createLegacyReviewEntry());
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
  resetQuestionHelp(); state.selected = index; state.reviewOpen = false; state.query = ""; state.filter = "all"; state.activeQuestionId = null; closeInline();
  $("audioAdminLegacyReview").classList.add("hidden"); $("audioAdminChapters").classList.add("hidden"); $("audioAdminQuestions").classList.remove("hidden"); renderChapter();
  history.replaceState({}, "", `/aggiungi-spiegazioni?capitolo=${index + 1}`);
}

function closeChapter() {
  resetQuestionHelp(); state.selected = null; state.reviewOpen = false; state.activeQuestionId = null; closeInline();
  $("audioAdminLegacyReview").classList.add("hidden"); $("audioAdminQuestions").classList.add("hidden"); $("audioAdminChapters").classList.remove("hidden");
  renderChapters(); history.replaceState({}, "", "/aggiungi-spiegazioni");
}

function visibleQuestions() {
  const chapter = state.chapters[state.selected];
  if (!chapter) return [];
  return chapter.questions.filter(question => {
    const textMatch = !state.query || normalize(question.question).includes(normalize(state.query));
    const hasAudio = isIdentityAvailable(question.identity);
    return textMatch && (state.filter === "all" || (state.filter === "available" && hasAudio) || (state.filter === "missing" && !hasAudio));
  });
}

function renderChapter() {
  const chapter = state.chapters[state.selected];
  if (!chapter) return;
  const root = $("audioAdminQuestions"); root.replaceChildren();
  const head = document.createElement("div"); head.className = "audio-admin-question-head";
  const title = document.createElement("h2"); title.textContent = `${String(state.selected + 1).padStart(2, "0")} · ${chapterName(chapter, state.selected)}`;
  const back = document.createElement("button"); back.type = "button"; back.className = "audio-admin-back-list"; back.setAttribute("aria-label", "Torna a tutti i capitoli");
  const backIcon = document.createElement("img"); backIcon.src = "icons/back.png"; backIcon.alt = ""; backIcon.setAttribute("aria-hidden", "true");
  const backLabel = document.createElement("span"); backLabel.textContent = "Tutti i capitoli"; back.append(backIcon, backLabel); back.addEventListener("click", closeChapter); head.append(title, back);
  const toolbar = document.createElement("div"); toolbar.className = "audio-admin-toolbar";
  const search = document.createElement("input"); search.type = "search"; search.placeholder = "Cerca nella domanda"; search.value = state.query; search.addEventListener("input", () => { state.query = search.value; renderChapter(); });
  toolbar.append(search, createFilterMenu());
  const list = document.createElement("div"); list.className = "audio-admin-question-list";
  visibleQuestions().forEach((question, index) => list.append(questionRow(question, index)));
  if (!list.children.length) { const empty = document.createElement("div"); empty.className = "audio-admin-empty"; empty.textContent = "Nessun quiz corrisponde al filtro."; list.append(empty); }
  root.append(head, toolbar, list);
}

function createFilterMenu() {
  const wrapper = document.createElement("div"); wrapper.className = "audio-admin-filter";
  const selected = FILTER_OPTIONS.find(option => option.value === state.filter) || FILTER_OPTIONS[0];
  const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "audio-admin-filter-trigger"; trigger.setAttribute("aria-haspopup", "listbox"); trigger.setAttribute("aria-expanded", "false");
  const icon = document.createElement("img"); icon.src = "icons/menu.png"; icon.alt = ""; icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span"); label.textContent = selected.label;
  trigger.append(icon, label);
  const menu = document.createElement("div"); menu.className = "audio-admin-filter-menu"; menu.setAttribute("role", "listbox"); menu.setAttribute("aria-label", "Filtra quiz"); menu.hidden = true;
  const close = () => { wrapper.classList.remove("is-open"); trigger.setAttribute("aria-expanded", "false"); menu.hidden = true; document.removeEventListener("click", onDocumentClick); document.removeEventListener("keydown", onKeyDown); };
  const onDocumentClick = event => { if (!wrapper.contains(event.target)) close(); };
  const onKeyDown = event => { if (event.key === "Escape") { close(); trigger.focus(); } };
  FILTER_OPTIONS.forEach(option => {
    const item = document.createElement("button"); item.type = "button"; item.className = "audio-admin-filter-option"; item.setAttribute("role", "option"); item.setAttribute("aria-selected", String(option.value === state.filter));
    if (option.value === state.filter) item.classList.add("is-selected");
    const marker = document.createElement("span"); marker.className = "audio-admin-filter-marker"; marker.setAttribute("aria-hidden", "true");
    const text = document.createElement("span"); text.textContent = option.label; item.append(marker, text);
    item.addEventListener("click", () => { state.filter = option.value; close(); renderChapter(); });
    menu.append(item);
  });
  trigger.addEventListener("click", event => { event.stopPropagation(); const open = !wrapper.classList.contains("is-open"); if (open) { wrapper.classList.add("is-open"); trigger.setAttribute("aria-expanded", "true"); menu.hidden = false; document.addEventListener("click", onDocumentClick); document.addEventListener("keydown", onKeyDown); } else close(); });
  wrapper.append(trigger, menu); return wrapper;
}

function resetQuestionHelp() {
  state.activeHelpKey = null;
  state.helpRequestId += 1;
}

function helpPanelId(key) {
  const safe = String(key || "question").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "question";
  return `audio-admin-help-${safe}`;
}

function renderHelpLoading(panel) {
  panel.replaceChildren();
  panel.dataset.helpState = "loading";
  panel.setAttribute("aria-busy", "true");
  const status = document.createElement("p");
  status.className = "audio-admin-help-status";
  status.setAttribute("role", "status");
  status.textContent = "Caricamento della traduzione personale…";
  panel.append(status);
}

function renderHelpError(panel) {
  panel.replaceChildren();
  panel.dataset.helpState = "error";
  panel.setAttribute("aria-busy", "false");
  const status = document.createElement("p");
  status.className = "audio-admin-help-status is-error";
  status.textContent = "Traduzioni non disponibili in questo momento. Riprova tra poco.";
  panel.append(status);
}

function appendHelpContext(context, label, value) {
  const italian = String(value?.italian || "").trim();
  const bangla = String(value?.bangla || "").trim();
  if (!italian && !bangla) return;
  const item = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = `${label}:`;
  item.append(title);
  if (italian) item.append(document.createTextNode(` ${italian}`));
  if (bangla) {
    const translated = document.createElement("span");
    translated.lang = "bn";
    translated.textContent = ` · ${bangla}`;
    item.append(translated);
  }
  context.append(item);
}

function renderQuestionHelp(panel, help) {
  panel.replaceChildren();
  panel.dataset.helpState = "ready";
  panel.setAttribute("aria-busy", "false");

  const label = document.createElement("span");
  label.className = "audio-admin-help-label";
  label.textContent = "FONTE PERSONALE DI TRADUZIONE";
  panel.append(label);

  const translation = document.createElement("p");
  translation.className = "audio-admin-help-translation";
  translation.lang = "bn";
  if (help?.translation) {
    translation.textContent = help.translation;
  } else {
    translation.classList.add("is-missing");
    translation.textContent = "Traduzione completa non disponibile per questa domanda.";
  }
  panel.append(translation);

  const context = document.createElement("div");
  context.className = "audio-admin-help-context";
  appendHelpContext(context, "Capitolo", help?.chapter);
  appendHelpContext(context, "Argomento", help?.topic);
  if (context.children.length) panel.append(context);

  const title = document.createElement("span");
  title.className = "audio-admin-help-section-title";
  title.textContent = "PAROLE CHIAVE";
  panel.append(title);

  const words = document.createElement("div");
  words.className = "audio-admin-help-words";
  if (!help?.words?.length) {
    const empty = document.createElement("p");
    empty.className = "audio-admin-help-status";
    empty.textContent = "Parole chiave non disponibili per questa domanda.";
    words.append(empty);
  } else {
    help.words.forEach(word => {
      const item = document.createElement("div");
      item.className = "audio-admin-help-word";
      const italian = document.createElement("strong");
      italian.textContent = word.italian;
      const bangla = document.createElement("span");
      bangla.className = "audio-admin-help-word-bn";
      bangla.lang = "bn";
      bangla.textContent = word.bangla;
      item.append(italian, bangla);
      if (word.simpleBn && word.simpleBn !== word.bangla) {
        const note = document.createElement("small");
        note.className = "audio-admin-help-word-note";
        note.lang = "bn";
        note.textContent = `Spiegazione: ${word.simpleBn}`;
        item.append(note);
      }
      words.append(item);
    });
  }
  panel.append(words);
}

function closeOtherQuestionHelp(exceptKey = "") {
  const root = $("audioAdminQuestions");
  root?.querySelectorAll(".audio-admin-help-toggle[aria-expanded='true']").forEach(button => {
    if (button.dataset.helpKey === exceptKey) return;
    button.setAttribute("aria-expanded", "false");
  });
  root?.querySelectorAll(".audio-admin-help-panel:not([hidden])").forEach(panel => {
    if (panel.dataset.helpKey === exceptKey) return;
    panel.hidden = true;
  });
  root?.querySelectorAll(".audio-admin-question.is-help-open").forEach(row => {
    if (row.dataset.helpKey !== exceptKey) row.classList.remove("is-help-open");
  });
}

async function loadQuestionHelp(question, key, panel) {
  const requestId = ++state.helpRequestId;
  renderHelpLoading(panel);
  try {
    if (!window.QuizHelpPreview?.getQuestionHelp) throw new Error("quiz_help_preview_missing");
    const help = await window.QuizHelpPreview.getQuestionHelp(question);
    if (requestId !== state.helpRequestId || state.activeHelpKey !== key || !document.body.contains(panel)) return;
    renderQuestionHelp(panel, help);
  } catch (_) {
    if (requestId !== state.helpRequestId || state.activeHelpKey !== key || !document.body.contains(panel)) return;
    renderHelpError(panel);
  }
}

function toggleQuestionHelp(question, key, button, panel, row) {
  const open = button.getAttribute("aria-expanded") === "true";
  if (open) {
    state.activeHelpKey = null;
    state.helpRequestId += 1;
    button.setAttribute("aria-expanded", "false");
    panel.hidden = true;
    row.classList.remove("is-help-open");
    return;
  }
  closeOtherQuestionHelp(key);
  state.activeHelpKey = key;
  button.setAttribute("aria-expanded", "true");
  panel.hidden = false;
  row.classList.add("is-help-open");
  void loadQuestionHelp(question, key, panel);
}

function createQuestionHelpDisclosure(question, key, row) {
  const panelId = helpPanelId(key);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "audio-admin-help-toggle";
  button.dataset.helpKey = key;
  button.setAttribute("aria-expanded", String(state.activeHelpKey === key));
  button.setAttribute("aria-controls", panelId);
  const label = document.createElement("span");
  label.textContent = "Traduzione Bangla e parole chiave";
  const marker = document.createElement("span");
  marker.className = "audio-admin-help-toggle-marker";
  marker.setAttribute("aria-hidden", "true");
  button.append(label, marker);

  const panel = document.createElement("section");
  panel.id = panelId;
  panel.className = "audio-admin-help-panel";
  panel.dataset.helpKey = key;
  panel.setAttribute("aria-label", "Traduzione Bangla e parole chiave");
  panel.hidden = state.activeHelpKey !== key;
  button.addEventListener("click", () => toggleQuestionHelp(question, key, button, panel, row));
  if (state.activeHelpKey === key) {
    row.classList.add("is-help-open");
    void loadQuestionHelp(question, key, panel);
  }
  return { button, panel };
}

function questionRow(question, position) {
  const row = document.createElement("article"); row.className = "audio-admin-question";
  const copy = document.createElement("div"); copy.className = "audio-admin-question-copy";
  const text = document.createElement("strong"); text.textContent = `${position + 1}. ${question.question}`; copy.append(text);
  const imageSource = figureUrl(question.figure);
  if (imageSource) { const image = document.createElement("img"); image.src = imageSource; image.alt = "Figura della domanda"; image.loading = "lazy"; image.onerror = () => image.remove(); copy.append(image); }
  const activeId = `chapter-${state.selected}-quiz-${question.id}`;
  const help = createQuestionHelpDisclosure(question, activeId, row);
  copy.append(help.button);
  const actions = document.createElement("div"); actions.className = "audio-admin-actions";
  const italianPlayer = createItalianQuestionPlayer(question);
  if (isIdentityAvailable(question.identity)) {
    const player = createAudioPlayer(question); const edit = iconButton("renew", "Registra di nuovo", RENEW_ICON); edit.addEventListener("click", () => beginInline(question, activeId)); actions.append(italianPlayer, player, answerBadge(question.correct), edit);
  } else {
    const add = iconButton("add", "Aggiungi spiegazione", ADD_ICON); add.addEventListener("click", () => beginInline(question, activeId)); actions.append(italianPlayer, answerBadge(question.correct), add);
  }
  row.dataset.helpKey = activeId;
  row.append(copy, actions, help.panel);
  if (state.activeQuestionId === activeId) row.append(inlineRecorder());
  return row;
}

function stopCurrentPlayer(except = null) {
  if (!state.playing || state.playing === except) return;
  state.playing.audio.pause(); state.playing.button.classList.remove("is-playing"); state.playing = null;
}

function base64AudioUrl(base64) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
}

function createItalianQuestionPlayer(question) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "audio-admin-italian-listen";
  button.innerHTML = `${SPEAKER_ICON}<span>Italiano</span>`;
  button.setAttribute("aria-label", "Ascolta la domanda in italiano");
  button.title = "Ascolta la domanda in italiano";

  const audio = new Audio();
  audio.preload = "metadata";
  let objectUrl = "";
  const instance = { audio, button };
  const questionId = String(question?.id ?? "").trim();
  const clearSource = () => {
    audio.pause();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    audio.removeAttribute("src");
    audio.load();
  };

  button.addEventListener("click", async () => {
    if (state.playing === instance && !audio.paused) {
      state.playbackRequestId += 1;
      audio.pause();
      return;
    }

    const requestId = ++state.playbackRequestId;
    stopCurrentPlayer(instance);
    button.disabled = true;
    button.classList.add("is-loading");
    button.setAttribute("aria-label", "Caricamento audio italiano");
    try {
      let data = state.italianAudioCache.get(questionId);
      if (!data) {
        data = await api("getAdminItalianQuestionAudio", { questionId });
        if (!data?.audio) throw new Error("italian_audio_unavailable");
        state.italianAudioCache.set(questionId, data);
      }
      if (requestId !== state.playbackRequestId) return;
      if (!audio.src) {
        objectUrl = base64AudioUrl(data.audio);
        audio.src = objectUrl;
      }
      state.playing = instance;
      await audio.play();
    } catch (error) {
      clearSource();
      console.error("[aggiungi-spiegazioni] italian_audio_unavailable", error);
      await showProblem("Audio italiano non disponibile", "Riprova tra poco.", "");
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
      if (!button.classList.contains("is-playing")) button.setAttribute("aria-label", "Ascolta la domanda in italiano");
    }
  });

  audio.addEventListener("play", () => {
    button.classList.add("is-playing");
    button.setAttribute("aria-label", "Metti in pausa la domanda in italiano");
  });
  audio.addEventListener("pause", () => {
    button.classList.remove("is-playing");
    button.setAttribute("aria-label", "Ascolta la domanda in italiano");
  });
  audio.addEventListener("ended", () => {
    if (state.playing === instance) state.playing = null;
    clearSource();
  });
  audio.addEventListener("error", () => {
    if (state.playing === instance) state.playing = null;
    button.classList.remove("is-playing");
  });
  return button;
}

function createAudioPlayer(question, { legacy = false } = {}) {
  const player = document.createElement("div"); player.className = "audio-admin-player"; player.setAttribute("aria-label", "Player spiegazione audio");
  const button = document.createElement("button"); button.type = "button"; button.className = "audio-admin-player-play"; button.setAttribute("aria-label", "Riproduci spiegazione");
  const progress = document.createElement("input"); progress.type = "range"; progress.min = "0"; progress.max = "100"; progress.step = "0.1"; progress.value = "0"; progress.className = "audio-admin-player-progress"; progress.setAttribute("aria-label", "Avanzamento audio"); progress.setAttribute("aria-valuemin", "0"); progress.setAttribute("aria-valuemax", "100"); progress.setAttribute("aria-valuenow", "0");
  const speed = document.createElement("button"); speed.type = "button"; speed.className = "audio-admin-player-speed"; speed.textContent = "1×"; speed.title = "Cambia velocità";
  const audio = new Audio(); audio.preload = "metadata"; let loading = null; let objectUrl = ""; let speedValue = 1; let frame = 0; let seeking = false; let durationHint = 0; let sourceMode = ""; let blobFallbackTried = false;
  const clearSource = () => { audio.pause(); if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = ""; audio.removeAttribute("src"); audio.load(); };
  const instance = { audio, button };
  const duration = () => { const nativeDuration = Number(audio.duration); return Number.isFinite(nativeDuration) && nativeDuration > 0 ? nativeDuration : durationHint; };
  const paint = () => { if (seeking) return; const total = duration(); const currentTime = Number(audio.currentTime); const percent = Number.isFinite(total) && total > 0 && Number.isFinite(currentTime) ? Math.max(0, Math.min(100, currentTime / total * 100)) : 0; progress.value = String(percent); progress.setAttribute("aria-valuenow", percent.toFixed(1)); progress.style.setProperty("--progress", `${percent}%`); };
  const seek = () => { const total = duration(); if (!Number.isFinite(total) || total <= 0) return; const percent = Math.max(0, Math.min(100, Number(progress.value) || 0)); try { audio.currentTime = total * percent / 100; } catch (_) { return; } progress.style.setProperty("--progress", `${percent}%`); };
  const stopFrame = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
  const tick = () => { paint(); if (!audio.paused && !audio.ended) frame = requestAnimationFrame(tick); };
  const waitForReady = () => { if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve(); return new Promise((resolve, reject) => { const timeout = setTimeout(() => { cleanup(); reject(new Error("audio_metadata_timeout")); }, 10000); const cleanup = () => { clearTimeout(timeout); audio.removeEventListener("loadedmetadata", ready); audio.removeEventListener("canplay", ready); audio.removeEventListener("error", failed); }; const ready = () => { cleanup(); resolve(); }; const failed = () => { cleanup(); reject(new Error("audio_media_error")); }; audio.addEventListener("loadedmetadata", ready); audio.addEventListener("canplay", ready); audio.addEventListener("error", failed); }); };
  const loadBlob = async () => {
    let result;
    if (legacy) {
      result = await apiBlob("getLegacyQuizAudioBlob", quizAudioPayload(question));
    } else {
      try {
        result = await apiBlob("getQuizAudioBlob", quizAudioPayload(question));
      } catch (error) {
        // An admin must still be able to listen before assigning an ambiguous
        // legacy recording to its final figure/question identity.
        if (error?.message !== "quiz_audio_requires_review") throw error;
        result = await apiBlob("getLegacyQuizAudioBlob", quizAudioPayload(question));
      }
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    durationHint = Math.max(durationHint, Math.max(0, Number(result.durationMs) || 0) / 1000);
    objectUrl = URL.createObjectURL(result.blob); audio.src = objectUrl; sourceMode = "blob"; audio.load();
  };
  const load = async () => {
    if (audio.src) return;
    if (!loading) {
      button.classList.add("is-loading");
      // Use the same-origin blob path directly. It is the reliable path already
      // used by the quiz and avoids signed-URL/CSP playback differences here.
      loading = loadBlob()
        .finally(() => { loading = null; button.classList.remove("is-loading"); });
    }
    return loading;
  };
  button.addEventListener("click", async () => { const requestId = ++state.playbackRequestId; try { if (!audio.src) await load(); if (requestId !== state.playbackRequestId) return; if (audio.paused) { try { await waitForReady(); stopCurrentPlayer(instance); state.playing = instance; await audio.play(); } catch (error) { if (sourceMode !== "signed" || blobFallbackTried) throw error; blobFallbackTried = true; clearSource(); await loadBlob(); if (requestId !== state.playbackRequestId) return; await waitForReady(); stopCurrentPlayer(instance); state.playing = instance; await audio.play(); } } else audio.pause(); } catch (error) { loading = null; clearSource(); await showProblem("Audio non disponibile", "Il sito non riesce a recuperare questa spiegazione.", error); } });
  progress.addEventListener("pointerdown", event => { seeking = true; progress.setPointerCapture?.(event.pointerId); });
  progress.addEventListener("touchstart", () => { seeking = true; }, { passive: true });
  progress.addEventListener("input", seek);
  progress.addEventListener("change", () => { seek(); seeking = false; paint(); });
  progress.addEventListener("pointerup", () => { seek(); seeking = false; paint(); });
  progress.addEventListener("pointercancel", () => { seek(); seeking = false; paint(); });
  progress.addEventListener("touchend", () => { seek(); seeking = false; paint(); }, { passive: true });
  speed.addEventListener("click", () => { speedValue = [1, 1.25, 1.5, 2][([1, 1.25, 1.5, 2].indexOf(speedValue) + 1) % 4]; audio.playbackRate = speedValue; speed.textContent = `${String(speedValue).replace(".", ",")}×`; });
  audio.addEventListener("play", () => { button.classList.add("is-playing"); stopFrame(); tick(); });
  audio.addEventListener("pause", () => { button.classList.remove("is-playing"); stopFrame(); });
  audio.addEventListener("ended", () => { button.classList.remove("is-playing"); stopFrame(); seeking = false; progress.value = "0"; progress.style.setProperty("--progress", "0%"); if (state.playing === instance) state.playing = null; });
  ["loadedmetadata", "durationchange", "canplay", "timeupdate", "seeking", "seeked"].forEach(eventName => audio.addEventListener(eventName, paint));
  player.append(button, progress, speed); return player;
}

function elapsed(item) { return item ? item.elapsed + (item.phase === "recording" ? Date.now() - item.startedAt : 0) : 0; }
function buildBlob(item) { if (!item?.chunks?.length) return null; if (item.blobUrl) URL.revokeObjectURL(item.blobUrl); item.blob = new Blob(item.chunks, { type: item.mimeType || "audio/webm" }); item.blobUrl = URL.createObjectURL(item.blob); return item.blob; }
function blobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("audio_read_failed"));
    reader.readAsDataURL(blob);
  });
}
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
  state.inline = { activeQuestionId: activeId, key: question.quizKey, question, saved: isIdentityAvailable(question.identity), phase: "ready", chunks: [], elapsed: 0, startedAt: 0, status: "Microfono non avviato. Premi il microfono per iniziare.", stream: null, recorder: null, blob: null, blobUrl: "", timer: null, saving: false, retryable: false };
  state.activeQuestionId = activeId; renderChapter(); void restoreDraft(state.inline);
}

async function restoreDraft(item) { const draft = await getDraft(item.key); if (state.inline !== item || !draft?.blob) return; item.blob = draft.blob; item.blobUrl = URL.createObjectURL(draft.blob); item.elapsed = Number(draft.durationMs) || 0; item.phase = "paused"; item.retryable = true; item.status = "Audio locale pronto. Premi Salva per riprovare il caricamento."; renderChapter(); }
function closeInline() { const item = state.inline; if (!item) { state.activeQuestionId = null; return; } clearInterval(item.timer); if (item.recorder && item.recorder.state !== "inactive") item.recorder.stop(); item.stream?.getTracks().forEach(track => track.stop()); if (item.blobUrl) URL.revokeObjectURL(item.blobUrl); state.inline = null; state.activeQuestionId = null; }
async function requestCloseInline() { const item = state.inline; if (!item || item.saving) return; if (hasUnsaved(item)) { const accepted = await openDialog({ title: "Registrazione non salvata", text: "Vuoi chiudere il pannello e abbandonare l'audio non salvato?", confirmLabel: "Abbandona e chiudi", cancelLabel: "Continua a modificare", danger: true }); if (!accepted) return; } if (item.retryable) await deleteDraft(item.key); closeInline(); renderChapter(); }

async function microphonePermissionState() {
  if (!navigator.permissions?.query) return "unknown";
  try { return (await navigator.permissions.query({ name: "microphone" })).state || "unknown"; } catch (_) { return "unknown"; }
}

async function ensureStream() {
  const item = state.inline;
  if (!item) return false;
  if (item.stream?.active) return true;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    item.status = "Microfono non disponibile: apri il sito con HTTPS.";
    renderChapter();
    return false;
  }

  // This call is made directly from the microphone button handler. When the
  // browser permission is still undecided, the browser shows its own prompt.
  try {
    item.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    item.status = "Microfono pronto.";
    return true;
  } catch (error) {
    const permissionAfter = await microphonePermissionState();
    if (permissionAfter === "denied" || error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
      // Do not cover the browser permission flow with a second application
      // dialog. The inline message remains visible if the user denied it.
      item.status = "Microfono bloccato. Apri il lucchetto del sito e scegli Consenti, poi riprova.";
      renderChapter();
      return false;
    }
    item.status = "Impossibile accedere al microfono. Riprova.";
    renderChapter();
    await showProblem("Microfono non disponibile", item.status, error);
    return false;
  }
}
async function startRecording() {
  const item = state.inline;
  if (!item || !(await ensureStream())) return;
  if (item.recorder?.state === "paused") {
    item.recorder.resume();
  } else {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/webm"
    ];
    const mimeType = candidates.find(value => MediaRecorder.isTypeSupported(value)) || "";
    const options = { audioBitsPerSecond: 64000, ...(mimeType ? { mimeType } : {}) };
    item.recorder = new MediaRecorder(item.stream, options);
    item.mimeType = item.recorder.mimeType || mimeType || "audio/webm";
    item.chunks = [];
    item.recorder.ondataavailable = event => { if (event.data?.size) item.chunks.push(event.data); };
    item.recorder.start();
  }
  item.phase = "recording";
  item.startedAt = Date.now();
  clearInterval(item.timer);
  item.timer = setInterval(updateTimer, 250);
  item.status = "Registrazione in corso…";
  renderChapter();
}
async function pauseRecording() { const item = state.inline; if (!item || item.recorder?.state !== "recording") return; item.elapsed += Date.now() - item.startedAt; item.recorder.requestData(); item.recorder.pause(); item.phase = "paused"; clearInterval(item.timer); item.status = "In pausa. Puoi riprendere, ascoltare o salvare."; await new Promise(resolve => setTimeout(resolve, 100)); buildBlob(item); renderChapter(); }
async function discardDraft() { const item = state.inline; if (!item) return; const accepted = await openDialog({ title: "Eliminare la registrazione?", text: "La registrazione non salvata verrà eliminata.", confirmLabel: "Elimina", cancelLabel: "Mantieni", danger: true }); if (!accepted) return; await deleteDraft(item.key); const activeId = item.activeQuestionId; const question = item.question; closeInline(); state.inline = { activeQuestionId: activeId, key: question.quizKey, question, saved: item.saved, phase: "ready", chunks: [], elapsed: 0, startedAt: 0, status: "Registrazione eliminata.", stream: null, recorder: null, blob: null, blobUrl: "", timer: null, saving: false, retryable: false }; state.activeQuestionId = activeId; renderChapter(); }
async function renewRecording() { const item = state.inline; if (!item) return; const accepted = await openDialog({ title: "Ricominciare da capo?", text: "La registrazione attuale verrà sostituita da una nuova.", confirmLabel: "Ricomincia", cancelLabel: "Annulla" }); if (!accepted) return; await deleteDraft(item.key); const question = item.question; const activeId = item.activeQuestionId; closeInline(); state.inline = { activeQuestionId: activeId, key: question.quizKey, question, saved: item.saved, phase: "ready", chunks: [], elapsed: 0, startedAt: 0, status: "Microfono non avviato. Premi il microfono per iniziare.", stream: null, recorder: null, blob: null, blobUrl: "", timer: null, saving: false, retryable: false }; state.activeQuestionId = activeId; renderChapter(); }

async function saveInline() {
  const item = state.inline; if (!item) return; if (item.phase === "recording") await pauseRecording(); if (!item.blob) { await showProblem("Nessun audio da salvare", "Premi il microfono, registra la spiegazione e poi salva.", "audio_empty"); return; }
  item.saving = true; item.status = "Caricamento sicuro in corso…"; renderChapter();
  try {
    const payload = { ...quizAudioPayload(item.question), audioMimeType: item.blob.type || item.mimeType };
    const created = await api("createQuizAudioUpload", payload);
    // The signed R2 URL is generated for this exact header. Do not send the
    // MediaRecorder codec suffix (e.g. ";codecs=opus"), otherwise R2 rejects
    // the request even though the locally recorded audio is valid.
    const uploadContentType = String(created.uploadContentType || "audio/webm");
    try {
      const upload = await fetch(created.uploadUrl, { method: "PUT", headers: { "Content-Type": uploadContentType }, body: item.blob });
      if (!upload.ok) throw new Error(`r2_upload_${upload.status}`);
      await api("confirmQuizAudioUpload", { ...payload, audioDurationMs: elapsed(item) });
    } catch {
      // Same-origin fallback: this also works when the browser CSP blocks the
      // direct signed R2 request. The local recording is never discarded.
      item.status = "Caricamento protetto in corso…";
      renderChapter();
      await api("saveQuizAudio", {
        ...payload,
        audioBase64: await blobAsDataUrl(item.blob),
        audioMimeType: item.blob.type || item.mimeType,
        audioDurationMs: elapsed(item)
      });
    }
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
  try {
    await api("deleteQuizAudio", quizAudioPayload(question));
    state.audioKeys.delete(question.quizKey);
    state.audioKeys.delete(question.identity.legacyQuizKey);
    if (state.inline?.key === question.quizKey) closeInline();
    renderChapters(); renderChapter();
  } catch (error) { await showProblem("Eliminazione non riuscita", "Il sito non è riuscito a eliminare l'audio.", error); }
}

$("audioAdminDialogCancel").addEventListener("click", () => closeDialog(false));
$("audioAdminDialogConfirm").addEventListener("click", () => closeDialog(true));
$("audioAdminDialog").addEventListener("click", event => { if (event.target === $("audioAdminDialog")) closeDialog(false); });

async function migrateSafeLegacyAudios() {
  const identities = new Map();
  state.chapters.forEach(chapter => chapter.questions.forEach(question => {
    if (!identities.has(question.identity.legacyQuizKey)) identities.set(question.identity.legacyQuizKey, []);
    identities.get(question.identity.legacyQuizKey).push(question);
  }));
  const pending = [...state.audioKeys]
    .filter(key => key.startsWith("q_") && !isLegacyAmbiguous(key))
    .map(key => {
      const choices = identities.get(key) || [];
      const candidates = legacyCollisionCandidates(key);
      if (candidates.length !== 1) return choices[0];
      const targetFigure = QuizAudioIdentity.normalizeFigure(candidates[0].figureKey);
      return choices.find(question => question.identity.figureKey === targetFigure);
    })
    .filter(question => question && !state.audioKeys.has(question.identity.quizKey))
    .filter(Boolean);
  for (const question of pending) {
    try {
      const result = await api("migrateLegacyQuizAudio", quizAudioPayload(question));
      state.audioKeys.delete(question.identity.legacyQuizKey);
      state.legacyReviewKeys.delete(question.identity.legacyQuizKey);
      state.audioKeys.add(result.quizKey);
    } catch (_) {
      // The API still serves safe legacy audio while this optional cleanup is pending.
    }
  }
}

function legacyReviewGroups() {
  return [...state.legacyReviewKeys]
    .filter(key => state.audioKeys.has(key))
    .map(key => ({ legacyQuizKey: key, ...state.collisionRegistry.collisions[key] }))
    .filter(group => group.question && Array.isArray(group.candidates) && group.candidates.length > 1);
}

function createLegacyReviewEntry() {
  const groups = legacyReviewGroups();
  const button = document.createElement("button");
  button.type = "button";
  button.className = `audio-admin-chapter audio-admin-review-entry${groups.length ? " has-items" : " is-clear"}`;
  button.disabled = groups.length === 0;
  button.innerHTML = `
    <span class="audio-admin-review-entry-top">
      <i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v5m0 3h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></i>
      <b>${groups.length}</b>
    </span>
    <strong>Controlla audio vecchi</strong>
    <small>${groups.length ? `${groups.length} audio da sistemare` : "Tutto in ordine"}</small>
    <span class="audio-admin-review-entry-status">${groups.length ? "Apri controllo" : "Nessun intervento richiesto"}</span>`;
  if (groups.length) button.addEventListener("click", () => showLegacyReviews());
  return button;
}

function showLegacyReviews(updateHistory = true) {
  if (!legacyReviewGroups().length) return closeChapter();
  closeInline();
  resetQuestionHelp();
  state.selected = null;
  state.reviewOpen = true;
  $("audioAdminChapters").classList.add("hidden");
  $("audioAdminQuestions").classList.add("hidden");
  renderLegacyReviews();
  if (updateHistory) history.replaceState({}, "", "/aggiungi-spiegazioni?controllo-audio=1");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function assignLegacyAudio(group, candidate) {
  const accepted = await openDialog({
    title: "Confermare questa figura?",
    text: "L'audio esistente verrà associato soltanto a questa domanda e a questa figura, in entrambi i sistemi.",
    confirmLabel: "Associa audio",
    cancelLabel: "Annulla"
  });
  if (!accepted) return;
  try {
    const result = await api("assignLegacyQuizAudio", {
      question: group.question,
      figure: candidate.figureKey,
      quizAudioIdentityVersion: QuizAudioIdentity.VERSION
    });
    state.audioKeys.delete(group.legacyQuizKey);
    state.legacyReviewKeys.delete(group.legacyQuizKey);
    state.audioKeys.add(result.quizKey);
    renderChapters();
    if (legacyReviewGroups().length) renderLegacyReviews();
    else closeChapter();
    if (state.selected !== null) renderChapter();
  } catch (error) {
    await showProblem("Associazione non riuscita", "L'audio è rimasto intatto. Puoi riprovare.", error);
  }
}

function renderLegacyReviews() {
  const root = $("audioAdminLegacyReview");
  if (!root) return;
  const groups = legacyReviewGroups();
  root.replaceChildren();
  root.classList.toggle("hidden", !state.reviewOpen || groups.length === 0);
  if (!state.reviewOpen || !groups.length) return;

  const heading = document.createElement("div");
  heading.className = "audio-admin-review-heading";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "audio-admin-review-back";
  back.setAttribute("aria-label", "Torna ai capitoli");
  back.innerHTML = '<img src="icons/back.png" alt="" aria-hidden="true">';
  back.addEventListener("click", closeChapter);
  const headingCopy = document.createElement("div");
  const eyebrow = document.createElement("span"); eyebrow.textContent = "CONTROLLO SICUREZZA";
  const title = document.createElement("h2"); title.textContent = "Audio da associare alla figura corretta";
  const description = document.createElement("p");
  description.textContent = `${groups.length} ${groups.length === 1 ? "audio richiede" : "audio richiedono"} una verifica. Nessuna registrazione verrà cancellata.`;
  const count = document.createElement("strong"); count.textContent = String(groups.length);
  headingCopy.append(eyebrow, title, description); heading.append(back, headingCopy, count); root.append(heading);

  groups.forEach(group => {
    const card = document.createElement("article"); card.className = "audio-admin-review-card";
    const intro = document.createElement("div"); intro.className = "audio-admin-review-intro";
    const copy = document.createElement("div");
    const label = document.createElement("small"); label.textContent = "REGISTRAZIONE ESISTENTE";
    const questionTitle = document.createElement("h3"); questionTitle.textContent = group.question;
    const instruction = document.createElement("p"); instruction.textContent = "Ascolta l'audio e scegli la figura che l'admin stava spiegando.";
    copy.append(label, questionTitle, instruction);
    const firstCandidate = group.candidates[0];
    intro.append(copy, createAudioPlayer({ question: group.question, figure: firstCandidate?.figureKey || "" }, { legacy: true }));
    card.append(intro);

    const candidates = document.createElement("div"); candidates.className = "audio-admin-review-candidates";
    group.candidates.forEach(candidate => {
      const option = document.createElement("button"); option.type = "button"; option.className = "audio-admin-review-candidate";
      const originalFigure = candidate.figures?.[0] || candidate.figureKey;
      const source = figureUrl(originalFigure);
      if (source) {
        const image = document.createElement("img"); image.src = source; image.alt = `Figura ${candidate.figureKey}`; image.loading = "lazy";
        image.onerror = () => image.remove();
        option.append(image);
      } else {
        const noFigure = document.createElement("span"); noFigure.className = "audio-admin-review-no-image"; noFigure.textContent = "Senza figura"; option.append(noFigure);
      }
      const meta = document.createElement("span"); meta.className = "audio-admin-review-candidate-meta";
      const figureName = document.createElement("strong"); figureName.textContent = candidate.figureKey === "none" ? "Nessuna figura" : candidate.figureKey;
      meta.append(figureName);
      if (candidate.correctValues?.length === 1) meta.append(answerBadge(candidate.correctValues[0]));
      option.append(meta);
      option.addEventListener("click", () => assignLegacyAudio(group, candidate));
      candidates.append(option);
    });
    card.append(candidates); root.append(card);
  });
}

async function load() {
  if (!isAdmin()) { showMessage("Accesso admin richiesto.", "error"); return; }
  try {
    await ensureFreshAccessToken({ force: true });
    showMessage("Caricamento catalogo Magic Book…");
    const [catalog, overview, collisionRegistry] = await Promise.all([
      api("getMagicBookCatalog"),
      api("getQuizAudioAdminOverview"),
      fetch("data/quiz-audio-legacy-collisions-v1.json", { cache: "no-store" }).then(response => {
        if (!response.ok) throw new Error(`collision_registry_${response.status}`);
        return response.json();
      })
    ]);
    const rows = Array.isArray(catalog.quiz) ? catalog.quiz : [];
    if (rows.length !== 788) throw new Error(`magic_catalog_count_mismatch_${rows.length}`);
    const identities = await Promise.all(rows.map(identityFor));
    state.collisionRegistry = QuizAudioIdentity.filterCollisionRegistry(collisionRegistry, identities, {
      preserveSources: ["all-books"]
    });
    state.audioKeys = new Set(overview.quizKeys || []);
    state.legacyReviewKeys = new Set(overview.legacyReviewKeys || []);
    const byChapter = new Map();
    rows.forEach((row, index) => {
      const chapter = String(row.chapter ?? "").trim() || "0";
      if (!byChapter.has(chapter)) byChapter.set(chapter, []);
      byChapter.get(chapter).push({ ...row, identity: identities[index], quizKey: identities[index].quizKey });
    });
    state.chapters = [...byChapter.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([key, questions]) => ({ key, name: `Capitolo ${key}`, questions }));
    await migrateSafeLegacyAudios();
    renderChapters(); showMessage("");
    const params = new URLSearchParams(location.search);
    const chapterParam = Number(params.get("capitolo"));
    if (params.get("controllo-audio") === "1" && legacyReviewGroups().length) showLegacyReviews(false);
    else if (chapterParam > 0 && chapterParam <= state.chapters.length) openChapter(chapterParam - 1);
  } catch (error) { showMessage("Impossibile caricare il catalogo audio.", "error"); await showProblem("Caricamento non riuscito", "Controlla la configurazione server e la pubblicazione del catalogo Apps Script.", error); }
}

window.addEventListener("popstate", () => {
  const params = new URLSearchParams(location.search);
  const index = Number(params.get("capitolo")) - 1;
  if (params.get("controllo-audio") === "1" && legacyReviewGroups().length) showLegacyReviews(false);
  else if (index >= 0 && index < state.chapters.length) openChapter(index);
  else closeChapter();
});
load();
