const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeService,identity,ACTIONS}=require('../lib/quiz-video.cjs');
const {resolveFigureVideoRow}=require('../lib/figure-video.cjs');
const {storageFixture}=require('./fixtures/video-r2.cjs');
test('figure identities are separate from quiz videos and catalog rejects arbitrary IDs',()=>{
 const row=resolveFigureVideoRow('fv_1');assert.equal(row.figure,'fig1');assert.equal(identity(row).prefix,'xyz3d/figure-v1/fig1');
 assert.notEqual(identity(row).key,identity({...row,mediaType:undefined,correct:true}).key);
 assert.equal(resolveFigureVideoRow('fv_999999'),undefined);assert.equal(resolveFigureVideoRow('fv_../1'),undefined);
});
test('figure upload, replacement and removal use the shared archive, without covers or ordinary access',async()=>{
 const f=storageFixture(),row=resolveFigureVideoRow('fv_1');
 const service=makeService({storage:f.storage,bucket:'fixture',secret:'test',sign:f.sign});
 const run=(action,data={},master=true)=>service({action,row,master,owner:'admin',data});
 for(const action of ACTIONS)await assert.rejects(run(action,{},false),/master_admin_required/);
 assert.equal(f.calls.length,0);await assert.rejects(run('saveQuizVideoThumbnail'),/master_admin_required/);
 const publish=async expectedRevision=>{const ticket=await run('createQuizVideoUpload',{bytes:64,duration:30,mime:'video/mp4',expectedRevision});const bytes=Buffer.alloc(64);bytes.write('ftyp',4);f.put(new URL(ticket.uploadUrl).pathname.slice(4),bytes);return run('confirmQuizVideoUpload',{uploadToken:ticket.uploadToken});};
 const first=await publish(null);assert.equal(first.archive.prefix,'xyz3d/figure-v1/fig1/');
 const second=await publish(first.revision);assert.notEqual(second.url,first.url);assert.equal(f.objects.has(first.archive.objectKey),false);
 const record=JSON.parse(f.objects.get('xyz3d/figure-v1/fig1/current.json').body);assert.equal(record.mediaType,'figure');assert.equal(record.figureNumber,1);assert.equal(record.thumbnail,undefined);
 const removed=await run('deleteQuizVideo',{expectedRevision:second.revision,operationId:crypto.randomUUID()});assert.equal(removed.available,false);assert.equal((await run('getQuizVideo')).available,false);
});
