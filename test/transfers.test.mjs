import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transferPairs,checkTransferRecords} from '../extension/transfers.js';
import {workingQueue} from '../extension/workflow.js';
const business='11111111-1111-1111-1111-111111111111';
const out={id:'1000000000000000001',date:'2025-01-01',description:'Card payment',direction:'out',amount:9900,primary:{accountId:'bank',account:'Fictional Checking'},categories:['Uncategorized Expense'],kind:'Transfer candidate',partner:{id:'1000000000000000002',date:'2025-01-02'}};
const incoming={...out,id:'1000000000000000002',date:'2025-01-02',description:'Payment thank you',direction:'in',primary:{accountId:'card',account:'Fictional Card'},categories:['Uncategorized Income'],partner:{id:out.id,date:out.date}};
const pair={key:[out.id,incoming.id].join(':'),out,in:incoming};
const snapshot=t=>({identity:{business,transaction:t.id},fields:{date:t.date,description:t.description,account:t.primary.account,amount:'99.00',type:t.direction==='out'?'Withdrawal':'Deposit',category:t.categories[0]},reviewed:'Unknown',problems:[]});
test('unique transfer view deduplicates reciprocal pairs and excludes refunds and ambiguity',()=>{
 assert.equal(transferPairs([out,incoming]).length,1);
 assert.equal(transferPairs([out,{...incoming,kind:'Ambiguous transfer'}]).length,0);
 assert.equal(transferPairs([out,{...incoming,primary:out.primary}]).length,0);
 assert.equal(transferPairs([out,{...incoming,primary:{accountId:'bank',account:'Renamed bank'}}]).length,0);
 assert.equal(transferPairs([out,{...incoming,amount:9901}]).length,0);
 assert.equal(transferPairs(workingQueue([{...out,date:'2024-12-31'},incoming])).length,0);
});
test('two-record checker reads both exact records without claiming a confirmed transfer',async()=>{
 const reads=[];const result=await checkTransferRecords(pair,business,async t=>{reads.push(t.id);return snapshot(t);});
 assert.deepEqual(reads,[out.id,incoming.id]);assert(result.matches);assert(result.message.includes('remains a candidate'));assert.equal(result.sides[0].reviewed,'Unknown');
});
test('wrong business, changed fields and reader problems are withheld',async()=>{
 for(const bad of [{...snapshot(incoming),identity:{business:'22222222-2222-2222-2222-222222222222',transaction:incoming.id}},{...snapshot(incoming),fields:{...snapshot(incoming).fields,category:'Transfer from Fictional Checking'}},{...snapshot(incoming),problems:['Account unreadable']},{identity:{business,transaction:incoming.id},fields:{},problems:[]}]){
  const result=await checkTransferRecords(pair,business,async t=>t.id===out.id?snapshot(t):bad);assert.equal(result.matches,false);
 }
});
test('selection changes cancel before reading another transfer side',async()=>{
 let current=true,reads=0;const result=await checkTransferRecords(pair,business,async t=>{reads++;current=false;return snapshot(t);},()=>current);assert.equal(result,null);assert.equal(reads,1);
 await assert.rejects(()=>checkTransferRecords(pair,business,async()=>{throw Error('Unreadable record');}),/Unreadable/);
});
import {prepareTransferEdit,verifyTransferResult} from '../extension/transfers.js';
const editablePair={...pair,out:{...out,postings:[{},{}]},in:{...incoming,postings:[{},{}]}};
const menu={format:'wave-solver-transfer-menu',version:1,identity:{business,transaction:out.id},matchingGroups:1,matchingOptions:[{text:'Transfer to Fictional Card - Jan 2, 2025 - Payment thank you'}],problems:[]};
test('transfer edits require both complete original records and a unique existing match',()=>{const snapshots={[out.id]:snapshot(out),[incoming.id]:snapshot(incoming)};const request=prepareTransferEdit(editablePair,business,snapshots,menu);assert.equal(request.category,'Transfer to Fictional Card');assert.equal(request.transfer.id,incoming.id);assert.throws(()=>prepareTransferEdit(editablePair,business,{...snapshots,[incoming.id]:{...snapshot(incoming),fields:{...snapshot(incoming).fields,amount:'100.00'}}},menu),/Both live records/);assert.throws(()=>prepareTransferEdit({...editablePair,in:{...editablePair.in,primary:out.primary}},business,snapshots,menu),/unique pair/);assert.throws(()=>prepareTransferEdit(editablePair,business,snapshots,{...menu,matchingOptions:[],createOptions:menu.matchingOptions}),/exact unique/);});
test('transfer verification requires both saved categories and reports reviewed statuses independently',()=>{const saved=t=>({...snapshot(t),fields:{...snapshot(t).fields,category:t.direction==='out'?'Transfer to Fictional Card':'Transfer from Fictional Checking'},reviewed:'Reviewed'});const snapshots={[out.id]:saved(out),[incoming.id]:saved(incoming)};assert(verifyTransferResult(editablePair,snapshots,business).reviewed);assert.equal(verifyTransferResult(editablePair,{...snapshots,[incoming.id]:{...saved(incoming),reviewed:'Unknown'}},business).reviewed,false);assert.equal(verifyTransferResult(editablePair,{[out.id]:saved(out)},business).verified,false);assert.equal(verifyTransferResult(editablePair,{...snapshots,[incoming.id]:snapshot(incoming)},business).verified,false);});

test('failed transfer preflight identifies the side and field and retains copyable snapshots',()=>{const snapshots={[out.id]:snapshot(out),[incoming.id]:{...snapshot(incoming),fields:{...snapshot(incoming).fields,category:''},problems:['Category: control not readable.']}};assert.throws(()=>prepareTransferEdit(editablePair,business,snapshots,menu),e=>{assert.match(e.message,/Money in:.*Category/);assert.equal(e.diagnostics.sides.length,2);assert.equal(e.diagnostics.sides[1].snapshot,snapshots[incoming.id]);assert.equal(e.diagnostics.sides[1].checks.find(c=>c.field==='Category').state,'Unknown');return true;});});
