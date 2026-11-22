'use strict';
const bridge = require('./classroom-bridge.cjs');
const quizVideo = require('./quiz-video.cjs');
const records = require('./classroom-video-record.cjs');
const archive = require('./video-archive.cjs');
const actions = new Set(['getClassroom','getClassroomScene','getClassroomPage','getClassroomQuizVideo','getClassroomSceneSettings','saveClassroomSceneSettings','getClassroomSceneSource']);
const archiveActions=new Set(['getArchiveSourceInfo','getArchiveVideo','getArchiveVideoPart']);
const archiveId=id=>typeof id==='string' && /^(?:fv_[1-9]\d{0,4}|vg_[a-f0-9]{64})$/.test(id);
const isArchive=(action,id)=>(archiveActions.has(action) && archiveId(id)) ||
  (action==='getClassroomFigureVideo' && /^fv_[1-9]\d{0,4}$/.test(id));
const isTheoryVideo = (action,id) => isArchive(action,id) || (['getTheorySources','getTheorySourceInfo','getTheoryVideoPart'].includes(action) || quizVideo.ACTIONS.has(action)) && typeof id==='string' && id.startsWith('tv_');

function theoryRow(id,title) {
  const parts=/^tv_([1-9][0-9]*)_([a-z0-9]+(?:-[a-z0-9]+)*)(?:~([a-f0-9]{24}))?$/.exec(id);
  if(!parts || id.length>128 || typeof title!=='string' || !title.trim())throw Object.assign(new Error('lesson_not_found'),{statusCode:404});
  return {id,mediaType:'theory',chapter:Number(parts[1]),lessonId:parts[2],clipId:parts[3],question:title};
}

async function request(action,data,req,res,topicCache,booksProof) {
  const controller=new AbortController();
  const close=()=>{if(!res.writableEnded)controller.abort();};
  req.once?.('aborted',close);res.once?.('close',close);
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(22000)]);
  try {
    const {entryId,questionId,video,owner}=data;
    if(!isTheoryVideo(action,questionId)) {
      return await bridge.forward(bridge.materials,{action,entryId,questionId,video,owner},signal);
    }
    let title;
    if(booksProof!==undefined) {
      const fields={action,questionId,question:data.question,phone:owner,video};
      if(!await bridge.verifyAtIssuer(bridge.video,booksProof,fields,signal)){
        throw Object.assign(new Error('master_admin_required'),{statusCode:403});
      }
      title=fields.question;
    } else if (!isArchive(action,questionId)) {
      // Only catalogue metadata is shared across local requests. Each caller has
      // already passed its own Master admin check; storage responses are never cached here.
      const topic=await topicCache.run(questionId,()=>bridge.forward(bridge.materials,
        {action:'getClassroomTheoryTopic',questionId},AbortSignal.timeout(8000)));
      title=topic.title;
    }
    signal.throwIfAborted();
    if(action==='getClassroomFigureVideo'){
      const figure=require('./figure-video.cjs').resolveFigureVideoRow(questionId);
      if(!figure)return {available:false};
      const result=await quizVideo.runRequest({action:'getQuizVideo',row:figure,allowFigureRead:true,signal});
      return result.available ? {available:true,url:result.url,duration:result.duration} : {available:false};
    }
    if(isArchive(action,questionId)) return await archive.source(action,questionId,video,signal);
    const row=theoryRow(questionId,title);
    if(action==='getTheorySources' && video?.includeSections===true) {
      const names=['theory','figure','quiz'];
      const results=await Promise.allSettled([
        records.sources(signal),archive.sources('figure',signal),archive.sources('quiz',signal)
      ]);
      signal.throwIfAborted();
      return {sources:results.flatMap((r,i)=>r.status==='fulfilled' ? r.value.map(s=>({...s,section:names[i]})) : []),
        unavailable:names.filter((_,i)=>results[i].status==='rejected')};
    }
    if(action==='getTheorySources') return {sources:await records.sources(signal)};
    if(action==='getTheorySourceInfo') return {source:(await records.sources(signal,quizVideo.identity(row).key))[0] || null};
    return await quizVideo.runRequest({action,row,data:video,owner,master:true,signal});
  } finally {req.removeListener?.('aborted',close);res.removeListener?.('close',close);}
}
const verify=(hash,proof)=>bridge.verify(bridge.materials,hash,proof);
module.exports={actions,isTheoryVideo,request,verify};
