import test from 'node:test';import assert from 'node:assert/strict';
import {prepareSubscriptionTransactions,findSubscriptions,subscriptionMerchant,saveSubscriptionChoice,subscriptionChoice,observeSubscriptionChoices,undoSubscriptionChoice,subscriptionTotals} from '../extension/subscriptions.js';
import {recordSnapshot} from '../extension/plan.js';import {evidenceSnapshot} from '../extension/service-solvers.js';
import {validateLocalBackup,planBackupImport} from '../extension/migration.js';
const business='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
let serial=100;
const tx=(date,amount=2000,description='Fictional Cloud',account='Fictional Bank',extras={})=>({id:String(++serial),date,amount,description,direction:'out',currency:'USD',categories:['Software'],primary:{account,type:'Cash and Bank'},postings:[{account},{account:'Software'}],...extras});
const analyze=transactions=>findSubscriptions(prepareSubscriptionTransactions({business,transactions}),{asOf:'2026-10-09'});
const monthly=(amount=2000,name='Fictional Cloud',account='Fictional Bank')=>['2026-05-31','2026-06-30','2026-07-31','2026-08-31'].map(date=>tx(date,amount,name,account));
test('all accounting history participates, including reviewed and closed-period records; overlapping scans do not double-count',()=>{
 const rows=monthly(),report={business,filter:'ALL',completeness:'count-confirmed',expectedTotal:rows.length,capturedAt:'2026-10-09T18:00:00Z',records:rows.map(t=>({id:t.id,date:t.date,description:t.description,account:t.primary.account,amountCents:t.amount,category:'Software',reviewed:'Reviewed'}))};
 const prep=prepareSubscriptionTransactions({business,transactions:[...rows,...rows],reports:[report]});assert.equal(prep.transactions.length,4);assert.equal(prep.coverage.fullCountConfirmed,true);assert.equal(analyze(rows.map(r=>({...r,date:r.date.replace('2026','2023')}))).findings.length,1);
 const f=findSubscriptions(prep,{asOf:'2026-10-09'}).findings[0];assert.equal(f.confidence,'likely');assert.equal(f.frequency,'Monthly');assert.equal(f.nextDate,'2026-09-30');assert.equal(f.overdue,true);assert.equal(f.monthlyCents,2000);assert.equal(f.annualCents,24000);assert.doesNotMatch(f.explanation,/cancel/i);
});
test('calendar shifts, leap days, missing cycles and annual observations stay honest',()=>{
 for(const dates of [['2026-01-31','2026-02-28','2026-03-31'],['2026-05-03','2026-06-05','2026-07-02']])assert.equal(analyze(dates.map(d=>tx(d))).findings[0].frequency,'Monthly');
 const annual=analyze(['2024-02-29','2025-02-28'].map(d=>tx(d))).findings[0];assert.equal(annual.frequency,'Annual');assert.equal(annual.confidence,'possible');assert.equal(annual.nextDate,'2026-02-28');
 const gaps=analyze(['2026-01-10','2026-03-10','2026-04-10'].map(d=>tx(d))).findings[0];assert.equal(gaps.missingCycles,1);assert.match(gaps.explanation,/not observed/);
 assert.equal(analyze(['2024-01-01','2026-01-01'].map(d=>tx(d))).findings.length,0);
});
test('weekly, fortnightly and quarterly patterns are distinguished without assuming missed weekly bills',()=>{
 for(const [dates,frequency] of [[['2026-08-01','2026-08-08','2026-08-15','2026-08-22'],'Weekly'],[['2026-07-01','2026-07-15','2026-07-29'],'Every two weeks'],[['2026-01-05','2026-04-05','2026-07-05'],'Quarterly']])assert.equal(analyze(dates.map(d=>tx(d))).findings[0].frequency,frequency);
});
test('repeated names with no schedule never become a confirmed subscription; processors remain tentative',()=>{
 assert.equal(analyze(['2026-01-02','2026-02-15','2026-04-28'].map(d=>tx(d))).findings.length,0);
 for(const name of ['Amazon Mktpl*AB123456','PayPal','Venmo']){const f=analyze(monthly(2000,name)).findings[0];assert.equal(f.confidence,'possible');assert.equal(f.generic,true);}
 assert.equal(subscriptionMerchant('PURCHASE AUTHORIZED ON 05/10 Fictional Cloud S123456789012 CARD 9563').key,'fictional cloud');
 assert.notEqual(subscriptionMerchant('Cloud Plan 1').key,subscriptionMerchant('Cloud Plan 2').key);
 assert.notEqual(subscriptionMerchant('Microsoft*Office365').key,subscriptionMerchant('Microsoft*Xbox360').key);
 assert.equal(analyze(monthly(2000,'RECURRING CARD PAYMENT Fictional Cloud')).findings.length,1);
});
test('overlapping plans at one merchant remain separate and duplicates are flagged without discarding real IDs',()=>{
 const rows=[...monthly(1000),...monthly(4000)],result=analyze(rows);assert.equal(result.findings.length,2);assert.deepEqual(result.findings.map(f=>f.typicalCents).sort((a,b)=>a-b),[1000,4000]);assert.equal(new Set(result.findings.flatMap(f=>f.transactions.map(t=>t.id))).size,8);
 assert(result.findings.every(f=>f.flags.includes('Multiple recurring schedules at this merchant')));
 const duplicates=analyze([...monthly(2000),...monthly(2000)]);assert.equal(duplicates.findings.length,2);assert(duplicates.findings.every(f=>f.flags.some(s=>s.includes('Possible duplicate'))));
});
test('price increases extend a schedule; variable bills remain separate from fixed costs',()=>{
 const rows=monthly(2000),up=analyze([...rows,tx('2026-09-30',2500)]).findings[0];assert.equal(up.transactions.length,5);assert.equal(up.priceChange.percent,25);
 const variable=analyze(['2026-05-10','2026-06-10','2026-07-10','2026-08-10'].map((date,i)=>tx(date,[4000,9000,6000,12000][i],'Fictional Utility'))).findings[0];assert.equal(variable.kind,'variable');assert.match(variable.explanation,/recurring bill/);
 const prices=analyze(['2026-01-10','2026-02-10','2026-03-10','2026-04-10','2026-05-10','2026-06-10'].map((date,i)=>tx(date,i<3?2000:5000)));assert.equal(prices.findings.length,1);assert.equal(prices.findings[0].transactions.length,6);assert.equal(prices.findings[0].kind,'fixed');assert.equal(prices.findings[0].typicalCents,5000);assert.equal(prices.findings[0].priceChange.date,'2026-04-10');
});
test('businesses, accounts, currencies and conflicting copies never merge',()=>{
 const first=monthly(),second=monthly(2000,'Fictional Cloud','Other Bank'),eur=monthly().map(t=>({...t,currency:'EUR'})),foreign=monthly().map(t=>({...t,business:other}));const result=analyze([...first,...second,...eur,...foreign]);assert.equal(result.findings.length,3);assert.equal(result.coverage.observed,12);
 const conflict=prepareSubscriptionTransactions({business,transactions:[...first,{...first[0],amount:9999}]});assert.equal(conflict.transactions.length,3);assert.equal(conflict.coverage.excluded['Conflicting copies'],1);
 const unknown=analyze(monthly().map(({currency,...t})=>t));assert.equal(unknown.findings[0].currency,'Unspecified');assert.equal(unknown.coverage.unspecifiedCurrency,4);
});
test('income, refunds, transfers and card/loan payments are excluded; unsigned live-only rows need direction',()=>{
 const rows=[...monthly().map(t=>({...t,direction:'in'})),...monthly().map(t=>({...t,existingTransfer:true})),...monthly(2000,'CREDIT CARD PAYMENT'),...monthly(2000,'LOAN PAYMENT')];assert.equal(analyze(rows).findings.length,0);
 const report={business,filter:'ALL',completeness:'unconfirmed',records:monthly().map(t=>({id:t.id,date:t.date,description:t.description,account:t.primary.account,amountCents:t.amount,amountText:'$20.00'}))};let prep=prepareSubscriptionTransactions({business,reports:[report]});assert.equal(prep.transactions.length,0);assert.equal(prep.coverage.fullCountConfirmed,false);assert.equal(prep.coverage.excluded['Money direction not recorded'],4);
 report.records=report.records.map(r=>({...r,type:'Withdrawal',currency:'USD'}));assert.equal(findSubscriptions(prepareSubscriptionTransactions({business,reports:[report]})).findings.length,1);
});
test('only a confirmed unchanged source link may identify generic processor charges',()=>{
 const rows=monthly(2000,'PayPal'),evidence=rows.map((t,i)=>({key:'source'+i,provider:'paypal',sourceId:'fictional'+i,kind:'Purchase',currency:'USD',amountCents:2000,merchant:'Fictional Cloud',items:[]})),state={business,links:{},decisions:{}};
 rows.forEach((t,i)=>{state.links[evidence[i].key]={id:t.id,expected:recordSnapshot(t),confirmedAt:'2026-10-09T18:00:00Z'};state.decisions[evidence[i].key]={expected:evidenceSnapshot(evidence[i])};});
 const run=()=>findSubscriptions(prepareSubscriptionTransactions({business,transactions:rows,evidence,sourceState:state}));assert.equal(run().findings[0].confidence,'likely');assert(run().findings[0].transactions.every(t=>t.evidence.confirmed));
 const noLinks=findSubscriptions(prepareSubscriptionTransactions({business,transactions:rows,evidence}));assert.equal(noLinks.findings[0].confidence,'possible');assert(noLinks.findings[0].transactions.every(t=>t.evidence===null));
 evidence[0].merchant='Changed source';assert.equal(run().findings.flatMap(f=>f.transactions).some(t=>t.id===rows[0].id),false);
 evidence[0].merchant='Fictional Cloud';state.business=other;assert.equal(run().findings[0].confidence,'possible');
});
test('local names, confirmation, dismissal and undo persist as new charges arrive and never cross businesses',()=>{
 const rows=monthly(),finding=analyze(rows).findings[0],initial={version:1,business,choices:{},history:[]};let state=saveSubscriptionChoice(initial,finding,{kind:'subscription',name:'Work cloud',note:'Check renewal'});
 const extended=analyze([...rows,tx('2026-09-30')]).findings[0];state=observeSubscriptionChoices(state,[extended]);assert.equal(subscriptionChoice(state,extended).name,'Work cloud');assert.equal(subscriptionChoice(state,extended).ids.length,5);assert.equal(subscriptionTotals([extended],state)[0].monthlyCents,2000);
 const dismissed=saveSubscriptionChoice(state,extended,{kind:'dismissed',name:'Work cloud',note:'Check renewal'});assert.equal(subscriptionTotals([extended],dismissed).length,0);assert.equal(subscriptionChoice(undoSubscriptionChoice(dismissed),extended).kind,'subscription');assert.equal(subscriptionChoice({...state,business:other},extended),null);assert.deepEqual(initial.choices,{});
});
test('local labels survive changed bank descriptions when the same charge IDs prove continuity',()=>{
 const rows=monthly(),f=analyze(rows).findings[0],state=saveSubscriptionChoice({version:1,business,choices:{},history:[]},f,{kind:'subscription',name:'Work cloud',note:'Keep'}),renamed=analyze(rows.map(t=>({...t,description:'Fictional New Cloud Descriptor'}))).findings[0];
 const observed=observeSubscriptionChoices(state,[renamed]);assert.equal(subscriptionChoice(observed,renamed).name,'Work cloud');assert.equal(subscriptionChoice(observed,renamed).note,'Keep');
 const unrelated=analyze(monthly(2000,'Fictional New Cloud Descriptor')).findings[0];assert.equal(subscriptionChoice(state,unrelated),null);
});
test('future-dated records and high-volume ambiguous merchant groups do not manufacture subscriptions',()=>{
 const future=analyze(['2027-01-10','2027-02-10','2027-03-10'].map(d=>tx(d)));assert.equal(future.findings.length,0);assert.equal(future.coverage.excluded['Future-dated records are not observed charges'],3);
 const high=analyze(Array.from({length:601},(_,i)=>tx('2026-'+String(i%8+1).padStart(2,'0')+'-05',2000,'PayPal')));assert.equal(high.findings.length,0);assert.equal(high.analysisIssues.length,1);
});
test('subscription choices participate in portable backups without silently replacing existing choices',()=>{
 const f=analyze(monthly()).findings[0],value=saveSubscriptionChoice({version:1,business,choices:{},history:[]},f,{kind:'subscription',name:'Work cloud'}),key='finance:subscriptions:'+business,backup={format:'wave-solver-local-backup',version:1,records:[{key,value}],settings:{}};
 assert.equal(planBackupImport(backup,[],{}).records[0].value.choices[f.key].name,'Work cloud');assert.throws(()=>validateLocalBackup({...backup,records:[{key,value:{...value,business:other}}]}),/different business/);
 assert.throws(()=>planBackupImport(backup,[{key,value:{...value,choices:{}}}],{}),/differs/);assert.equal(planBackupImport(backup,[{key,value}],{}).records.length,0);
});
test('truncated descriptors and missing capture dates cannot establish a complete subscription history',()=>{
 const rows=monthly().map(t=>({...t,description:'Fictional Cloud…'})),result=analyze(rows);assert.equal(result.findings.length,0);assert.equal(result.coverage.excluded['Truncated account or description'],4);
 const report={business,filter:'ALL',completeness:'count-confirmed',expectedTotal:0,records:[]};assert.equal(prepareSubscriptionTransactions({business,reports:[report]}).coverage.fullCountConfirmed,false);
});
