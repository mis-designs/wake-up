'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { S3Client } = require('@aws-sdk/client-s3');
const { identity } = require('../lib/quiz-video.cjs');
const archive = require('../lib/video-archive.cjs');
const id='fv_23', path=identity({mediaType:'figure',figure:'fig23'});
const version='12345678-1234-4234-8234-123456789abc';
const objectKey=path.prefix+'/'+version+'.mp4';
const record={key:path.key,objectKey,bytes:32,duration:9,question:'Semaforo',uploadId:version};
const manifest=value=>({ETag:'etag',Body:{transformToString:async()=>JSON.stringify(value)}});

test('editors and galleries share a metadata-only snapshot and invalidate it on upload',async t=>{
  for(const key of ['ACCOUNT_ID','ACCESS_KEY_ID','SECRET_ACCESS_KEY']){
    const name='QUIZ_VIDEO_R2_'+key, previous=process.env[name];
    process.env[name]='test';
    t.after(()=>{if(previous==null)delete process.env[name];else process.env[name]=previous;});
  }
  const calls=[];
  t.mock.method(S3Client.prototype,'send',async cmd=>{
    calls.push(cmd.input);
    if(cmd.input.Prefix) return {Contents:[{Key:objectKey},{Key:path.prefix+'/current.json'}]};
    assert.equal(cmd.input.Key,path.prefix+'/current.json');return manifest(record);
  });
  const [first,second]=await Promise.all([archive.sources('figure'),archive.snapshot('figure')]);
  assert.deepEqual(first,[{id,section:'figure',title:'Figura 23 · Semaforo',duration:9,version}]);
  assert.equal(second.size,1);
  await archive.sources('figure');assert.equal(calls.length,2);
  archive.invalidate('figure');await archive.sources('figure');assert.equal(calls.length,4);
});

test('read and save bind the current upload version, and relay reads are bounded',async()=>{
  let current=record, mediaReads=0;
  const open=()=>({bucket:'test',storage:{destroy(){},async send(cmd){
    if(cmd.input.Key.endsWith('current.json'))return manifest(current);
    assert.equal(cmd.input.Key,objectKey);assert.equal(cmd.input.Range,'bytes=0-31');mediaReads++;
    return {Body:{transformToByteArray:async()=>Buffer.alloc(32)}};
  }}});
  const invoke=(action,data)=>archive.source(action,id,data,undefined,open,async()=>'https://example.invalid/file');
  assert.equal((await invoke('getArchiveSourceInfo',{version})).source.id,id);
  assert.equal((await invoke('getArchiveVideo',{version})).sourceVersion,version);
  await assert.rejects(invoke('getArchiveVideoPart',{version,index:1}),/video_chunk_invalid/);
  assert.equal(Buffer.from((await invoke('getArchiveVideoPart',{version,index:0})).base64,'base64').length,32);
  current={...record,uploadId:'replacement'};
  await assert.rejects(invoke('getArchiveVideoPart',{version,index:0}),/scene_source_changed/);
  current={...record,deleted:true};
  await assert.rejects(invoke('getArchiveVideo',{version}),/scene_source_changed/);
  assert.equal(mediaReads,1);
});
