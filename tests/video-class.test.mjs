import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getVideoClassCatalog, VIDEO_SOURCE_ENTRIES, default as privateModule } from '../api/video-class-catalog.mjs';
import { createVideoFavorites, createVideoCatalogReader, embedSource, videoPath, selectVideoLessons, supportsVideoEmbed } from '../video-class-model.mjs';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const catalog = getVideoClassCatalog();

test('old native shells get an explicit external player, browsers and video-capable shells embed', () => {
  assert.equal(supportsVideoEmbed('Mozilla/5.0 Chrome/130'), true);
  assert.equal(supportsVideoEmbed('MagicBookViewer/1.3'), false);
  assert.equal(supportsVideoEmbed('MagicBookViewer/1.3 MagicBookVideo/1'), true);
  assert.equal(supportsVideoEmbed('MagicBookViewer/1.3 MagicBookVideo/10'), false);
});

test('source audit: all 174 YouTube occurrences retain exact identity and source order; eight duplicates become aliases', () => {
  const expected = JSON.parse(read('docs/video-class-source-ids.json')).youtubeIds;
  assert.deepEqual(VIDEO_SOURCE_ENTRIES.filter(x => !x.id.startsWith('facebook-')).map(x => x.id), expected);
  assert.equal(catalog.lessons.length, 167);
  assert.equal(catalog.lessons.filter(x => x.provider === 'youtube').length, 166);
  assert.equal(catalog.lessons.reduce((n,x) => n + x.aliases.length, 0), 8);
  assert.equal(catalog.resources.length, 2);
  assert.equal(catalog.groups.length, 27);
  assert.equal(catalog.groups.find(x => x.id === '22').title, 'Primo soccorso');
  assert.equal(catalog.lessons.find(x => x.id === 'Sa4oMMmQ3EU').minutes, undefined, 'ambiguous trailing duration is not assigned');
  for (const lesson of catalog.lessons) {
    assert.ok(catalog.groups.some(x => x.id === lesson.group));
    if (lesson.provider === 'youtube') assert.match(lesson.id, /^[a-zA-Z0-9_-]{11}$/);
    assert.doesNotMatch(lesson.url, /\s|\?si=/);
  }
});
test('routes, filters and provider isolation reject unsupported player sources', () => {
  assert.equal(embedSource({ id: '../bad', provider: 'youtube' }, 'https://test.invalid'), '');
  assert.equal(embedSource(catalog.lessons.find(x => x.provider === 'facebook'), 'https://test.invalid'), '');
  const src = new URL(embedSource(catalog.lessons[0], 'https://test.invalid/private?token=secret'));
  assert.equal(src.origin, 'https://www.youtube-nocookie.com');
  assert.equal(src.searchParams.get('autoplay'), '0');
  assert.equal(src.searchParams.get('origin'), 'https://test.invalid');
  assert.doesNotMatch(videoPath({ group: '../x', lesson:'<script>' }), /script|\.\./);
  assert.equal(selectVideoLessons(catalog, { saved:true }, []).length, 0);
  assert.equal(selectVideoLessons(catalog, { group:'01', kind:'quiz' }).length,4);
});
const memoryStorage = () => { const map = new Map(); return { getItem:k=>map.get(k) || null, setItem:(k,v)=>map.set(k,v) }; };
test('favorites persist IDs only, toggle, merge other tabs, isolate accounts and reject unknown IDs', () => {
  const store = memoryStorage(), ids = new Set(catalog.lessons.map(x=>x.id));
  const a = createVideoFavorites(store,'a:device',ids), secondTab = createVideoFavorites(store,'a:device',ids);
  a.toggle(catalog.lessons[0].id); secondTab.toggle(catalog.lessons[1].id);
  assert.equal(a.read().length, 2);
  a.toggle(catalog.lessons[0].id); assert.deepEqual(a.values(), [catalog.lessons[1].id]);
  a.toggle('unknown'); assert.equal(a.values().length,1);
  assert.equal(createVideoFavorites(store,'b:device',ids).values().length,0);
  assert.doesNotMatch(store.getItem(a.key), /https|token|title|phone/);
});
test('storage unavailable/corrupt/quota remain honest usable memory-only favorites', () => {
  const ids = new Set(['abcdefghijk']);
  for (const storage of [undefined, {getItem(){throw Error();},setItem(){throw Error();}}, {getItem(){return '{';},setItem(){throw Error();}}]) {
    const favorite = createVideoFavorites(storage, 'a', ids);
    favorite.toggle('abcdefghijk'); assert.equal(favorite.durable,false); assert.deepEqual(favorite.values(), ['abcdefghijk']);
    favorite.toggle('abcdefghijk'); assert.deepEqual(favorite.values(), []);
  }
});
test('catalogue read budget: deduplicate, cache for five minutes, invalidate identity, no polling', async () => {
  let calls=0, scope='a', now=1000;
  const reader=createVideoCatalogReader(async()=>{calls++;return {catalog};},()=>scope,()=>now);
  await Promise.all([reader.read(),reader.read()]); await reader.read(); assert.equal(calls,1);
  now+=300000; await reader.read(); assert.equal(calls,2);
  scope='b'; await reader.read(); assert.equal(calls,3);
  scope=''; await assert.rejects(reader.read(),/unauthorized/); assert.equal(calls,3); reader.clear();
});
test('catalogue rejects stale/aborted data, failed response not cached, explicit retry only', async () => {
  let release, calls=0;
  const reader=createVideoCatalogReader(()=>{calls++; return new Promise(r=>{release=r;});},()=>'a');
  const pending=reader.read(); await Promise.resolve(); reader.cancel(); release({catalog});
  await assert.rejects(pending,{name:'AbortError'});
  const retry=reader.read(); await Promise.resolve(); release({catalog}); await retry; assert.equal(calls,2); reader.clear();
});
test('catalogue timeout aborts once; no timer-driven retry', async t => {
  let deadline, cleared=0, calls=0;
  t.mock.method(globalThis,'setTimeout',(cb,ms)=>{assert.equal(ms,12000);deadline=cb;return 1;});
  t.mock.method(globalThis,'clearTimeout',()=>{cleared++;});
  const reader=createVideoCatalogReader(({signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Timed out','AbortError'))));},()=>'a');
  const pending=reader.read(); await Promise.resolve(); deadline(); await assert.rejects(pending,{name:'AbortError'});
  assert.equal(calls,1);assert.equal(cleared,1); reader.clear();
});
test('server catalogue uses established device-bound authorization, is never publicly cacheable and adds zero upstream reads for signed users', async t => {
  const env={SESSION_SECRET:'video-catalog-test',GAS_ACCESS_URL:'https://fixture.invalid',GAS_SECRET:'fixture',QUIZ_GAS_URL:'https://fixture.invalid',QUIZ_PROXY_SECRET:'fixture'};
  for(const [key,value] of Object.entries(env)){const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}
  t.mock.method(globalThis,'fetch',()=>assert.fail('unexpected network read'));
  const {default:handler}=await import(`../api/quiz.js?video=${crypto.randomUUID()}`);
  const phone='39123456789',deviceId='video-test-device';
  const payload=Buffer.from(JSON.stringify({phone,deviceId,purpose:'access',role:'user',exp:Date.now()+60000})).toString('base64url');
  const token=`${payload}.${crypto.createHmac('sha256',env.SESSION_SECRET).update(payload).digest('base64url')}`;
  const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.body=v;return this;},end(){return this;}});
  const res=response();await handler({method:'GET',query:{action:'getVideoClasses',phone,deviceId},headers:{authorization:`Bearer ${token}`}},res);
  assert.equal(res.code,200);assert.equal(res.body.catalog.lessons.length,167);assert.match(res.headers['Cache-Control'],/no-store/);
  assert.equal(res.headers['Vercel-CDN-Cache-Control'],'no-store');
  t.mock.method(globalThis,'fetch',async()=>Response.json({success:false,error:'device_mismatch'}));
  const denied=response(); await handler({method:'GET',query:{action:'getVideoClasses',phone,deviceId:'another-device'},headers:{authorization:`Bearer ${token}`}},denied);
  assert.equal(denied.code,403);assert.equal(denied.body.catalog,undefined);
  const direct=response();privateModule({},direct);assert.equal(direct.code,404);assert.equal(direct.body,undefined);
});
test('only authorized catalogue response carries unlisted links; browser assets and worker do not contain IDs', () => {
  for (const file of ['video-class.js','video-class-model.mjs','study-quiz.html','service-worker.js']) {
    const content=read(file);
    for(const item of catalog.lessons) assert.ok(!content.includes(item.id),file);
  }
  assert.match(read('vercel.json'),/frame-src[^;]*https:\/\/www\.youtube-nocookie\.com;/);
  assert.doesNotMatch(read('api/trial.js'),/getVideoClasses/);
});
