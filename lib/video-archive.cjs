'use strict';
const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { storageConfig, identity } = require('./quiz-video.cjs');
const { makeRecords } = require('./quiz-video-record.cjs');
const fail = (message, statusCode = 503) => Object.assign(Error(message), { statusCode });
const sections = {
  figure: { prefix: 'xyz3d/figure-v1/', folder: /^fig([1-9]\d{0,4})$/, tag: 'fv_' },
  quiz: { prefix: 'xyz3d/quiz-v1/', folder: /^([a-f0-9]{64})$/, tag: 'vg_' }
};
function location(id) {
  if (typeof id === 'string' && /^fv_[1-9]\d{0,4}$/.test(id))
    return identity({ mediaType: 'figure', figure: 'fig' + id.slice(3) });
  if (typeof id === 'string' && /^vg_[a-f0-9]{64}$/.test(id))
    return { key: id.slice(3), prefix: sections.quiz.prefix + id.slice(3) };
  throw fail('video_source_invalid', 400);
}
function openStorage() {
  const c = storageConfig();
  return { bucket: c.bucket, storage: new S3Client({ region: 'auto', maxAttempts: 1,
    endpoint: 'https://' + c.account + '.r2.cloudflarestorage.com',
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } }) };
}
function sender(storage, bucket) {
  return (Command, params, signal) => storage.send(new Command({ Bucket: bucket, ...params }), { abortSignal: signal });
}
async function readRecords(storage, bucket, section, signal) {
  const {prefix, folder, tag} = sections[section];
  const send = sender(storage,bucket), records = makeRecords(send,fail);
  const ids = new Set();
  let token;
  do {
    signal?.throwIfAborted();
    const page = await send(ListObjectsV2Command,{Prefix:prefix,ContinuationToken:token,MaxKeys:1000},signal);
    for (const {Key} of page.Contents || []) {
      if (!Key.startsWith(prefix) || !Key.endsWith('/current.json')) continue;
      const match = folder.exec(Key.slice(prefix.length,-'/current.json'.length));
      if (match) ids.add(tag + match[1]);
    }
    const next = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && (!next || next === token)) throw fail('video_gallery_incomplete');
    token = next;
  } while (token);
  const found = new Map(), iterator = ids.values();
  await Promise.all(Array.from({length:Math.min(8,ids.size)},async () => {
    for (const id of iterator) {
      signal?.throwIfAborted();
      const record = await records.read(location(id),signal);
      if (record && !record.value.deleted) found.set(id,record.value);
    }
  }));
  return found;
}
// Two process-local entries. Share the manifest reads between the gallery and the editor.
const snapshots = new Map();
function invalidate(section) { snapshots.delete(section); }
async function snapshot(section,signal) {
  signal?.throwIfAborted();
  let entry = snapshots.get(section);
  if (!entry || entry.expires <= Date.now()) {
    const {storage,bucket} = openStorage();
    entry = {expires:Infinity,waiters:0,controller:new AbortController()};
    snapshots.set(section,entry);
    entry.work = readRecords(storage,bucket,section,AbortSignal.any([entry.controller.signal,AbortSignal.timeout(18000)]))
      .then(value => { entry.expires=Date.now()+60000; entry.value=value; return value; })
      .catch(error => { if (snapshots.get(section)===entry) invalidate(section); throw error; })
      .finally(() => storage.destroy());
  }
  if (entry.value) return entry.value;
  entry.waiters++;
  let onAbort;
  try {
    if (!signal) return await entry.work;
    const aborted = new Promise((_,reject) => {
      onAbort=()=>reject(signal.reason);
      signal.addEventListener('abort',onAbort,{once:true});
    });
    return await Promise.race([entry.work,aborted]);
  } finally {
    if (onAbort) signal.removeEventListener('abort',onAbort);
    if (--entry.waiters===0 && !entry.value) {
      if (snapshots.get(section)===entry) invalidate(section);
      entry.controller.abort();
    }
  }
}
function metadata(id,record,section) {
  const version = record.uploadId || record.objectKey.split('/').pop().slice(0,-4);
  const title = record.question || record.fileName || record.questionId || id;
  return {id,section,title:section==='figure' ? 'Figura '+id.slice(3)+' · '+title : title,
    duration:record.duration,version};
}
async function sources(section,signal) {
  const records=await snapshot(section,signal);
  return [...records].map(([id,r])=>metadata(id,r,section));
}
async function source(action,id,data,signal,open=openStorage,sign=getSignedUrl) {
  const path = location(id), {storage,bucket} = open();
  try {
    const send=sender(storage,bucket), current=await makeRecords(send,fail).read(path,signal);
    const section=id.startsWith('fv_')?'figure':'quiz';
    const record=current?.value;
    const ref=record && !record.deleted && metadata(id,record,section);
    if (!ref || data?.version !== ref.version) {
      invalidate(section);
      throw fail('scene_source_changed',409);
    }
    if (action==='getArchiveSourceInfo') return {source:ref};
    if (action==='getArchiveVideo') {
      const url=await sign(storage,new GetObjectCommand({Bucket:bucket,Key:record.objectKey}),{expiresIn:900});
      return {available:true,url,bytes:record.bytes,duration:ref.duration,sourceVersion:ref.version};
    }
    if (action!=='getArchiveVideoPart') throw fail('invalid_action',400);
    const size=2*1024*1024, index=data.index;
    if (!Number.isSafeInteger(index) || index<0 || index>=Math.ceil(record.bytes/size)) throw fail('video_chunk_invalid',400);
    const start=index*size, end=Math.min(record.bytes,start+size)-1;
    const part=await send(GetObjectCommand,{Key:record.objectKey,Range:'bytes='+start+'-'+end},signal);
    return {base64:Buffer.from(await part.Body.transformToByteArray()).toString('base64')};
  } finally { storage.destroy(); }
}
module.exports={readRecords,snapshot,invalidate,sources,source};
