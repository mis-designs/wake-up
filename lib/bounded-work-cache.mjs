// Process-local only: never an HTTP/authentication cache. No failed work is retained.
export function createWorkCache({ maxEntries = 32, maxBytes = 0, ttlMs = 0,
  maxPending = 64, sizeOf = () => 0, now = Date.now } = {}) {
  const values = new Map();
  const pending = new Map();
  let bytes = 0;
  function drop(key) {
    const item = values.get(key);
    if (item) bytes -= item.bytes;
    values.delete(key);
  }
  return {
    run(key, load) {
      for (const [oldKey, item] of values) if (item.expiresAt <= now()) drop(oldKey);
      const cached = values.get(key);
      if (cached) {
        values.delete(key);
        values.set(key, cached);
        return Promise.resolve(cached.value);
      }
      if (pending.has(key)) return pending.get(key);
      if (pending.size >= maxPending) return Promise.resolve().then(load);
      const work = Promise.resolve().then(load).then(value => {
        const size = Math.max(0, sizeOf(value));
        if (ttlMs > 0 && maxEntries > 0 && size <= maxBytes) {
          drop(key);
          while (values.size && (values.size >= maxEntries || bytes + size > maxBytes)) {
            drop(values.keys().next().value);
          }
          values.set(key, { value, bytes: size, expiresAt: now() + ttlMs });
          bytes += size;
        }
        return value;
      }).finally(() => { if (pending.get(key) === work) pending.delete(key); });
      pending.set(key, work);
      return work;
    },
    stats: () => ({ entries: values.size, bytes, pending: pending.size })
  };
}
