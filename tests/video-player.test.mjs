import test from 'node:test';
import assert from 'node:assert/strict';
import { trackYouTubePlayer } from '../video-player.mjs';

function clockFixture(t) {
  const timeouts=new Map(),intervals=new Map();let next=0,clock=0;
  t.mock.method(globalThis,'setTimeout',(f,ms)=>{timeouts.set(++next,{f,ms});return next;});
  t.mock.method(globalThis,'clearTimeout',id=>timeouts.delete(id));
  t.mock.method(globalThis,'setInterval',(f,ms)=>{intervals.set(++next,{f,ms});return next;});
  t.mock.method(globalThis,'clearInterval',id=>intervals.delete(id));
  t.mock.method(performance,'now',()=>clock);
  const original=globalThis.document;globalThis.document={hidden:false};
  t.after(()=>{if(original===undefined)delete globalThis.document;else globalThis.document=original;});
  return {timeouts,intervals,advance(ms){clock+=ms;for(const {f} of [...intervals.values()])f();}};
}
function playerFixture() {
  let instance;const calls={add:[],checkpoints:[],flush:0,changed:0,ready:0,failed:0,blocked:0};
  const YT={Player:class {
    constructor(frame,{events}){instance=this;this.events=events;this.state=-1;this.time=0;this.rate=1;this.plays=0;}
    getCurrentTime(){return this.time;} getDuration(){return 100;} getPlaybackRate(){return this.rate;} getPlayerState(){return this.state;}
    playVideo(){this.plays++;this.state=1;this.events.onStateChange({data:1});}
    pauseVideo(){this.state=2;this.events.onStateChange({data:2});}
    seekTo(time){this.time=time;}
    destroy(){this.destroyed=true;}
  }};
  return {YT,calls,get instance(){return instance;},options:{frame:{},id:'abcdefghijk',store:{add(...a){calls.add.push(a);},checkpoint(...a){calls.checkpoints.push(a);},flush(){calls.flush++;}},isCurrent:()=>true,changed(){calls.changed++;},ready(){calls.ready++;},failed(){calls.failed++;},blocked(){calls.blocked++;},loadAPI:()=>Promise.resolve(YT)}};
}
test('one-click player starts once, samples locally, batches saves and stops cleanly',async t=>{
  const clock=clockFixture(t),fixture=playerFixture();
  const playback=trackYouTubePlayer(fixture.options);await Promise.resolve();const p=fixture.instance;
  p.events.onReady();assert.equal(p.plays,1);assert.equal(clock.intervals.size,1);assert.equal(clock.timeouts.size,0);
  for(let i=1;i<=6;i++){p.time=i;clock.advance(1000);}
  assert.equal(fixture.calls.add.length,6);assert.equal(fixture.calls.flush,1);
  p.state=2;p.events.onStateChange({data:2});assert.equal(clock.intervals.size,0);assert.equal(fixture.calls.flush,2);
  playback.stop();playback.stop();assert.ok(p.destroyed);assert.equal(clock.intervals.size,0);
  p.events.onStateChange({data:1});assert.equal(clock.intervals.size,0);
});
test('late API resolution after navigation creates no player or timer',async t=>{
  const clock=clockFixture(t),fixture=playerFixture();let resolve;
  const playback=trackYouTubePlayer({...fixture.options,loadAPI:()=>new Promise(r=>{resolve=r;})});
  playback.stop();resolve(fixture.YT);await Promise.resolve();
  assert.equal(fixture.instance,undefined);assert.equal(clock.timeouts.size,0);assert.equal(clock.intervals.size,0);
});
test('provider error and obsolete identity stop sampling without erasing watched data',async t=>{
  const clock=clockFixture(t),fixture=playerFixture();let current=true;
  const playback=trackYouTubePlayer({...fixture.options,isCurrent:()=>current});await Promise.resolve();
  const p=fixture.instance;p.events.onReady();p.time=1;clock.advance(1000);
  current=false;p.time=2;clock.advance(1000);assert.equal(clock.intervals.size,0);assert.equal(fixture.calls.add.length,1);
  current=true;p.events.onError();assert.equal(fixture.calls.failed,1);
  p.events.onStateChange({data:1});assert.equal(clock.intervals.size,0);playback.stop();
});
test('failed/timeout API has one recovery message, no automatic retry or false progress',async t=>{
  const clock=clockFixture(t),fixture=playerFixture();let calls=0;
  const playback=trackYouTubePlayer({...fixture.options,loadAPI:()=>{calls++;return Promise.reject(Error('offline'));}});
  await Promise.resolve();await Promise.resolve();assert.equal(fixture.calls.failed,1);assert.equal(calls,1);
  assert.equal(clock.timeouts.size,0);assert.equal(fixture.calls.add.length,0);playback.stop();
});
test('blocked autoplay keeps the player controls and explains the required gesture',async t=>{
  clockFixture(t);const fixture=playerFixture(),playback=trackYouTubePlayer(fixture.options);await Promise.resolve();
  fixture.instance.events.onAutoplayBlocked();assert.equal(fixture.calls.blocked,1);assert.equal(fixture.calls.add.length,0);playback.stop();
});
test('official API script is lazy, deduplicated, bounded and explicitly retryable after failure',async t=>{
  const clock=clockFixture(t);const {loadYouTubeAPI}=await import('../video-player.mjs?loader-test');
  const scripts=[],win={},doc={createElement:()=>({remove(){this.removed=true;}}),head:{append(s){scripts.push(s);}}};
  const a=loadYouTubeAPI(win,doc),b=loadYouTubeAPI(win,doc);assert.equal(a,b);assert.equal(scripts.length,1);
  assert.equal(scripts[0].src,'https://www.youtube.com/iframe_api');
  const failure=assert.rejects(a,/player_timeout/);[...clock.timeouts.values()][0].f();await failure;
  assert.ok(scripts[0].removed);assert.equal(scripts.length,1);
  const retry=loadYouTubeAPI(win,doc);assert.equal(scripts.length,2);win.YT={Player:class{}};win.onYouTubeIframeAPIReady();
  assert.equal(await retry,win.YT);await loadYouTubeAPI(win,doc);assert.equal(scripts.length,2);assert.equal(clock.timeouts.size,0);
});

