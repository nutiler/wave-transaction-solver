import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesDescription,matchingRules,validateRule,nonPurchaseReason} from '../extension/rules.js';
import {analyzeHistory,historicalEvidence} from '../extension/analysis.js';
import {acceptProposal,ruleFingerprint} from '../extension/rule-pack.js';
import {proposals} from '../extension/model.js';
const business='11111111-1111-1111-1111-111111111111';
const rule={name:'Example Hardware',aliases:['EXAMPLE HARDWARE'],storeAliases:['EXAMPLE HARDWARE TOOLS'],category:'Parts'};
function tx(id,category='Parts',date='2023-06-01',description='Example Hardware',direction='out'){
 const amount=1000,day=Date.parse(date+'T00:00:00Z')/86400000,primary={id,account:'Checking',accountId:'bank',type:'Cash and Bank',group:'Asset',date,day,description,debit:direction==='in'?amount:0,credit:direction==='out'?amount:0};return {id,date,day,description,direction,amount,primary,categories:[category],postings:[primary,{...primary,account:category,accountId:'category',type:'Expense',group:'Expense',credit:primary.debit,debit:primary.credit}],existingTransfer:false};
}
test('normalized aliases ignore capitalization, accents and punctuation but retain word boundaries',()=>{
 assert(matchesDescription('PURCHASE AUTHORIZED ON 08/02 ÉXAMPLE-HARDWARE #24 CA P123456789012 CARD 1234',rule));
 assert(!matchesDescription('MYEXAMPLE HARDWARES',rule));assert(!matchesDescription('Person Name "EXAMPLE HARDWARE"',rule));assert(!matchesDescription('Other Merchant REF # EXAMPLE HARDWARE',rule));assert(!matchesDescription('OVERDRAFT FEE FOR EXAMPLE HARDWARE',rule));
});
test('explicit store-number aliases recognize joined numbers only for approved merchant stems',()=>{
 const storeOnly={...rule,aliases:['EXAMPLE HARDWARE TOOLS']};
 assert(matchesDescription('EXAMPLE HARDWARE TOOLS3259 AUBURN CA',storeOnly));assert(matchesDescription('EXAMPLE HARDWARE TOOLS #3259',storeOnly));
 assert(!matchesDescription('MYEXAMPLE HARDWARE TOOLS3259',storeOnly));assert(!matchesDescription('EXAMPLE HARDWARE TOOLS3259ABC',storeOnly));assert(!matchesDescription('OTHER SHOP REF EXAMPLE HARDWARE TOOLS3259',storeOnly));
 assert.throws(()=>validateRule({...rule,storeAliases:['711']}));assert.throws(()=>validateRule({...rule,storeAliases:['WM']}));
});
test('store-number matching uses account scopes and cannot categorize incoming transactions',()=>{
 const r={...rule,accountNames:['Checking'],onlyCategories:['Parts','Uncategorized Expense']};
 assert.equal(matchingRules('EXAMPLE HARDWARE TOOLS3259',[r],tx('1','Uncategorized Expense'),business).length,1);
 assert.equal(matchingRules('EXAMPLE HARDWARE TOOLS3259',[r],tx('1','Uncategorized Expense','2023-06-01','x','in'),business).length,0);
 assert.equal(matchingRules('EXAMPLE HARDWARE TOOLS3259',[r],tx('1','Personal'),business).length,0);
});
test('card payments, student loan payments and returned deposits never become expenses',()=>{
 for(const name of ['APPLECARD GSBANK PAYMENT 012526','DEPT EDUCATION STUDENT LN 260108','DEPOSITED ITEM RETN UNPAID - PAPER','PAY OFF FAMILY LOAN'])assert(nonPurchaseReason(tx('1','Uncategorized Expense','2026-01-01',name)));
});
test('uncategorized gaps do not contradict eight consistent purchases and backlog gains stay explicit',()=>{
 const rows=Array.from({length:8},(_,i)=>tx(String(i+1))),pending=tx('9','Uncategorized Expense','2026-01-01','EXAMPLE HARDWARE TOOLS3259');rows.push(pending);
 const result=analyzeHistory({transactions:rows,categories:['Parts','Uncategorized Expense'],ledgerRows:18},{business,groups:[{...rule,narrow:true,purpose:'Hardware service'}],backlog:{records:[{id:'9'}]}},{});
 const p=result.pack.proposals[0];assert.equal(p.tier,'strong_proposal');assert.equal(p.evidence.uncategorized,1);assert.equal(p.evidence.conflictingHistory,false);assert.equal(p.evidence.backlog,1);assert.equal(p.evidence.eligibleChange,1);assert.deepEqual(result.session.candidates.map(t=>t.id),['9']);
});
test('reliable 2023–2024 history takes priority over learning-year alternatives without overwriting them',()=>{
 const rows=[...Array.from({length:20},(_,i)=>tx(String(i),'Old Category','2021-06-01')),...Array.from({length:3},(_,i)=>tx(String(i+30),'Parts','2023-06-01')),tx('50','Uncategorized Expense','2026-01-01')];
 const result=analyzeHistory({transactions:rows,categories:['Parts','Old Category','Uncategorized Expense'],ledgerRows:48},{business,groups:[{...rule,narrow:true,purpose:'Specific hardware purchase'}]},{});
 assert.equal(result.pack.proposals[0].tier,'strong_proposal');assert.equal(result.pack.proposals[0].evidence.history.recentCount,3);assert(!result.pack.proposals[0].transactionIds.includes('1'));assert(result.session.candidates.every(t=>t.date>='2025-01-01'));
});
test('conflicting reliable years remain judgment cases even for a known merchant',()=>{
 const rows=[tx('1'),tx('2','Office'),tx('3','Parts'),tx('4','Uncategorized Expense','2026-01-01')];
 const result=analyzeHistory({transactions:rows,categories:['Parts','Office','Uncategorized Expense'],ledgerRows:8},{business,groups:[{...rule,narrow:true,purpose:'Hardware service',noScope:true}]},{});
 assert.equal(result.pack.proposals[0].tier,'needs_judgment');assert.equal(historicalEvidence(rows).recentCount,3);
});
test('accepting an upgrade replaces only the unchanged identified rule and retains a local previous version',()=>{
 const old={name:'Example Hardware',aliases:['EXAMPLE HARDWARE'],category:'Parts'},other={name:'Other',aliases:['Other'],category:'Office'},updated={...rule,aliases:['EXAMPLE HARDWARE','EXAMPLEHARDWARE']};
 const pack={business,source:{sha256:'synthetic'},proposals:[{id:'p',tier:'strong_proposal',rule:updated,replaces:[ruleFingerprint(old)]}]};
 const result=acceptProposal(pack,'p',[old,other]);assert.equal(result.rules.length,2);assert.equal(result.rules[0],other);assert.deepEqual(result.rules[1].previousVersions,[old]);assert.equal(old.aliases.length,1);
 const changed={...old,accountNames:['Another account']},preserved=acceptProposal(pack,'p',[changed,other]);assert(preserved.rules.includes(changed));assert.equal(preserved.rules.length,3);
});
test('edited proposal categories are explicit local approvals and retain matching restrictions',()=>{
 const pack={business,source:{sha256:'synthetic'},proposals:[{id:'p',tier:'needs_judgment',rule:{...rule,accountNames:['Checking']}}]},edited={...pack.proposals[0].rule,category:'Tools',onlyCategories:['Tools','Uncategorized Expense']};
 const result=acceptProposal(pack,'p',[],{},edited);assert.equal(result.rules[0].category,'Tools');assert.deepEqual(result.rules[0].accountNames,['Checking']);assert.equal(result.decisions.p,'accepted');assert.throws(()=>acceptProposal(pack,'p',[],{},{...edited,aliases:[]}));
});
test('new aliases preserve same-account refunds and conflicting rule withholding',()=>{
 const purchase=tx('1','Parts','2026-01-01','EXAMPLE HARDWARE TOOLS3259'),refund=tx('2','Parts','2026-01-02','EXAMPLE HARDWARE TOOLS3259','in');
 assert(proposals([purchase,refund],[rule],5,business).every(t=>t.kind==='Possible refund'));const other={...rule,category:'Tools'};assert.equal(proposals([purchase],[rule,other],5,business)[0].kind,'Conflicting merchant rules');
});

test('replacement fingerprints never remove rules belonging to another business',()=>{
 const original={...rule,business:'22222222-2222-2222-2222-222222222222'};const pack={business,source:{sha256:'synthetic'},proposals:[{id:'p',tier:'strong_proposal',rule,replaces:[ruleFingerprint(original)]}]};const result=acceptProposal(pack,'p',[original]);assert(result.rules.includes(original));assert.equal(result.rules.length,2);
});
