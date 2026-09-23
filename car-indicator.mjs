// Owner-supplied arrow and recording. Timings are measured from the original MP3,
// not independent CSS keyframes: both the lamp and sound use the audio clock.
export const INDICATOR_SOUND = '/assets/car-indicator.mp3?v=1';
export const INDICATOR_DURATION = 1.32;
export const INDICATOR_PREPARE_MS = 400;
export const INDICATOR_PLAYBACK_GUARD_MS = 4000;
export const INDICATOR_PATH = 'M21 12L14 5V9H3.8C3.51997 9 3.37996 9 3.273 9.0545C3.17892 9.10243 3.10243 9.17892 3.0545 9.273C3 9.37996 3 9.51997 3 9.8V14.2C3 14.48 3 14.62 3.0545 14.727C3.10243 14.8211 3.17892 14.8976 3.273 14.9455C3.37996 15 3.51997 15 3.8 15H14V19L21 12Z';
export function indicatorLit(seconds) {
  return (seconds >= .085 && seconds < .423) || (seconds >= .781 && seconds < 1.119);
}
export function carIndicatorIcon(doc = document) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '24', height: '24', fill: 'none', class: 'car-indicator', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
  for (const outline of [false, true]) {
    const path = doc.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', INDICATOR_PATH);
    path.setAttribute('class', outline ? 'car-indicator-outline' : 'car-indicator-fill');
    if (outline) for (const [key, value] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) path.setAttribute(key, value);
    svg.append(path);
  }
  return svg;
}

export function createCarIndicator({ doc = document, win = window, isCurrent = () => true, announce = () => {} } = {}) {
  const lifetime = new AbortController();
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const contrast = win.matchMedia('(forced-colors: active)');
  let active = null, context = null, buffer = null, unavailable = false, destroyed = false;
  const staticMode = () => reduced.matches || contrast.matches || doc.documentElement.hasAttribute('data-native-motion-paused');
  function storedPause() {
    try { return doc.documentElement.classList.contains('android-webview') && win.localStorage.getItem('native-study-motion-paused') === '1'; } catch { return false; }
  }
  function clean(run) {
    win.clearTimeout(run.prepareTimer); win.clearTimeout(run.deadline);
    win.cancelAnimationFrame(run.frame); run.request.abort();
    if (run.source) { run.source.onended = null; try { run.source.stop(); } catch {} run.source.disconnect(); }
    run.gain?.disconnect();
    for (const name of ['aria-busy', 'aria-disabled', 'data-car-pending', 'data-car-lit']) run.trigger.removeAttribute(name);
    // Retain just the public decoded clip; suspend the device audio engine at rest.
    if (context?.state === 'running') void context.suspend().catch(() => {});
  }
  function cancel() {
    if (!active) return;
    const run = active; active = null; clean(run); announce('');
  }
  function finish(run) {
    if (active !== run) return;
    const allowed = !destroyed && !doc.hidden && run.trigger.isConnected && isCurrent();
    active = null; clean(run); announce('');
    if (allowed) run.open();
  }
  function silent(run) {
    if (active !== run || run.started) return;
    run.request.abort(); run.started = true; run.origin = win.performance.now();
    run.clock = () => (win.performance.now() - run.origin) / 1000;
    win.clearTimeout(run.prepareTimer);
    playbackDeadline(run);
  }
  function playbackDeadline(run) {
    // Device-engine startup can block the first click's task. Give the actual
    // playback its own bounded window, so that startup never cuts cycle two.
    win.clearTimeout(run.deadline);
    run.deadline = win.setTimeout(() => finish(run), INDICATOR_PLAYBACK_GUARD_MS);
  }
  function draw(run) {
    if (active !== run) return;
    if (doc.hidden || !run.trigger.isConnected || !isCurrent()) { cancel(); return; }
    if (staticMode()) { finish(run); return; }
    if (run.started) {
      // If the OS suspends audio mid-effect, finish quietly instead of stalling.
      if (run.source && context.state !== 'running') { finish(run); return; }
      const elapsed = run.clock();
      if (run.source) {
        if (elapsed > (run.lastAudioTime ?? -1)) { run.lastAudioTime = elapsed; run.lastAdvance = win.performance.now(); }
        else if (win.performance.now() - run.lastAdvance > 400) { finish(run); return; }
      }
      const lit = String(indicatorLit(elapsed));
      if (run.trigger.getAttribute('data-car-lit') !== lit) run.trigger.setAttribute('data-car-lit', lit);
      if (elapsed >= INDICATOR_DURATION) { finish(run); return; }
    }
    run.frame = win.requestAnimationFrame(() => draw(run));
  }
  async function prepare(run) {
    try {
      const AudioContext = win.AudioContext || win.webkitAudioContext;
      if (unavailable || !AudioContext) { silent(run); return; }
      context ||= new AudioContext();
      // resume() must be called synchronously within the user's click/Enter.
      const resumed = context.resume();
      const decoded = buffer ? Promise.resolve(buffer) : win.fetch(INDICATOR_SOUND, { signal: run.request.signal, cache: 'force-cache' })
        .then(response => { if (!response.ok) throw new Error('indicator unavailable'); return response.arrayBuffer(); })
        .then(bytes => context.decodeAudioData(bytes));
      const [, audio] = await Promise.all([resumed, decoded]);
      if (active !== run || run.started || run.request.signal.aborted) {
        if (!active && context?.state === 'running') void context.suspend().catch(() => {});
        return;
      }
      if (context.state !== 'running' || audio.duration < INDICATOR_DURATION) throw new Error('indicator unavailable');
      buffer = audio;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = audio; gain.gain.value = .45;
      source.connect(gain); gain.connect(context.destination);
      run.source = source; run.gain = gain; run.started = true;
      const origin = context.currentTime;
      run.clock = () => context.currentTime - origin;
      source.onended = () => finish(run);
      source.start(origin, 0, INDICATOR_DURATION);
      win.clearTimeout(run.prepareTimer);
      playbackDeadline(run);
    } catch (_) {
      if (active !== run || run.request.signal.aborted) return;
      unavailable = true; silent(run); // Decoration never blocks the real route.
    }
  }
  function start(trigger, open) {
    if (destroyed || active || doc.hidden || !isCurrent()) return false;
    if (staticMode() || storedPause()) { open(); return true; }
    const run = { trigger, open, request: new AbortController(), started: false };
    active = run;
    for (const name of ['aria-busy', 'aria-disabled', 'data-car-pending']) trigger.setAttribute(name, 'true');
    trigger.setAttribute('data-car-lit', 'false');
    announce('Apro il capitolo…');
    run.prepareTimer = win.setTimeout(() => silent(run), INDICATOR_PREPARE_MS);
    run.deadline = win.setTimeout(() => finish(run), INDICATOR_PREPARE_MS + INDICATOR_PLAYBACK_GUARD_MS);
    void prepare(run);
    draw(run);
    return true;
  }
  const options = { signal: lifetime.signal };
  win.addEventListener('pagehide', cancel, options);
  win.addEventListener('popstate', cancel, options);
  win.addEventListener('keydown', event => { if (active && event.key === 'Escape') { event.preventDefault(); cancel(); } }, options);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) cancel(); }, options);
  const motionChanged = () => { if (active && staticMode()) finish(active); };
  reduced.addEventListener('change', motionChanged, options);
  contrast.addEventListener('change', motionChanged, options);
  return { start, cancel, get pending() { return Boolean(active); }, destroy() {
    destroyed = true; cancel(); lifetime.abort(); buffer = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    context = null;
  } };
}
