(() => {
  'use strict';
  const library='/vendor/quiz-video/mediabunny-1.65.2/mediabunny.min.mjs';
  async function localCut(file,start,end,signal) {
    signal.throwIfAborted();
    const blob=await new Promise((resolve,reject)=>{
      const worker=new Worker('/classroom-clip-worker.js?v=1');
      const finish=(error,bytes)=>{
        worker.terminate();signal.removeEventListener('abort',abort);
        if(error)reject(error);else resolve(new Blob([bytes],{type:'video/mp4'}));
      };
      const abort=()=>finish(signal.reason);
      signal.addEventListener('abort',abort,{once:true});
      worker.onmessage=({data})=>data.bytes ? finish(null,data.bytes) : finish(Error('clip_export_failed'));
      worker.onerror=()=>finish(Error('clip_export_failed'));
      worker.postMessage({file,start,end});
    });
    const meta=await QuizVideoOptimizer.inspect(blob,signal);
    if(Math.abs(meta.duration-(end-start))>.15 || blob.size>128*1024*1024)throw Error('clip_export_failed');
    return {blob,duration:meta.duration};
  }
  const archiveId=id=>id.startsWith('fv_') || id.startsWith('vg_');
  async function descriptor(api,source,version,signal) {
    const info=archiveId(source)
      ? await api('getArchiveVideo',{questionId:source,video:{version}},signal)
      : await api('getQuizVideo',{questionId:source,video:{}},signal);
    if(!info.available || !version || info.sourceVersion!==version)throw Error('scene_source_changed');
    return info;
  }
  const readPart=(api,id,info,signal)=>index=>archiveId(id)
    ? api('getArchiveVideoPart',{questionId:id,video:{version:info.sourceVersion,index}},signal)
    : api('getTheoryVideoPart',{questionId:id,video:{revision:info.revision,index}},signal);
  async function original(api,source,version,signal) {
    const info=await descriptor(api,source,version,signal);
    return ClassroomVideoFile.load(info,readPart(api,source,info,signal),signal);
  }
  async function excerpt(api,cut,signal) {
    const info=await descriptor(api,cut.source,cut.sourceVersion,signal);
    const part=readPart(api,cut.source,info,signal);
    if(cut.start===0 && cut.end===info.duration)return ClassroomVideoFile.load(info,part,signal);
    // Read the MP4 index and the encrypted blocks touched by this interval.
    // Exact boundaries may need a transcode when they fall between keyframes.
    const {CustomSource,Input,MP4,Output,Mp4OutputFormat,BufferTarget,Conversion,EncodedPacketSink}=await import(library);
    const bytes=await ClassroomVideoFile.reader(info,part,signal);
    const input=new Input({formats:[MP4],source:new CustomSource({getSize:()=>info.bytes,read:bytes,maxCacheSize:4*1024*1024})});
    let conversion;
    const cancel=()=>{conversion?.cancel().catch(()=>{});};
    signal.addEventListener('abort',cancel,{once:true});
    async function convert(start,copy) {
      const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target:new BufferTarget()});
      conversion=await Conversion.init({input,output,trim:{start,end:cut.end},copy,
        audio:cut.audio?{}:{discard:true},showWarnings:false});
      signal.throwIfAborted();
      if(!conversion.isValid || conversion.discardedTracks.some(t=>t.reason!=='discarded_by_user'))throw Error('codec');
      await conversion.execute();signal.throwIfAborted();
      return new Blob([output.target.buffer],{type:'video/mp4'});
    }
    try {
      try {
        const blob=await convert(cut.start,{boundaryTolerance:0});
        const meta=await QuizVideoOptimizer.inspect(blob,signal);
        if(Math.abs(meta.duration-(cut.end-cut.start))>.15)throw Error('clip_export_failed');
        return blob;
      } catch(error) {
        signal.throwIfAborted();
        if(['video_changed','access','scene_source_changed'].includes(error.message))throw error;
        // Keep the preceding keyframe for decoding, then trim the small window
        // locally on browsers without a suitable native encoder.
        const track=await input.getPrimaryVideoTrack();
        const packet=track && await new EncodedPacketSink(track).getKeyPacket(cut.start,{metadataOnly:true});
        const base=Math.max(0,packet?.timestamp || 0);
        const window=await convert(base,{mode:'forced'});
        return (await localCut(window,cut.start-base,cut.end-base,signal)).blob;
      }
    } finally {signal.removeEventListener('abort',cancel);input.dispose();}
  }
  async function upload(api,parent,prepared,name,signal,report) {
    const hash=await crypto.subtle.digest('SHA-256',await prepared.blob.arrayBuffer());
    const suffix=Array.from(new Uint8Array(hash,0,12),n=>n.toString(16).padStart(2,'0')).join('');
    const id=parent+'~'+suffix;
    const call=(action,video={})=>api(action,{questionId:id,video},signal);
    const found=await call('getTheorySourceInfo');
    if(found.source)return found.source;
    const sealed=await ClassroomVideoFile.seal(prepared.blob,signal);
    const create=relay=>call('createQuizVideoUpload',{bytes:prepared.blob.size,duration:prepared.duration,mime:'video/mp4',
      expectedRevision:null,protection:sealed.protection,fileName:name,...(relay?{transport:'relay'}:{})});
    const progress=p=>report('Caricamento dello spezzone · '+Math.round(p)+'%');
    let transfer=await create(false);
    try {await MagicQuizVideo.directUpload(transfer.uploadUrl,sealed.blob,signal,progress);}
    catch {signal.throwIfAborted();}
    let result;
    try {result=await call('confirmQuizVideoUpload',{uploadToken:transfer.uploadToken});}
    catch(error) {
      if(error.message!=='video_upload_not_received' || !transfer.relaySupported)throw error;
      transfer=await create(true);
      if(transfer.chunkBytes!==2621440 || !transfer.uploadToken)throw Error('video_upload_invalid');
      for(let i=0;i*transfer.chunkBytes<sealed.blob.size;i++){
        const chunk=sealed.blob.slice(i*transfer.chunkBytes,(i+1)*transfer.chunkBytes);
        const chunkBase64=await MagicQuizVideo.encodeChunk(chunk,signal);
        const ack=await call('uploadQuizVideoChunk',{uploadToken:transfer.uploadToken,chunkIndex:i,chunkBase64});
        if(!ack.received || ack.nextChunk!==i+1)throw Error('video_upload_invalid');
        progress(Math.min(100,100*(i+1)*transfer.chunkBytes/sealed.blob.size));
      }
      result=await call('confirmQuizVideoUpload',{uploadToken:transfer.uploadToken});
    }
    if(!result.saved || !result.sourceVersion)throw Error('video_upload_invalid');
    return {id,version:result.sourceVersion,duration:result.duration,title:name};
  }
  window.ClassroomClipMedia={original,excerpt,localCut,upload};
})();
