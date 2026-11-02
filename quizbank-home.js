export function mountQuizBankHome(home) {
  const syncBadge = image => {
    if (!image?.matches?.('.qb-entry-tag img')) return;
    image.parentElement.toggleAttribute('data-ready', image.complete && image.naturalWidth > 0);
  };
  home.addEventListener('load', event => syncBadge(event.target), true);
  home.addEventListener('error', event => syncBadge(event.target), true);
  home.querySelectorAll('.qb-entry-tag img').forEach(syncBadge);
  let stopped = false;
  function sync() {
    const motion = !stopped && !home.classList.contains('hidden') && !document.hidden && !home.inert ? 'running' : 'paused';
    if (home.dataset.qbMotion !== motion) home.dataset.qbMotion = motion;
  }
  const observer = new MutationObserver(sync);
  const observe = () => observer.observe(home, { attributes: true, attributeFilter: ['class', 'inert'] });
  observe();
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => { stopped = true; observer.disconnect(); sync(); });
  window.addEventListener('pageshow', () => { stopped = false; observe(); sync(); });
  sync();
}
