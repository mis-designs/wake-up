(function initializeMagicBookOfflineNotice(windowObject) {
  "use strict";

  const documentObject = windowObject.document;
  if (!documentObject) return;

  let notice = null;
  let card = null;
  let previousFocus = null;
  const previousInertStates = new Map();

  function createNotice() {
    if (notice || !documentObject.body) return;

    notice = documentObject.createElement("div");
    notice.id = "magicOfflineNotice";
    notice.className = "magic-offline-notice";
    notice.hidden = true;
    notice.setAttribute("role", "alertdialog");
    notice.setAttribute("aria-modal", "true");
    notice.setAttribute("aria-labelledby", "magicOfflineTitle");
    notice.setAttribute("aria-describedby", "magicOfflineMessage");
    notice.setAttribute("aria-hidden", "true");
    notice.innerHTML = `
      <div class="magic-offline-backdrop" aria-hidden="true"></div>
      <section class="magic-offline-card" tabindex="-1">
        <div class="magic-offline-visual" aria-hidden="true">
          <img src="/icons/no-internet.gif" alt="">
        </div>
        <p class="magic-offline-kicker">Magic Book · Connessione</p>
        <h2 id="magicOfflineTitle">Sei offline</h2>
        <p class="magic-offline-message" id="magicOfflineMessage">Niente paura. Magic Book riparte automaticamente appena torna la connessione.</p>
        <div class="magic-offline-status" role="status" aria-live="polite">
          <span class="magic-offline-status-dot" aria-hidden="true"></span>
          In attesa della rete
        </div>
      </section>`;

    documentObject.body.appendChild(notice);
    card = notice.querySelector(".magic-offline-card");
    notice.addEventListener("keydown", event => {
      if (event.key !== "Tab" || notice.hidden) return;
      event.preventDefault();
      card?.focus({ preventScroll: true });
    });
  }

  function setBackgroundInert(isInert) {
    if (!documentObject.body || !notice) return;

    if (isInert) {
      for (const element of documentObject.body.children) {
        if (element === notice || previousInertStates.has(element)) continue;
        previousInertStates.set(element, Boolean(element.inert));
        element.inert = true;
      }
      return;
    }

    for (const [element, wasInert] of previousInertStates) {
      if (element.isConnected) element.inert = wasInert;
    }
    previousInertStates.clear();
  }

  function showNotice() {
    createNotice();
    if (!notice || !notice.hidden) return;

    previousFocus = documentObject.activeElement;
    notice.hidden = false;
    notice.setAttribute("aria-hidden", "false");
    documentObject.body.classList.add("magic-offline-active");
    setBackgroundInert(true);
    windowObject.requestAnimationFrame(() => card?.focus({ preventScroll: true }));
  }

  function hideNotice() {
    if (!notice || notice.hidden) return;

    notice.hidden = true;
    notice.setAttribute("aria-hidden", "true");
    documentObject.body.classList.remove("magic-offline-active");
    setBackgroundInert(false);

    const focusTarget = previousFocus;
    previousFocus = null;
    if (focusTarget?.isConnected && typeof focusTarget.focus === "function") {
      windowObject.requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
    }
  }

  function updateConnectivityNotice() {
    if (windowObject.navigator?.onLine === false) showNotice();
    else hideNotice();
  }

  function start() {
    createNotice();
    updateConnectivityNotice();
  }

  if (documentObject.readyState === "loading") {
    documentObject.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  windowObject.addEventListener("offline", updateConnectivityNotice);
  windowObject.addEventListener("online", updateConnectivityNotice);
  windowObject.addEventListener("pageshow", updateConnectivityNotice);

  windowObject.MagicBookOfflineNotice = Object.freeze({
    refresh: updateConnectivityNotice
  });
})(window);
