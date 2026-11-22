'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const classroom = require('../lib/classroom.cjs');
const video = require('../lib/quiz-video.cjs');
const bridge = require('../lib/classroom-bridge.cjs');

test('Magic handles theory video locally and only looks up the lesson title once',async t=>{
  const {createWorkCache}=await import('../lib/bounded-work-cache.mjs');
  const cache=createWorkCache({ttlMs:60000,maxEntries:2});
  const calls=[];
  t.mock.method(bridge,'forward',async(route,fields)=>{
    assert.equal(route,bridge.materials);
    assert.deepEqual(fields,{action:'getClassroomTheoryTopic',questionId:'tv_1_strada'});
    calls.push('catalogue');
    return {title:'Strada'};
  });
  t.mock.method(video,'runRequest',async input=>{
    assert.equal(input.master,true);
    assert.equal(input.owner,'teacher');
    assert.equal(input.row.question,'Strada');
    assert.equal(video.identity(input.row).prefix,'xyz3d/theory-v1/1/strada');
    calls.push(input.action);
    return {canUpload:true};
  });
  for(const action of ['getQuizVideo','createQuizVideoUpload']){
    await classroom.request(action,{questionId:'tv_1_strada',question:'client label',owner:'teacher'},new EventEmitter(),new EventEmitter(),cache);
  }
  assert.deepEqual(calls,['catalogue','getQuizVideo','createQuizVideoUpload']);
});
