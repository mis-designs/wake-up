import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { prepareAdminReadResponse, isAdminUserExpired } from '../api/admin.js';

const now = Date.now();
const users = Array.from({length: 16}, (_,i) => ({
  phone: `39333000${1000+i}`, registration_date: new Date(now+i*1000).toISOString(),
  expiry: new Date(now+(i<12 ? 86400000 : -1000)).toISOString()
}));
users[0].expiry = null;
test('recent filters before slicing; expired accounts are absent from every response field', () => {
  const response = prepareAdminReadResponse({success:true,list:users,user:users[15],result:users[15],total:999,stats:{total:999}},'recent','active',now);
  assert.equal(response.total,12);
  assert.deepEqual(response.list.map(u=>u.phone),users.slice(2,12).reverse().map(u=>u.phone));
  for(const key of ['user','result','stats']) assert.equal(key in response,false);
});
test('full list, search and expiry boundaries keep the scopes exclusive', () => {
  assert.equal(prepareAdminReadResponse({list:users},'list','active',now).list.length,12);
  assert.equal(prepareAdminReadResponse({list:users},'list','expired',now).list.length,4);
  assert.equal(prepareAdminReadResponse({user:users[15]},'search','active',now).list.length,0);
  assert.equal(prepareAdminReadResponse({user:users[15]},'search','expired',now).list.length,1);
  assert.equal(isAdminUserExpired({expiry:new Date(now-1).toISOString()},now),true);
  assert.equal(isAdminUserExpired({expiry:new Date(now).toISOString()},now),false);
  assert.equal(isAdminUserExpired({expiry:null},now),false);
});

const source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
function extract(name){
 const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
 assert.ok(start>=0,name);
 const rest=source.slice(start),next=rest.slice(1).search(/^(?:async )?function \w+\(/m);
 return next<0?rest:rest.slice(0,next+1);
}
function harness(){
 const calls=[],pending=[],nodes=new Map(),tabs=['users','promo','expiring','expired','duplicates'].map(name=>({
  dataset:{adminTab:name},id:name,handlers:{},classList:{toggle(){}},setAttribute(){},addEventListener(k,fn){this.handlers[k]=fn}
 }));
 const node=id=>nodes.get(id)||nodes.set(id,{value:'',textContent:'',disabled:false,classList:{add(){},toggle(){}},setAttribute(){},addEventListener(){}}).get(id);
 const ctx=vm.createContext({console,setTimeout,clearTimeout,Date,trialGuestMode:false,
 ADMIN_EXPIRING_DAYS:16,ADMIN_SEARCH_MIN_DIGITS:6,ADMIN_SEARCH_DEBOUNCE_MS:300,
 adminState:{users:[],tab:'users',query:'',mode:'recent',loading:false,loadVersion:0,promoLoaded:false,promoLoading:false},
 document:{getElementById:node,querySelectorAll:()=>tabs},isCurrentSessionAdmin:()=>true,
 renderAdminLoading(){},renderAdminUsers(){},setAdminMessage(){},getAdminErrorMessage:x=>x,
 normalizeAdminSearch:x=>String(x||'').replace(/\D/g,''),normalizePhone:x=>x,
 adminLoadPromoUsers:async()=>{},adminRetryPromoUsers(){},adminUpdateUserFormSummary(){},adminFillBulkFromClipboard(){},
 adminRequest:async(action,fields)=>{calls.push({action,...fields});return await new Promise((resolve,reject)=>pending.push({resolve,reject}));}
 });
 for(const name of ['getAdminStatus','getAdminRegistrationTime','getAdminResponseUsers','setAdminTab','adminLoadUsers','adminLoadAllUsers','adminRefreshUsers','updateAdminDatasetControls','setupAdminUI','scheduleAdminPhoneSearch','clearAdminPhoneSearch'])vm.runInContext(extract(name),ctx);
 ctx.setupAdminUI();
 return {ctx,calls,pending,node,click:name=>tabs.find(t=>t.dataset.adminTab===name).handlers.click()};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
test('only entering Scaduti requests expired users; tabs and repeated clicks do not fan out',async()=>{
 const {ctx,calls,pending,click}=harness();
 let p=ctx.adminLoadUsers(false,'recent');pending.shift().resolve({list:users,total:16});await p;
 assert.equal(ctx.adminState.users.length,12); // defensive filter also protects old API responses
 click('expiring');assert.equal(calls.length,1);
 click('expired');assert.equal(calls.length,2);assert.equal(calls[1].scope,'expired');
 assert.equal(ctx.adminState.users.length,0);
 click('expired');assert.equal(calls.length,2);
 pending.shift().resolve({list:users,total:4});await tick();assert.equal(ctx.adminState.users.length,4);
 click('users');assert.equal(calls.length,3);assert.equal(calls[2].scope,'active');
 pending.shift().resolve({list:users,total:12});await tick();assert.equal(ctx.adminState.users.length,12);
});
test('obsolete expired responses cannot replace valid users; failure leaves retry enabled',async()=>{
 const {ctx,calls,pending,click,node}=harness();
 click('expired');click('users');assert.equal(calls.length,2);
 pending[1].resolve({list:users,total:12});await tick();pending[0].resolve({list:users.slice(12),total:4});await tick();
 assert.equal(ctx.adminState.users.length,12);assert.equal(ctx.adminState.tab,'users');
 pending.length=0;
 let p=ctx.adminRefreshUsers();pending.shift().reject(new Error('service_unavailable'));await p;
 assert.equal(ctx.adminState.users.length,0);assert.equal(node('adminLoadAllUsers').disabled,false);
 p=ctx.adminRefreshUsers();pending.shift().resolve({list:[],total:0});await p;
 assert.equal(ctx.adminState.loadError,false);assert.equal(ctx.adminState.users.length,0);
});
test('search within Scaduti retains expired scope',async()=>{
 const {ctx,calls,pending}=harness();ctx.adminState.tab='expired';
 ctx.scheduleAdminPhoneSearch('393330001015',{immediate:true});await tick();
 assert.equal(calls.length,1);assert.equal(calls[0].action,'search');assert.equal(calls[0].scope,'expired');
 pending.shift().resolve({user:users[15]});await tick();assert.equal(ctx.adminState.users.length,1);
});
