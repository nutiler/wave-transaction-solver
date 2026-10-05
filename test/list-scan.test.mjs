import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scopedListIds} from '../extension/list-view.js';
import {expenseCandidates} from '../extension/expense-batch.js';
test('live-list scope preserves string IDs and excludes unresolved or explicitly reviewed rows',()=>{
 const report={records:[{id:'1000000000000000001',identity:'Wave transaction ID',reviewed:'Not reviewed'},{id:'1000000000000000002',identity:'Unique full-field export match',reviewed:'Unknown'},{id:'1000000000000000003',identity:'Wave transaction ID',reviewed:'Reviewed'},{id:'1000000000000000004',identity:'unresolved',reviewed:'Unknown'},{id:1000000000000000005,identity:'Wave transaction ID'},{id:null,identity:'unresolved'}]};
 assert.deepEqual([...scopedListIds(report)],['1000000000000000001','1000000000000000002']);assert.equal(scopedListIds(null).size,0);
});
test('expense batches honor an explicit live-list scope without enabling other transaction types',()=>{
 const t={kind:'Merchant rule',direction:'out',amount:1000,primary:{account:'Fictional Checking'},postings:[{},{}],categories:['Software'],proposed:'Software',id:'1000000000000000001'};
 const q=[t,{...t,id:'1000000000000000002'},{...t,kind:'Transfer candidate',id:'1000000000000000003'}];
 assert.equal(expenseCandidates(q).length,2);assert.deepEqual(expenseCandidates(q,new Set([t.id,'1000000000000000003'])).map(r=>r.id),[t.id]);assert.equal(expenseCandidates(q,new Set()).length,0);
});
