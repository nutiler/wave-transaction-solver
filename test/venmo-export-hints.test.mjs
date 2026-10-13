import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fundingExportHints,loadLatestRepairExport} from '../extension/venmo-export-hints.js';
import {fictionalRepairPlan,fictionalTransaction} from '../extension/venmo-repair-fixture-data.js';
import {fundingKey} from '../extension/venmo-funding.js';

test('export hints locate exact generated counterparts without treating real receipts as funding',()=>{
 const plan=fictionalRepairPlan(),p=plan.actions.find(a=>a.transfer?.kind==='funding').transfer;
 const bank=fictionalTransaction(p.bank.id,p.bank.date,p.bank.primary.account,-p.bank.amount,p.bank.description,'Transfer Clearing');
 const generated=fictionalTransaction('900',p.bank.date,p.walletAccount.account,p.bank.amount,'Created Transfer: '+p.bank.description,'Transfer Clearing');
 generated.primary.accountId=p.walletAccount.accountId;
 const receipt=fictionalTransaction('901',p.bank.date,p.walletAccount.account,p.bank.amount,'Alex "Pizza"','Transfer Clearing');
 assert.deepEqual(fundingExportHints(plan,[bank,generated,receipt]),{[fundingKey(p)]:['900']});
 for(const change of [t=>t.date='2026-01-12',t=>t.primary.account='Another wallet',t=>t.amount++,t=>t.direction='out',t=>t.description='Created Transfer: another payment',t=>t.categories=['Tools']]){
  const bad=structuredClone(generated);change(bad);if(bad.primary.account==='Another wallet')bad.primary.accountId='other';assert.deepEqual(fundingExportHints(plan,[bank,bad,receipt]),{});
 }
 assert.deepEqual(fundingExportHints(plan,[bank,receipt]),{});
});

test('latest export selection is isolated by business and checks the export manifest',async()=>{
 const plan=fictionalRepairPlan(),dirs=new Map();
 const file=s=>({kind:'file',getFile:async()=>({size:s.length,text:async()=>s})});
 const dir=entries=>({kind:'directory',entries:async function*(){yield* entries},getDirectoryHandle:async n=>{if(!entries.has(n))throw Object.assign(Error('Missing'),{name:'NotFoundError'});return entries.get(n);},getFileHandle:async n=>{if(!entries.has(n))throw Object.assign(Error('Missing'),{name:'NotFoundError'});return entries.get(n);}});
 const manifest=(business,date)=>JSON.stringify({format:'wave-solver-wave-export',version:1,business,importedAt:date,historyMatched:true,transactionCount:2,files:['accounting.csv']});
 for(const [name,business,date,text] of [['export-1111111111111111',plan.business,'2026-01-01','old'],['export-2222222222222222',plan.business,'2026-01-02','latest'],['export-3333333333333333','other','2026-01-03','wrong business']])dirs.set(name,dir(new Map([['manifest.local.json',file(manifest(business,date))],['accounting.csv',file(text)]])));
 const root=dir(new Map([['wave',dir(new Map([['exports',dir(dirs)]]))]]));
 const latest=await loadLatestRepairExport(root,plan.business);assert.equal(latest.text,'latest');assert.equal(latest.source,'wave/exports/export-2222222222222222/accounting.csv');
 assert.equal(await loadLatestRepairExport(root,'absent'),null);
});
