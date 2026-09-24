/* One public-image fallback owner for all shared loaders, including CSS controls. */
(() => {
  const root = document.documentElement;
  const primary = '/icons/loading_headlight.gif';
  const backup = '/icons/loading_backup.gif';
  const blank = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const selector = 'img.magic-loading-indicator__image, img.magic-loading-image';
  let state = 'primary';
  let probe;

  const pathname = image => {
    try { return new URL(image.currentSrc || image.src, document.baseURI).pathname; }
    catch { return ''; }
  };
  function repair(image) {
    if (state === 'backup' && pathname(image) === primary) image.src = backup;
    if (state === 'unavailable' && image.src !== blank) image.src = blank;
  }
  function fail(source) {
    if (source === primary && state === 'primary') {
      state = 'backup';
      root.dataset.loadingAsset = state;
      document.querySelectorAll(selector).forEach(repair);
      check(backup);
    } else if (source === backup && state === 'backup') {
      state = 'unavailable';
      root.dataset.loadingAsset = state;
      document.querySelectorAll(selector).forEach(repair);
    }
  }
  function check(source) {
    // At most one primary check and one backup check per document; no retry loop.
    probe = new Image();
    probe.onerror = () => fail(source);
    probe.src = source;
  }
  document.addEventListener('error', event => {
    const image = event.target;
    if (!image?.matches?.(selector)) return;
    fail(pathname(image));
    repair(image);
  }, true);
  function ready() {
    document.querySelectorAll(selector).forEach(repair);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
  check(primary);
})();
