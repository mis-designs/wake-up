'use strict';
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const { ACTIONS } = require('./quiz-video.cjs');
const actions = new Set(['getClassroom','getClassroomScene','getClassroomQuizVideo']);
const isTheoryVideo = (action, id) => (action === 'getTheoryVideoPart' || ACTIONS.has(action)) && typeof id === 'string' && id.startsWith('tv_');
const digest = body => createHash('sha256').update(body).digest('hex');
function signature(hash, expires) {
  return createHmac('sha256', process.env.SESSION_SECRET)
    .update('tmm-allbooks-classroom-v1\n' + expires + '\n' + hash).digest('hex');
}
function verify(hash, proof, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(hash) || !/^\d{13}\.[a-f0-9]{64}$/.test(proof)) return false;
  const [expires, mac] = proof.split('.');
  return Number(expires) >= now && Number(expires) <= now + 60000 &&
    timingSafeEqual(Buffer.from(mac,'hex'), Buffer.from(signature(hash,expires),'hex'));
}
async function request(action, data, req, res) {
  const {entryId, questionId, video, owner} = data;
  const body = JSON.stringify({action,entryId,questionId,video,owner});
  const expires = Date.now() + 45000;
  const controller = new AbortController();
  const close = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', close);
  try {
    const response = await fetch('https://www.tmmbooks.eu/api/quiz', {
      method:'POST', redirect:'error', cache:'no-store',
      headers:{'Content-Type':'application/json','X-TMM-Classroom-Proof':expires+'.'+signature(digest(body),expires)},
      body, signal:AbortSignal.any([controller.signal,AbortSignal.timeout(22000)])
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'classroom_unavailable'),{statusCode:response.status});
    return result;
  } finally { res.removeListener('close', close); }
}
module.exports = {actions,isTheoryVideo,request,verify};
