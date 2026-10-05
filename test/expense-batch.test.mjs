import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expenseCandidates,prepareExpenseBatch} from '../extension/expense-batch.js';
const business='11111111-1111-1111-1111-111111111111';
const t={id:'1000000000000000001',date:'2026-09-01',description:'Fictional Cloud',primary:{account:'Fictional Checking'},direction:'out',amount:1000,postings:[{},{}],categories:['Uncategorized Expense'],kind:'Merchant rule',proposed:'Software'};
const snapshot={identity:{business,transaction:t.id},fields:{date:t.date,description:t.description,account:t.primary.account,type:'Withdrawal',amount:'10.00',category:t.categories[0]},problems:[],reviewed:'Unknown',controls:['Mark as reviewed']};
const options={business,categories:['Software'],categoryGroups:[],sample:false};
test('expense candidates exclude incoming, transfers, refunds, conflicts and splits',()=>{assert.equal(expenseCandidates([t]).length,1);for(const bad of [{...t,direction:'in'},{...t,kind:'Transfer candidate'},{...t,kind:'Possible refund'},{...t,kind:'Conflicting merchant rules'},{...t,postings:[{},{},{}]},{...t,categories:['Software','Materials']}])assert.equal(expenseCandidates([bad]).length,0);});
test('matching approved live category requires only review even if export is older',()=>{const live={...snapshot,fields:{...snapshot.fields,category:'Software'}};const r=prepareExpenseBatch(t,live,options);assert.equal(r.state,'review');assert.equal(r.request.reviewOnly,true);assert.equal(r.request.expected.category,'Software');assert.equal(prepareExpenseBatch(t,{...live,reviewed:'Reviewed'},options).state,'completed');});
test('unchanged purchase may change to exact approved category with personal submenu supported',()=>{assert.equal(prepareExpenseBatch(t,snapshot,options).state,'change');const r=prepareExpenseBatch(t,snapshot,{...options,categoryGroups:[{name:'Equity',accounts:[{name:'Software'}]}]});assert.deepEqual(r.request.categoryPath,['Personal Expense or Withdrawal']);});
test('changed identity, amounts, other categories or unreadable fields cannot be bulk edited',()=>{for(const bad of [{...snapshot,fields:{...snapshot.fields,amount:'10.01'}},{...snapshot,fields:{...snapshot.fields,category:'Other purpose'}},{...snapshot,identity:{business,transaction:'1000000000000000002'}},{...snapshot,problems:['Account unreadable']}])assert.throws(()=>prepareExpenseBatch(t,bad,options),e=>!!e.diagnostics);assert.throws(()=>prepareExpenseBatch(t,{...snapshot,reviewed:'Reviewed'},options),/Already reviewed in another category/);assert.throws(()=>prepareExpenseBatch(t,snapshot,{...options,sample:true}));});

test('Review updates and absent or disabled review controls need attention before editing',()=>{
 for(const controls of [['Save','Cancel','Review updates'],['Save','Cancel'],['Mark as reviewed','Reviewed']])assert.throws(()=>prepareExpenseBatch(t,{...snapshot,controls},options),e=>!!e.diagnostics && /control/.test(e.message));
 const matching={...snapshot,fields:{...snapshot.fields,category:'Software'},reviewActions:[{name:'Mark as reviewed',disabled:true}]};assert.throws(()=>prepareExpenseBatch(t,matching,options),/disabled/);
 const checkbox={...snapshot,fields:{...snapshot.fields,category:'Software'},controls:['Save','Cancel'],reviewCheckbox:{checked:false,disabled:false}};assert.equal(prepareExpenseBatch(t,checkbox,options).state,'review');
});
import {recoverStoppedExpenseReceipt} from '../extension/expense-batch.js';
test('only explicit no-click editor preflight failures can move a persisted lock to attention',()=>{
 const receipt={category:'Software',stage:'expense-edit',saveAttempted:true,reviewAttempted:true,originalSnapshot:snapshot,editOutcome:{stage:'preflight',saveAttempted:false,problem:'Cannot identify a reviewed-state control.'}};
 const recovered=recoverStoppedExpenseReceipt(receipt);assert.equal(recovered.saveAttempted,false);assert.equal(recovered.reviewAttempted,false);assert.equal(recovered.stage,'expense-preflight');assert.equal(recovered.previousAttempts.length,1);assert.equal(receipt.saveAttempted,true);
 for(const bad of [{...receipt,editOutcome:undefined},{...receipt,editOutcome:{...receipt.editOutcome,saveAttempted:true}},{...receipt,editOutcome:{...receipt.editOutcome,stage:'review'}},{...receipt,editOutcome:{...receipt.editOutcome,stage:'category selection'}},{...receipt,originalSnapshot:null}])assert.equal(recoverStoppedExpenseReceipt(bad),bad);
 assert.equal(recoverStoppedExpenseReceipt(recovered),recovered);
});
