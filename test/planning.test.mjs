import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historySuggestions } from '../extension/history.js';
import { buildPlan, validatePlan, recordSnapshot } from '../extension/plan.js';
import { defaultRules, proposals } from '../extension/model.js';
const business='11111111-1111-1111-1111-111111111111';
function t(id, description, account='Checking', amount=1500, direction='out', category='Office Expenses') {
  const primary={id,date:'2026-10-02',day:20728,description,account,accountId:account,group:account==='Card'?'Liability':'Asset',type:account==='Card'?'Credit Card':'Cash and Bank',debit:direction==='in'?amount:0,credit:direction==='out'?amount:0,modified:'2026-10-03'};
  const other={...primary,account:category,accountId:category,group:'Expense',type:'Expense',debit:primary.credit,credit:primary.debit};
  return {id,postings:[primary,other],primary,categories:[category],date:primary.date,day:primary.day,description,amount,direction,existingTransfer:false};
}
test('history suggests repeated consistent descriptions but preserves conflicts',()=>{
  const consistent=[t('1','Office Depot'),t('2','OFFICE DEPOT'),t('3','Office Depot')];
  assert.equal(historySuggestions(consistent,defaultRules)[0].category,'Office Expenses');
  const mixed=[...consistent,t('4','Office Depot','Checking',1500,'out','Parts & Materials')];
  const group=historySuggestions(mixed,defaultRules)[0];assert.equal(group.category,'');assert.equal(group.mixed,true);assert.equal(group.distribution.length,2);
});
test('uncategorized and transfer history never become automatic merchant rules',()=>{
  const data=[...['1','2','3'].map(id=>t(id,'Card Payment')), ...['4','5','6'].map(id=>t(id,'Chevron')), ...['7','8','9'].map(id=>t(id,'Unknown Shop','Checking',1500,'out','Uncategorized Expense'))];
  const groups=historySuggestions(data,defaultRules);assert.equal(groups.length,1);assert.equal(groups[0].category,'');assert.equal(groups[0].known,0);
});
test('a single historical categorization is insufficient to prepare a rule',()=>{
  const data=[t('1','New Shop'),t('2','New Shop','Checking',1500,'out','Uncategorized Expense'),t('3','New Shop','Checking',1500,'out','Uncategorized Expense')];
  const group=historySuggestions(data,defaultRules)[0];assert.equal(group.known,1);assert.equal(group.category,'');
});
test('a transfer pair is exported once even when both sides are shortlisted',()=>{
  const queue=proposals([t('1000000000000000002','Robinhood','Checking',169941,'out'),t('1000000000000000003','Payment','Card',169941,'in')],defaultRules);
  const plan=buildPlan(queue,new Set(queue.map(t=>t.id)),{business,sourceName:'accounting.csv'});
  assert.equal(plan.entries.length,1);assert.equal(plan.entries[0].ids.length,2);assert.equal(plan.executed,false);assert.equal(plan.status,'draft_requires_live_validation');
  assert.equal(typeof plan.entries[0].ids[0],'string');assert.equal(plan.entries[0].action,'propose_existing_transfer_match');
});
test('plan checks reject wrong business, missing counterpart, and changed category',()=>{
  const data=[t('1','Chevron','Checking',1500,'out','Fuel')],queue=proposals(data,defaultRules);
  const plan=buildPlan(queue,new Set(['1']),{business,sourceName:'accounting.csv'});
  assert.equal(validatePlan(plan,data,business)[0].state,'Unchanged in export');
  assert.equal(validatePlan(plan,[{...data[0],categories:['New category']}],business)[0].state,'Stale');
  assert.equal(validatePlan(plan,[],business)[0].state,'Stale');
  assert.throws(()=>validatePlan(plan,data,'other-business'));
  assert.throws(()=>buildPlan(queue,new Set(['1']),{business:null,sourceName:'accounting.csv'}));
  const transfer={...queue[0],kind:'Transfer candidate',partner:{id:'missing'},proposed:'Match card'};
  assert.throws(()=>buildPlan([transfer],new Set(['1']),{business,sourceName:'accounting.csv'}));
});
test('snapshot comparison is stable when ledger row order changes',()=>{
  const record=t('1','Chevron');assert.deepEqual(recordSnapshot(record),recordSnapshot({...record,postings:[...record.postings].reverse()}));
});
test('ambiguous proposals cannot be shortlisted into an actionable plan',()=>{
  const queue=proposals([t('1','Card payment','Checking'),t('2','Payment','Card',1500,'in'),t('3','Card payment','Other bank')],defaultRules);
  assert.throws(()=>buildPlan(queue,new Set(['1']),{business,sourceName:'accounting.csv'}));
});
test('fictional sample plans are clearly marked and rejected for real data',()=>{
  const queue=proposals([t('1','Chevron')],defaultRules),plan=buildPlan(queue,new Set(['1']),{sample:true,sourceName:'Sample'});
  assert.equal(plan.sample,true);assert.equal(plan.business,null);assert.throws(()=>validatePlan(plan,queue,business));
});
test('imported plans reject repeated IDs, numeric IDs, and unknown actions',()=>{
  const data=[t('1000000000000000001','Chevron')],queue=proposals(data,defaultRules),plan=buildPlan(queue,new Set([data[0].id]),{business,sourceName:'accounting.csv'});
  assert.throws(()=>validatePlan({...plan,entries:[...plan.entries,...plan.entries]},data,business));
  assert.throws(()=>validatePlan({...plan,entries:[{...plan.entries[0],ids:[Number(data[0].id)]}]},data,business));
  assert.throws(()=>validatePlan({...plan,entries:[{...plan.entries[0],action:'apply_now'}]},data,business));
});
