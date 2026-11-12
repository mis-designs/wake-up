const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeService,identity}=require('../lib/quiz-video.cjs');
const row={question:'Il veicolo può transitare?',figure:'fig1.png',correct:1};
function fixture(){
 const objects=new Map(),calls=[];let counter=0;
 const uuid=()=>`00000000-0000-4000-8000-${String(++counter).padStart(12,'0')}`;
 const storage={async send(cmd){const x=cmd.input,name=cmd.constructor.name;calls.push({name,key:x.Key});let obj=objects.get(x.Key);
  if(name==='GetObjectCommand'||name==='HeadObjectCommand'){
   if(!obj)throw Object.assign(new Error('missing'),{name:'NoSuchKey',$metadata:{httpStatusCode:404}});
   if(x.IfMatch&&x.IfMatch!==obj.etag)throw Object.assign(new Error('conflict'),{$metadata:{httpStatusCode:412}});
   const body=x.Range?obj.body.subarray(0,32):obj.body;
   return{ContentLength:obj.body.length,ContentType:obj.mime,ETag:obj.etag,Body:{transformToString:async()=>body.toString(),transformToByteArray:async()=>body}};
  }
  if(name==='PutObjectCommand'){
   if(x.IfNoneMatch==='*'&&obj)throw Object.assign(new Error('conflict'),{$metadata:{httpStatusCode:412}});
   objects.set(x.Key,{body:Buffer.from(x.Body),mime:x.ContentType,etag:'metadata'});return{};
  }
  if(name==='CopyObjectCommand'){
   const source=objects.get(x.CopySource.slice('bucket/'.length));
   assert.equal(source.etag,x.CopySourceIfMatch);objects.set(x.Key,{...source});return{};
  }
  if(name==='DeleteObjectCommand'){objects.delete(x.Key);return{};}
  throw Error(name);
 }};
 const signed=[];const sign=async(_,cmd)=>{signed.push(cmd.input);return'https://storage.test/'+cmd.input.Key;};
 const run=makeService({storage,bucket:'bucket',secret:'test-secret',sign,uuid});
 async function start(){const created=await run({action:'createQuizVideoUpload',row,master:true,owner:'admin',data:{bytes:64,mime:'video/mp4',duration:30}});return created;}
 function put(created,corrupt=false){const key=created.uploadUrl.slice('https://storage.test/'.length);const body=Buffer.alloc(64);body.write(corrupt?'nope':'ftyp',4);objects.set(key,{body,mime:'video/mp4',etag:crypto.createHash('md5').update(body).digest('hex')});return key;}
 return{objects,calls,signed,run,start,put};
}
test('identity spans products but distinguishes answer and figure',()=>{
 assert.equal(identity(row).key,identity({q:'Il veicolo può transitare!',img:'1',a:true}).key);
 assert.notEqual(identity(row).key,identity({...row,correct:0}).key);
 assert.notEqual(identity(row).key,identity({...row,figure:'fig2'}).key);
 assert.throws(()=>identity({...row,correct:null}),/video_answer/);
});
test('ordinary users cannot create or confirm and cause zero storage work',async()=>{
 const f=fixture();for(const action of ['createQuizVideoUpload','confirmQuizVideoUpload'])await assert.rejects(f.run({action,row}),/master_admin_required/);assert.equal(f.calls.length,0);
});
test('missing video is an absence; permission failures are not converted to absence',async()=>{
 const f=fixture();assert.deepEqual(await f.run({action:'getQuizVideo',row}),{available:false,canUpload:false});assert.equal(f.calls.length,1);
 const run=makeService({storage:{send:async()=>{throw Error('AccessDenied');}},bucket:'bucket',secret:'x'});await assert.rejects(run({action:'getQuizVideo',row}),/AccessDenied/);
});
test('publish only verified MP4, replay confirmation idempotently, never overwrite existing video',async()=>{
 const f=fixture(),created=await f.start(),pending=f.put(created);
 const data={uploadToken:created.uploadToken};
 const result=await f.run({action:'confirmQuizVideoUpload',row,master:true,owner:'admin',data});
 assert.equal(result.saved,true);assert.ok(!f.objects.has(pending));assert.equal(f.signed[0].ContentLength,64);
 const writes=f.calls.filter(x=>['PutObjectCommand','CopyObjectCommand'].includes(x.name)).length;
 const again=await f.run({action:'confirmQuizVideoUpload',row,master:true,owner:'admin',data});assert.equal(again.url,result.url);
 assert.equal(f.calls.filter(x=>['PutObjectCommand','CopyObjectCommand'].includes(x.name)).length,writes);
 await assert.rejects(f.start(),/video_already_exists/);
});
test('ticket cannot be reused for another admin, question, or answer',async()=>{
 const f=fixture(),created=await f.start();f.put(created);
 for(const override of [{owner:'other'},{row:{...row,correct:0}},{data:{uploadToken:created.uploadToken+'x'}}])await assert.rejects(f.run({action:'confirmQuizVideoUpload',row,master:true,owner:'admin',data:{uploadToken:created.uploadToken},...override}),/video_upload/);
 assert.equal(f.calls.filter(x=>x.name==='CopyObjectCommand').length,0);
});
test('invalid upload never publishes metadata',async()=>{
 const f=fixture(),created=await f.start();f.put(created,true);
 await assert.rejects(f.run({action:'confirmQuizVideoUpload',row,master:true,owner:'admin',data:{uploadToken:created.uploadToken}}),/video_file_invalid/);
 assert.equal(f.calls.filter(x=>x.name==='PutObjectCommand').length,0);
});
