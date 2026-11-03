import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import vm from 'node:vm';
import {S3Client} from '@aws-sdk/client-s3';
import {loadQuizBank} from '../api/quizbank-catalog.mjs';
const require=createRequire(import.meta.url);
const release=require('../api/quizbank-release.json');

test('new PDF revision still uses the existing number-based R2 resolver',()=>{
  const requests=[];
  const context={window:{},document:{}};
  vm.runInNewContext(readFileSync(new URL('../quizbank-figures.js',import.meta.url),'utf8'),context);
  const api=context.window.MagicQuizBankFigures;
  const image={set src(value){requests.push(value);}};
  api.load(image,{figure:'168',sourceRevision:release.sourcePdfSha256});
  assert.deepEqual(requests,[api.source('168')]);
  assert.equal(requests[0],'/api/asset?kind=figure&figure=168&presentation=numberless-v2&catalog=quizbank-r2-v2');
  assert.equal(Object.hasOwn(release,'figures'),false);
  assert.equal(api.source('../168'),'');
});

test('final archive bytes are pinned: a mixed or changed release is rejected before use',async t=>{
  const rows=Array.from({length:1500},(_,i)=>({id:`qb_s${String(Math.floor(i/30)+1).padStart(2,'0')}_q${String(i%30+1).padStart(2,'0')}`,
    scheda:Math.floor(i/30)+1,numero_domanda:i%30+1,domanda:`Release fixture ${i}`,risposta:'V',risposta_corretta:true,
    ha_figura:false,numero_figura:null,figureRotation:0,sourceRevision:release.sourcePdfSha256}));
  let bytes=Buffer.from(JSON.stringify(rows)),reads=0;
  const expected=release.archiveSha256;t.after(()=>{release.archiveSha256=expected;});
  release.archiveSha256=createHash('sha256').update(bytes).digest('hex');
  t.mock.method(S3Client.prototype,'send',async()=>{reads++;return {Body:Readable.from([bytes])};});
  const config={accountId:'final-good',accessKeyId:'fixture',secretAccessKey:'fixture',bucket:'fixture',key:release.archiveKey};
  assert.equal((await loadQuizBank(config)).byId.size,1500);
  rows[0].domanda='Unexpected substituted question';bytes=Buffer.from(JSON.stringify(rows));
  await assert.rejects(loadQuizBank({...config,accountId:'final-bad'}),{message:'quizbank_invalid_archive',statusCode:503});
  assert.equal(reads,2);
});
