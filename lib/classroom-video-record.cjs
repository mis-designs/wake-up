'use strict';
const { neon } = require('@neondatabase/serverless');
const { randomUUID, createDecipheriv } = require('node:crypto');
const BLOCK = 1024 * 1024;
const TAG = 16;
let setup;
function connection(signal) {
  return neon(process.env.DATABASE_URL || process.env.STORAGE_URL || process.env.NEON_DATABASE_URL, {fetchOptions:{signal}});
}
async function table(signal) {
  const sql = connection(signal);
  if (!setup) {
    setup = sql.query('CREATE TABLE IF NOT EXISTS classroom_video_records (lesson_key text PRIMARY KEY, revision uuid NOT NULL, record jsonb NOT NULL)').catch(error => {setup = null; throw error;});
  }
  await setup;
  return sql;
}
async function read(id, signal) {
  const sql = await table(signal);
  const [row] = await sql.query('SELECT revision, record FROM classroom_video_records WHERE lesson_key=$1',[id.key]);
  return row ? {value:row.record,etag:row.revision} : null;
}
// Return catalogue metadata only. Playback authorization and decryption are separate.
async function sources(signal,key) {
  const sql=await table(signal);
  const rows=await sql.query(`SELECT record->>'chapter' AS chapter, record->>'lessonId' AS lesson,
      record->>'clipId' AS clip, record->>'question' AS title, record->>'fileName' AS filename,
      record->>'duration' AS duration, record->>'uploadId' AS version
    FROM classroom_video_records WHERE record->>'mediaType'='theory'
      AND record->>'deleted' IS DISTINCT FROM 'true' AND record ? 'uploadId'
      ${key ? 'AND lesson_key=$1' : ''} ORDER BY title, lesson_key`,key ? [key] : []);
  return rows.map(row=>({id:'tv_'+row.chapter+'_'+row.lesson+(row.clip?'~'+row.clip:''),
    title:row.clip ? row.filename || row.title : row.title, duration:Number(row.duration),version:row.version}));
}
async function write(id, value, etag, signal) {
  const sql = await table(signal);
  const revision = randomUUID();
  const args = [id.key,revision,JSON.stringify(value)];
  const rows = etag
    ? await sql.query('UPDATE classroom_video_records SET revision=$2,record=$3 WHERE lesson_key=$1 AND revision=$4 RETURNING revision',[...args,etag])
    : await sql.query('INSERT INTO classroom_video_records (lesson_key,revision,record) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING revision',args);
  if (!rows.length) throw Object.assign(new Error('video_changed'),{$metadata:{httpStatusCode:412}});
  return {value,etag:revision};
}
function checkEnvelope(meta,plainBytes) {
  if (!meta || meta.version !== 1 || !/^[a-f0-9]{64}$/.test(meta.key) || !/^[a-f0-9]{16}$/.test(meta.nonce)) {
    throw Object.assign(new Error('video_file_invalid'),{statusCode:400});
  }
  return {version:1,key:meta.key,nonce:meta.nonce,plainBytes};
}
function storedBytes(plain) { return plain + TAG * Math.ceil(plain / BLOCK); }
function openFirst(buffer, meta) {
  const plain = Math.min(meta.plainBytes,BLOCK);
  if (buffer.length !== plain+TAG) throw Object.assign(new Error('video_file_invalid'),{statusCode:409});
  try {
    const iv=Buffer.alloc(12); Buffer.from(meta.nonce,'hex').copy(iv);
    const decipher=createDecipheriv('aes-256-gcm',Buffer.from(meta.key,'hex'),iv);
    decipher.setAuthTag(buffer.subarray(plain));
    return Buffer.concat([decipher.update(buffer.subarray(0,plain)),decipher.final()]);
  } catch {throw Object.assign(new Error('video_file_invalid'),{statusCode:409});}
}
module.exports={sources,read,write,checkEnvelope,storedBytes,openFirst,BLOCK,TAG};
