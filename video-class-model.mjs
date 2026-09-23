export const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
export const PAGE_SIZE = 12;
export function supportsVideoEmbed(userAgent = '') {
  return !/MagicBookViewer\//i.test(userAgent) || /MagicBookVideo\/1\b/.test(userAgent);
}
export function videoPath({ group = '', saved = false, lesson = '', kind = '' } = {}) {
  const p = new URLSearchParams({ view: 'videos' });
  if (/^(0[1-9]|1\d|2[0-5]|parole|guide)$/.test(group)) p.set('group', group);
  if (saved) p.set('saved', '1');
  if (VIDEO_ID.test(lesson) || /^facebook-[a-zA-Z0-9]+$/.test(lesson)) p.set('lesson', lesson);
  if (['teoria','quiz','misto','parole','guide'].includes(kind)) p.set('kind', kind);
  return `/studia-quiz?${p}`;
}
export function selectVideoLessons(catalog, state, favorites = []) {
  return catalog.lessons.filter(x => (!state.group || x.group === state.group)
    && (!state.kind || x.kind === state.kind || (['teoria', 'quiz'].includes(state.kind) && x.kind === 'misto'))
    && (!state.saved || favorites.includes(x.id)));
}
export function embedSource(lesson, origin, { autoplay = false } = {}) {
  if (lesson?.provider !== 'youtube' || !VIDEO_ID.test(lesson.id)) return '';
  const url = new URL(`https://www.youtube-nocookie.com/embed/${lesson.id}`);
  url.search = new URLSearchParams({ enablejsapi: '1', playsinline: '1', autoplay: autoplay ? '1' : '0', controls: '1', rel: '0', hl: 'it', origin: new URL(origin).origin }).toString();
  return url.href;
}
export function createVideoFavorites(storage, scope, allowedIds) {
  const key = `magicbook-video-favorites-v1:${encodeURIComponent(scope)}`;
  let memory = [], durable = true;
  function read() {
    try {
      const raw = storage?.getItem(key);
      if (!storage) throw new Error('unavailable');
      if (raw?.length > 32768) throw new Error('invalid');
      const ids = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(ids)) throw new Error('invalid');
      memory = [...new Set(ids.filter(id => allowedIds.has(id)))].slice(0, 250);
      durable = true;
    } catch (_) { durable = false; }
    return [...memory];
  }
  read();
  return { key, read, get durable() { return durable; },
    toggle(id) {
      if (!allowedIds.has(id)) return [...memory];
      if (durable) read(); // merge another tab's latest explicit choices
      memory = memory.includes(id) ? memory.filter(x => x !== id) : [...memory, id].slice(-250);
      try { if (!storage) throw new Error('unavailable'); storage.setItem(key, JSON.stringify(memory)); durable = true; }
      catch (_) { durable = false; }
      return [...memory];
    }, values() { return [...memory]; }
  };
}

// One private in-memory catalogue, bounded by identity and a five-minute lease.
// Nothing is persisted, polled or retrieved per tile. Abort invalidates late data.
export function createVideoCatalogReader(request, identity, now = Date.now) {
  let cache, cachedAt = 0, cacheScope = '', pending;
  function cancel() { pending?.controller.abort(); pending = null; }
  function clear() { cancel(); cache = null; cachedAt = 0; cacheScope = ''; }
  return { cancel, clear,
    read() {
      const scope = identity();
      if (!scope) { clear(); return Promise.reject(new Error('unauthorized')); }
      if (scope !== cacheScope) { clear(); cacheScope = scope; }
      if (cache && now() >= cachedAt && now() - cachedAt < 300000) return Promise.resolve(cache);
      if (pending) return pending.promise;
      const own = { controller: new AbortController() };
      const timer = setTimeout(() => own.controller.abort(), 12000);
      pending = own;
      own.promise = Promise.resolve().then(() => request({ signal: own.controller.signal })).then(data => {
        if (own.controller.signal.aborted || identity() !== scope || pending !== own) throw new DOMException('Cancelled','AbortError');
        if (!Array.isArray(data?.catalog?.lessons) || !Array.isArray(data?.catalog?.groups)) throw new Error('invalid_catalog');
        cache = data.catalog; cachedAt = now(); return cache;
      }).finally(() => { clearTimeout(timer); if (pending === own) pending = null; });
      return own.promise;
    }
  };
}
