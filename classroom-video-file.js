(function(root) {
  'use strict';
  const block = 1024 * 1024, tag = 16;
  const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2,'0')).join('');
  const unhex = value => Uint8Array.from(value.match(/../g), pair => parseInt(pair,16));
  function iv(nonce,index) {
    const bytes = new Uint8Array(12);
    bytes.set(unhex(nonce)); new DataView(bytes.buffer).setUint32(8,index); return bytes;
  }
  async function convert(blob, protection, encrypt, signal) {
    const mode = encrypt ? 'encrypt' : 'decrypt';
    const key = await crypto.subtle.importKey('raw',unhex(protection.key),'AES-GCM',false,[mode]);
    const pieces = [], step = encrypt ? block : block + tag;
    for(let start=0,index=0; start<blob.size; start+=step,index++) {
      signal.throwIfAborted();
      const input = await blob.slice(start,start+step).arrayBuffer();
      pieces.push(await crypto.subtle[mode]({name:'AES-GCM',iv:iv(protection.nonce,index)},key,input));
    }
    signal.throwIfAborted();
    return new Blob(pieces,{type:'video/mp4'});
  }
  async function seal(blob,signal) {
    const protection = {version:1,key:hex(crypto.getRandomValues(new Uint8Array(32))),nonce:hex(crypto.getRandomValues(new Uint8Array(8)))};
    return {blob:await convert(blob,protection,true,signal),protection};
  }
  async function load(result,readPart,signal) {
    const meta = result.protection;
    const expected = meta.plainBytes + Math.ceil(meta.plainBytes/block) * tag;
    let encrypted;
    try {
      const response = await fetch(result.url,{signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok) throw new Error('video_unreadable');
      encrypted = await response.blob();
      if(encrypted.size !== expected) throw new Error('video_unreadable');
    } catch(error) {
      signal.throwIfAborted();
      const parts=[];
      for(let index=0;index<Math.ceil(expected/(2*block));index++) {
        const response=await readPart(index);
        const part=Uint8Array.from(atob(response.base64),c=>c.charCodeAt(0));
        if(part.length !== Math.min(2*block,expected-index*2*block)) throw new Error('video_unreadable');
        parts.push(part);
      }
      encrypted=new Blob(parts);
    }
    const video=await convert(encrypted,meta,false,signal);
    if(video.size !== meta.plainBytes) throw new Error('video_unreadable');
    return video;
  }
  root.ClassroomVideoFile={seal,load};
})(globalThis);
