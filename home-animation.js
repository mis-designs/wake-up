// Browser Home decoration only. One cached catalog per document; no API or polling.
let catalogPromise;
const catalog = () => catalogPromise ||= import('./assets/home-animations/catalog.mjs?v=cc8fc71c2247').then(module => module.default).catch(() => []);
const selectionKey = 'magicbook.homeAnimation.v1';

export function mountHomeAnimation(home) {
  const slot = home?.querySelector('.member-animation');
  if (!slot) return;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  let entered = false, stopped = false, generation = 0, selected = null;
  let clip = null, still = null, timer = 0, played = false, previous = '';
  const visible = () => !stopped && !home.classList.contains('hidden') && !root.classList.contains('android-webview');
  const canAnimate = () => visible() && !document.hidden && !home.inert && !reduced.matches && !forced.matches && !root.hasAttribute('data-native-motion-paused');
  function stopClip() {
    clearTimeout(timer); timer = 0;
    if (clip) {
      clip.onload = clip.onerror = null;
      clip.removeAttribute('src'); clip.remove(); clip = null;
      if (still && visible()) slot.replaceChildren(still);
    }
  }
  function syncMotion() {
    if (!canAnimate()) { stopClip(); return; }
    if (!selected?.animated || played) return;
    played = true;
    const current = generation;
    const image = new Image();
    clip = image;
    image.alt = ''; image.draggable = false; image.hidden = true;
    image.onload = () => {
      if (current !== generation || clip !== image || !canAnimate()) return;
      clearTimeout(timer);
      image.hidden = false;
      // Transparent originals must replace the poster, never layer over it.
      slot.replaceChildren(image);
      // A finite welcome accent, then its real still frame; no pause toggle.
      timer = setTimeout(stopClip, 4500);
    };
    image.onerror = stopClip;
    // Load off-DOM so the still is the only artwork until the original is ready.
    timer = setTimeout(stopClip, 8000);
    image.src = selected.src;
  }
  async function enter(current) {
    const items = await catalog();
    if (current !== generation || !visible() || !items.length) return;
    try { previous = localStorage.getItem(selectionKey) || previous; } catch { /* Memory-only rotation still works. */ }
    selected = items[(items.findIndex(item => item.id === previous) + 1) % items.length];
    previous = selected.id;
    try { localStorage.setItem(selectionKey, previous); } catch { /* No personal data or required persistence. */ }
    slot.dataset.asset = selected.id;
    const poster = new Image();
    still = poster;
    poster.alt = ''; poster.draggable = false;
    poster.onerror = () => { poster.hidden = true; };
    poster.src = selected.poster;
    slot.replaceChildren(poster);
    syncMotion();
  }
  function sync() {
    if (!visible()) {
      if (entered) {
        generation++; entered = false; selected = null;
        stopClip();
        if (still) { still.onerror = null; still.removeAttribute('src'); still = null; }
        slot.replaceChildren(); delete slot.dataset.asset;
      }
      return;
    }
    if (!entered) {
      entered = true; played = false;
      void enter(++generation);
    }
    syncMotion();
  }
  const observer = new MutationObserver(sync);
  function observe() {
    observer.observe(home, { attributes: true, attributeFilter: ['class', 'inert'] });
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-native-motion-paused'] });
  }
  reduced.addEventListener('change', syncMotion);
  forced.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('pagehide', () => { stopped = true; observer.disconnect(); sync(); });
  window.addEventListener('pageshow', () => { stopped = false; observe(); sync(); });
  observe(); sync();
}
