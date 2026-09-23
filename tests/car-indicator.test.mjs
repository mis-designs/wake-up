import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCarIndicator, indicatorLit, INDICATOR_SOUND, INDICATOR_DURATION } from '../car-indicator.mjs';

const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
function fixture({ reduced = false, contrast = false, denied = false, slow = false, nativePause = false, engineStartup = 0, frozenAudio = false } = {}) {
  let now = 0, id = 0, opened = 0, reads = 0, current = true, plays = 0, stops = 0, requestSignal;
  const timers = new Map(), frames = new Map(), attrs = new Map(), messages = [], lamps = [];
  const doc = Object.assign(new EventTarget(), { hidden: false, documentElement: { hasAttribute: () => false, classList: { contains: () => nativePause } } });
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const trigger = { isConnected: true, setAttribute(key, value) { attrs.set(key, value); if (key === 'data-car-lit') lamps.push([now,value]); }, removeAttribute: key => attrs.delete(key), getAttribute: key => attrs.get(key) };
  const win = Object.assign(new EventTarget(), {
    performance: { now: () => now }, localStorage: { getItem: () => nativePause ? '1' : null },
    matchMedia: query => query.includes('reduced') ? media : Object.assign(new EventTarget(), { matches: contrast }),
    setTimeout(fn, delay) { timers.set(++id, { at: now + delay, fn }); return id; }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
    fetch: (url, { signal }) => { reads++; requestSignal = signal; assert.equal(url, INDICATOR_SOUND); return slow ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) }); },
    AudioContext: class {
      constructor() { now += engineStartup; }
      state = 'suspended'; destination = {};
      get currentTime() { return frozenAudio ? 0 : now / 1000; }
      resume() { if (denied) return Promise.reject(new Error('blocked')); this.state = 'running'; return Promise.resolve(); }
      suspend() { this.state = 'suspended'; return Promise.resolve(); }
      close() { this.state = 'closed'; return Promise.resolve(); }
      decodeAudioData() { return Promise.resolve({ duration: 9.6 }); }
      createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
      createBufferSource() { return { connect() {}, disconnect() {}, start(at, offset, duration) { assert.equal(offset,0); assert.equal(duration,INDICATOR_DURATION); plays++; }, stop() { stops++; } }; }
    }
  });
  const cue = createCarIndicator({ doc, win, isCurrent: () => current, announce: text => messages.push(text) });
  const step = async ms => {
    now += ms;
    for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.fn(); }
    const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); await flush();
  };
  return { cue, doc, win, media, trigger, attrs, lamps, messages, step,
    start: () => cue.start(trigger, () => opened++), invalidate: () => { current = false; },
    state: () => ({ opened, reads, plays, stops, aborted: requestSignal?.aborted, timers: timers.size, frames: frames.size }) };
}

