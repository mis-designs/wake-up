// One small device-local counter, without account identifiers or analytics.
export const OFFER_KEY = 'magicbook.offerNotice.v1';
export const OFFER_DAILY_LIMIT = 3;
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function nextImpression(raw, date = new Date()) {
  const day = localDay(date);
  let count = 0;
  if (raw !== null) {
    let saved;
    try { saved = JSON.parse(raw); } catch { return null; }
    if (!saved || !/^\d{4}-\d{2}-\d{2}$/.test(saved.day) || !Number.isInteger(saved.count) || saved.count < 0 || saved.count > OFFER_DAILY_LIMIT) return null;
    // A clock rollback must not reset the quota.
    if (saved.day > day) return null;
    if (saved.day === day) count = saved.count;
  }
  return count < OFFER_DAILY_LIMIT ? { day, count: count + 1 } : null;
}
export function reserveImpression(storage, date = new Date()) {
  try {
    const next = nextImpression(storage.getItem(OFFER_KEY), date);
    if (!next) return false;
    const value = JSON.stringify(next);
    storage.setItem(OFFER_KEY, value);
    return storage.getItem(OFFER_KEY) === value;
  } catch { return false; } // No persistent counter: no automatic promotion.
}
