// The file stays on the device until the administrator confirms the selected interval.
const vendor='/vendor/quiz-video/ffmpeg-0.12.15-core-0.12.10/';
importScripts(vendor+'ffmpeg-core.js');
self.onmessage=async ({data:{file,start,end}})=>{
  try {
    const wasmURL=new URL(vendor+'ffmpeg-core.wasm',location.href).href;
    const core=await createFFmpegCore({mainScriptUrlOrBlob:location.href+'#'+btoa(JSON.stringify({wasmURL}))});
    core.FS.mkdir('/source');
    core.FS.mount(core.FS.filesystems.WORKERFS,{blobs:[{name:'original',data:file}]},'/source');
    const result=core.exec('-ss',String(start),'-i','/source/original','-t',String(end-start),
      '-map','0:v:0','-map','0:a:0?','-map_metadata','-1','-map_chapters','-1',
      '-c:v','libx264','-preset','ultrafast','-crf','18','-threads','1','-pix_fmt','yuv420p',
      '-c:a','aac','-b:a','160k','-movflags','+faststart','cut.mp4');
    if(result!==0)throw Error();
    const bytes=core.FS.readFile('cut.mp4');
    self.postMessage({bytes},[bytes.buffer]);
  } catch { self.postMessage({error:'clip_export_failed'}); }
};
