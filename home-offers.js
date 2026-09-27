import { OFFER_KEY, reserveImpression } from './offer-frequency.mjs?v=1';
import { mountHomeAnimation } from './home-animation.js?v=4-hat&art=fbda23c8df0e';
import { mountHomeUtilities } from './home-utilities.js?v=2-admin';

const doc = document;
const home = doc.getElementById('home');
const join = doc.getElementById('join');
const joinHost = doc.getElementById('joinOfferHost');
const source = 'https://www.canva.com/design/DAHLyZHWUYo/qHS9sfdQAw2ku5raxvnX6Q/view';
const historyKey = 'magicBookOffer';
let shown = false, scheduled = 0, stopped = false;
let overlay = null, unmount = null, releaseEmbed = null, joinEmbed = null;
let baseState, baseUrl, closing = false, afterClose = null;
const visible = node => node && !node.classList.contains('hidden');

function embed(host) {
  let disposed = false, cancelAttempt = () => {};
  function start(focusPending = false) {
    if (disposed) return;
    cancelAttempt();
    const frame = doc.createElement('iframe');
    frame.title = 'Prodotti per Te! — TMM Bangla Patente';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allow = 'fullscreen';
    frame.allowFullscreen = true;
    const status = doc.createElement('div');
    status.className = 'offer-loading';
    status.setAttribute('role', 'status');
    status.tabIndex = -1;
    status.innerHTML = '<span class="magic-loading-indicator magic-loading-indicator--panel"><span class="magic-loading-indicator__media"><img class="magic-loading-indicator__image" src="/icons/loading_headlight.gif" alt=""></span><span>Caricamento prodotti…</span></span>';
    const image = status.querySelector('img');
    image.addEventListener('error', () => {
      if (image.dataset.backup) image.hidden = true;
      else { image.dataset.backup = 'true'; image.src = '/icons/loading_backup.gif'; }
    });
    let active = true;
    const finish = () => {
      if (!active || disposed) return;
      clearTimeout(timer);
      if (doc.activeElement === status) frame.focus();
      status.remove();
    };
    const fail = message => {
      if (!active || disposed) return;
      active = false;
      clearTimeout(timer);
      frame.removeEventListener('load', finish);
      frame.remove();
      status.classList.add('offer-loading--error');
      const copy = doc.createElement('p');
      copy.textContent = message;
      const retry = doc.createElement('button');
      retry.type = 'button';
      retry.className = 'offer-retry';
      retry.textContent = 'Riprova';
      retry.addEventListener('click', () => start(true), { once: true });
      status.replaceChildren(copy, retry);
    };
    const timer = setTimeout(() => fail('Il riquadro prodotti sta impiegando più tempo. Puoi riprovare.'), 12000);
    frame.addEventListener('load', finish, { once: true });
    frame.addEventListener('error', () => fail('Non riesco a caricare i prodotti. Controlla la connessione e riprova.'), { once: true });
    frame.src = `${source}?embed`;
    host.append(status, frame);
    if (focusPending) status.focus();
    cancelAttempt = () => {
      active = false;
      clearTimeout(timer);
      frame.removeEventListener('load', finish);
      frame.remove(); status.remove();
    };
  }
  start();
  return () => {
    disposed = true;
    cancelAttempt();
  };
}

