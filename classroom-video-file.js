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
    if (!meta) {
      const read=await reader(result,readPart,signal);
      return new Blob([await read(0,result.bytes)],{type:'video/mp4'});
    }
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
  async function reader(info,readPart,signal) {
    const meta=info.protection, stride=block+tag, stored=meta ? meta.plainBytes+Math.ceil(meta.plainBytes/block)*tag : info.bytes;
    const key=meta && await crypto.subtle.importKey('raw',unhex(meta.key),'AES-GCM',false,['decrypt']);
    const blocks=new Map(), parts=new Map();
    let relay=false,whole;
    function cached(cache,index,make) {
      if(!cache.has(index)){
        if(cache.size>=6)cache.delete(cache.keys().next().value);
        cache.set(index,make());
      }
      return cache.get(index);
    }
    async function storedRange(start,end) {
      signal.throwIfAborted();
      if(whole)return whole.slice(start,end).arrayBuffer();
      if(!relay)try {
        const res=await fetch(info.url,{headers:{Range:'bytes='+start+'-'+(end-1)},signal,
          credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
        if(res.status===206){
          const data=await res.arrayBuffer();if(data.byteLength!==end-start)throw Error('video_unreadable');
          return data;
        }
        if(res.status===200){
          const blob=await res.blob();if(blob.size!==stored)throw Error('video_unreadable');
          whole=blob;return blob.slice(start,end).arrayBuffer();
        }
        throw Error('video_unreadable');
      } catch {signal.throwIfAborted();relay=true;}
      const pieces=[],size=2*block;
      for(let offset=start;offset<end;){
        const i=Math.floor(offset/size);
        const data=await cached(parts,i,async()=>Uint8Array.from(atob((await readPart(i)).base64),c=>c.charCodeAt(0)));
        if(data.length!==Math.min(size,stored-i*size))throw Error('video_unreadable');
        const next=Math.min(end,(i+1)*size);
        pieces.push(data.subarray(offset-i*size,next-i*size));offset=next;
      }
      return new Blob(pieces).arrayBuffer();
    }
    if(!meta)return async (start,end)=>new Uint8Array(await storedRange(start,end));
    return async (start,end)=>{
      const out=new Uint8Array(end-start);
      for(let pos=start;pos<end;){
        signal.throwIfAborted();
        const i=Math.floor(pos/block);
        const data=await cached(blocks,i,async()=>new Uint8Array(await crypto.subtle.decrypt(
          {name:'AES-GCM',iv:iv(meta.nonce,i)},key,await storedRange(i*stride,Math.min(stored,(i+1)*stride)))));
        const next=Math.min(end,(i+1)*block);
        out.set(data.subarray(pos-i*block,next-i*block),pos-start);pos=next;
      }
      return out;
    };
  }
  root.ClassroomVideoFile={seal,load,reader};
})(globalThis);
