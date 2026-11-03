import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import {S3Client} from '@aws-sdk/client-s3';
import handler from '../api/asset.js';

test('QuizBank reads the owner-maintained numbered R2 object, including 565, without alternate objects', async t => {
  for (const key of ['BOOK_R2_BUCKET','BOOK_R2_ACCOUNT_ID','BOOK_R2_ACCESS_KEY_ID','BOOK_R2_SECRET_ACCESS_KEY']) {
    const previous=process.env[key]; process.env[key]='fixture';
    t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous;});
  }
  const bytes=readFileSync(new URL('./fixtures/quiz-figures/fig40.jpg',import.meta.url));
  const keys=[]; let failure=null;
  t.mock.method(globalThis,'fetch',()=>assert.fail('External images are forbidden'));
  t.mock.method(S3Client.prototype,'send',async cmd=>{
    keys.push(cmd.input.Key);
    if(failure)throw Object.assign(new Error(failure),{name:failure,$metadata:{httpStatusCode:failure==='NoSuchKey'?404:503}});
    return {Body:Readable.from([bytes]),ContentType:'image/jpeg'};
  });
  async function request(figure,catalog='quizbank-r2-v1') {
    const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;},end(){return this;}};
    await handler({method:'GET',query:{kind:'figure',figure,catalog}},res);return res;
  }
  assert.equal((await request('565')).statusCode,200);
  assert.deepEqual(keys,['Figure/fig565.jpg']);
  failure='NoSuchKey';
  const missing=await request('565');assert.equal(missing.statusCode,404);
  assert.equal(keys.length,2);assert.equal(keys[1],'Figure/fig565.jpg');
  assert.equal(missing.headers['Cache-Control'],'public, max-age=60, s-maxage=60');
  failure='ServiceUnavailable';
  const unavailable=await request('565');assert.equal(unavailable.statusCode,500);assert.equal(keys.length,3);
  assert.doesNotMatch(unavailable.headers['Cache-Control']||'',/public|s-maxage/);
  failure=null;
  const normal=await request('564');assert.equal(normal.statusCode,200);assert.equal(keys.at(-1),'Figure/fig564.jpg');
  assert.equal(normal.headers['Cache-Control'],'public, max-age=86400, s-maxage=604800');
  await request('565','');assert.equal(keys.at(-1),'Figure/fig565.jpg','existing MagicBook path preserved');
});
