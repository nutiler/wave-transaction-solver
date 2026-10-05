import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scopedListIds,liveExpenseLinks,liveMerchantAudit} from '../extension/list-view.js';
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

test('live merchant audit checks approved rules and explains exclusions without enabling transfers or credits',()=>{
 const business='11111111-1111-1111-1111-111111111111';
 const base={date:'2026-10-01',description:'Example Cloud',primary:{account:'Fictional Checking',accountId:'bank'},categories:['Uncategorized Expense'],postings:[{},{}],amount:1000,direction:'out'};
 const tx=[{...base,id:'1'},{...base,id:'2'},{...base,id:'3',direction:'in'},{...base,id:'4',description:'Example Store'},{...base,id:'5',primary:{account:'Other account',accountId:'other'}}];
 const queue=tx.map((t,i)=>({...t,kind:i===0?'Merchant rule':i===1?'Transfer candidate':'Unclassified',proposed:'Software',reason:i===1?'Existing transfer candidate':'Needs purpose review'}));
 const rules=[{name:'Cloud',aliases:['Example Cloud'],category:'Software',accountIds:['bank'],business}];
 const report={records:tx.map(t=>({id:t.id,date:t.date,description:t.description,identity:'Wave transaction ID',reviewed:'Not reviewed'}))};
 const audit=liveMerchantAudit(report,rules,tx,queue,business);
 assert.equal(audit.known,1);assert.equal(audit.blocked,3);assert.equal(audit.unmatched,1);assert.equal(audit.rows[1].reason,'Existing transfer candidate');assert.match(audit.rows[2].reason,/excludes/);assert.match(audit.rows[4].reason,/excludes/);assert.equal(audit.rows[0].rules[0].category,'Software');
});
test('rule audit keeps conflicting categories and changed live descriptions out of the known result',()=>{
 const t={id:'1',date:'2026-10-01',description:'Example Cloud',direction:'out',amount:1000,primary:{account:'Fictional Checking'},postings:[{},{}],categories:['Software'],kind:'Merchant rule',proposed:'Software'};
 const record={id:'1',date:t.date,description:t.description,identity:'Wave transaction ID',reviewed:'Not reviewed'};
 const rules=[{name:'Cloud',aliases:['Example Cloud'],category:'Software'},{name:'Other purpose',aliases:['Example Cloud'],category:'Other'}];
 assert.equal(liveMerchantAudit({records:[record]},rules,[t],[t]).rows[0].reason,'Conflicting approved categories.');
 assert.equal(liveMerchantAudit({records:[{...record,description:'Example Cloud new description'}]},rules.slice(0,1),[t],[t]).known,0);
});
