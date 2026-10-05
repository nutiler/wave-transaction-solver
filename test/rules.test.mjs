import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingRules, matchesDescription, nonPurchaseReason, validateRule } from '../extension/rules.js';
import { ruleCoverage, acceptProposal, acceptProposals, validateRulePack, sourceHash } from '../extension/rule-pack.js';
import { analyzeHistory } from '../extension/analysis.js';
import { proposals } from '../extension/model.js';
const business='11111111-1111-1111-1111-111111111111';
const rule={name:'Example Cloud',aliases:['EXAMPLE CLOUD'],category:'Hosting'};
function t(id,description='EXAMPLE CLOUD',category='Uncategorized Expense',accountId='bank',direction='out',amount=1000,day=20000){
 const primary={accountId,account:accountId,type:'Cash and Bank',group:'Asset',description,debit:direction==='in'?amount:0,credit:direction==='out'?amount:0,date:'2024-10-04',day,id};
 return{id,description,categories:[category],primary,postings:[primary,{...primary,account:category,accountId:'category',type:'Expense',group:'Expense',debit:primary.credit,credit:primary.debit}],date:'2024-10-04',day,direction,amount,existingTransfer:false};
}
test('word, prefix, exact and numeric aliases cannot consume reference codes',()=>{
 assert(matchesDescription('PURCHASE AUTHORIZED ON 10/02 EXAMPLE CLOUD #42 CA S123456789012 CARD 9876',rule));
 assert(!matchesDescription('MYEXAMPLE CLOUDY',rule));
 assert(!matchesDescription('Other Store REF # EXAMPLE CLOUD',rule));
 assert(!matchesDescription('PAYPAL INST XFER 200711 MERCHANT', { ...rule,aliases:['711'] }));
 assert(!matchesDescription('Other Store 711', { ...rule,aliases:['711'] }));
 assert(matchesDescription('711 STORE',{...rule,aliases:['711']}));
 assert(!matchesDescription('EXAMPLE CLOUD HOSTING',{...rule,matchMode:'exact'}));
 assert(!matchesDescription('Some EXAMPLE CLOUD',{...rule,matchMode:'prefix'}));
 assert(!matchesDescription('OVERDRAFT FEE FOR EXAMPLE CLOUD',rule));
});
test('account, business and category scopes are required throughout matching',()=>{
 const scoped={...rule,business,accountIds:['bank'],accountNames:['bank'],excludedAccountIds:['other'],onlyCategories:['Hosting','Uncategorized Expense'],excludeAliases:['HOSTING REFUND']};
 assert.equal(matchingRules('EXAMPLE CLOUD',[scoped]).length,0);
 assert.equal(matchingRules('EXAMPLE CLOUD',[scoped],t('1'),business).length,1);
 assert.equal(matchingRules('EXAMPLE CLOUD',[scoped],t('1','EXAMPLE CLOUD','Office'),business).length,0);
 assert.equal(matchingRules('EXAMPLE CLOUD',[scoped],t('1','EXAMPLE CLOUD','Hosting','other'),business).length,0);
 assert.equal(matchingRules('EXAMPLE CLOUD',[scoped],t('1'),business.replace(/^1/,'2')).length,0);
 assert.equal(matchingRules('EXAMPLE CLOUD',[scoped],t('1','EXAMPLE CLOUD','Hosting','bank','in'),business).length,0);
 assert.equal(matchingRules('EXAMPLE CLOUD HOSTING REFUND',[scoped],t('1'),business).length,0);
 assert.throws(()=>validateRule({...rule,accountIds:[123]}));
 assert.throws(()=>validateRule({...rule,direction:'in'}));
});
test('conflicting category rules are withheld, same-category overlaps count once',()=>{
 const tx=t('1000000000000000001');
 const conflict={...rule,name:'Other rule',category:'Software'};
 const q=proposals([tx],[rule,conflict]);
 assert.equal(q[0].kind,'Conflicting merchant rules');
 assert.equal(q[0].proposed,'');
 const c=ruleCoverage([tx],[rule,conflict]);
 assert.equal(c.conflicts,1);assert.equal(c.covered,0);assert.equal(c.conflictCents,1000);
 const same=ruleCoverage([tx],[rule,{...rule,name:'Another alias'}]);
 assert.equal(same.covered,1);assert.equal(same.coveredCents,1000);assert.equal(same.overlaps,1);
});
test('expense suggestions exclude incoming, transfers, financing, withdrawals and returns',()=>{
 for(const tx of [t('1','EXAMPLE CLOUD','Hosting','bank','in'),t('2','EXAMPLE CLOUD RETURN'),t('3','ATM WITHDRAWAL'),t('4','ONLINE TRANSFER EXAMPLE CLOUD'),t('5','CHECK # 123'),t('11','PYPL PAYIN4'),t('12','SCRATCHPAY.COM'),t('13','AFTERPAY US INC'),{...t('6'),primary:{...t('6').primary,type:'Business Loan'}},{...t('7'),existingTransfer:true}]){
 assert(nonPurchaseReason(tx));assert.equal(ruleCoverage([tx],[rule]).covered,0);
 }
 const purchase=t('8','EXAMPLE CLOUD','Hosting','bank','out',1000,20000),credit=t('9','EXAMPLE CLOUD','Hosting','bank','in',1000,20002);
 assert(proposals([purchase,credit],[rule]).every(p=>p.kind==='Possible refund'));
 const cross=t('10','Card Payment','Uncategorized Income','card','in',1000,20001);
 assert.equal(proposals([purchase,cross],[rule])[0].kind,'Transfer candidate');
});
test('rule packs bind exact CSV, business, category and unique text IDs',async()=>{
 const hash=await sourceHash('synthetic CSV'),pack={format:'wave-solver-rule-proposals',version:1,business,source:{sha256:hash},proposals:[{id:'p1',tier:'strong_proposal',rule,reason:'Synthetic evidence',evidence:{transactions:3}}]};
 assert.equal(validateRulePack(pack,{business,hash,categories:['Hosting']}),pack);
 assert.throws(()=>validateRulePack({...pack,proposals:[{...pack.proposals[0],sources:['https://']}]},{business,hash,categories:['Hosting']}));
 assert.throws(()=>validateRulePack(pack,{business,hash:'different',categories:['Hosting']}));
 assert.throws(()=>validateRulePack(pack,{business:'22222222-2222-2222-2222-222222222222',hash,categories:['Hosting']}));
 assert.throws(()=>validateRulePack(pack,{business,hash,categories:['Software']}));
 assert.throws(()=>validateRulePack({...pack,proposals:[...pack.proposals,...pack.proposals]},{business,hash,categories:['Hosting']}));
 const old={name:'Existing rule',aliases:['Old'],category:'Office'};
 const result=acceptProposal(pack,'p1',[old]);
 assert.deepEqual(result.rules[0],old);assert.equal(result.rules.length,2);assert.equal(result.decisions.p1,'accepted');
 assert.equal(result.rules[1].business,business);
 assert.equal(acceptProposal(pack,'p1',result.rules).rules.length,2);
});
test('full-history analysis reconciles groups, thresholds, aliases, partial refunds and approval plans',()=>{
 const txs=[t('1000000000000000001','EXAMPLE CLOUD','Hosting'),t('1000000000000000002','Example Cloud #12','Hosting'),t('1000000000000000003','EXAMPLE CLOUD','Hosting'),t('1000000000000000004','EXAMPLE CLOUD','Uncategorized Expense'),t('1000000000000000005','Other Store','Office'),t('1000000000000000006','EXAMPLE CLOUD REFUND','Hosting','bank','in',250,20001)];
 const dataset={transactions:txs,ledgerRows:12,categories:['Hosting','Office','Uncategorized Expense']};
 const out=analyzeHistory(dataset,{business,groups:[{...rule,narrow:true,purpose:'Explicit cloud product'}]},{sha256:'synthetic',createdAt:'2026-10-04'});
 assert.equal(out.merchants.reduce((n,m)=>n+m.transactions,0),txs.length);
 assert.equal(out.pack.proposals.filter(p=>p.tier==='strong_proposal').length,1);
 assert.equal(out.refundCandidates.length,1);assert.equal(out.refundCandidates[0].amountCents,250);
 assert(out.session.candidates.every(c=>c.requiresApproval.length===1));
 assert(!out.session.candidates.some(c=>c.id==='1000000000000000006'));
 assert.equal(out.coverage.combined.covered,4);assert.equal(out.coverage.combined.changes,1);
 assert.equal(out.session.executed,false);
 const mixed=analyzeHistory({...dataset,transactions:[...txs,t('1000000000000000007','EXAMPLE CLOUD','Office')]},{business,groups:[{...rule,narrow:true,purpose:'Cloud product'}]},{});
 assert.equal(mixed.pack.proposals[0].tier,'needs_judgment');
});


