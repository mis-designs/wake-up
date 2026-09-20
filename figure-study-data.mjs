// One bounded, cancellable read owner. No polling, automatic retries, or durable
// private answer cache. Authentication remains in the existing study API adapter.
export function createFigureStudyData(request, identity = () => '') {
  const cache = new Map(), pending = new Map();
  let scope = identity();
  function cancel() {
    for (const item of pending.values()) item.controller.abort();
    pending.clear();
  }
  function clear() { cancel(); cache.clear(); }
  async function read(action, figure = '') {
    const currentScope = identity();
    if (currentScope !== scope) { clear(); scope = currentScope; }
    const key = `${action}:${figure}`, now = Date.now();
    const saved = cache.get(key);
    if (saved && saved.expires > now) return saved.value;
    if (pending.has(key)) return pending.get(key).promise;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const item = { controller, promise: null };
    item.promise = Promise.resolve().then(() => request(action, figure ? { figure } : {}, { signal: controller.signal }))
      .then(value => {
        if (controller.signal.aborted || currentScope !== identity()) throw new DOMException('Cancelled', 'AbortError');
        cache.delete(key);
        cache.set(key, { value, expires: Date.now() + 60000 });
        while (cache.size > 16) cache.delete(cache.keys().next().value);
        return value;
      }).finally(() => {
        clearTimeout(timer);
        if (pending.get(key) === item) pending.delete(key);
      });
    pending.set(key, item);
    return item.promise;
  }
  // Explicit retry only; do not discard unrelated examples or in-flight deduplication.
  function invalidate(action, figure = '') { cache.delete(`${action}:${figure}`); }
  return { read, cancel, clear, invalidate };
}

export function explanationImageSource(manifest, figure) {
  const entry = manifest?.files?.[figure];
  if (!/^fig[1-9]\d*$/.test(figure) || !entry || !new RegExp(`^${figure}(?:_[01])?\\.(webp|png|jpg|jpeg)$`).test(entry.file)) return '';
  const params = new URLSearchParams({ kind: 'explanation', figure, value: '0',
    ext: entry.file.split('.').pop(), file: entry.file });
  if (Number.isFinite(entry.version) && entry.version > 0) params.set('v', String(entry.version));
  return `/api/asset?${params}`;
}