test('notification shade pauses and checkpoints the same player; returning never autoplays',async t=>{
  const clock=clockFixture(t),fixture=playerFixture(),playback=trackYouTubePlayer(fixture.options);
  await Promise.resolve();const p=fixture.instance;p.events.onReady();p.time=12.75;
  document.hidden=true;playback.pause();
  assert.equal(p.destroyed,undefined);assert.equal(p.state,2);assert.equal(clock.intervals.size,0);
  assert.deepEqual(fixture.calls.checkpoints.at(-1),['abcdefghijk',12.75,100]);
  const coverage=fixture.calls.add.length;clock.advance(30000);
  document.hidden=false;playback.foreground();assert.equal(p.plays,1);assert.equal(fixture.calls.add.length,coverage);
  p.playVideo();p.time=13.75;clock.advance(1000);assert.equal(fixture.calls.add.length,coverage+1);playback.stop();
});
test('forward and backward seeks save the real position without crediting skipped minutes',async t=>{
  const clock=clockFixture(t),fixture=playerFixture(),playback=trackYouTubePlayer({...fixture.options,start:25.5});
  await Promise.resolve();const p=fixture.instance;p.events.onReady();assert.equal(p.time,25.5);
  p.time=80;clock.advance(1000);assert.equal(fixture.calls.add.length,0);assert.equal(fixture.calls.checkpoints.at(-1)[1],80);
  p.time=4;playback.stop();assert.equal(fixture.calls.checkpoints.at(-1)[1],4);assert.equal(fixture.calls.add.length,0);
});
test('late readiness in background keeps resume position and cannot start playback',async t=>{
  const clock=clockFixture(t),fixture=playerFixture(),playback=trackYouTubePlayer({...fixture.options,start:42});
  playback.pause();await Promise.resolve();const p=fixture.instance;p.events.onReady();
  assert.equal(p.time,42);assert.equal(p.plays,0);assert.equal(fixture.calls.checkpoints.length,0);assert.equal(clock.timeouts.size,0);
  playback.foreground();assert.equal(p.plays,0);p.playVideo();p.time=43;clock.advance(1000);
  assert.equal(fixture.calls.checkpoints.at(-1)[1],43);playback.stop();
});
test('ended resets only resume; stale identity cannot write a new checkpoint',async t=>{
  clockFixture(t);const fixture=playerFixture();let current=true;
  const playback=trackYouTubePlayer({...fixture.options,isCurrent:()=>current});await Promise.resolve();const p=fixture.instance;p.events.onReady();
  p.time=100;p.state=0;p.events.onStateChange({data:0});assert.equal(fixture.calls.checkpoints.at(-1)[1],0);assert.equal(fixture.calls.add.length,0);
  const n=fixture.calls.checkpoints.length;current=false;p.time=10;playback.stop();assert.equal(fixture.calls.checkpoints.length,n);
});

test('leaving and returning before the API is ready does not revive the original autoplay request',async t=>{
  clockFixture(t);const fixture=playerFixture();let resolve;
  const playback=trackYouTubePlayer({...fixture.options,start:24,loadAPI:()=>new Promise(r=>{resolve=r;})});
  playback.pause();playback.foreground();resolve(fixture.YT);await Promise.resolve();
  const p=fixture.instance;p.events.onReady();assert.equal(p.plays,0);assert.equal(p.state,2);assert.equal(fixture.calls.checkpoints.length,0);
  p.playVideo();assert.equal(p.time,24);assert.equal(p.plays,1);playback.stop();
});
