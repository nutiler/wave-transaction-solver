import {test} from 'node:test';
import assert from 'node:assert/strict';
import {historySuggestions,acceptHistoryRules} from '../extension/history.js';
import {matchingRules} from '../extension/rules.js';
const business='11111111-1111-1111-1111-111111111111';
function t(id,description='Example Cloud',category='Software',date='2024-01-01',direction='out',account='Checking'){
 const primary={account,accountId:account,type:'Cash and Bank',group:'Asset'};
 return {id,description,date,day:Date.parse(date)/86400000,direction,amount:1234,primary,postings:[primary,{account:category,group:category.startsWith('Personal')?'Equity':'Expense'}],categories:[category],existingTransfer:false};
}
const data=[t('1'),t('2'),t('3'),t('4','Example Cloud','Uncategorized Expense','2026-01-01')];
const options={business,categories:['Software','Utilities','Personal Groceries','Uncategorized Expense'],transactions:data};
test('history cleans only bank wrappers and respects reference and store boundaries',()=>{
 const ts=data.map((x,i)=>({...x,description:'PURCHASE AUTHORIZED ON 01/01 Example Cloud S12345678901'+i+' CARD 0001'}));
 const g=historySuggestions(ts,[])[0];assert.equal(g.count,4);assert.deepEqual(g.aliases,['Example Cloud']);
 const {rules}=acceptHistoryRules([g],[{id:g.id,category:'Software'}],[],options);
 assert.equal(matchingRules('PURCHASE AUTHORIZED ON 01/01 Example Cloud REF 999',rules,data[0],business).length,1);
 assert.equal(matchingRules('Other shop REF Example Cloud',rules,data[0],business).length,0);
 assert.equal(historySuggestions([...data,...data.map(x=>({...x,id:x.id+'9',description:'Example Cloud 100'}))],[]).length,2);
});
test('2023–2024 evidence is preferred but conflicts still need an explicit choice',()=>{
 const ts=[t('1','Shop','Utilities','2021-01-01'),...['2','3','4'].map(id=>t(id,'Shop','Software'))];
 const g=historySuggestions(ts,[])[0];assert.equal(g.category,'');assert.equal(g.recommendedCategory,'Software');assert.equal(g.mixed,true);assert.equal(g.recentDistribution[0].count,3);
});
test('equity personal categories count as history; one uncategorized gap is not a conflict',()=>{
 const ts=data.map(x=>({...x,categories:[x.id==='4'?'Uncategorized Expense':'Personal Groceries'],postings:[x.primary,{account:'Personal Groceries',group:'Equity'}]}));
 const g=historySuggestions(ts,[])[0];assert.equal(g.category,'Personal Groceries');assert.equal(g.known,3);assert.equal(g.unresolved,1);
});
test('approved account scope retains other-account history and prevents overwriting conflicts',()=>{
 const rules=[{name:'Cloud on Checking',aliases:['Example Cloud'],category:'Software',accountNames:['Checking']}];
 const ts=[...data,t('5','Example Cloud','Uncategorized Expense','2026-01-02','out','Card')];
 const g=historySuggestions(ts,rules)[0];assert.equal(g.count,5);assert.equal(g.uncovered,1);
 const result=acceptHistoryRules([g],[{id:g.id,category:'Software'}],rules,{...options,transactions:ts});assert.equal(result.rules.length,2);assert.equal(result.rules[0],rules[0]);
 assert.throws(()=>acceptHistoryRules([g],[{id:g.id,category:'Utilities'}],rules,{...options,transactions:ts}),/conflict/);
});
test('history batch validates all choices before returning and keeps inputs unchanged',()=>{
 const ts=[...data,...data.map(x=>({...x,id:x.id+'0',description:'Example Power',categories:['Utilities']}))];const items=historySuggestions(ts,[]);
 const chosen=items.map(g=>({id:g.id,category:g.category}));const result=acceptHistoryRules(items,chosen,[],{...options,transactions:ts});assert.equal(result.added.length,2);
 const original=[];assert.throws(()=>acceptHistoryRules(items,[chosen[0],{...chosen[1],category:'Missing'}],original,{...options,transactions:ts}));assert.deepEqual(original,[]);
 assert.throws(()=>acceptHistoryRules(items,[chosen[0],chosen[0]],[],{...options,transactions:ts}));
 assert.throws(()=>acceptHistoryRules(items,[],[],options));
 assert.throws(()=>acceptHistoryRules(items,[{...chosen[0],category:'Uncategorized Expense'}],[],options));
});
test('refunds, incoming, payment, financing and quoted person memos do not supply purchase rules',()=>{
 const ts=[...data,...data.map(x=>({...x,id:x.id+'1',description:'Card Payment'})),...data.map(x=>({...x,id:x.id+'2',description:'PAYIN4'})),...data.map(x=>({...x,id:x.id+'3',description:'Fictional Person "Rent"'})),t('9','Example Cloud','Software','2024-01-01','in')];
 assert.equal(historySuggestions(ts,[]).length,0); // Every cloud charge has a same-account equal-amount credit within 60 days.
});
test('backlog counts use exact text IDs and exclude pre-period records',()=>{
 const g=historySuggestions(data,[],3,business,{backlogIds:['1','4']})[0];assert.equal(g.backlog,1);assert.equal(g.backlogCents,1234);assert.equal(typeof g.transactionIds[0],'string');
});
test('history batch protects already established different categories',()=>{
 const items=historySuggestions(data,[]),{rules}=acceptHistoryRules(items,[{id:items[0].id,category:'Software'}],[],options);
 assert.equal(matchingRules('Example Cloud',rules,t('9','Example Cloud','Utilities'),business).length,0);
 assert.equal(matchingRules('Example Cloud',rules,t('9','Example Cloud','Software','2026-01-01','in'),business).length,0);
});

test('accepted mixed history moves to current rules while known exceptions remain protected',()=>{
 const ts=[...data,t('5','Example Cloud','Utilities')],items=historySuggestions(ts,[]),result=acceptHistoryRules(items,[{id:items[0].id,category:'Software'}],[],{...options,transactions:ts});
 assert.equal(historySuggestions(ts,result.rules,3,business).length,0);
 assert.equal(matchingRules('Example Cloud',result.rules,ts.at(-1),business).length,0);
 assert.equal(historySuggestions(ts,[],3,business).length,1);
});
