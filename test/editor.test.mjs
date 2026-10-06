import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareCategoryEdit, verifyCategoryResult, resetAttemptReceipt } from '../extension/editor.js';
import { buildPlan } from '../extension/plan.js';
const business = '11111111-1111-1111-1111-111111111111';
const primary = { id:'1000000000000000001', account:'Test Card', accountId:'card', type:'Credit Card', debit:0, credit:5280, group:'Liability', date:'2026-09-20', description:'Test Store' };
const transaction = { id:primary.id, primary, postings:[primary,{...primary,account:'Uncategorized Expense',type:'Expense',group:'Expense',debit:5280,credit:0}], categories:['Uncategorized Expense'], date:primary.date, description:primary.description, direction:'out', amount:5280, kind:'Merchant rule', proposed:'Personal Groceries' };
const snapshot = { identity:{business,transaction:transaction.id}, problems:[], fields:{date:transaction.date,description:transaction.description,account:primary.account,type:'Withdrawal',amount:'52.80',category:'Uncategorized Expense'} };
const options = {business,sample:false,shortlist:new Set([transaction.id]),queue:[transaction],categories:['Personal Groceries']};
test('Apply needs a planned real single-category purchase with matching live fields', () => {
  assert.equal(prepareCategoryEdit(transaction,snapshot,options).category,'Personal Groceries');
  for (const changed of [{sample:true},{business:null},{shortlist:new Set()},{categories:[]}]) assert.throws(()=>prepareCategoryEdit(transaction,snapshot,{...options,...changed}));
  for (const changed of [{kind:'Transfer candidate'},{direction:'in'},{postings:[...transaction.postings,primary]},{categories:['one','two']}]) assert.throws(()=>prepareCategoryEdit({...transaction,...changed},snapshot,options));
});
test('Apply blocks changed identity, unknown fields, reader problems and live changes', () => {
  assert.throws(()=>prepareCategoryEdit(transaction,null,options));
  assert.throws(()=>prepareCategoryEdit(transaction,{...snapshot,identity:{business:'22222222-2222-2222-2222-222222222222',transaction:transaction.id}},options));
  for (const field of Object.keys(snapshot.fields)) {
    assert.throws(()=>prepareCategoryEdit(transaction,{...snapshot,fields:{...snapshot.fields,[field]:''}},options));
    assert.throws(()=>prepareCategoryEdit(transaction,{...snapshot,fields:{...snapshot.fields,[field]:'changed'}},options));
  }
  assert.throws(()=>prepareCategoryEdit(transaction,{...snapshot,problems:['ambiguous control']},options));
});
test('Imported plan authorizes only its unchanged transaction and current rule category', () => {
  const loadedPlan = buildPlan([transaction],[transaction.id],{business,sourceName:'test.csv'});
  const context = {...options,shortlist:new Set(),loadedPlan};
  assert.equal(prepareCategoryEdit(transaction,snapshot,context).id,transaction.id);
  assert.throws(()=>prepareCategoryEdit({...transaction,amount:100},snapshot,context));
  assert.throws(()=>prepareCategoryEdit(transaction,snapshot,{...context,loadedPlan:{...loadedPlan,business:'22222222-2222-2222-2222-222222222222'}}));
  assert.throws(()=>prepareCategoryEdit(transaction,snapshot,{...context,loadedPlan:{...loadedPlan,entries:loadedPlan.entries.map(e=>({...e,category:'Other category'}))}}));
});

test('Saved verification needs every field and explicit reviewed evidence', () => {
  const saved = {...snapshot,fields:{...snapshot.fields,category:'Personal Groceries'},controls:['Mark as unreviewed']};
  assert.deepEqual(verifyCategoryResult(transaction,saved,business,'Personal Groceries'),{categoryVerified:true,reviewedVerified:true,descriptionVerified:true,message:'Saved category and reviewed status verified after reloading Wave.'});
  assert.equal(verifyCategoryResult(transaction,{...saved,controls:[]},business,'Personal Groceries').reviewedVerified,false);
  assert.equal(verifyCategoryResult(transaction,{...saved,controls:['Mark as unreviewed','Mark as reviewed']},business,'Personal Groceries').reviewedVerified,false);
  for(const changed of [{identity:{business:'other',transaction:transaction.id}},{fields:{...saved.fields,amount:'99.00'}},{fields:{...saved.fields,category:'Uncategorized Expense'}},{problems:['Unreadable control']}]) {
    const result = verifyCategoryResult(transaction,{...saved,...changed},business,'Personal Groceries');
    assert.equal(result.categoryVerified,false); assert.equal(result.reviewedVerified,false);
  }
});

test('Equity merchant categories route through the personal-expense submenu', () => {
  const equity = {name:'Equity',accounts:[{name:'Personal Groceries'}]};
  assert.deepEqual(prepareCategoryEdit(transaction,snapshot,{...options,categoryGroups:[equity]}).categoryPath,['Personal Expense or Withdrawal']);
  assert.deepEqual(prepareCategoryEdit(transaction,snapshot,{...options,categoryGroups:[{...equity,name:'Expenses'}]}).categoryPath,[]);
});

test('Explicit reset archives the previous attempt only after the original live record matches',()=>{
  const receipt={saveAttempted:true,category:'Personal Groceries',message:'Unverified',previousAttempts:[{category:'Old category',saveAttempted:true}]};
  const reset=resetAttemptReceipt(transaction,snapshot,business,receipt,'2026-10-04T00:00:00.000Z');
  assert.equal(reset.saveAttempted,false); assert.equal(reset.previousAttempts.length,2); assert.equal(reset.previousAttempts[1].message,'Unverified'); assert.equal(receipt.saveAttempted,true); assert.equal(receipt.previousAttempts.length,1);
  assert.equal(prepareCategoryEdit(transaction,snapshot,options).category,reset.category);
});
test('Reset keeps locks for saved targets, changed records, wrong businesses or reviewed records',()=>{
  const receipt={saveAttempted:true,category:'Personal Groceries'};
  for(const modified of [{fields:{...snapshot.fields,category:'Personal Groceries'}},{fields:{...snapshot.fields,amount:'99.00'}},{identity:{business:'other',transaction:transaction.id}},{identity:{business,transaction:'2'}},{problems:['Unknown category']},{reviewed:'Reviewed'},{controls:['Mark as unreviewed']}]) assert.throws(()=>resetAttemptReceipt(transaction,{...snapshot,...modified},business,receipt));
  assert.throws(()=>resetAttemptReceipt(transaction,snapshot,business,{...receipt,saveAttempted:false}));
  assert.throws(()=>resetAttemptReceipt(transaction,snapshot,business,{...receipt,category:'Uncategorized Expense'}));
});

test('Wave Reviewed confirmation verifies the saved result and blocks resetting a reviewed record',()=>{
  const saved={...snapshot,fields:{...snapshot.fields,category:'Personal Groceries'},controls:['Reviewed','Save']};
  assert.equal(verifyCategoryResult(transaction,saved,business,'Personal Groceries').reviewedVerified,true);
  assert.equal(verifyCategoryResult(transaction,{...saved,controls:['Reviewed','Mark as reviewed']},business,'Personal Groceries').reviewedVerified,false);
  assert.throws(()=>resetAttemptReceipt(transaction,{...snapshot,controls:['Reviewed']},business,{saveAttempted:true,category:'Personal Groceries'}));
});