function eligible() {
  return !stopped && !shown && !doc.hidden && navigator.onLine !== false && visible(home)
    && Boolean(window.getCurrentSessionPhone?.())
    && !window.hasVisibleBlockingPopup?.()
    // Existing access/learning notices take priority. Do not stack promotions.
    && !window.isWhatsNewPopupAllowed?.() && !window.isWhatsAppGroupPopupAllowed?.()
    && ![...doc.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(node => node.getClientRects().length);
}

function dispose({ restoreFocus = false } = {}) {
  releaseEmbed?.(); releaseEmbed = null;
  unmount?.({ restoreFocus }); unmount = null;
  overlay = null; closing = false;
}

function close(callback) {
  if (!overlay || closing) return false;
  afterClose = typeof callback === 'function' ? callback : null;
  closing = true;
  if (history.state?.[historyKey]) history.back();
  else { dispose({ restoreFocus: true }); const next = afterClose; afterClose = null; next?.(); }
  return true;
}

function dismissForNotice() {
  if (!overlay) return;
  if (history.state?.[historyKey]) history.replaceState(baseState, '', location.href);
  afterClose = null;
  dispose();
}

function open() {
  baseState = history.state;
  baseUrl = location.href;
  const returnFocus = doc.activeElement !== doc.body ? doc.activeElement : home.querySelector('button');
  overlay = doc.getElementById('offerPopupTemplate').content.firstElementChild.cloneNode(true);
  const closeButton = overlay.querySelector('.offer-close');
  closeButton.addEventListener('click', () => close());
  overlay.querySelector('[data-offer-join]').addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    close(() => window.showJoinScreen());
  });
  doc.body.append(overlay);
  history.pushState({ ...baseState, [historyKey]: true }, '', baseUrl);
  unmount = window.MagicBookPopup.mount(overlay, {
    bodyClass: 'offer-popup-open', returnFocus, initialFocus: closeButton,
    focusable: () => overlay.querySelectorAll('button, a[href], iframe'),
    onDismiss: () => close()
  });
  shown = true;
  releaseEmbed = embed(overlay.querySelector('.offer-embed'));
}

async function attempt() {
  const reserve = () => {
    if (!eligible()) return;
    let storage;
    try { storage = localStorage; } catch { return; }
    if (reserveImpression(storage)) open();
  };
  // Serialize concurrent tabs where the platform supports Web Locks.
  try {
    if (navigator.locks?.request) await navigator.locks.request(OFFER_KEY, reserve);
    else reserve();
  } catch { /* Promotional failure must never interrupt study. */ }
}

function sync() {
  cancelAnimationFrame(scheduled); scheduled = 0;
  if (overlay && (!visible(home) || stopped)) {
    if (history.state?.[historyKey]) history.replaceState(baseState, '', location.href);
    afterClose = null; dispose();
  }
  if ((!visible(join) || stopped) && joinEmbed) { joinEmbed(); joinEmbed = null; }
  if (visible(join) && !stopped && !joinEmbed) joinEmbed = embed(joinHost);
  if (eligible()) scheduled = requestAnimationFrame(() => { scheduled = 0; void attempt(); });
}

window.MagicBookPopup.registerHistoryLayer(event => {
  if (!overlay) {
    // Forward must not resurrect a dismissed ad or consume another impression.
    if (event.state?.[historyKey]) {
      const { [historyKey]: unused, ...state } = event.state;
      history.replaceState(state, '', location.href);
    }
    return false;
  }
  const samePage = location.href === baseUrl;
  dispose({ restoreFocus: samePage });
  const next = afterClose; afterClose = null;
  if (samePage) next?.();
  return samePage;
});

const observer = new MutationObserver(sync);
function observe() {
  observer.observe(home, { attributes: true, attributeFilter: ['class'] });
  observer.observe(join, { attributes: true, attributeFilter: ['class'] });
}
observe();
window.addEventListener('pagehide', () => { stopped = true; observer.disconnect(); sync(); });
window.addEventListener('pageshow', () => { stopped = false; observe(); sync(); });
window.addEventListener('magicbook:before-offline-notice', () => {
  if (overlay) {
    if (history.state?.[historyKey]) history.replaceState(baseState, '', location.href);
    afterClose = null; dispose();
  }
});
// Focus notifications do not reopen the offer. Returning to Home is the trigger.
window.MagicBookOffers = Object.freeze({ close, dismissForNotice });
sync();

const book = home.querySelector('.member-book');
book.addEventListener('error', () => { book.hidden = true; home.querySelector('.member-book-fallback').hidden = false; });
if (book.complete && !book.naturalWidth) book.dispatchEvent(new Event('error'));
mountHomeAnimation(home);
mountHomeUtilities(home);
