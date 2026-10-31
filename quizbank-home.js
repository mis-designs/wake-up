import { introKey, readIntro, nextIntro, reserveIntro, acknowledgeIntro } from './quizbank-intro-policy.mjs?v=1';

export function mountQuizBankHome(home) {
  const doc = document, historyKey = 'magicBookQuizBankIntro';
  const visited = new Set(), acknowledged = new Set();
  let overlay, unmount, baseState, baseUrl, ownerKey, returnTarget, timer = 0, stopped = false, closing = false, afterClose;
  let priorityVisit = false;
  const key = () => introKey(window.getCurrentSessionPhone?.());
  const visible = () => !stopped && !home.classList.contains('hidden') && Boolean(key());
  const raw = id => { try { return localStorage.getItem(id); } catch { return 'unavailable'; } };
  const isAcknowledged = id => acknowledged.has(id) || readIntro(raw(id))?.acknowledged;
  const due = () => visible() && !visited.has(key()) && Boolean(nextIntro(raw(key())));
  const blocked = () => home.inert || doc.hidden || navigator.onLine === false ||
    window.hasVisibleBlockingPopup?.() || window.isWhatsNewPopupAllowed?.() || window.isWhatsAppGroupPopupAllowed?.() ||
    [...doc.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(node => node.getClientRects().length);

  function dispose(restoreFocus = true) {
    unmount?.({ restoreFocus }); unmount = null; overlay = null; closing = false;
    // The installed shell releases its nested inert surfaces in a body observer.
    // Let that existing owner finish before restoring the entry's focus.
    const target = returnTarget;
    if (restoreFocus && target?.closest('[inert]')) requestAnimationFrame(() => {
      if (visible() && !overlay && target.isConnected && !target.closest('[inert]')) target.focus({ preventScroll: true });
    });
  }
  function close(next) {
    if (!overlay || closing) return false;
    closing = true; afterClose = next;
    if (history.state?.[historyKey]) history.back();
    else { dispose(); afterClose = null; next?.(); }
    return true;
  }
  function dismissForNotice() {
    clearTimeout(timer); timer = 0;
    if (!overlay) return;
    if (history.state?.[historyKey]) history.replaceState(baseState, '', location.href);
    afterClose = null; dispose(false);
  }
  function open(trigger) {
    if (!visible() || overlay || blocked()) return false;
    ownerKey = key(); priorityVisit = true; visited.add(ownerKey);
    const retainedHistory = Boolean(history.state?.[historyKey]);
    baseState = history.state; baseUrl = location.href;
    if (retainedHistory) { const { [historyKey]: unused, ...state } = baseState; baseState = state; }
    overlay = doc.getElementById('quizBankIntroTemplate').content.firstElementChild.cloneNode(true);
    const closeButton = overlay.querySelector('[data-qb-close]');
    closeButton.addEventListener('click', () => close());
    overlay.querySelector('[data-qb-understood]').addEventListener('click', () => {
      if (key() !== ownerKey) return dismissForNotice();
      acknowledged.add(ownerKey);
      try { acknowledgeIntro(localStorage, ownerKey); } catch { /* Keep the acknowledgement for this visit. */ }
      close();
    });
    overlay.querySelector('[data-qb-open]').addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      close(() => location.assign('/quizbank'));
    });
    doc.body.append(overlay);
    try { history[retainedHistory ? 'replaceState' : 'pushState']({ ...baseState, [historyKey]: true }, '', baseUrl); } catch { /* X/Escape still work without History API. */ }
    returnTarget = trigger || [...home.querySelectorAll('[data-quizbank-entry]')].find(node => node.getClientRects().length);
    unmount = window.MagicBookPopup.mount(overlay, {
      bodyClass: 'qb-intro-open', returnFocus: returnTarget,
      initialFocus: closeButton, focusable: () => overlay.querySelectorAll('button,a[href]'), onDismiss: () => close()
    });
    return true;
  }
  async function attempt() {
    const id = key();
    const reserve = () => {
      if (id !== key() || !due() || blocked()) return;
      try { if (reserveIntro(localStorage, id)) open(); } catch { /* No persistent storage, no automatic presentation. */ }
    };
    try { if (navigator.locks?.request) await navigator.locks.request(id, reserve); else reserve(); } catch { /* Explicit entry remains usable. */ }
  }
  function sync() {
    clearTimeout(timer); timer = 0;
    if (overlay && (!visible() || ownerKey !== key())) dismissForNotice();
    const motion = visible() && !doc.hidden && !home.inert ? 'running' : 'paused';
    if (home.dataset.qbMotion !== motion) home.dataset.qbMotion = motion;
    if (due() && !blocked()) timer = setTimeout(() => { timer = 0; void attempt(); }, 650);
  }
  doc.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-quizbank-entry]');
    if (!trigger || !home.contains(trigger) || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (isAcknowledged(key())) return; // A real link remains the progressive-enhancement fallback.
    event.preventDefault();
    open(trigger);
  });
  window.MagicBookPopup.registerHistoryLayer(event => {
    if (!overlay) {
      if (event.state?.[historyKey]) {
        const { [historyKey]: unused, ...state } = event.state;
        history.replaceState(state, '', location.href);
      }
      return false;
    }
    const samePage = location.href === baseUrl;
    dispose(samePage);
    const next = afterClose; afterClose = null;
    if (samePage) next?.();
    return samePage;
  });
  const observer = new MutationObserver(sync);
  function observe() {
    observer.observe(home, { attributes: true, attributeFilter: ['class', 'inert'] });
    observer.observe(doc.body, { childList: true });
  }
  observe();
  doc.addEventListener('visibilitychange', sync);
  window.addEventListener('storage', sync);
  window.addEventListener('online', sync);
  window.addEventListener('magicbook:before-offline-notice', dismissForNotice);
  window.addEventListener('pagehide', () => { stopped = true; observer.disconnect(); sync(); });
  window.addEventListener('pageshow', () => { stopped = false; observe(); sync(); });
  sync();
  return Object.freeze({ blocksOffers: () => priorityVisit || due() || Boolean(overlay), close, dismissForNotice });
}
