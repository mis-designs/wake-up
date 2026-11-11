import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

process.env.GAS_ACCESS_URL = 'https://fixture.invalid/access';
process.env.GAS_SECRET = 'fixture-secret';
process.env.GAS_ADMIN_KEY = 'fixture-admin';
process.env.SESSION_SECRET = 'fixture-signature';
process.env.ADMIN_PHONE_NUMBERS = '393330001111';
const { default: handler, prepareAdminReadResponse } = await import('../api/admin.js');
const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const phone = '393330002222', actor = '393330001111', deviceId = 'fixture-device';
function signed(role = 'admin') {
  const body = Buffer.from(JSON.stringify({ phone: actor, deviceId, purpose: 'access', role, exp: Date.now()+60000 })).toString('base64url');
  return body+'.'+crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest('base64url');
}
async function call(fields, replies) {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    assert.ok(reply, 'unexpected additional upstream request');
    return new Response(JSON.stringify(reply));
  };
  const res = { code: 200, setHeader(){}, status(code){ this.code=code;return this; }, json(body){this.body=body;return this;} };
  try {
    await handler({method:'POST',body:{action:'create',sessionPhone:actor,deviceId,accessToken:signed(),phone,days:90,Quiz_bank:0,...fields}},res);
    return {...res,calls};
  } finally { globalThis.fetch=original; }
}
function extract(name) {
  const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
  assert.ok(start>=0,name);
  const rest=source.slice(start), end=rest.slice(1).search(/^(?:async )?function \w+\(/m);
  return end<0 ? rest : rest.slice(0,end+1);
}
function install(context,names){ for(const name of names) vm.runInContext(extract(name),context);return context; }

test('new numbers are created once and confirmed duplicates renew once without changing devices or QuizBank',async()=>{
  const created=await call({},[{success:true,phone,Quiz_bank:0}]);
  assert.equal(created.body.outcome,'created'); assert.equal(created.calls.length,1);
  for(const flag of [0,1]) {
    const renewed=await call({Quiz_bank:flag},[{success:false,error:'duplicate'},{success:true,phone,expiry:'2035-01-01'}]);
    assert.equal(renewed.body.outcome,'renewed');
    assert.deepEqual(renewed.calls.map(c=>c.action),['admin_add','admin_renew']);
    assert.equal(renewed.calls[1].mode,'set'); assert.equal(renewed.calls[1].days,90);
    assert.equal('Quiz_bank' in renewed.calls[1],false); assert.equal('deviceId' in renewed.calls[1],false);
  }
});
test('failed, unconfirmed or unauthorized creation never triggers renewal or claims success',async()=>{
  for(const error of ['busy','quizbank_column_missing','server_error']) {
    const r=await call({},[{success:false,error}]);
    assert.equal(r.calls.length,1); assert.equal(r.body.success,false); assert.equal(r.body.outcome,undefined);
  }
  const network=await call({},[new Error('lost response')]);
  assert.equal(network.calls.length,1);assert.equal(network.code,503);
  const uncertain=await call({},[{success:true}]);
  assert.equal(uncertain.body.error,'quizbank_not_confirmed');assert.equal(uncertain.calls.length,1);
  const denied=await call({accessToken:signed('user')},[]);
  assert.equal(denied.calls.length,0);assert.equal(denied.code,403);
  const failed=await call({},[{success:false,error:'duplicate'},{success:false,error:'busy'}]);
  assert.equal(failed.calls.length,2);assert.equal(failed.body.success,false);
});
test('expired matches stay excluded but provide an accurate destination without extra reads',async()=>{
  const expired={phone,expiry:'2000-01-01'},active={phone,expiry:'2035-01-01'};
  const result=prepareAdminReadResponse({success:true,user:expired},'search','active');
  assert.equal(result.foundInScope,'expired'); assert.deepEqual(result.list,[]);assert.equal(result.user,null);
  const reversed=prepareAdminReadResponse({success:true,user:active},'search','expired');
  assert.equal(reversed.foundInScope,'active'); assert.deepEqual(reversed.list,[]);
  assert.equal(prepareAdminReadResponse({success:true,list:[]},'search','active').foundInScope,undefined);
  const r=await call({action:'search'},[{success:true,user:expired}]);
  assert.equal(r.calls.length,1);assert.equal(r.body.foundInScope,'expired');
});
test('0039, +39, spaces and national phone searches keep the returned user visible',()=>{
  const ctx=install(vm.createContext({adminState:{users:[{phone}],tab:'users'},getAdminDuplicatePhones:()=>new Set(),
    getAdminStatus:()=>({key:'active'}),getAdminPhoneKey:x=>x}),['normalizeAdminSearch','getFilteredAdminUsers']);
  for(const query of ['00393330002222','+39\u00a0333\u00a0000\u00a02222','3330002222',phone]){
    ctx.adminState.query=query;assert.equal(ctx.getFilteredAdminUsers().length,1,query);
  }
});

function bulkFixture(entries,results) {
  const calls=[],messages=[],shown=[];
  const ctx=vm.createContext({adminUserFormBusy:false,adminState:{users:[{phone}],loadError:false},console,
    getAdminBulkEntries:()=>entries,isValidPhoneNumber:()=>true,normalizePhone:x=>x,
    setAdminMessage:(text,type)=>messages.push({text,type}),adminMarkInvalidPhones(){},
    getExistingAdminUser:()=>{throw Error('cached membership must not skip renewal');},
    setAdminUserFormBusy(){},adminRequest:async(action,fields)=>{calls.push({action,...fields});const result=results.shift();if(result instanceof Error)throw result;return result;},
    adminShowSavedUsers:async phones=>shown.push(Array.from(phones)),adminCloseUserModal(){},
    adminUpdateUserFormSummary(){},document:{querySelectorAll:()=>[]}});
  install(ctx,['adminSubmitBulkCreate']);return {ctx,calls,messages,shown};
}
test('bulk addition includes existing cached users, deduplicates input and reports actual create/renew outcomes',async()=>{
  const entry={phone,days:90,Quiz_bank:0},newPhone='393330003333';
  const h=bulkFixture([entry,entry,{...entry,phone:newPhone}],[{outcome:'renewed'},{outcome:'created'}]);
  await h.ctx.adminSubmitBulkCreate(null);
  assert.equal(h.calls.length,2);assert.ok(h.messages.at(-1).text.includes('1 utente rinnovato'));
  assert.ok(h.messages.at(-1).text.includes('1 utente aggiunto'));assert.equal(h.shown[0].length,2);
  const failed=bulkFixture([entry],[new Error('save_unconfirmed')]);
  failed.ctx.getAdminErrorMessage=x=>x;await failed.ctx.adminSubmitBulkCreate(null);
  assert.equal(failed.calls.length,1);assert.match(failed.messages.at(-1).text,/da verificare/);
  assert.doesNotMatch(failed.messages.at(-1).text,/rinnovato|aggiunto/);
});
test('one saved number opens its exact active search even when creation began in Scaduti',async()=>{
  const calls=[],nodes=new Map(),state={tab:'expired',query:'old',searchTimer:null};
  const ctx=install(vm.createContext({adminState:state,normalizePhone:x=>x,clearTimeout,
    setAdminTab:tab=>state.tab=tab,document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:'',classList:{remove(){}}});return nodes.get(id);}},
    adminLoadUsers:async(force,mode)=>calls.push({force,mode,tab:state.tab,query:state.query})}),['adminShowSavedUsers']);
  await ctx.adminShowSavedUsers([phone]);
  assert.deepEqual(calls,[{force:true,mode:'search',tab:'users',query:phone}]);
  assert.equal(nodes.get('adminSearchInput').value,phone);
});
test('known device identity does not wait for IndexedDB; concurrent recovery chooses one identity',async()=>{
  let reads=0,writes=[],resolve;
  const ctx=install(vm.createContext({cachedDeviceId:'known-device',deviceIdResolutionPromise:null,KEYS:{deviceId:'deviceId'},
    Storage:{get:()=>null},getDeviceCookie:()=>null,readStoredSession:()=>null,
    getIndexedDbDeviceId:()=>{reads++;return new Promise(r=>resolve=r);},syncDeviceId:id=>{ctx.cachedDeviceId=id;writes.push(id);},
    createDeviceId:()=>{throw Error('must preserve recovered identity');}}),['isValidStoredDeviceId','getRobustDeviceId']);
  assert.equal(await ctx.getRobustDeviceId(),'known-device');assert.equal(reads,0);
  ctx.cachedDeviceId=null;
  const a=ctx.getRobustDeviceId(),b=ctx.getRobustDeviceId();assert.equal(reads,1);
  resolve('stored-device');assert.equal(await a,'stored-device');assert.equal(await b,'stored-device');
  assert.deepEqual(writes,['known-device','stored-device']);
});
test('blocked/late IndexedDB and stalled transactions settle and release resources',async()=>{
  let request,closed=0,aborted=0,timer;
  const ctx=install(vm.createContext({DEVICE_DB_NAME:'fixture',DEVICE_STORE_NAME:'kv',DEVICE_STORAGE_TIMEOUT_MS:1500,
    indexedDB:{open:()=>request={}},setTimeout:fn=>{timer=fn;return 1;},clearTimeout(){}}),['openDeviceDb','runDeviceTransaction']);
  const p=ctx.openDeviceDb();const rejected=assert.rejects(p,/indexeddb_timeout/);timer();await rejected;
  request.result={close:()=>closed++};request.onsuccess();assert.equal(closed,1);
  const blocked=ctx.openDeviceDb();const rejectBlocked=assert.rejects(blocked,/indexeddb_blocked/);request.onblocked();await rejectBlocked;
  const tx={objectStore:()=>({get:()=>({})}),abort:()=>aborted++};
  const pending=ctx.runDeviceTransaction({transaction:()=>tx},'readonly',store=>store.get('deviceId'));
  const rejectTx=assert.rejects(pending,/indexeddb_timeout/);timer();await rejectTx;assert.equal(aborted,1);
});
