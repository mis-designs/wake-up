import { getFigureDetail, normalizeFigureId } from './figure-catalog.mjs?v=1';

// One read-only figure viewer for Quiz, review, study and learning details.
// No quiz text inference, TTS/translation requests, auth or answer state writes.
const SELECTOR = '#figure, .modal-review-img, .study-figure, .li-figure-image, .audio-admin-question-copy > img';
const bindings = new WeakMap();
const lifetime = new AbortController();
let active = null;
let consumingBack = false;
let pendingScrollRestore = null;

function restoreScroll(snapshot) {
  if (!snapshot) return;
  window.scrollTo({ left: snapshot.x, top: snapshot.y, behavior: 'instant' });
  snapshot.parents.forEach(({ node, top, left }) => {
    if (node.isConnected) node.scrollTo({ top, left, behavior: 'instant' });
  });
  history.scrollRestoration = snapshot.mode;
}

function identity(image) {
  try {
    const url = new URL(image.getAttribute('src') || '', location.href);
    if (url.origin !== location.origin || url.pathname !== '/api/asset' || url.searchParams.get('kind') !== 'figure') return '';
    return normalizeFigureId(url.searchParams.get('figure'));
  } catch { return ''; }
}

function close({ fromHistory = false, restoreFocus = true } = {}) {
  if (!active) return false;
  const state = active;
  active = null;
  state.observer.disconnect();
  // Restore the exact node: image requests, lazy-load/error listeners and pixels
  // stay with their original owner. The measured spacer kept its layout stable.
  state.spacer.replaceWith(state.image);
  state.trigger.setAttribute('aria-expanded', 'false');
  state.unmount({ restoreFocus });
  restoreScroll(state.scroll);
  if (!fromHistory && state.ownsHistory && history.state?.magicFigureDetail === state.historyKey) {
    consumingBack = true;
    pendingScrollRestore = state.scroll;
    history.scrollRestoration = 'manual';
    history.back();
  }
  return true;
}

function open(image, trigger) {
  if (active || consumingBack || navigator.onLine === false || document.body.classList.contains('magic-offline-active')) return;
  const id = identity(image);
  if (!id || !image.complete || !image.naturalWidth || trigger.closest('[inert]')) return;
  const detail = getFigureDetail(id);
  const scroll = { x: scrollX, y: scrollY, mode: history.scrollRestoration, parents: [] };
  for (let node = trigger.parentElement; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) {
      scroll.parents.push({ node, top: node.scrollTop, left: node.scrollLeft });
    }
  }
  const overlay = document.createElement('div');
  overlay.className = 'figure-detail-overlay';
  overlay.innerHTML = `<section class="figure-detail-card" role="dialog" aria-modal="true" aria-labelledby="figureDetailTitle" aria-describedby="figureDetailBangla" tabindex="-1">
    <div class="figure-detail-media"></div>
    <div class="figure-detail-copy"><h2 id="figureDetailTitle" lang="it"></h2><p id="figureDetailBangla" lang="bn"></p></div>
    <footer><button type="button" class="figure-detail-close" aria-label="Chiudi figura"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></footer>
  </section>`;
  const card = overlay.firstElementChild;
  overlay.querySelector('#figureDetailTitle').textContent = detail?.italian || 'Nome della figura non ancora disponibile';
  overlay.querySelector('#figureDetailBangla').textContent = detail?.bangla || 'এই ছবির নাম এখনো যোগ করা হয়নি';
  const spacer = document.createElement('span');
  spacer.className = 'figure-detail-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  const bounds = image.getBoundingClientRect();
  spacer.style.width = `${bounds.width}px`;
  spacer.style.height = `${bounds.height}px`;
  image.replaceWith(spacer);
  overlay.querySelector('.figure-detail-media').append(image);
  document.body.append(overlay);
  trigger.setAttribute('aria-expanded', 'true');
  const closeButton = overlay.querySelector('.figure-detail-close');
  closeButton.addEventListener('click', () => close());
  const unmount = window.MagicBookPopup.mount(overlay, {
    focusable: [closeButton], initialFocus: card, returnFocus: trigger,
    bodyClass: 'figure-detail-open', onDismiss: () => close()
  });
  const historyKey = `${Date.now()}-${id}`;
  let ownsHistory = false;
  try {
    history.pushState({ ...history.state, magicFigureDetail: historyKey }, '', location.href);
    history.scrollRestoration = 'manual';
    ownsHistory = true;
  } catch { /* X/Escape still work. */ }
  const source = image.getAttribute('src');
  const observer = new MutationObserver(() => {
    if (!trigger.isConnected || trigger.closest('.hidden, [hidden]') || image.getAttribute('src') !== source) close({ restoreFocus: false });
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'hidden', 'class'] });
  active = { image, trigger, spacer, unmount, observer, ownsHistory, historyKey, scroll };
}

