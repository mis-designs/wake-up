'use strict';
const bridge = require('./classroom-bridge.cjs');
const quizVideo = require('./quiz-video.cjs');
const actions = new Set(['getClassroom','getClassroomScene','getClassroomPage','getClassroomQuizVideo']);
const isTheoryVideo = (action,id) => (action==='getTheoryVideoPart' || quizVideo.ACTIONS.has(action)) && typeof id==='string' && id.startsWith('tv_');

function theoryRow(id,title) {
  const parts=/^tv_([1-9][0-9]*)_([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(id);
  if(!parts || id.length>120 || typeof title!=='string' || !title.trim())throw Object.assign(new Error('lesson_not_found'),{statusCode:404});
  return {id,mediaType:'theory',chapter:Number(parts[1]),lessonId:parts[2],question:title};
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
    } else {
      // Only catalogue metadata is shared across local requests. Each caller has
      // already passed its own Master admin check; storage responses are never cached here.
      const topic=await topicCache.run(questionId,()=>bridge.forward(bridge.materials,
        {action:'getClassroomTheoryTopic',questionId},AbortSignal.timeout(8000)));
      title=topic.title;
    }
    signal.throwIfAborted();
    return await quizVideo.runRequest({action,row:theoryRow(questionId,title),data:video,owner,master:true,signal});
  } finally {req.removeListener?.('aborted',close);res.removeListener?.('close',close);}
}
const verify=(hash,proof)=>bridge.verify(bridge.materials,hash,proof);
module.exports={actions,isTheoryVideo,request,verify};