test('only two green intervals match the first two tic-tac pairs of the supplied recording', () => {
  for (const [time, lit] of [[0,false],[.085,true],[.422,true],[.423,false],[.780,false],[.781,true],[1.118,true],[1.119,false],[1.32,false]]) assert.equal(indicatorLit(time),lit);
});
test('click gates duplicates, synchronizes fill to audio time and opens exactly once after two cycles', async () => {
  const f = fixture(); assert.equal(f.start(),true); assert.equal(f.start(),false); await flush();
  assert.equal(f.attrs.get('aria-busy'),'true'); assert.equal(f.state().plays,1);
  for (const delta of [90,340,360,340,200]) await f.step(delta);
  assert.deepEqual(f.lamps.map(x=>x[1]),['false','true','false','true','false']);
  assert.equal(f.state().opened,1); assert.equal(f.state().stops,1); assert.equal(f.attrs.size,0);
  assert.equal(f.state().timers,0); assert.equal(f.state().frames,0);
  f.start(); await flush(); assert.equal(f.state().reads,1,'decoded public audio reused, never per card'); f.cue.destroy();
});
test('blocked audio uses finite silent feedback without retry or navigation failure', async () => {
  const f = fixture({denied:true}); f.start(); await flush(); await f.step(1330);
  assert.equal(f.state().opened,1); assert.equal(f.state().plays,0);
  f.start(); await flush(); assert.equal(f.state().reads,1); await f.step(1330); assert.equal(f.state().opened,2); f.cue.destroy();
});
test('slow first device-engine initialization cannot truncate the second audible cycle', async () => {
  const f=fixture({engineStartup:750});f.start();await flush();await f.step(1200);
  assert.equal(f.state().opened,0);assert.equal(f.attrs.get('data-car-lit'),'false');
  await f.step(130);assert.equal(f.state().opened,1);assert.equal(f.state().plays,1);f.cue.destroy();
});
test('a stalled device audio clock does not strand navigation in the busy state', async () => {
  const f=fixture({frozenAudio:true});f.start();await flush();await f.step(16);await f.step(401);
  assert.equal(f.state().opened,1);assert.equal(f.state().stops,1);assert.equal(f.attrs.size,0);f.cue.destroy();
});
test('slow audio is aborted at the preparation bound; silent navigation remains finite', async () => {
  const f = fixture({slow:true}); f.start(); await f.step(400); assert.equal(f.state().aborted,true);
  await f.step(1330); assert.equal(f.state().opened,1); assert.equal(f.state().plays,0); f.cue.destroy();
});
for (const [name, options] of [['reduced motion',{reduced:true}],['forced colors',{contrast:true}],['native Profile pause',{nativePause:true}]]) test(`${name}: immediate navigation, no audio request or blink`, () => {
  const f = fixture(options); f.start(); assert.equal(f.state().opened,1); assert.equal(f.state().reads,0); assert.equal(f.attrs.size,0); f.cue.destroy();
});
for (const event of ['pagehide','popstate','visibilitychange','Escape']) test(`${event} cancels pending sound and navigation`, async () => {
  const f = fixture(); f.start(); await flush();
  if(event==='visibilitychange') { f.doc.hidden=true; f.doc.dispatchEvent(new Event(event)); }
  else if(event==='Escape') f.win.dispatchEvent(Object.assign(new Event('keydown'),{key:'Escape'}));
  else f.win.dispatchEvent(new Event(event));
  await f.step(2500); assert.equal(f.state().opened,0); assert.equal(f.state().stops,1); assert.equal(f.attrs.size,0); assert.equal(f.state().timers,0); f.cue.destroy();
});
test('changed identity and a detached card cannot trigger delayed navigation', async () => {
  for (const invalidate of [f=>f.invalidate(),f=>{f.trigger.isConnected=false;}]) {
    const f=fixture();f.start();await flush();invalidate(f);await f.step(90);await f.step(2000);assert.equal(f.state().opened,0);assert.equal(f.cue.pending,false);f.cue.destroy();
  }
});
test('destroy aborts slow work and removes global listeners; motion changes skip the remaining effect', async () => {
  const f=fixture({slow:true});f.start();f.cue.destroy();await f.step(2500);assert.equal(f.state().opened,0);assert.equal(f.state().aborted,true);assert.equal(f.start(),false);
  const g=fixture();g.start();await flush();g.media.matches=true;g.media.dispatchEvent(new Event('change'));assert.equal(g.state().opened,1);assert.equal(g.state().stops,1);g.cue.destroy();
});
test('the same original path has independent fill/outline and one scoped shared owner', () => {
  const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
  assert.match(read('car-indicator.mjs'),/for \(const outline of \[false, true\]\)/);
  assert.match(read('car-indicator.css'),/\.car-indicator-outline \{ fill: none; stroke: currentColor;/);
  assert.match(read('video-class.js'),/carIndicatorIcon\(\)/);
  assert.match(read('video-class.js'),/indicator\.start\(a, \(\) => navigate/);
  assert.match(read('study-quiz.html'),/car-indicator\.css\?v=1/);
  assert.match(read('service-worker.js'),/car-indicator\.mjs\?v=1/);
  assert.doesNotMatch(read('service-worker.js').split('];')[0],/car-indicator\.mp3/,'no eager audio precache');
  assert.ok(readFileSync(new URL('../icons/car_strument/car_indicator_sound.mp3',import.meta.url)).length<250000);
});
test('the lightweight two-cycle MP3 contains unchanged frames from the supplied original', () => {
  const original=readFileSync(new URL('../icons/car_strument/car_indicator_sound.mp3',import.meta.url));
  const clip=readFileSync(new URL('../assets/car-indicator.mp3',import.meta.url));
  assert.equal(clip.subarray(0,3).toString(),'ID3');
  const header=10+(clip[6]<<21)+(clip[7]<<14)+(clip[8]<<7)+clip[9];
  assert.ok(clip.length<30000);assert.deepEqual(clip.subarray(header),original.subarray(0,clip.length-header));
});