function enhance(image) {
  if (!(image instanceof HTMLImageElement) || !image.matches(SELECTOR) || bindings.has(image)) return;
  // Already-actionable thumbnails select learning detail or assign Admin audio;
  // their owners supply a separate zoom target rather than nesting buttons.
  if (image.closest('button, a, .figure-detail-overlay')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'figure-detail-trigger';
  if (image.id === 'figure') button.classList.add('figure-detail-trigger--live');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.title = 'Ingrandisci figura';
  image.before(button);
  button.append(image);
  const update = () => {
    const id = identity(image), detail = getFigureDetail(id);
    button.disabled = !id || !image.complete || !image.naturalWidth;
    button.setAttribute('aria-label', detail ? `Ingrandisci figura: ${detail.italian}` : 'Ingrandisci figura');
  };
  button.addEventListener('click', event => { event.stopPropagation(); open(image, button); });
  // Node-scoped handlers are collected with their question card; do not attach
  // them to a document-lifetime AbortSignal that would retain old chapters.
  image.addEventListener('load', update);
  image.addEventListener('error', update);
  bindings.set(image, { update });
  update();
}

function scan(node) {
  if (!(node instanceof Element) || node.closest('.figure-detail-overlay')) return;
  if (node.matches(SELECTOR)) enhance(node);
  node.querySelectorAll(SELECTOR).forEach(enhance);
}

const observer = new MutationObserver(records => {
  records.forEach(record => {
    if (record.type === 'attributes') bindings.get(record.target)?.update();
    else record.addedNodes.forEach(scan);
  });
});
scan(document.body);
observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

// The early shared history owner consumes only this viewer's entries before
// Quiz/Study/Home handlers. Do not reload data, render the route or reset audio.
const unregisterHistory = window.MagicBookPopup.registerHistoryLayer(() => {
  if (consumingBack) {
    consumingBack = false;
    restoreScroll(pendingScrollRestore);
    pendingScrollRestore = null;
    return true;
  }
  if (active) { close({ fromHistory: true }); return true; }
  if (history.state?.magicFigureDetail) {
    const { magicFigureDetail, ...previous } = history.state;
    history.replaceState(previous, '', location.href);
    return true;
  }
  return false;
});

for (const event of ['magicbook:before-offline-notice', 'magicbook:quiz-question-change', 'magicbook:quiz-help-close']) {
  window.addEventListener(event, () => close({ restoreFocus: false }), { capture: true, signal: lifetime.signal });
}
window.addEventListener('pagehide', event => {
  // Never schedule history navigation from a document that is unloading.
  close({ fromHistory: true, restoreFocus: false });
  restoreScroll(pendingScrollRestore);
  consumingBack = false;
  pendingScrollRestore = null;
  if (!event.persisted) { observer.disconnect(); unregisterHistory(); lifetime.abort(); }
}, { signal: lifetime.signal });
window.MagicBookFigureDetail = Object.freeze({ close, open, enhance });
