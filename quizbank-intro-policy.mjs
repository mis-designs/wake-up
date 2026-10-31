// Device-local presentation preferences only. Never grants access to QuizBank.
export const INTRO_WINDOW = 3 * 24 * 60 * 60 * 1000;
export const INTRO_LIMIT = 4;
export function introKey(phone) {
  if (!phone) return null;
  let hash = 2166136261;
  for (const c of String(phone).replace(/\D/g, '')) { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `magicbook.quizbankIntro.v1.${(hash >>> 0).toString(36)}`;
}
export function readIntro(raw) {
  if (raw === null) return { firstSeen: null, count: 0, acknowledged: false };
  try {
    const s = JSON.parse(raw);
    if (!s || typeof s.acknowledged !== 'boolean' || !Number.isInteger(s.count) || s.count < 0 || s.count > INTRO_LIMIT ||
        !(s.firstSeen === null || Number.isFinite(s.firstSeen) && s.firstSeen >= 0)) return null;
    if (s.count > 0 && s.firstSeen === null) return null;
    return { firstSeen: s.firstSeen, count: s.count, acknowledged: s.acknowledged };
  } catch { return null; }
}
export function nextIntro(raw, now = Date.now()) {
  const s = readIntro(raw);
  if (!s || s.acknowledged || s.count >= INTRO_LIMIT || !Number.isFinite(now) || now < 0) return null;
  if (s.firstSeen !== null && (now < s.firstSeen || now - s.firstSeen >= INTRO_WINDOW)) return null;
  return { ...s, firstSeen: s.firstSeen ?? now, count: s.count + 1 };
}
export function reserveIntro(storage, key, now = Date.now()) {
  try {
    if (!key) return false;
    const next = nextIntro(storage.getItem(key), now);
    if (!next) return false;
    const value = JSON.stringify(next);
    storage.setItem(key, value);
    return storage.getItem(key) === value;
  } catch { return false; }
}
export function acknowledgeIntro(storage, key) {
  try {
    const state = readIntro(storage.getItem(key)) || { firstSeen: null, count: 0 };
    const value = JSON.stringify({ ...state, acknowledged: true });
    storage.setItem(key, value);
    return storage.getItem(key) === value;
  } catch { return false; }
}
