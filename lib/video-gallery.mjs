import { createRequire } from 'node:module';
import { LOCAL_MAGIC_BOOK_ROWS } from '../api/local-quiz-bank.mjs';
import { applyQuizFigureCorrections } from '../api/quiz-figure-corrections.mjs';
import { loadQuizBank } from '../api/quizbank-catalog.mjs';
const require=createRequire(import.meta.url);
const {identity,storageConfig}=require('./quiz-video.cjs');
const {makeRecords}=require('./quiz-video-record.cjs');
const {S3Client,ListObjectsV2Command,GetObjectCommand}=require('@aws-sdk/client-s3');
const {getSignedUrl}=require('@aws-sdk/s3-request-presigner');
const all=require('../api/_video-gallery-allbooks.json');
export function buildCatalog(magic,allbooks,bank){
 const groups=new Map();
 for(const [source,rows] of [['magic',magic],['all',allbooks],['bank',bank]])for(const row of rows){
  const key=identity(row).key;
  if(!groups.has(key))groups.set(key,{...row,id:'vg_'+key,key,refs:[]});
  groups.get(key).refs.push({source,id:String(row.id),chapter:String(row.sheet??row.chapter),title:row.chapterTitle||`${source==='bank'?'Scheda':'Capitolo'} ${row.sheet??row.chapter}`});
 }
 return [...groups.values()];
}
export async function galleryCatalog(){
 const bank=await loadQuizBank();
 return buildCatalog(LOCAL_MAGIC_BOOK_ROWS.map(applyQuizFigureCorrections),all,[...bank.byId.values()]);
}
export async function resolveGalleryRow(id){return (await galleryCatalog()).find(r=>r.id===id);}
export async function readGalleryRecords(storage,bucket,signal){
 const send=(Command,input)=>storage.send(new Command({Bucket:bucket,...input}),{abortSignal:signal});
 const records=makeRecords(send,(message,statusCode=503)=>Object.assign(Error(message),{statusCode}));
 const keys=[];let token;
 do{
  signal?.throwIfAborted();
  const page=await send(ListObjectsV2Command,{Prefix:'xyz3d/quiz-v1/',ContinuationToken:token,MaxKeys:1000});
  for(const item of page.Contents||[]){const match=/^xyz3d\/quiz-v1\/([a-f0-9]{64})\/current.json$/.exec(item.Key);if(match)keys.push(match[1]);}
  token=page.IsTruncated?page.NextContinuationToken:undefined;
  if(page.IsTruncated&&!token)throw Error('video_gallery_incomplete');
 }while(token);
 const found=new Map();let cursor=0;
 await Promise.all(Array.from({length:Math.min(8,keys.length)},async()=>{
  while(cursor<keys.length){const key=keys[cursor++];signal?.throwIfAborted();const record=await records.read({key,prefix:`xyz3d/quiz-v1/${key}`},signal);if(record&&!record.value.deleted)found.set(key,record.value);}
 }));
 return found;
}
let cache,pending,generation=0;
export function invalidateGallery(){cache=null;generation++;}
export async function gallerySnapshot(){
 if(cache&&cache.expires>Date.now())return cache.value;
 if(pending)return pending;
 pending=(async()=>{
  const startedGeneration=generation;
  const c=storageConfig(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  const storage=new S3Client({region:'auto',endpoint:`https://${c.account}.r2.cloudflarestorage.com`,credentials:{accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey},maxAttempts:1});
  try{
   const [rows,records]=await Promise.all([galleryCatalog(),readGalleryRecords(storage,c.bucket,controller.signal)]);
   const items=await Promise.all(rows.map(async row=>{
    const record=records.get(row.key);let thumbnail='';
    if(record?.thumbnail)thumbnail=await getSignedUrl(storage,new GetObjectCommand({Bucket:c.bucket,Key:record.thumbnail.objectKey}),{expiresIn:900});
    return {...row,available:Boolean(record),thumbnail,updatedAt:record?.updatedAt||'',duration:record?.duration||0};
   }));
   const value={items,uploaded:records.size,unmatched:[...records.keys()].filter(k=>!rows.some(r=>r.key===k)).length,checkedAt:new Date().toISOString()};
   if(startedGeneration===generation)cache={value,expires:Date.now()+60000};return value;
  }finally{clearTimeout(timer);storage.destroy();}
 })().finally(()=>{pending=null;});
 return pending;
}
