// Browser Home decoration only. One cached catalog per document; no API or polling.
let catalogPromise;
const catalog = () => catalogPromise ||= import('./assets/home-animations/catalog.mjs?v=fbda23c8df0e').then(module => module.default).catch(() => []);

export function mountHomeAnimation(home) {
  const slot = home?.querySelector('.member-animation');
  if (!slot) return;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  let entered = false, stopped = false, generation = 0, selected = null;
  let clip = null, still = null, timer = 0, ready = false, failed = false;
  const visible = () => !stopped && !home.classList.contains('hidden') && !root.classList.contains('android-webview');
  const canAnimate = () => visible() && !document.hidden && !home.inert && !reduced.matches && !forced.matches && !root.hasAttribute('data-native-motion-paused');
  function stopClip() {
    clearTimeout(timer); timer = 0;
    ready = false;
    if (clip) {
      clip.onload = clip.onerror = null;
      clip.removeAttribute('src'); clip.remove(); clip = null;
      if (still && visible()) slot.replaceChildren(still);
    }
  }
  function syncMotion() {
    const running = canAnimate();
    home.dataset.homeMotion = running ? 'running' : 'paused';
    if (!running) {
      // Retain decoded media off-DOM: resuming must not request another image.
      clip?.remove();
      if (still && visible()) slot.replaceChildren(still);
      return;
    }
    if (!selected?.animated || failed) return;
    if (clip) { if (ready) slot.replaceChildren(clip); return; }
    const current = generation;
    const image = new Image();
    clip = image;
    image.alt = ''; image.draggable = false; image.hidden = true;
    image.onload = () => {
      if (current !== generation || clip !== image) return;
      clearTimeout(timer); timer = 0;
      ready = true;
      image.hidden = false;
      // Transparent originals must replace the poster, never layer over it.
      if (canAnimate()) slot.replaceChildren(image);
    };
    const fail = () => {
      if (current !== generation || clip !== image) return;
      failed = true; stopClip();
    };
    image.onerror = fail;
    // Load off-DOM so the still is the only artwork until the original is ready.
    timer = setTimeout(fail, 8000);
    image.src = selected.src;
  }
  async function enter(current) {
    const items = await catalog();
    if (current !== generation || !visible() || !items.length) return;
    // The owner chose the graduation cap only: never substitute another decoration.
    selected = items.find(item => /^Graduation_Hat\./i.test(item.id));
    if (!selected) return;
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
      home.dataset.homeMotion = 'paused';
      if (entered) {
        generation++; entered = false; selected = null;
        stopClip();
        if (still) { still.onerror = null; still.removeAttribute('src'); still = null; }
        slot.replaceChildren(); delete slot.dataset.asset;
      }
      return;
    }
    if (!entered) {
      entered = true; failed = false;
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
