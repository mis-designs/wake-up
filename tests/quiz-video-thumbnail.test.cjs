const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),sharp=require('sharp');
const {makeService,identity}=require('../lib/quiz-video.cjs');
const {storageFixture}=require('./fixtures/video-r2.cjs');
const row={id:'cover-quiz',question:'La carreggiata non comprende le piste ciclabili',correct:true,figure:''};
const image=()=>sharp({create:{width:540,height:960,channels:3,background:'#325ad7'}}).png().toBuffer();
async function fixture(){
 const f=storageFixture();f.run=(action,data={},extra={})=>makeService({storage:f.storage,bucket:'fixture',secret:'fixture',sign:f.sign})({action,row,master:true,owner:'test',data,...extra});
 f.publish=async expectedRevision=>{const ticket=await f.run('createQuizVideoUpload',{bytes:64,duration:30,mime:'video/mp4',expectedRevision});const bytes=Buffer.alloc(64);bytes.write('ftyp',4);f.put(new URL(ticket.uploadUrl).pathname.slice(4),bytes);return f.run('confirmQuizVideoUpload',{uploadToken:ticket.uploadToken});};
 f.record=()=>JSON.parse(f.objects.get(identity(row).prefix+'/current.json').body);
 f.cover=async revision=>({imageBase64:(await image()).toString('base64'),operationId:crypto.randomUUID(),expectedRevision:revision});
 return f;
}
test('master-only cover upload validates pixels, preserves portrait ratio and shares poster without archive fields',async()=>{
 const f=await fixture();for(const action of ['saveQuizVideoThumbnail','deleteQuizVideoThumbnail'])await assert.rejects(f.run(action,{}, {master:false}),/master_admin_required/);assert.equal(f.calls.length,0);
 const video=await f.publish(),request=await f.cover(video.revision),before=f.calls.length;
 const saved=await f.run('saveQuizVideoThumbnail',request);assert.equal(saved.thumbnailSaved,true);assert.equal(saved.url,video.url);assert.equal(saved.thumbnail.width,540);assert.equal(saved.thumbnail.height,960);
 assert.equal(f.calls.length-before,3); // metadata read, image put, conditional metadata write
 const decoded=await sharp(f.objects.get(f.record().thumbnail.objectKey).body).metadata();assert.equal(decoded.format,'jpeg');assert.equal(decoded.exif,undefined);
 const ordinary=await f.run('getQuizVideo',{}, {master:false});assert.equal(ordinary.thumbnail.url,saved.thumbnail.url);assert.equal(ordinary.archive,undefined);assert.equal(ordinary.thumbnail.objectKey,undefined);
 const count=f.calls.length;assert.equal((await f.run('saveQuizVideoThumbnail',request)).thumbnail.url,saved.thumbnail.url);assert.equal(f.calls.length-count,1);
});
test('replacement preserves cover, cover replacement deletes only old cover, video deletion removes both',async()=>{
 const f=await fixture(),video=await f.publish(),cover=await f.run('saveQuizVideoThumbnail',await f.cover(video.revision)),oldKey=f.record().thumbnail.objectKey;
 const newVideo=await f.publish(cover.revision);assert.equal(newVideo.thumbnail.url,cover.thumbnail.url);assert.ok(f.objects.has(oldKey));
 const replaced=await f.run('saveQuizVideoThumbnail',await f.cover(newVideo.revision));assert.notEqual(replaced.thumbnail.url,cover.thumbnail.url);assert.equal(f.objects.has(oldKey),false);
 const videoKey=f.record().objectKey,coverKey=f.record().thumbnail.objectKey;
 const removed=await f.run('deleteQuizVideo',{expectedRevision:replaced.revision,operationId:crypto.randomUUID()});assert.equal(removed.available,false);assert.equal(removed.thumbnail,undefined);assert.equal(removed.cleanupPending,false);assert.ok(!f.objects.has(videoKey));assert.ok(!f.objects.has(coverKey));
 const next=await f.publish(removed.revision);assert.equal(next.thumbnail,undefined);
});
test('cover removal is idempotent and leaves the video available',async()=>{
 const f=await fixture(),video=await f.publish(),saved=await f.run('saveQuizVideoThumbnail',await f.cover(video.revision)),key=f.record().thumbnail.objectKey;
 const data={expectedRevision:saved.revision,operationId:crypto.randomUUID()},removed=await f.run('deleteQuizVideoThumbnail',data);
 assert.equal(removed.thumbnailRemoved,true);assert.equal(removed.thumbnail,undefined);assert.equal(removed.url,video.url);assert.equal(f.objects.has(key),false);assert.equal((await f.run('deleteQuizVideoThumbnail',data)).thumbnailRemoved,true);
});
test('invalid, oversized and non-image uploads never write storage; absent video cannot receive covers',async()=>{
 const f=await fixture();await assert.rejects(f.run('saveQuizVideoThumbnail',await f.cover(null)),/thumbnail_video_required/);
 const video=await f.publish();for(const value of ['<svg/>',Buffer.from('<svg/>').toString('base64'),'A'.repeat(1398108),Buffer.from('not an image').toString('base64')]){
 const before=f.calls.length;await assert.rejects(f.run('saveQuizVideoThumbnail',{imageBase64:value,operationId:crypto.randomUUID(),expectedRevision:video.revision}),/thumbnail_invalid/);assert.equal(f.calls.length-before,1);}
});
test('lost publication response reconciles the same operation without new files, stale saves never replace a winner',async()=>{
 const f=await fixture(),video=await f.publish(),data=await f.cover(video.revision);let lost=false;
 f.afterWrite=async(name,x)=>{if(name==='PutObjectCommand'&&x.Key.endsWith('current.json')&&!lost){lost=true;throw Error('lost');}};
 await assert.rejects(f.run('saveQuizVideoThumbnail',data),/lost/);const key=f.record().thumbnail.objectKey;
 const saved=await f.run('saveQuizVideoThumbnail',data);assert.equal(saved.thumbnailSaved,true);assert.equal(f.record().thumbnail.objectKey,key);
 await assert.rejects(f.run('saveQuizVideoThumbnail',await f.cover(video.revision)),/video_changed/);assert.equal(f.record().thumbnail.objectKey,key);
});
test('cleanup failure remains recoverable; tampered cover paths cannot sign or delete other objects',async()=>{
 const f=await fixture(),video=await f.publish(),saved=await f.run('saveQuizVideoThumbnail',await f.cover(video.revision)),old=f.record().thumbnail.objectKey,send=f.storage.send;
 f.storage.send=async(...args)=>{if(args[0].constructor.name==='DeleteObjectCommand'&&args[0].input.Key===old)throw Error('offline');return send(...args);};
 const next=await f.run('saveQuizVideoThumbnail',await f.cover(saved.revision));assert.equal(next.cleanupPending,true);assert.equal(next.available,true);
 await assert.rejects(f.publish(next.revision),/video_cleanup_required/);f.storage.send=send;
 const cleaned=await f.run('cleanupQuizVideo',{expectedRevision:next.revision});assert.equal(cleaned.cleanupPending,false);assert.ok(!f.objects.has(old));
 f.put(identity(row).prefix+'/current.json',JSON.stringify({...f.record(),retiredThumbnailKey:'books/private.pdf'}),'application/json');
 await assert.rejects(f.run('getQuizVideo'),/video_record_invalid/);
});
test('simultaneous cover changes publish one winner and remove only the losing image',async()=>{
 const f=await fixture(),video=await f.publish(),a=await f.cover(video.revision),b=await f.cover(video.revision);const send=f.storage.send;let count=0,release;const gate=new Promise(r=>release=r);
 f.storage.send=async(...args)=>{if(args[0].constructor.name==='PutObjectCommand'&&args[0].input.IfMatch===video.revision){if(++count===2)release();await gate;}return send(...args);};
 const results=await Promise.allSettled([f.run('saveQuizVideoThumbnail',a),f.run('saveQuizVideoThumbnail',b)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal([...f.objects.keys()].filter(k=>k.endsWith('.jpg')).length,1);assert.ok(f.objects.has(f.record().thumbnail.objectKey));
});
test('an interrupted image write is retried with the same object, without orphan duplicates',async()=>{
 const f=await fixture(),video=await f.publish(),data=await f.cover(video.revision);let lost=false;
 f.afterWrite=async(name,x)=>{if(name==='PutObjectCommand'&&x.Key.endsWith('.jpg')&&!lost){lost=true;throw Error('lost');}};
 await assert.rejects(f.run('saveQuizVideoThumbnail',data),/lost/);assert.equal(f.record().thumbnail,undefined);
 const saved=await f.run('saveQuizVideoThumbnail',data);assert.equal(saved.thumbnailSaved,true);assert.equal([...f.objects.keys()].filter(k=>k.endsWith('.jpg')).length,1);
});
