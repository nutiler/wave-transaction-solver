import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scopedListIds,liveExpenseLinks} from '../extension/list-view.js';
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

test('live list links only approved expenses and explains missing exports and excluded rows',()=>{
 const base={identity:'Wave transaction ID',reviewed:'Not reviewed',date:'2026-10-01'};
 const report={records:[{...base,id:'1'},{...base,id:'2'},{...base,id:'3'},{...base,id:'4',date:'2024-12-31'},{...base,id:null,identity:'unresolved'},{...base,id:'5',reviewed:'Reviewed'}]};
 const t={id:'1',kind:'Merchant rule',direction:'out',amount:1000,primary:{account:'Fictional Checking'},postings:[{},{}],categories:['Software'],proposed:'Software'};
 const queue=[t,{...t,id:'2',kind:'Transfer candidate'}];
 assert.deepEqual(liveExpenseLinks(report,queue,[...queue,{id:'4'},{id:'5'}]),{known:1,needsReview:1,missingExport:1,completedPeriod:1,unresolved:1,reviewed:1});
});
