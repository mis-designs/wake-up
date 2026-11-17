const {identity,storageConfig}=require('./quiz-video.cjs');
const {makeRecords}=require('./quiz-video-record.cjs');
const {S3Client,ListObjectsV2Command}=require('@aws-sdk/client-s3');
const catalog=require('./figure-video-catalog.json');
const chapterMap=require('./figure-video-chapters.json');
const titles=new Map(chapterMap.chapters.map(row=>[row.chapter,row.title]));
function figureReferences(row){
 const chapters=chapterMap.figures[row.id]||[];
 return (chapters.length?chapters:['unassigned']).map(chapter=>({source:'figures',chapter,title:titles.get(chapter)||'Altre figure',id:String(row.number)}));
}
const byId=new Map(catalog.map(row=>[row.id,row]));
function resolveFigureVideoRow(id){return byId.get(String(id));}
let cached,pending,generation=0;
function invalidateFigureVideos(){cached=null;generation++;}
async function figureVideoGallery(){
 if(cached&&cached.expires>Date.now())return cached.value;
 if(pending)return pending;
 pending=(async()=>{
  const version=generation,c=storageConfig(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  const storage=new S3Client({region:'auto',endpoint:`https://${c.account}.r2.cloudflarestorage.com`,credentials:{accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey},maxAttempts:1});
  const send=(Command,input)=>storage.send(new Command({Bucket:c.bucket,...input}),{abortSignal:controller.signal});
  const records=makeRecords(send,(message,statusCode=503)=>Object.assign(Error(message),{statusCode}));
  try{
   const found=new Map(),ids=[];let token;
   do{const page=await send(ListObjectsV2Command,{Prefix:'xyz3d/figure-v1/',ContinuationToken:token,MaxKeys:1000});
    for(const item of page.Contents||[]){const m=/^xyz3d\/figure-v1\/fig([1-9][0-9]*)\/current.json$/.exec(item.Key);if(m&&byId.has('fv_'+m[1]))ids.push('fv_'+m[1]);}
    token=page.IsTruncated?page.NextContinuationToken:undefined;if(page.IsTruncated&&!token)throw Error('video_gallery_incomplete');
   }while(token);
   let cursor=0;await Promise.all(Array.from({length:Math.min(8,ids.length)},async()=>{while(cursor<ids.length){const row=byId.get(ids[cursor++]),record=await records.read(identity(row),controller.signal);if(record&&!record.value.deleted)found.set(row.id,record.value);}}));
   const value={items:catalog.map(row=>({...row,available:found.has(row.id),refs:figureReferences(row)})),chapters:chapterMap.chapters,uploaded:found.size,checkedAt:new Date().toISOString()};
   if(version===generation)cached={value,expires:Date.now()+60000};return value;
  }finally{clearTimeout(timer);storage.destroy();}
 })().finally(()=>{pending=null;});return pending;
}
module.exports={resolveFigureVideoRow,figureVideoGallery,invalidateFigureVideos,figureReferences};
