import { introKey, nextIntro, reserveIntro } from './quizbank-intro-policy.mjs?v=1';

export function mountQuizBankIntro({ surface, getPhone, isReady }) {
  const doc = document, historyKey = 'magicBookQuizBankIntro';
  const visited = new Set();
  let overlay, unmount, ownerKey, baseState, baseUrl, timer = 0, timerUrl, stopped = false, closing = false;
  const key = () => introKey(getPhone());
  const visible = () => !stopped && Boolean(key()) && isReady();
  const raw = id => { try { return localStorage.getItem(id); } catch { return 'unavailable'; } };
  const due = () => visible() && !visited.has(key()) && Boolean(nextIntro(raw(key())));
  const blocked = () => surface.inert || doc.hidden || navigator.onLine === false ||
    [...doc.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(node => node.getClientRects().length);
  const clearTimer = () => { clearTimeout(timer); timer = 0; };

  function dispose(restoreFocus = true) {
    unmount?.({ restoreFocus }); unmount = null; overlay = null; closing = false;
  }
  function close() {
    if (!overlay || closing) return;
    closing = true;
    if (history.state?.[historyKey]) history.back();
    else dispose();
  }
  function dismissForNotice() {
    clearTimer();
    if (!overlay) return;
    if (history.state?.[historyKey]) history.replaceState(baseState, '', location.href);
    dispose(false);
  }
  function open() {
    if (!visible() || overlay || blocked()) return;
    ownerKey = key(); visited.add(ownerKey);
    baseState = history.state; baseUrl = location.href;
    const retainedHistory = Boolean(baseState?.[historyKey]);
    if (retainedHistory) { const { [historyKey]: unused, ...state } = baseState; baseState = state; }
    const active = doc.activeElement;
    const returnTarget = surface.contains(active) ? active : surface.querySelector('h2[tabindex]');
    overlay = doc.getElementById('quizBankIntroTemplate').content.firstElementChild.cloneNode(true);
    const closeButton = overlay.querySelector('[data-qb-close]');
    closeButton.addEventListener('click', close);
    doc.body.append(overlay);
    try { history[retainedHistory ? 'replaceState' : 'pushState']({ ...baseState, [historyKey]: true }, '', baseUrl); } catch { /* X/Escape still dismiss without History API. */ }
    unmount = window.MagicBookPopup.mount(overlay, {
      bodyClass: 'qb-intro-open', returnFocus: returnTarget, initialFocus: closeButton,
      focusable: () => [closeButton], onDismiss: close
    });
  }
  async function attempt(id, url) {
    const reserve = () => {
      if (id !== key() || location.href !== url || !due() || blocked()) return;
      if (reserveIntro(localStorage, id)) open();
    };
    try { if (navigator.locks?.request) await navigator.locks.request(id, reserve); else reserve(); } catch { /* Optional presentation: storage failure never blocks QuizBank. */ }
  }
  function sync() {
    if (overlay && (!visible() || ownerKey !== key() || location.href !== baseUrl)) dismissForNotice();
    if (!due() || blocked()) { clearTimer(); return; }
    if (timer && timerUrl === location.href) return;
    clearTimer();
    const id = key(), url = location.href;
    timerUrl = url;
    timer = setTimeout(() => { timer = 0; void attempt(id, url); }, 1000);
  }
  window.MagicBookPopup.registerHistoryLayer(event => {
    if (!overlay) {
      if (event.state?.[historyKey]) {
        const { [historyKey]: unused, ...state } = event.state;
        history.replaceState(state, '', location.href);
        return true;
      }
      return false;
    }
    const samePage = location.href === baseUrl;
    dispose(samePage);
    return samePage;
  });
  const observer = new MutationObserver(sync);
  function observe() {
    observer.observe(surface, { subtree: true, attributes: true, attributeFilter: ['class', 'inert'] });
    observer.observe(doc.body, { childList: true });
  }
  observe();
  doc.addEventListener('visibilitychange', sync);
  window.addEventListener('storage', sync);
  window.addEventListener('online', sync);
  window.addEventListener('offline', dismissForNotice);
  window.addEventListener('magicbook:before-offline-notice', dismissForNotice);
  window.addEventListener('pagehide', () => { stopped = true; observer.disconnect(); dismissForNotice(); });
  window.addEventListener('pageshow', () => { stopped = false; observe(); sync(); });
  sync();
}
