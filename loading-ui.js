/* One size/asset-fallback owner for web and installed Android loading feedback. */
(() => {
  const root = document.documentElement;
  const primary = '/icons/loading_headlight.gif';
  const backup = '/icons/loading_backup.gif';
  const blank = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const selector = 'img.magic-loading-indicator__image, img.magic-loading-image';
  const failed = new Set();
  const large = image => !image.matches('.magic-loading-image--button') &&
    (image.matches('#quiz-loading-figure-img') || !!image.closest('.magic-loading-indicator--panel, .magic-loading-indicator--page'));

  const pathname = image => {
    try { return new URL(image.currentSrc || image.src, document.baseURI).pathname; }
    catch { return ''; }
  };
  function repair(image) {
    const source = large(image) && !failed.has(primary) ? primary : !failed.has(backup) ? backup : blank;
    image.toggleAttribute('data-loading-unavailable', source === blank);
    if (image.src !== new URL(source, document.baseURI).href) image.src = source;
  }
  function visit(container) {
    if (container.matches?.(selector)) repair(container);
    container.querySelectorAll?.(selector).forEach(repair);
  }
  function fail(source) {
    if (![primary,backup].includes(source) || failed.has(source)) return;
    failed.add(source);
    // Losing the compact GIF must never disable a healthy large Headlight.
    root.dataset.loadingAsset = failed.has(primary) ? failed.has(backup) ? 'unavailable' : 'backup' : 'primary';
    root.dataset.loadingCompact = failed.has(backup) ? 'unavailable' : 'backup';
    visit(document);
  }
  document.addEventListener('error', event => {
    const image = event.target;
    if (!image?.matches?.(selector)) return;
    fail(pathname(image));
    repair(image);
  }, true);
  document.addEventListener('load', event => {
    if (event.target?.matches?.(selector)) repair(event.target);
  }, true);
  // Existing route owners mount named variants; repair added images before paint.
  // No layout measurement, timer or per-screen fallback engine.
  const observer = new MutationObserver(records => {
    for (const record of records) for (const child of record.addedNodes) visit(child);
  });
  observer.observe(root, { childList:true, subtree:true });
  window.addEventListener('pagehide', () => observer.disconnect());
  window.addEventListener('pageshow', () => { visit(document); observer.observe(root, { childList:true, subtree:true }); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => visit(document), { once:true });
  else visit(document);
  // One check per existing public GIF, shared with browser/PWA asset caching.
  // CSS background failures cannot emit image errors. No retries or task reads.
  for (const source of [primary,backup]) {
    const probe = new Image(); probe.onerror = () => fail(source); probe.src = source;
  }
})();
