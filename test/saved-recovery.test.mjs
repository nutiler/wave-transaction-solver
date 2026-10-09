import test from 'node:test';import assert from 'node:assert/strict';
import {verifyCategoryResult} from '../extension/editor.js';
import {currentCategoryChoice,keepCurrentCategory,receiptLocallyResolved} from '../extension/saved-recovery.js';
import {unverifiedWaveReceipts} from '../extension/finance-home.js';
const business='11111111-1111-4111-8111-111111111111',id='1000000000000000300',key=business+':'+id;
const record={id,date:'2026-06-10',description:'Fictional membership',amount:1082,direction:'out',primary:{account:'Fictional Checking',type:'Cash and Bank'},categories:['Uncategorized Expense'],postings:[{account:'Fictional Checking'},{account:'Uncategorized Expense'}]};
const snapshot={identity:{business,transaction:id},currency:'USD',structure:{singleCategory:true,split:false},fields:{date:record.date,description:record.description,account:record.primary.account,type:'Withdrawal',amount:'10.82',category:'Fictional Materials'},problems:[],reviewed:'Reviewed',controls:['Reviewed','Save'],capturedAt:'2026-10-09T21:00:00Z'};
const receipt={saveAttempted:true,category:'Fictional Project Income',categoryVerified:false,reviewedVerified:false,originalSnapshot:{...snapshot,fields:{...snapshot.fields,category:'Uncategorized Expense'}}};
test('a failed saved check identifies the precise approved/live difference and retains explicit Reviewed evidence',()=>{
 const result=verifyCategoryResult(record,snapshot,business,receipt.category);assert.equal(result.categoryVerified,false);assert.equal(result.reviewedVerified,false);assert.match(result.message,/Category differs/);assert.equal(result.verification.reviewed,'Reviewed');assert.deepEqual(result.verification.checks.filter(c=>c.state!=='Match'),[{field:'Category',expected:receipt.category,live:snapshot.fields.category,state:'Different'}]);
 const unknown=verifyCategoryResult(record,{...snapshot,fields:{...snapshot.fields,amount:''}},business,receipt.category);assert.equal(unknown.verification.checks.find(c=>c.field==='Amount').state,'Unknown');assert.match(verifyCategoryResult(record,null,business,receipt.category).message,/identity/);
});
test('explicitly keeping a freshly checked different category records local resolution without falsely verifying the old target',()=>{
 const before=structuredClone(receipt),choice=currentCategoryChoice(receipt,record,snapshot,business);assert.equal(choice.currentCategory,'Fictional Materials');
 const kept=keepCurrentCategory(receipt,record,{...snapshot,capturedAt:'2026-10-09T21:01:00Z'},business,choice);
 assert.deepEqual(receipt,before);assert.equal(kept.category,receipt.category);assert.equal(kept.saveAttempted,true);assert.equal(kept.categoryVerified,false);assert.equal(kept.reviewedVerified,false);assert.deepEqual(kept.originalSnapshot,receipt.originalSnapshot);assert.equal(receiptLocallyResolved(key,JSON.parse(JSON.stringify(kept)),business),true);assert.equal(unverifiedWaveReceipts({[key]:kept},business).length,0);assert.equal(unverifiedWaveReceipts({[key]:receipt},business).length,1);
});
test('local category acceptance rejects unknown identity, changed approved fields, structure, currency, reviewed status and transfer categories',()=>{
 for(const change of [{identity:{business:'22222222-2222-4222-8222-222222222222',transaction:id}},{identity:{business,transaction:'1000000000000000301'}},{currency:null},{currency:'CAD'},{structure:{singleCategory:false,split:true}},{reviewed:'Unknown',controls:[]},{reviewed:'Not reviewed',controls:['Mark as reviewed']},{controls:['Reviewed','Mark as reviewed']},{problems:['Unreadable selected value']},...Object.entries({date:'2026-06-11',description:'Other item',account:'Other Checking',type:'Deposit',amount:'10.83',category:'Transfer to Other Checking'}).map(([field,value])=>({fields:{...snapshot.fields,[field]:value}}))])assert.equal(currentCategoryChoice(receipt,record,{...snapshot,...change},business),null,JSON.stringify(change));
 assert.equal(currentCategoryChoice(receipt,null,snapshot,business),null);assert.equal(currentCategoryChoice(receipt,{...record,postings:[...record.postings,{}]},snapshot,business),null);assert.equal(currentCategoryChoice(receipt,{...record,primary:{...record.primary,type:'Loan'}},snapshot,business),null);
});
test('a confirmation cannot accept Wave or approval changes since the displayed comparison',()=>{
 const choice=currentCategoryChoice(receipt,record,snapshot,business);
 assert.throws(()=>keepCurrentCategory(receipt,record,{...snapshot,fields:{...snapshot.fields,category:'Another expense'}},business,choice),/changed since/);assert.throws(()=>keepCurrentCategory({...receipt,category:'Another prior approval'},record,snapshot,business,choice),/changed since/);assert.throws(()=>keepCurrentCategory(receipt,record,{...snapshot,reviewed:'Unknown',controls:[]},business,choice),/changed since/);
});
test('persisted local resolutions remain scoped to their exact original approval and verified evidence',()=>{
 const kept=keepCurrentCategory(receipt,record,snapshot,business,currentCategoryChoice(receipt,record,snapshot,business));
 assert.equal(receiptLocallyResolved(business+':transfer:'+id,kept,business),false);assert.equal(receiptLocallyResolved(business+':1000000000000000301',kept,business),false);assert.equal(receiptLocallyResolved(key,{...kept,category:'Changed approval'},business),false);assert.equal(receiptLocallyResolved(key,{...kept,resolution:{...kept.resolution,snapshot:{...snapshot,fields:{...snapshot.fields,amount:'88.00'}}}},business),false);assert.equal(receiptLocallyResolved(key,{...kept,resolution:{...kept.resolution,acceptedAt:'invalid'}},business),false);
 assert.equal(receiptLocallyResolved(key,{...kept,resolution:{...kept.resolution,baseline:{...record,description:undefined}}},business),false);assert.equal(receiptLocallyResolved(key,{...kept,resolution:{...kept.resolution,snapshot:{...snapshot,fields:{...snapshot.fields,description:{malformed:true}}}}},business),false);
});
