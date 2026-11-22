const archive=require('./video-archive.cjs');
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
function invalidateFigureVideos(){cached=null;generation++;archive.invalidate('figure');}
async function figureVideoGallery(){
 if(cached&&cached.expires>Date.now())return cached.value;
 if(pending)return pending;
 pending=(async()=>{
  const version=generation;
  const found=await archive.snapshot('figure');
  const value={items:catalog.map(row=>({...row,available:found.has(row.id),refs:figureReferences(row)})),chapters:chapterMap.chapters,uploaded:found.size,checkedAt:new Date().toISOString()};
  if(version===generation)cached={value,expires:Date.now()+60000};return value;
 })().finally(()=>{pending=null;});return pending;
}
module.exports={resolveFigureVideoRow,figureVideoGallery,invalidateFigureVideos,figureReferences};
