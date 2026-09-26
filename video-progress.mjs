// Watched coverage, not furthest playhead. Never bridges a seek or counts replays twice.
const MAX_DURATION = 86400;
const MAX_RANGES = 128;
const MAX_ITEMS = 250;
const MAX_BYTES = 1048576;
const validDuration = n => Number.isFinite(n) && n > 0 && n <= MAX_DURATION;

export function mergeWatchedRanges(ranges, duration) {
  if (!validDuration(duration)) return [];
  const sorted = ranges.filter(r => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite))
    .map(([a,b]) => [Math.max(0,a),Math.min(duration,b)])
    .filter(([a,b]) => b > a).sort((a,b) => a[0] - b[0]);
  const result = [];
  for (const range of sorted) {
    const last = result.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1],range[1]);
    else result.push([...range]);
  }
  // Extremely fragmented viewing remains bounded; discard the smallest fragments,
  // never merge across an unwatched gap to make a stronger completion claim.
  if (result.length > MAX_RANGES) return result.sort((a,b) => (b[1]-b[0])-(a[1]-a[0]))
    .slice(0,MAX_RANGES).sort((a,b) => a[0]-b[0]);
  return result;
}

export function watchedSummary(record) {
  if (!record || !validDuration(record.duration)) return { known:false, percent:0, seconds:0 };
  const seconds = mergeWatchedRanges(record.ranges || [],record.duration).reduce((n,[a,b]) => n+b-a,0);
  return { known:true, seconds, percent:Math.min(100,Math.floor(seconds / record.duration * 100 + 1e-8)) };
}

export function createVideoProgress(storage, scope, allowedIds, now = Date.now) {
  const key = `magicbook-video-progress-v1:${encodeURIComponent(scope)}`;
  let records = Object.create(null), dirty = false, durable = !!storage;
  function normalize(record) {
    if (!record || !validDuration(record.duration) || !Array.isArray(record.ranges) || record.ranges.length > MAX_RANGES) return null;
    const checkpoint = Number.isFinite(record.position) && record.position >= 0 && record.position <= record.duration && Number.isFinite(record.positionUpdatedAt) && record.positionUpdatedAt > 0
      ? { position:record.position, positionUpdatedAt:record.positionUpdatedAt } : {};
    return { duration:record.duration, ranges:mergeWatchedRanges(record.ranges,record.duration), updatedAt:Number.isFinite(record.updatedAt) ? record.updatedAt : 0, ...checkpoint };
  }
  function merge(id, record) {
    const old = records[id];
    const duration = !old || record.updatedAt >= old.updatedAt ? record.duration : old.duration;
    // Coverage is cumulative; the resume point is the latest choice, even a backward seek.
    const checkpoint = (record.positionUpdatedAt || 0) > (old?.positionUpdatedAt || 0) ? record : old;
    records[id] = { duration, ranges:mergeWatchedRanges([...(old?.ranges || []),...record.ranges],duration), updatedAt:Math.max(old?.updatedAt || 0,record.updatedAt),
      ...(checkpoint?.positionUpdatedAt ? { position:Math.min(duration,checkpoint.position), positionUpdatedAt:checkpoint.positionUpdatedAt } : {}) };
  }
  function trim() {
    if (Object.keys(records).length > MAX_ITEMS) {
      const oldest = Object.entries(records).sort((a,b) => a[1].updatedAt-b[1].updatedAt)[0][0]; delete records[oldest];
    }
  }
  function read() {
    if (!durable) return;
    try {
      const raw = storage.getItem(key);
      if (!raw) return;
      if (raw.length > MAX_BYTES) throw Error('size');
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !parsed.items || typeof parsed.items !== 'object' || Array.isArray(parsed.items)) throw Error('format');
      const entries = Object.entries(parsed.items);
      if (entries.length > MAX_ITEMS) throw Error('size');
      for (const [id,value] of entries) {
        if (!allowedIds.has(id)) continue;
        const record = normalize(value); if (record) merge(id,record);
      }
    } catch (_) { durable = false; }
  }
  function flush() {
    if (!dirty || !durable) return;
    read(); if (!durable) return;
    try {
      const items = Object.fromEntries(Object.entries(records).sort((a,b) => b[1].updatedAt-a[1].updatedAt).slice(0,MAX_ITEMS));
      const raw = JSON.stringify({ version:1, items });
      if (raw.length > MAX_BYTES) throw Error('size');
      storage.setItem(key,raw); dirty = false;
    } catch (_) { durable = false; }
  }
  read();
  return { key, read, flush, get durable() { return durable; },
    summary(id) { return watchedSummary(records[id]); },
    resume(id) { return records[id]?.position || 0; },
    checkpoint(id, position, duration) {
      if (!allowedIds.has(id) || !validDuration(duration) || !Number.isFinite(position) || position < 0 || position > duration) return false;
      const stamp = Math.max(now(),(records[id]?.positionUpdatedAt || 0)+1);
      merge(id,{ duration, ranges:[], position, positionUpdatedAt:stamp, updatedAt:stamp }); dirty = true; trim();
      return true;
    },
    add(id, start, end, duration) {
      if (!allowedIds.has(id) || !validDuration(duration) || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration) return false;
      merge(id,{ duration, ranges:[[start,end]], updatedAt:now() }); dirty = true;
      trim();
      return true;
    }
  };
}

export function createWatchTracker(record, now = () => performance.now()) {
  let previous = null;
  return {
    reset() { previous = null; },
    sample({ time, duration, rate = 1, playing = false, settle = false, visible = true }) {
      const clock = now();
      if (!visible || !validDuration(duration) || !Number.isFinite(time) || time < 0 || time > duration || !Number.isFinite(rate) || rate <= 0 || rate > 4) { previous = null; return; }
      if (previous && (playing || settle) && previous.rate === rate && previous.duration === duration) {
        const elapsed = (clock-previous.clock)/1000, delta = time-previous.time;
        // A suspended timer, forward/backward seek or speed transition starts a new segment.
        if (elapsed > 0 && elapsed <= 2.5 && delta > 0 && delta <= elapsed*rate + .35) record(previous.time,time,duration);
      }
      previous = playing ? { time,duration,rate,clock } : null;
    }
  };
}
