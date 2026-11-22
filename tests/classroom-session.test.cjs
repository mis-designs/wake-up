const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(books){
  let now=1700000000000,expires=now+900000,handler;
  const storage=new Map(),timers=new Map(),calls=[],locks=[],prefix=books?'allBooks.':'';
  const token=(expiry,master=true)=>{const payload={role:'admin',phone:'fixture',deviceId:'fixture-device',exp:books?expiry/1000:expiry,
    masterAdmin:master,masterAdminRevision:'a'.repeat(64)};
    return (books?'header.':'')+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.test';};
  const credentials=()=>({phone:'fixture',deviceId:'fixture-device',accessToken:storage.get(prefix+'accessToken') || ''});
  storage.set(prefix+'accessToken',token(expires));storage.set('user_session',JSON.stringify(credentials()));
  const context={window:{},document:{hidden:false},atob,JSON,Date:{now:()=>now},
    AbortController,AbortSignal,setTimeout:(fn,delay)=>{const id=Symbol();timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    localStorage:{getItem:k=>storage.get(k) ?? null,setItem:(k,v)=>storage.set(k,v)},
    fetch:async (url,options)=>{calls.push({url,options});return handler?handler():Response.json({ok:true,success:true,...credentials(),accessToken:token(now+900000)});}};
  for(const file of ['account-role.js','classroom-session.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  const session=context.window.ClassroomSession.create({allBooks:books,credentials,lock:temporary=>{locks.push(temporary);session.stop();}});
  return {session,calls,locks,storage,timers,token,context,prefix,expires,setNow:n=>now=n,setHandler:f=>handler=f};
}
for(const books of [false,true]){
 const site=books?'All Books':'Magic Book';
 test(site+' renews once near expiry and retains lesson scope across tab renewal',async()=>{
   const f=fixture(books);assert.ok(await f.session.ensure());const scope=f.session.key;
   assert.equal(f.calls.length,0);assert.equal([...f.timers.values()][0].delay,840000);
   f.setNow(f.expires-60000);assert.deepEqual(await Promise.all([f.session.ensure(),f.session.ensure()]),[true,true]);
   assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,books?'/api/auth':'/api/getPages');
   assert.equal(f.session.key,scope);assert.deepEqual(f.locks,[]);assert.ok(f.session.matches(scope));
   const fresh=f.storage.get(f.prefix+'accessToken');assert.notEqual(fresh,f.token(f.expires));
   if(!books)assert.equal(JSON.parse(f.storage.get('user_session')).accessToken,fresh);
   f.storage.set(f.prefix+'accessToken',f.token(f.expires+1800000));assert.ok(await f.session.ensure());assert.equal(f.calls.length,1);
   f.context.document.hidden=true;f.session.suspend();assert.equal(f.timers.size,0);
 });
 test(site+' preserves a still-valid session during an outage, requires verification after expiry, and rejects downgrade',async()=>{
   const f=fixture(books);await f.session.ensure();f.setNow(f.expires-30000);
   f.setHandler(()=>{throw Error('offline');});assert.ok(await f.session.ensure());assert.ok(await f.session.ensure());assert.equal(f.calls.length,1);
   f.setNow(f.expires+1000);assert.equal(await f.session.ensure(),false);assert.deepEqual(f.locks,[true]);
   f.setHandler(()=>Response.json({ok:true,success:true,accessToken:f.token(f.expires+900000,false)}));
   assert.equal(await f.session.ensure(),false);assert.equal(f.session.key,'');
 });
 test(site+' cannot restore a session after logout during an outstanding renewal',async()=>{
   const f=fixture(books);f.setNow(f.expires-1000);let finish;
   f.setHandler(()=>new Promise(r=>{finish=r;}));const waiting=f.session.ensure();
   f.storage.delete(f.prefix+'accessToken');f.session.stop();
   finish(Response.json({ok:true,success:true,accessToken:f.token(f.expires+900000)}));
   assert.equal(await waiting,false);assert.equal(f.storage.has(f.prefix+'accessToken'),false);
 });
}