test('batch acceptance creates one result and preserves original rules and decisions',()=>{
 const pack={business,source:{sha256:'synthetic'},proposals:[{id:'p1',tier:'strong_proposal',rule},{id:'p2',tier:'needs_judgment',rule:{name:'Example Storage',aliases:['EXAMPLE STORAGE'],category:'Storage'}}]};
 const old={name:'Existing rule',aliases:['Old'],category:'Office'},rules=[old],decisions={prior:'rejected'};
 const result=acceptProposals(pack,['p1','p2'],rules,decisions,{p2:{...pack.proposals[1].rule,aliases:['EXAMPLE STORAGE','EXAMPLESTORAGE']}});
 assert.equal(result.rules.length,3);assert.deepEqual(result.decisions,{prior:'rejected',p1:'accepted',p2:'accepted'});
 assert.deepEqual(result.rules[2].aliases,['EXAMPLE STORAGE','EXAMPLESTORAGE']);
 assert.deepEqual(rules,[old]);assert.deepEqual(decisions,{prior:'rejected'});
});

test('invalid or already accepted selections fail the entire batch without mutating inputs',()=>{
 const pack={business,source:{sha256:'synthetic'},proposals:[{id:'p1',tier:'strong_proposal',rule},{id:'p2',tier:'needs_judgment',rule:{...rule,name:'Second',aliases:['SECOND']}},{id:'existing',tier:'existing_approved',rule}]};
 const rules=[],decisions={prior:'rejected'};
 for(const ids of [[],['p1','p1'],['p1','missing'],['p1','existing']])assert.throws(()=>acceptProposals(pack,ids,rules,decisions));
 assert.throws(()=>acceptProposals(pack,['p1','p2'],rules,decisions,{p2:{...rule,aliases:[]}}));
 assert.throws(()=>acceptProposals(pack,['p1','p2'],rules,{p2:'accepted'}));
 assert.deepEqual(rules,[]);assert.deepEqual(decisions,{prior:'rejected'});
});

test('history-only analysis candidates require judgment even with consistent reliable-year categories',()=>{
 const ts=['1','2','3','4'].map((id,i)=>({...t(id,'Fictional Unknown',i===3?'Uncategorized Expense':'Hosting'),date:i===3?'2026-01-01':'2024-01-01'}));
 const dataset={transactions:ts,ledgerRows:8,categories:['Hosting','Uncategorized Expense']};
 const config={business,groups:[],includeHistoryProposals:true};const a=analyzeHistory(dataset,config,{sha256:'synthetic'});
 assert.equal(a.pack.proposals.length,1);assert.equal(a.pack.proposals[0].tier,'needs_judgment');assert.equal(a.pack.proposals[0].historyOnly,true);assert.equal(a.pack.proposals[0].rule.matchMode,'exact');assert.equal(a.session.candidates.length,0);
 assert.equal(analyzeHistory(dataset,{...config,includeHistoryProposals:false},{}).pack.proposals.length,0);
});
