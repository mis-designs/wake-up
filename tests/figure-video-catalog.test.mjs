import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {FIGURE_CATALOG} from '../figure-catalog.mjs';
const require=createRequire(import.meta.url);
test('portable video figure catalog matches the reviewed figure owner',()=>{
 const catalog=require('../lib/figure-video-catalog.json');
 assert.deepEqual(catalog,Object.values(FIGURE_CATALOG).map(x=>({id:'fv_'+x.number,mediaType:'figure',figure:x.id,question:x.italian,number:x.number})));
});
