import test from 'node:test';import assert from 'node:assert/strict';
import {verifyCategoryResult} from '../extension/editor.js';
import {commandBaselineRecord,decisionRecord} from '../extension/command-center.js';
import {recordSnapshot} from '../extension/plan.js';
import {refundGroupChoices,decisionProposals} from '../extension/operator-decisions.js';
import {prepareExpenseBatch} from '../extension/expense-batch.js';
const business='11111111-1111-4111-8111-111111111111',category='Fictional Rent — Office, Shop, Yard, Storage',id='1000000000000000314';
const record={id,date:'2026-09-14',description:'Fictional refund',direction:'in',amount:125000,primary:{account:'Fictional Checking',type:'Cash and Bank'},postings:[{account:'Fictional Checking'},{account:'Uncategorized Income'}],categories:['Uncategorized Income'],kind:'Credit / incoming'};
const decision={key:id,business,treatment:'refund',category,description:record.description,ids:[id],expected:[recordSnapshot(record)],requestReview:true};
const approved=decisionRecord(record,decision),saved={identity:{business,transaction:id},currency:'USD',structure:{singleCategory:true,split:false},fields:{date:record.date,description:record.description,account:record.primary.account,type:'Deposit',amount:'1250',category:'Refund for '+category},reviewed:'Reviewed',controls:['Reviewed'],problems:[]};
test('an explicitly approved deposit refund verifies Wave’s Refund for expense label against the same category',()=>{
 for(const t of [approved,commandBaselineRecord(decision)]){const result=verifyCategoryResult(t,saved,business,category);assert.equal(result.categoryVerified,true);assert.equal(result.reviewedVerified,true);assert.equal(result.descriptionVerified,true);const check=result.verification.checks.find(c=>c.field==='Category');assert.equal(check.expected,category);assert.equal(check.live,saved.fields.category);assert.equal(check.state,'Match');assert.deepEqual(result.verification.categoryLabel,{kind:'refund',approvedCategory:category,displayedCategory:saved.fields.category});}
 assert.equal(verifyCategoryResult(approved,{...saved,fields:{...saved.fields,category}},business,category).reviewedVerified,true);
 const prepared=prepareExpenseBatch(approved,saved,{business,categories:[category],categoryGroups:[{name:'Expenses',accounts:[{name:category}]}]});assert.equal(prepared.state,'completed');
});
test('legacy explicit operator refunds also recognize the same saved label',()=>{
 const choices=refundGroupChoices({type:'merchant',records:[record]},category,{business,categories:[category]}),[t]=decisionProposals([record],choices,business);assert.equal(verifyCategoryResult(t,saved,business,category).reviewedVerified,true);
});
test('income, personal deposits, raw refund guesses, outgoing purchases and changed approvals do not acquire refund equivalence',()=>{
 for(const t of [record,{...record,intent:'refund',proposed:category},...['income','personal-deposit'].map(treatment=>decisionRecord(record,{...decision,treatment})),decisionRecord({...record,direction:'out'},{...decision,treatment:'purchase',expected:[recordSnapshot({...record,direction:'out'})]}),{...approved,commandDecision:{...decision,business:'22222222-2222-4222-8222-222222222222'}},{...approved,commandDecision:{...decision,category:'Other category'}}])assert.equal(verifyCategoryResult(t,saved,business,category).categoryVerified,false);
});
test('a refund prefix cannot hide changes to category, identity, date, amount, account, description, direction or reader problems',()=>{
 for(const change of [{identity:{business,transaction:'1000000000000000315'}},{identity:{business:'22222222-2222-4222-8222-222222222222',transaction:id}},{problems:['Ambiguous category']},{currency:null},{currency:'CAD'},{structure:{singleCategory:false,split:true}},...Object.entries({date:'2026-09-15',description:'Other payment',account:'Other Checking',type:'Withdrawal',amount:'1250.01',category:'Refund for Other rent'}).map(([field,value])=>({fields:{...saved.fields,[field]:value}}))])assert.equal(verifyCategoryResult(approved,{...saved,...change},business,category).categoryVerified,false,JSON.stringify(change));
 assert.equal(verifyCategoryResult(approved,{...saved,reviewed:'Unknown',controls:[]},business,category).reviewedVerified,false);
});
