import { ChapterDial, clampChapter, DETENT_DEGREES, progressValue } from "./android-rotary-model.mjs";

// Runtime gate is the native shell marker, not screen size or standalone/PWA mode.
const doc = document;
const html = doc.documentElement;
const template = doc.getElementById("androidStudyTemplate");
if (html.classList.contains("android-webview") && template) initialize();

function initialize() {
  const app = window.MagicBookAndroidAdapter || {
    titles: CHAPTER_TITLES,
    selected: () => selectedChapter,
    screen: () => currentScreen,
    busy: () => appActionGate.isBusy(),
    select: selectChapter,
    actions: {
      home: showHome, chapters: showChapters, open: () => openChapter(selectedChapter),
      study: startStudyQuiz, quiz: openQuiz, exam: openExam,
      dictionary: showMagicDictionary, statistics: showLearningStatistics, errors: showLearningErrors
    },
    prepareUtilities() {
      updateProfileUI(!trialGuestMode);
      setProfileIconVisible(!trialGuestMode);
      updateAdminEntryVisibility();
    }
  };
  const fragment = template.content.cloneNode(true);
  const home = fragment.querySelector(".native-home");
  const chapters = fragment.querySelector(".native-chapters");
  const dock = fragment.querySelector(".native-dock");
  doc.getElementById("home").append(home);
  doc.getElementById("chapters").append(chapters);
  doc.body.append(dock);
  const dial = doc.getElementById("nativeChapterDial");
  const numbers = doc.getElementById("nativeDialNumbers");
  const selectedOutput = doc.getElementById("nativeSelectedNumber");
  const chapterTitle = doc.getElementById("nativeChapterTitle");
  const image = doc.getElementById("nativeChapterImage");
  const preview = image.parentElement;
  const status = doc.getElementById("nativeDialStatus");
  const progress = dock.querySelector("[role=progressbar]");
  const progressLabel = dock.querySelector(".native-progress-label");
  const progressButton = dock.querySelector(".native-progress-link");
  const progressStatus = doc.getElementById("nativeProgressStatus");
  const model = new ChapterDial(app.selected());
  const utilityAnchors = new Map();
  const labels = [];
  let screen = "";
  let frame = 0;
  let pendingPreview = model.selected;
  let controller = null;
  let requestVersion = 0;
  let imageVersion = 0;
  let imageChapter = 0;
  const lastFeedback = { selection: -1000, boundary: -1000 };
  let suppressActionsUntil = 0;
  let covers = {};
  const canInteract = () => Boolean(screen && app.screen() === screen && !app.busy() && !doc.hidden);
  for (let i = 0; i < 25; i++) {
    const label = doc.createElementNS("http://www.w3.org/2000/svg", "text");
    label.textContent = String(i + 1).padStart(2, "0");
    numbers.append(label);
    labels.push(label);
  }

  // Explicit per-chapter mapping: never infer the photo from a quiz figure or a protected book page.
  fetch("/assets/native-chapter-covers.json", { cache: "no-cache" })
    .then(response => response.ok ? response.json() : {})
    .then(data => { covers = data.covers || {}; imageChapter = 0; if (screen === "chapters") updateImage(); })
    .catch(() => {});

  function feedback(kind) {
    const now = performance.now();
    if (now - lastFeedback[kind] < (kind === "boundary" ? 180 : 40) || doc.hidden) return;
    lastFeedback[kind] = now;
    try {
      if (window.MagicBookHaptics?.postMessage) window.MagicBookHaptics.postMessage(kind);
      else navigator.vibrate?.(kind === "boundary" ? [18, 70, 18] : 12);
    } catch { /* Haptics are optional; selection always remains functional. */ }
  }

  function draw(value = model.selected) {
    labels.forEach((label, i) => {
      const distance = i + 1 - value;
      const degrees = 180 + distance * DETENT_DEGREES;
      const radians = degrees * Math.PI / 180;
      const x = 150 + 125 * Math.cos(radians);
      const y = 150 + 125 * Math.sin(radians);
      label.setAttribute("x", x.toFixed(2));
      label.setAttribute("y", y.toFixed(2));
      label.setAttribute("transform", `rotate(${degrees - 180} ${x} ${y})`);
      // Selected value is read in the gap, not duplicated under the open action.
      label.style.display = Math.abs(distance) < .55 || Math.abs(distance) > 3 ? "none" : "";
      label.style.opacity = Math.abs(distance) > 2 ? ".55" : "1";
    });
  }

  function scheduleDraw(value) {
    pendingPreview = value;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(pendingPreview); });
  }

  function updateImage() {
    if (imageChapter === model.selected) return;
    imageChapter = model.selected;
    const version = ++imageVersion;
    const path = covers[String(model.selected).padStart(2, "0")];
    image.hidden = true;
    image.removeAttribute("src");
    delete preview.dataset.imageReady;
    if (typeof path !== "string" || !path.startsWith("/assets/chapter-covers/") || path.includes("..")) return;
    const loader = new Image();
    loader.onload = () => {
      if (version !== imageVersion) return;
      image.src = path;
      image.alt = `Capitolo ${String(model.selected).padStart(2, "0")}: ${app.titles[model.selected - 1]}`;
      image.hidden = false;
      preview.dataset.imageReady = "true";
    };
    loader.src = path;
  }

  function refreshSelected(value) {
    model.selected = clampChapter(value);
    selectedOutput.textContent = String(model.selected).padStart(2, "0");
    chapterTitle.textContent = app.titles[model.selected - 1];
    dial.setAttribute("aria-valuenow", String(model.selected));
    dial.setAttribute("aria-valuetext", `${model.selected} di 25: ${chapterTitle.textContent}`);
    doc.getElementById("nativeOpenChapter").setAttribute("aria-label", `Apri capitolo ${model.selected}: ${chapterTitle.textContent}`);
    updateImage();
    if (!model.gesture) draw();
  }

  function applySelection(result) {
    if (!result) return;
    if (result.changed) {
      app.select(result.selected);
      refreshSelected(result.selected);
      feedback("selection");
    }
    if (result.boundary) {
      feedback("boundary");
      status.textContent = model.selected === 25 ? "Ultimo capitolo: 25. Fine della selezione." : "Primo capitolo: 1.";
    } else if (result.changed) status.textContent = `Capitolo ${model.selected}: ${chapterTitle.textContent}`;
    scheduleDraw(result.preview);
  }

  function pointerAngle(event) {
    const box = dial.getBoundingClientRect();
    return Math.atan2(event.clientY - box.top - box.height / 2, event.clientX - box.left - box.width / 2) * 180 / Math.PI;
  }
  function finishGesture(pointerId) {
    if (!model.end(pointerId)) return;
    dial.classList.remove("is-dragging");
    if (pointerId !== undefined && dial.hasPointerCapture(pointerId)) dial.releasePointerCapture(pointerId);
    suppressActionsUntil = performance.now() + 120;
    scheduleDraw(model.selected);
  }
  dial.addEventListener("pointerdown", event => {
    if (screen !== "chapters" || !canInteract() || event.button !== 0 || !event.isPrimary) return;
    if (!model.begin(event.pointerId, pointerAngle(event))) return;
    event.preventDefault();
    dial.setPointerCapture(event.pointerId);
    dial.classList.add("is-dragging");
    dial.focus({ preventScroll: true });
  });
  dial.addEventListener("pointermove", event => {
    if (!canInteract()) { finishGesture(event.pointerId); return; }
    applySelection(model.move(event.pointerId, pointerAngle(event)));
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => dial.addEventListener(type, event => finishGesture(event.pointerId)));
  dial.addEventListener("keydown", event => {
    if (!canInteract() || model.gesture) return;
    const targets = { ArrowUp: model.selected + 1, ArrowRight: model.selected + 1, ArrowDown: model.selected - 1, ArrowLeft: model.selected - 1, PageUp: model.selected + 5, PageDown: model.selected - 5, Home: 1, End: 25 };
    if (Object.hasOwn(targets, event.key)) { event.preventDefault(); applySelection(model.select(targets[event.key])); }
    else if (event.key === "Enter") { event.preventDefault(); runAction("open"); }
  });

  function runAction(action) {
    if (!canInteract() || model.gesture || performance.now() < suppressActionsUntil) return;
    // Canonical actions own the app-wide lock, history, auth and pending-work cancellation.
    app.actions[action]?.();
  }
  [home, chapters, dock].forEach(element => element.addEventListener("click", event => {
    const step = event.target.closest("[data-native-step]");
    if (step && canInteract() && !model.gesture) applySelection(model.select(model.selected + Number(step.dataset.nativeStep)));
    const action = event.target.closest("[data-native-action]");
    if (action) runAction(action.dataset.nativeAction);
  }));

  const motionToggle = home.querySelector(".native-motion-toggle");
  try { if (localStorage.getItem("native-study-motion-paused") === "1") html.dataset.nativeMotionPaused = "true"; } catch {}
  function updateMotionLabel() {
    const paused = html.hasAttribute("data-native-motion-paused");
    motionToggle.setAttribute("aria-pressed", String(paused));
    motionToggle.textContent = paused ? "Riprendi animazioni" : "Pausa animazioni";
  }
  motionToggle.addEventListener("click", () => {
    html.toggleAttribute("data-native-motion-paused");
    try { localStorage.setItem("native-study-motion-paused", html.hasAttribute("data-native-motion-paused") ? "1" : "0"); } catch {}
    updateMotionLabel();
  });
  updateMotionLabel();

  function setProgress(result) {
    const value = progressValue(result?.model);
    if (value === null) return false;
    const rounded = Math.round(value);
    progress.setAttribute("aria-valuenow", String(rounded));
    progress.setAttribute("aria-valuetext", `${rounded}% dei quiz affrontati${result.cached ? ", copia salvata" : ""}`);
    dock.style.setProperty("--native-progress", `${value}%`);
    progressLabel.textContent = `Quiz · ${rounded}%${result.cached ? " *" : ""}`;
    progressButton.setAttribute("aria-label", `${rounded}% dei quiz affrontati${result.cached ? ", copia salvata" : ""}. Apri Statistiche`);
    progressStatus.textContent = `${rounded}% dei quiz affrontati.${result.cached ? " Dati salvati: aggiornamento in attesa." : ""}`;
    return true;
  }

  async function refreshProgress() {
    controller?.abort();
    const version = ++requestVersion;
    controller = new AbortController();
    const signal = controller.signal;
    const timeout = setTimeout(() => { if (!signal.aborted) controller?.abort(); }, 14000);
    let cached = false;
    progress.removeAttribute("aria-valuenow");
    progress.removeAttribute("aria-valuetext");
    dock.style.setProperty("--native-progress", "0%");
    progressLabel.textContent = "Studio · …";
    progressButton.setAttribute("aria-label", "Avanzamento in caricamento. Apri Statistiche");
    try {
      const result = await window.MagicBookLearningInsights?.readProgress({ signal, onCached: value => {
        if (version === requestVersion && screen) cached = setProgress(value);
      } });
      if (version === requestVersion && screen && !setProgress(result)) throw new Error("progress_unavailable");
    } catch (error) {
      if (version !== requestVersion || !screen) return;
      if (error.message === "progress_auth_required") cached = false;
      if (!cached) {
        progress.removeAttribute("aria-valuenow");
        progress.removeAttribute("aria-valuetext");
        dock.style.setProperty("--native-progress", "0%");
        progressLabel.textContent = "Studio · —";
        progressButton.setAttribute("aria-label", "Dati studio non disponibili. Apri Statistiche per riprovare");
        progressStatus.textContent = "Avanzamento non disponibile. Apri Statistiche per riprovare.";
      }
    } finally { clearTimeout(timeout); }
  }

  function show(nextScreen) {
    if (!["home", "chapters"].includes(nextScreen)) return;
    screen = nextScreen;
    html.dataset.nativeStudyScreen = screen;
    for (const id of ["profileBtn", "adminEntryBtn"]) {
      const button = doc.getElementById(id);
      if (!button) continue;
      if (!utilityAnchors.has(button)) {
        const anchor = doc.createComment(`Original ${id} position`);
        button.before(anchor);
        utilityAnchors.set(button, anchor);
      }
      dock.querySelector(".native-dock-utilities").append(button);
    }
    app.prepareUtilities();
    dock.hidden = false;
    refreshSelected(app.selected());
    void refreshProgress();
    requestAnimationFrame(() => {
      const target = doc.getElementById(nextScreen === "home" ? "nativeHomeTitle" : "nativeChaptersTitle");
      if (screen === nextScreen && !target?.closest("[inert]") && !doc.querySelector('[aria-modal="true"]:not(.hidden)')) target?.focus({ preventScroll: true });
    });
  }
  function hide() {
    screen = "";
    finishGesture(model.gesture?.pointerId);
    controller?.abort();
    requestVersion++;
    delete html.dataset.nativeStudyScreen;
    dock.hidden = true;
    utilityAnchors.forEach((anchor, button) => anchor.after(button));
  }
  doc.addEventListener("visibilitychange", () => {
    html.toggleAttribute("data-native-background", doc.hidden);
    if (doc.hidden) finishGesture(model.gesture?.pointerId);
  });
  const syncModalIsolation = () => {
    const modal = doc.body.classList.contains("qms-open") || doc.body.classList.contains("magic-word-gate-open");
    [home, chapters, dock].forEach(element => { element.inert = modal; });
  };
  new MutationObserver(syncModalIsolation).observe(doc.body, { attributes: true, attributeFilter: ["class"] });
  syncModalIsolation();
  doc.addEventListener("keydown", event => {
    const panel = doc.getElementById("profilePanel");
    if (screen && event.key === "Escape" && panel && !panel.classList.contains("hidden")) {
      panel.classList.add("hidden");
      doc.getElementById("profileBtn")?.setAttribute("aria-expanded", "false");
      doc.getElementById("profileBtn")?.focus({ preventScroll: true });
    }
  });
  window.addEventListener("pagehide", hide);
  window.addEventListener("online", () => { if (screen) void refreshProgress(); });
  window.addEventListener("storage", event => {
    if (["user_session", "session", "accessToken"].includes(event.key) && screen) void refreshProgress();
  });
  window.MagicBookAndroidStudy = Object.freeze({ show, hide, refreshSelected });
  if (["home", "chapters"].includes(app.screen())) show(app.screen());
}
