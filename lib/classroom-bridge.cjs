'use strict';
const {createHash,createHmac,timingSafeEqual} = require('node:crypto');
const books = 'https://www.tmmbooks.eu/api/quiz';
const magic = 'https://tmmmagic.eu/api/quiz';

const materials = {scope:'tmm-allbooks-classroom-v1',target:books,issuer:magic,header:'X-TMM-Classroom-Proof',verify:'verifyClassroomRequest'};
const video = {scope:'tmm-magic-theory-video-v1',target:magic,issuer:books,header:'X-TMM-Theory-Video-Proof',verify:'verifyTheoryVideoRequest'};

const digest = text => createHash('sha256').update(text).digest('hex');
function mac(route,expires,hash) {
  return createHmac('sha256',process.env.SESSION_SECRET).update(route.scope+'\n'+expires+'\n'+hash).digest('hex');
}
function current(proof) {
  if(typeof proof!=='string' || !/^\d{13}\.[a-f0-9]{64}$/.test(proof))return false;
  const expires=Number(proof.slice(0,13)), now=Date.now();
  return expires>=now && expires<=now+60000;
}
function verify(route,hash,proof) {
  if(typeof hash!=='string' || !/^[a-f0-9]{64}$/.test(hash) || !current(proof))return false;
  const [expires,signature]=proof.split('.');
  return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(mac(route,expires,hash),'hex'));
}
async function verifyAtIssuer(route,proof,fields,signal) {
  if(!current(proof))return false;
  const response=await fetch(route.issuer,{method:'POST',redirect:'error',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    signal:AbortSignal.any([AbortSignal.timeout(5000),...(signal?[signal]:[])]),
    body:JSON.stringify({action:route.verify,entryId:digest(JSON.stringify(fields)),questionId:proof})});
  if(!response.ok)throw Object.assign(new Error('classroom_unavailable'),{statusCode:503});
  return (await response.json()).verified===true;
}
async function forward(route,fields,signal) {
  const body=JSON.stringify(fields), expires=Date.now()+45000;
  const proof=expires+'.'+mac(route,expires,digest(body));
  const response=await fetch(route.target,{method:'POST',redirect:'error',cache:'no-store',signal,
    headers:{'Content-Type':'application/json',[route.header]:proof},body});
  if(!response.ok){
    const error=await response.json().catch(()=>({}));
    throw Object.assign(new Error(error.error || 'classroom_unavailable'),{statusCode:response.status});
  }
  return response.json();
}
module.exports={materials,video,verify,verifyAtIssuer,forward};
