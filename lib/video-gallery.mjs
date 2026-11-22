import { createRequire } from 'node:module';
import { LOCAL_MAGIC_BOOK_ROWS } from '../api/local-quiz-bank.mjs';
import { applyQuizFigureCorrections } from '../api/quiz-figure-corrections.mjs';
import { loadQuizBank } from '../api/quizbank-catalog.mjs';
const require=createRequire(import.meta.url);
const {identity,storageConfig}=require('./quiz-video.cjs');
const archive=require('./video-archive.cjs');
const {S3Client,GetObjectCommand}=require('@aws-sdk/client-s3');
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
 const found=await archive.readRecords(storage,bucket,'quiz',signal);
 return new Map([...found].map(([id,record])=>[id.slice(3),record]));
}
let cache,pending,generation=0;
export function invalidateGallery(){cache=null;generation++;archive.invalidate('quiz');}
export async function gallerySnapshot(){
 if(cache&&cache.expires>Date.now())return cache.value;
 if(pending)return pending;
 pending=(async()=>{
  const startedGeneration=generation;
  const c=storageConfig(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  const storage=new S3Client({region:'auto',endpoint:`https://${c.account}.r2.cloudflarestorage.com`,credentials:{accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey},maxAttempts:1});
  try{
   const [rows,records]=await Promise.all([galleryCatalog(),archive.snapshot('quiz',controller.signal)]);
   const items=await Promise.all(rows.map(async row=>{
    const record=records.get(row.id);let thumbnail='';
    if(record?.thumbnail)thumbnail=await getSignedUrl(storage,new GetObjectCommand({Bucket:c.bucket,Key:record.thumbnail.objectKey}),{expiresIn:900});
    return {...row,available:Boolean(record),thumbnail,updatedAt:record?.updatedAt||'',duration:record?.duration||0};
   }));
   const value={items,uploaded:records.size,unmatched:[...records.keys()].filter(k=>!rows.some(r=>r.id===k)).length,checkedAt:new Date().toISOString()};
   if(startedGeneration===generation)cache={value,expires:Date.now()+60000};return value;
  }finally{clearTimeout(timer);storage.destroy();}
 })().finally(()=>{pending=null;});
 return pending;
}
