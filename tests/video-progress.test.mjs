import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVideoProgress, createWatchTracker, watchedSummary, mergeWatchedRanges } from '../video-progress.mjs';
import { getVideoClassCatalog } from '../api/video-class-catalog.mjs';
import { embedSource } from '../video-class-model.mjs';
const memory = () => { const m=new Map(); let writes=0; return {getItem:k=>m.get(k)||null,setItem(k,v){writes++;m.set(k,v);},get writes(){return writes;}}; };
const ids = new Set(['abcdefghijk','bcdefghijkl']);

test('watched coverage unions replays and leaves seek gaps untouched', () => {
  assert.deepEqual(mergeWatchedRanges([[0,10],[5,15],[15,20],[90,100]],100),[[0,20],[90,100]]);
  assert.deepEqual(watchedSummary({duration:100,ranges:[[0,20],[90,100]]}),{known:true,percent:30,seconds:30});
  assert.equal(watchedSummary({duration:100,ranges:[[0,99.5]]}).percent,99);
  assert.equal(watchedSummary({duration:100,ranges:[[0,100]]}).percent,100);
  assert.equal(watchedSummary(null).known,false);
  assert.deepEqual(mergeWatchedRanges([[0,Infinity],['0',30],[-5,4],[99,120]],100),[[0,4],[99,100]]);
});
test('fragment cap discards fragments rather than inventing viewed gaps', () => {
  const ranges=Array.from({length:500},(_,i)=>[i*2,i*2+1]);
  assert.equal(mergeWatchedRanges(ranges,1000).length,128);
  assert.equal(watchedSummary({duration:1000,ranges}).seconds,128);
});
test('local video progress is scoped, durable, bounded and contains no catalog or auth', () => {
  const storage=memory(), a=createVideoProgress(storage,'a:device',ids);
  assert.equal(storage.writes,0);assert.equal(a.summary('abcdefghijk').known,false);
  a.add('abcdefghijk',0,30,100); a.flush(); a.flush();assert.equal(storage.writes,1);
  assert.equal(createVideoProgress(storage,'a:device',ids).summary('abcdefghijk').percent,30);
  assert.equal(createVideoProgress(storage,'b:device',ids).summary('abcdefghijk').known,false);
  assert.equal(a.add('unknown',0,10,100),false);
  for(const args of [[-1,10,100],[0,101,100],[0,1,Infinity],[0,0,100],[NaN,10,100]]) assert.equal(a.add('abcdefghijk',...args),false);
  assert.doesNotMatch(storage.getItem(a.key),/https|token|title|phone|quiz/);
});
test('two tabs merge real viewed ranges before writing and on storage updates', () => {
  const storage=memory(), a=createVideoProgress(storage,'a',ids), b=createVideoProgress(storage,'a',ids);
  a.add('abcdefghijk',0,20,100);b.add('abcdefghijk',50,60,100);a.flush();b.flush();a.read();
  assert.equal(a.summary('abcdefghijk').percent,30);
  a.add('abcdefghijk',0,15,100);a.flush();assert.equal(a.summary('abcdefghijk').percent,30);
});
test('unavailable, corrupt, oversized or full storage remains honest memory-only progress', () => {
  for(const storage of [undefined,{getItem(){throw Error();}},{getItem(){return '{';}}, {getItem(){return 'x'.repeat(1048577);}}, {getItem(){return null;},setItem(){throw Error();}}]) {
    const store=createVideoProgress(storage,'a',ids);store.add('abcdefghijk',0,20,100);store.flush();
    assert.equal(store.durable,false);assert.equal(store.summary('abcdefghijk').percent,20);
  }
});
test('stored metadata validation rejects invalid records and foreign video IDs', () => {
  const storage=memory(), key='magicbook-video-progress-v1:a';
  storage.setItem(key,JSON.stringify({version:1,items:{abcdefghijk:{duration:100,ranges:[[0,20]],updatedAt:1},bcdefghijkl:{duration:-1,ranges:[[0,20]]},unknown:{duration:100,ranges:[[0,100]]}}}));
  const store=createVideoProgress(storage,'a',ids);
  assert.equal(store.summary('abcdefghijk').percent,20);assert.equal(store.summary('bcdefghijkl').known,false);assert.equal(store.summary('unknown').known,false);
});
test('tracker counts only plausible visible playing segments, including correct playback speed', () => {
  let clock=0;const ranges=[],tracker=createWatchTracker((a,b,d)=>ranges.push([a,b,d]),()=>clock);
  const sample=(time,extra={})=>tracker.sample({time,duration:100,playing:true,...extra});
  sample(0);clock+=1000;sample(1);clock+=1000;sample(2);
  clock+=1000;sample(60); // forward seek, not coverage
  clock+=1000;sample(61);clock+=1000;sample(10); // backward seek
  clock+=1000;sample(11,{playing:false,settle:true}); // final second before pause
  clock+=10000;sample(11,{playing:false});clock+=1000;sample(11);
  clock+=1000;sample(12,{visible:false});clock+=1000;sample(13);
  clock+=9000;sample(22); // suspended timer is not assumed viewed
  clock+=1000;sample(23,{rate:2});clock+=1000;sample(25,{rate:2});
  assert.deepEqual(ranges,[[0,1,100],[1,2,100],[60,61,100],[10,11,100],[23,25,100]]);
});
test('buffering, unknown duration, reset and end events never mark the whole video watched', () => {
  let clock=0;const ranges=[],tracker=createWatchTracker((a,b)=>ranges.push([a,b]),()=>clock);
  tracker.sample({time:0,duration:0,playing:true});clock+=1000;
  tracker.sample({time:50,duration:100,playing:true});clock+=1000;
  tracker.sample({time:99,duration:100,playing:false});clock+=1000;
  tracker.sample({time:99,duration:100,playing:true});clock+=1000;
  tracker.sample({time:100,duration:100,playing:false,settle:true});
  assert.deepEqual(ranges,[[99,100]]);tracker.reset();
});
test('source-backed lesson titles clarify theory parts, teachers and duplicate quiz references', () => {
  const {lessons}=getVideoClassCatalog();
  assert.equal(lessons[0].title,'Teoria · Parte 1');assert.equal(lessons[0].sourceTitle,'Lezione 1');
  const complete=lessons.find(x=>x.group==='02');assert.equal(complete.title,'Teoria completa');assert.equal(complete.teacher,'Borhan sir');
  assert.equal(lessons.find(x=>x.id==='TZPZlTNd4IA').title,'Quiz 1 / 2');
  assert.equal(lessons.find(x=>x.id==='MDE8JOh5CPg').title,'Quiz 1 / 5');
  assert.equal(lessons.find(x=>x.id==='uxra5oJQ_FU').title,'Parole del capitolo 1 · Parte 1');
});
test('autoplay is explicit Watch-only; provider API origin and public-cache boundaries remain narrow', () => {
  const lesson={id:'abcdefghijk',provider:'youtube'};
  assert.equal(new URL(embedSource(lesson,'https://test.invalid')).searchParams.get('autoplay'),'0');
  const clicked=new URL(embedSource(lesson,'https://test.invalid',{autoplay:true}));
  assert.equal(clicked.searchParams.get('autoplay'),'1');assert.equal(clicked.searchParams.get('enablejsapi'),'1');
  const read=x=>readFileSync(new URL(`../${x}`,import.meta.url),'utf8');
  const csp=JSON.parse(read('vercel.json')).headers[0].headers.find(x=>x.key==='Content-Security-Policy').value;
  assert.match(csp,/script-src[^;]* https:\/\/www.youtube.com;/);assert.doesNotMatch(csp,/\*\.youtube/);
  for(const file of ['video-player.mjs','video-progress.mjs'])for(const lesson of getVideoClassCatalog().lessons)assert.ok(!read(file).includes(lesson.id));
});
