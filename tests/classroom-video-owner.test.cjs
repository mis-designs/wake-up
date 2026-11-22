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

test('one metadata read lists the available recordings; a custom clip has its own storage key',async t=>{
  const records=require('../lib/classroom-video-record.cjs');
  const cache={run:async()=>({title:'Strada'})},calls=[];
  const item={id:'tv_1_strada',title:'Strada',duration:147,version:'v1'};
  t.mock.method(records,'sources',async(signal,key)=>{calls.push(key);return [item];});
  const get=action=>classroom.request(action,{questionId:item.id,owner:'teacher'},new EventEmitter(),new EventEmitter(),cache);
  assert.deepEqual(await get('getTheorySources'),{sources:[item]});
  assert.deepEqual(await get('getTheorySourceInfo'),{source:item});
  const identity=id=>video.identity({id,mediaType:'theory'});
  assert.deepEqual(calls,[undefined,identity(item.id).key]);
  const custom=identity(item.id+'~'+'b'.repeat(24));
  assert.notEqual(custom.key,identity(item.id).key);assert.match(custom.prefix,/\/clips\/b{24}$/);
  assert.throws(()=>identity(item.id+'~invalid'),/lesson_not_found/);
});
test('classroom figures read the gallery original by number without a dedicated theory upload',async t=>{
  const calls=[];
  t.mock.method(video,'runRequest',async input=>{
    calls.push([input.action,input.row.figure,input.allowFigureRead]);
    return {available:true,url:'https://example.invalid/fig1.mp4',duration:8};
  });
  const result=await classroom.request('getClassroomFigureVideo',{questionId:'fv_1',owner:'teacher'},new EventEmitter(),new EventEmitter());
  assert.deepEqual(result,{available:true,url:'https://example.invalid/fig1.mp4',duration:8});
  assert.deepEqual(calls,[['getQuizVideo','fig1',true]]);
});
