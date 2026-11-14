import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCatalog,readGalleryRecords} from '../lib/video-gallery.mjs';
import {createRequire}from'node:module';
const require=createRequire(import.meta.url),{identity}=require('../lib/quiz-video.cjs');
test('coverage preserves references but deduplicates shared videos by answer and figure',()=>{
 const row={id:'1',chapter:1,question:'La strada è libera',correct:1,figure:'12'};
 const rows=buildCatalog([row],[{...row,id:'2'}],[{...row,id:'qb',sheet:4},{...row,id:'other',correct:0}]);
 assert.equal(rows.length,2);assert.equal(rows[0].refs.length,3);assert.equal(rows[1].refs.length,1);
 assert.equal(buildCatalog([row],[{...row,figure:'13'}],[]).length,2);
});
test('archive paginates, ignores partial uploads and excludes deletion tombstones',async()=>{
 const a='a'.repeat(64),b='b'.repeat(64),calls=[];
 const storage={send:async cmd=>{const x=cmd.input;calls.push(x);
 if(cmd.constructor.name==='ListObjectsV2Command')return x.ContinuationToken?{Contents:[{Key:`xyz3d/quiz-v1/${b}/current.json`}]}:{IsTruncated:true,NextContinuationToken:'next',Contents:[{Key:`xyz3d/quiz-v1/${a}/current.json`},{Key:`xyz3d/quiz-v1/${a}/pending.json`}]};
 const key=x.Key.split('/')[2];return{ETag:'etag',Body:{transformToString:async()=>JSON.stringify({key,objectKey:`xyz3d/quiz-v1/${key}/00000000-0000-4000-8000-000000000000.mp4`,deleted:key===b})}};
 }};
 const records=await readGalleryRecords(storage,'test',new AbortController().signal);
 assert.equal(records.size,1);assert.ok(records.has(a));assert.equal(calls.length,4);
});
test('storage errors are not converted into zero progress',async()=>{
 await assert.rejects(readGalleryRecords({send:async()=>{throw Error('denied');}},'test'),/denied/);
 const c=new AbortController();c.abort();let calls=0;
 await assert.rejects(readGalleryRecords({send:async()=>{calls++;}},'test',c.signal));assert.equal(calls,0);
});
test('allbooks snapshot is complete and identity-compatible with shared video owner',()=>{
 const rows=require('../api/_video-gallery-allbooks.json');assert.equal(rows.length,7139);assert.equal(new Set(rows.map(r=>r.chapter)).size,25);for(const row of rows)assert.match(identity(row).key,/^[a-f0-9]{64}$/);
});
