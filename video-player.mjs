import { createWatchTracker } from './video-progress.mjs?v=2';

let apiPromise;
// One lazy API load per document. Failure is retryable only on the next explicit Watch.
export function loadYouTubeAPI(win = window, doc = document) {
  if (win.YT?.Player) return Promise.resolve(win.YT);
  if (apiPromise) return apiPromise;
  const pending = new Promise((resolve,reject) => {
    const script = doc.createElement('script');
    const previous = win.onYouTubeIframeAPIReady;
    let timer;
    const finish = error => {
      clearTimeout(timer); script.onerror = null;
      if (win.onYouTubeIframeAPIReady === ready) win.onYouTubeIframeAPIReady = previous;
      if (error) { script.remove(); reject(error); } else resolve(win.YT);
    };
    const ready = () => { try { previous?.(); } finally { finish(win.YT?.Player ? null : Error('player_unavailable')); } };
    win.onYouTubeIframeAPIReady = ready;
    script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.onerror = () => finish(Error('player_unavailable'));
    timer = setTimeout(() => finish(Error('player_timeout')),12000);
    doc.head.append(script);
  });
  apiPromise = pending;
  pending.catch(() => { if (apiPromise === pending) apiPromise = null; });
  return pending;
}

export function trackYouTubePlayer({ frame, id, store, isCurrent, changed, ready, failed, blocked, start = 0, loadAPI = loadYouTubeAPI }) {
  let player, stopped = false, broken = false, interval = 0, lastSave = performance.now(), readyTimer;
  let suspended = document.hidden, initialized = false, observedPlayback = false, allowInitialAutoplay = true;
  const tracker = createWatchTracker((start,end,duration) => {
    if (!isCurrent()) return;
    store.add(id,start,end,duration);
  });
  function sample(settle = false) {
    if (stopped || broken || !isCurrent() || !player) { tracker.reset(); clearSampling(); return; }
    try {
      const state = player.getPlayerState(), time = player.getCurrentTime(), duration = player.getDuration();
      if (state === 1) observedPlayback = true;
      // Unstarted/cued provider zeroes must not erase a saved position, including late readiness.
      if (observedPlayback && [0,1,2,3].includes(state)) store.checkpoint(id,state === 0 ? 0 : time,duration);
      tracker.sample({ time, duration, rate:player.getPlaybackRate(), playing:state === 1, settle, visible:!document.hidden && !suspended });
      if (performance.now()-lastSave >= 5000) { store.flush(); lastSave = performance.now(); }
      changed();
    }
    catch (_) { tracker.reset(); }
  }
  function clearSampling() { clearInterval(interval); interval = 0; }
  function fail() {
    if (stopped || broken || !isCurrent()) return;
    broken = true; clearSampling(); tracker.reset(); store.flush(); changed(); clearTimeout(readyTimer); failed();
  }
  function armReadyTimeout() { clearTimeout(readyTimer); if (!initialized && !suspended) readyTimer = setTimeout(fail,15000); }
  function pause() {
    if (stopped || broken || !isCurrent()) return;
    sample(true); suspended = true; allowInitialAutoplay = false; clearSampling(); clearTimeout(readyTimer); tracker.reset(); store.flush();
    try { if (initialized && player.getPlayerState() === 1) player.pauseVideo(); } catch (_) { /* provider unavailable */ }
  }
  armReadyTimeout();
  loadAPI().then(YT => {
    if (stopped || broken || !isCurrent()) return;
    player = new YT.Player(frame, { events:{
      onReady() {
        if (stopped || broken || !isCurrent()) return;
        initialized = true; clearTimeout(readyTimer); ready();
        if (Number.isFinite(start) && start > 0 && start <= 86400) player.seekTo(start,true);
        if (suspended || document.hidden) { pause(); return; }
        if (!allowInitialAutoplay) { player.pauseVideo(); return; }
        // Constructed only after the learner's Watch gesture, never on route entry.
        if (player.getPlayerState() !== 1) player.playVideo();
        else { sample(); clearSampling(); interval = setInterval(() => sample(),1000); }
      },
      onStateChange(event) {
        if (stopped || broken || !isCurrent()) return;
        clearSampling();
        if (event.data === 1 && (suspended || document.hidden)) { pause(); return; }
        if (event.data === 1 && !document.hidden) { sample(); interval = setInterval(() => sample(),1000); }
        else { sample(event.data === 0 || event.data === 2); tracker.reset(); store.flush(); changed(); }
      },
      onPlaybackRateChange() { tracker.reset(); sample(); },
      onError:fail,
      onAutoplayBlocked() { if (!stopped && isCurrent()) blocked?.(); }
    } });
  }).catch(fail);
  return { pause, foreground() {
    if (stopped || broken || !isCurrent() || document.hidden) return;
    suspended = false; tracker.reset(); armReadyTimeout(); // Deliberately do not autoplay on return.
  }, stop() {
    if (stopped) return;
    sample(); store.flush(); stopped = true; clearSampling(); clearTimeout(readyTimer); tracker.reset();
    try { player?.destroy(); } catch (_) { /* detached frame */ }
  } };
}
