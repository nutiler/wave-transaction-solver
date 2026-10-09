import test from 'node:test';import assert from 'node:assert/strict';
import {prepareSavedCorrection} from '../extension/saved-recovery.js';
import {recoverSavedOutcomes} from '../extension/command-guidance.js';
import {openBackgroundTab,collectWithTabRecovery} from '../extension/workflow.js';
import {recordSnapshot} from '../extension/plan.js';
import {decisionRecord} from '../extension/command-center.js';
const business='11111111-1111-4111-8111-111111111111',id='1000000000000000001',category='Fictional materials';
const record={id,date:'2026-09-14',description:'Fictional merchant',direction:'out',amount:1082,primary:{account:'Fictional Checking',type:'Cash and Bank'},postings:[{account:'Fictional Checking'},{account:'Uncategorized Expense'}],categories:['Uncategorized Expense']};
const approval={key:id,business,treatment:'purchase',category,description:'Approved purchase description',ids:[id],expected:[recordSnapshot(record)],requestReview:true},t=decisionRecord(record,approval);
const snapshot={identity:{business,transaction:id},capturedAt:'2026-10-09T18:00:00Z',currency:'USD',structure:{singleCategory:true,split:false},fields:{date:record.date,description:record.description,account:record.primary.account,type:'Withdrawal',amount:'10.82',category:'Other expense'},reviewed:'Reviewed',controls:['Reviewed'],problems:[]};
const options={business,categories:[category],categoryGroups:[{name:'Expenses',accounts:[{name:category}]}],receipt:{saveAttempted:true,category,description:approval.description}};
test('correct an exact saved record to the immutable approval while guarding its current fields',()=>{
 const before=structuredClone(t),out=prepareSavedCorrection(t,snapshot,options);
 assert.equal(out.state,'correction');assert.equal(out.request.category,category);assert.equal(out.request.description,approval.description);assert.equal(out.request.liveOnly,true);assert.deepEqual(out.request.expected,snapshot.fields);assert.deepEqual(t,before);
 assert.equal(prepareSavedCorrection(t,{...snapshot,fields:{...snapshot.fields,description:approval.description,category}},options).state,'completed');
 const review=prepareSavedCorrection(t,{...snapshot,reviewed:'Not reviewed',controls:['Mark as reviewed'],fields:{...snapshot.fields,description:approval.description,category}},options);assert.equal(review.request.reviewOnly,true);
});
test('correction refuses changed immutable fields, missing or ambiguous readings, transfer categories and changed approval',()=>{
 for(const change of [{identity:{business:'other',transaction:id}},{identity:{business,transaction:'2'}},{currency:'CAD'},{structure:{singleCategory:false,split:true}},{capturedAt:null},{problems:['Ambiguous reader']},{controls:['Review updates']},...Object.entries({date:'2026-09-15',account:'Other Checking',amount:'10.83',type:'Deposit',category:'Transfer to Other Bank',description:'Truncated…'}).map(([key,value])=>({fields:{...snapshot.fields,[key]:value}}))])assert.throws(()=>prepareSavedCorrection(t,{...snapshot,...change},options),undefined,JSON.stringify(change));
 assert.throws(()=>prepareSavedCorrection(t,snapshot,{...options,receipt:{...options.receipt,category:'Different approval'}}));
 assert.throws(()=>prepareSavedCorrection(t,snapshot,{...options,categoryGroups:[{name:'Income',accounts:[{name:category}]}]}));
});
test('deposit refunds use their approved expense path; ordinary income cannot inherit it',()=>{
 const incoming={...record,direction:'in',categories:['Uncategorized Income']},refund={...approval,treatment:'refund',expected:[recordSnapshot(incoming)]},rt=decisionRecord(incoming,refund),s={...snapshot,fields:{...snapshot.fields,type:'Deposit'}};
 assert.deepEqual(prepareSavedCorrection(rt,s,options).request.categoryPath,['Refund for Expense']);
 assert.equal(prepareSavedCorrection(rt,{...s,fields:{...s.fields,description:approval.description,category:'Refund for '+category}},options).state,'completed');
 assert.throws(()=>prepareSavedCorrection(decisionRecord(incoming,{...refund,treatment:'income'}),s,options));
});
test('Apply converges a prior expense once, never repairs an uncertain transfer, and retains failures',async()=>{
 const decisions=[{key:'expense',treatment:'purchase'},{key:'transfer',treatment:'transfer'}],results={expense:{status:'uncertain'},transfer:{status:'executing'}},calls=[],saved={};
 const out=await recoverSavedOutcomes({decisions,results,repair:async d=>{calls.push('repair:'+d.key);return {categoryVerified:true,reviewedVerified:true,descriptionVerified:true};},recheck:async d=>{calls.push('read:'+d.key);return {verified:false,reviewed:false};},checkpoint:async(k,v)=>saved[k]=v});
 assert.deepEqual(calls,['repair:expense','read:transfer']);assert.equal(out.verified,1);assert.equal(saved.expense.status,'done');assert.equal(saved.transfer.status,'uncertain');
 let attempts=0;const failed=await recoverSavedOutcomes({decisions:[decisions[0]],results,repair:async()=>{attempts++;throw Error('Amount changed');},checkpoint:async(k,v)=>saved[k]=v});assert.equal(attempts,1);assert.equal(failed.attention.length,1);assert.equal(saved.expense.status,'uncertain');
});
test('closed cached scan tab is replaced in the same window without focus; other errors remain visible',async()=>{
 const calls=[],tabs={update:async()=>{throw Error('No tab with id: 123.');},getCurrent:async()=>({windowId:42}),create:async value=>{calls.push(value);return{id:9};}};
 assert.equal((await openBackgroundTab(tabs,'https://example.test',123)).id,9);assert.deepEqual(calls,[{url:'https://example.test',active:false,windowId:42}]);
 tabs.update=async()=>{throw Error('Permission denied');};await assert.rejects(openBackgroundTab(tabs,'https://example.test',123),/Permission/);assert.equal(calls.length,1);
});
test('an uncertain new correction stops further corrections and keeps later approvals untouched',async()=>{
 const decisions=[{key:'first',treatment:'purchase'},{key:'later',treatment:'purchase'}],results={first:{status:'uncertain'},later:{status:'uncertain'}},calls=[],saved={};
 const out=await recoverSavedOutcomes({decisions,results,repair:async d=>{calls.push(d.key);return {correctionAttempted:true,categoryVerified:false,reviewedVerified:false,message:'Saved correction could not be read.'};},checkpoint:async(k,v)=>saved[k]=v});
 assert.deepEqual(calls,['first']);assert.equal(saved.first.status,'uncertain');assert.equal(saved.later,undefined);assert.equal(out.stopped,true);assert.equal(out.attention.length,1);
});
test('mid-collection closure restarts at most once and respects Stop or business changes',async()=>{
 const calls=[];assert.equal(await collectWithTabRecovery(async replaced=>{calls.push(replaced);if(!replaced)throw Error('No tab with id: 123');return 'complete';}),'complete');assert.deepEqual(calls,[false,true]);
 let attempts=0;await assert.rejects(collectWithTabRecovery(async()=>{attempts++;throw Error('No tab with id: 123');}),/No tab/);assert.equal(attempts,2);
 for(const guard of [{stopped:()=>true},{current:()=>false}]){let reads=0;await assert.rejects(collectWithTabRecovery(async()=>{reads++;throw Error('No tab with id: 123');},guard));assert.equal(reads,1);}
});
