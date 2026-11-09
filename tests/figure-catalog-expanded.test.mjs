import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIGURE_CATALOG,getFigureDetail} from '../figure-catalog.mjs';
const review=JSON.parse(readFileSync(new URL('../docs/figure-name-review-20261109.json',import.meta.url)));
test('reviewed R2 identities are bilingual, unique and synchronized with the audit',()=>{
 assert.equal(Object.keys(FIGURE_CATALOG).length,410);
 for(const [id,item] of Object.entries(review.entries)) {
   assert.equal(getFigureDetail(id).italian,item.italian,id);
   assert.equal(getFigureDetail(id).bangla,item.bangla,id);
 }
 for(const id of review.unavailable_r2)assert.equal(getFigureDetail(id),null,id);
 assert.match(getFigureDetail('fig517').italian,/Attraversamento pedonale/);
 assert.match(getFigureDetail('fig517').bangla,/পথচারী/);
 assert.match(getFigureDetail('fig24').italian,/sdrucciolevole/);
});
