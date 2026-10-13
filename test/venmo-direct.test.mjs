import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runFundingRepairs} from '../extension/venmo-funding-runner.js';
import {runVenmoRepairPlan} from '../extension/venmo-repair-runner.js';
import {fundingKey,fundingFingerprint,fundingSnapshot} from '../extension/venmo-funding.js';
import {repairKey,repairFingerprint,validateRepairPlan} from '../extension/venmo-reconciliation.js';
import {assertDateScope} from '../extension/venmo-direct-runner.js';
import {fictionalRepairHarness,fictionalTransaction} from '../extension/venmo-repair-fixture-data.js';
import {fundingExportHints} from '../extension/venmo-export-hints.js';

export function directHarness(){
 const h=fictionalRepairHarness();let lookups=0,lose=false;
 const lookupDates=async(startDate,endDate)=>{lookups++;return {business:h.plan.business,scope:'date-range',startDate,endDate,completeness:'count-confirmed',records:structuredClone(h.rows.filter(r=>r.date>=startDate&&r.date<=endDate))};};
 const directTransfer=async(p,s,{checkOnly=false}={})=>{if(checkOnly)return {saveAttempted:false};const result=await h.args.edit(p);if(lose)throw Error('Response lost after Save');return result;};
 return {h,args:{...h.args,lookupDates,directTransfer,collect:async()=>{throw Error('Full history must not run in the direct batch');}},get lookups(){return lookups},set lose(v){lose=v}};
}
test('prepared direct batch covers every repair type with zero complete-history calls',async()=>{const d=directHarness(),r=await runVenmoRepairPlan({...d.args,mode:'apply'});assert.equal(Object.values(r.receipts).filter(r=>r.verified).length,7);assert.equal(d.h.writes,7);assert.equal(d.h.collections,0);const writes=d.h.writes,lookups=d.lookups;await runVenmoRepairPlan({...d.args,...r,mode:'apply'});assert.equal(d.h.writes,writes);assert.equal(d.lookups,lookups);});
test('a manually completed transfer is adopted, with no second save',async()=>{const d=directHarness(),a=d.h.plan.actions.find(a=>a.transfer?.kind==='funding');await d.h.args.edit(a.transfer);const r=await runVenmoRepairPlan({...d.args,mode:'apply'});assert(r.receipts[repairKey(a)].verified);assert.equal(d.h.writes,7);});

test('recovery immediately adopts an exact verified checkpoint without reopening the purchase again',async()=>{
 const d=directHarness(),a=d.h.plan.actions.find(a=>a.transfer?.kind==='funding'),p=a.transfer;await d.h.args.edit(p);
 const old={business:p.business,proposal:p,fingerprint:fundingFingerprint(p),beforeIds:[],saveAttempted:true,verified:true,counterpartId:d.h.rows.at(-1).id};
 const read=d.args.read;let redundantReads=0;
 const result=await runVenmoRepairPlan({...d.args,transferReceipts:{[fundingKey(p)]:old},read:async record=>{if(record.id===p.purchase.id){redundantReads++;throw Error('Wave returned another transaction');}return read(record);},mode:'apply'});
 assert.equal(redundantReads,0);assert(result.receipts[repairKey(a)].verified);assert.equal(Object.values(result.receipts).filter(r=>r.verified).length,7);assert.equal(d.h.writes,7);
});

test('a read-only verified funding checkpoint counts in the prepared batch even without a Save attempt',async()=>{
 const d=directHarness(),a=d.h.plan.actions.find(a=>a.transfer?.kind==='funding'),p=a.transfer;await d.h.args.edit(p);
 const old={business:p.business,proposal:p,fingerprint:fundingFingerprint(p),beforeIds:[],saveAttempted:false,verified:true,counterpartId:d.h.rows.at(-1).id};
 const result=await runVenmoRepairPlan({...d.args,transferReceipts:{[fundingKey(p)]:old},mode:'apply'});
 assert(result.receipts[repairKey(a)].verified);assert.equal(result.receipts[repairKey(a)].saveAttempted,false);assert.equal(Object.values(result.receipts).filter(r=>r.verified).length,7);assert.equal(d.h.writes,7);
});

test('recovered progress is checkpointed before a later unreadable record and independent fixes continue',async()=>{
 const d=directHarness(),a=d.h.plan.actions.find(a=>a.transfer?.kind==='funding'),p=a.transfer;await d.h.args.edit(p);const id=d.h.rows.at(-1).id;
 const old={business:p.business,proposal:p,fingerprint:fundingFingerprint(p),beforeIds:[],saveAttempted:true,verified:false},read=d.args.read,persist=d.args.persist;let reads=0,savedWhileRecovering=false;
 const result=await runVenmoRepairPlan({...d.args,transferReceipts:{[fundingKey(p)]:old},read:async record=>{if(record.id===p.purchase.id&&++reads>1)throw Error('Wave returned another transaction');return read(record);},counterpartHints:{[fundingKey(p)]:[id]},persist:async state=>{if(state.receipts[repairKey(a)]?.verified&&d.h.writes===1)savedWhileRecovering=true;await persist(state);},mode:'apply'});
 assert(savedWhileRecovering);assert.equal(reads,1);assert.equal(Object.values(result.receipts).filter(r=>r.verified).length,7);assert.equal(d.h.writes,7);
});
test('lost Save response verifies exact day and does not repeat the creation',async()=>{const d=directHarness(),p=d.h.plan.actions.find(a=>a.transfer?.kind==='funding').transfer;d.lose=true;let receipts={};const args={...d.args,proposals:[p],approvals:{[fundingKey(p)]:fundingFingerprint(p)},persist:async s=>receipts=structuredClone(s)};const r=await runFundingRepairs({...args,mode:'apply'});assert(r.receipts[fundingKey(p)].verified);assert.equal(d.h.writes,1);await runFundingRepairs({...args,receipts,mode:'recheck'});assert.equal(d.h.writes,1);});
test('unresolved old Save is held locally while the next independent payment finishes',async()=>{const d=directHarness(),ps=d.h.plan.actions.filter(a=>a.kind==='transfer').map(a=>a.transfer),p=ps[0],receipts={[fundingKey(p)]:{business:p.business,proposal:p,fingerprint:fundingFingerprint(p),originalSnapshots:{},beforeIds:[],saveAttempted:true,verified:false}};const r=await runFundingRepairs({...d.args,proposals:ps,approvals:Object.fromEntries(ps.map(p=>[fundingKey(p),fundingFingerprint(p)])),receipts,mode:'apply',persist:async()=>{}});assert(!r.receipts[fundingKey(p)].verified);assert(r.receipts[fundingKey(ps[1])].verified);assert.equal(d.h.writes,1);});
test('wrong amount, currency, purchase category, business or missing approval never writes',async()=>{for(const change of [d=>d.h.snapshots['30'].fields.amount='3.00',d=>d.h.snapshots['30'].currency='CAD',d=>d.h.snapshots['20'].fields.category='Other',d=>d.h.snapshots['30'].identity.business='other']){const d=directHarness(),p=d.h.plan.actions.find(a=>a.transfer?.kind==='funding').transfer;change(d);const r=await runFundingRepairs({...d.args,proposals:[p],approvals:{[fundingKey(p)]:fundingFingerprint(p)},persist:async()=>{},mode:'apply'});assert(!r.results[0].verified);assert.equal(d.h.writes,0);}});
test('focused lookup rejects incomplete scope, wrong dates and unidentified rows',()=>{const r={business:'b',scope:'date-range',startDate:'2026-01-01',endDate:'2026-01-01',completeness:'count-confirmed',records:[]};assertDateScope(r,'b',r.startDate,r.endDate);for(const bad of [{...r,scope:'ALL'},{...r,completeness:'bottom-reached'},{...r,records:[{id:'1',date:'2025-01-01'}]},{...r,records:[{id:null,date:r.startDate}]}])assert.throws(()=>assertDateScope(bad,'b',r.startDate,r.endDate));});

test('a spent recovery that stopped before any transfer selection can resume after exact absence proof',async()=>{
 for(const mode of ['apply','recheck']){const d=directHarness(),p=d.h.plan.actions.find(a=>a.transfer?.kind==='funding').transfer,k=fundingKey(p),old={business:p.business,proposal:p,fingerprint:fundingFingerprint(p),originalSnapshots:{[p.bank.id]:await d.h.args.read(p.bank),[p.purchase.id]:await d.h.args.read(p.purchase)},beforeIds:[],saveAttempted:true,directRetryCount:1,verified:false,outcome:{saveAttempted:false,stage:'open transfer menu',problem:'Cannot identify one transfer submenu.'}};
 const r=await runFundingRepairs({...d.args,proposals:[p],receipts:{[k]:old},approvals:{[k]:fundingFingerprint(p)},persist:async()=>{},mode});
 assert.equal(d.h.writes,mode==='apply'?1:0);assert.equal(!!r.receipts[k].verified,mode==='apply');if(mode==='apply'){assert(d.lookups>0);assert.deepEqual(r.receipts[k].previousAttempts.at(-1),old);}}
});
test('a split fee derives USD and total only with independently inspected allocations and exact list evidence',async()=>{
 for(const inspectedCurrency of ['USD','CAD',null]){const d=directHarness(),a=d.h.plan.actions.find(a=>a.kind==='fee'),t=d.h.plan.baseline.find(t=>t.id===a.record.id),p=t.postings.find(p=>p.account!==t.primary.account);
 const splits=[2,1,2].map(debit=>({...p,debit}));t.postings=[t.primary,...splits];a.record.postings=t.postings;
 Object.assign(d.h.snapshots[t.id],{currency:null,structure:{singleCategory:false,split:true},problems:['Amount: multiple visible named controls','Category: multiple visible named controls']});d.h.snapshots[t.id].fields.amount='';
 const inspect=d.args.inspect;
 const result=await runVenmoRepairPlan({...d.args,approvedFingerprint:JSON.stringify(d.h.plan),inspect:async record=>record.id===t.id?{protected:false,currency:inspectedCurrency,allocations:splits.map(p=>({category:p.account,amountCents:p.debit}))}:inspect(record),mode:'apply'});
 assert.equal(!!result.receipts[repairKey(a)].verified,inspectedCurrency==='USD');assert.equal(d.h.rows.some(r=>r.id===t.id),inspectedCurrency!=='USD');}
});
test('spent menu recovery still holds changed originals and an existing opposite wallet entry',async()=>{
 for(const change of ['amount','opposite']){const d=directHarness(),p=d.h.plan.actions.find(a=>a.transfer?.kind==='funding').transfer,k=fundingKey(p),old={business:p.business,proposal:p,fingerprint:fundingFingerprint(p),originalSnapshots:{[p.bank.id]:await d.h.args.read(p.bank),[p.purchase.id]:await d.h.args.read(p.purchase)},beforeIds:[],saveAttempted:true,directRetryCount:1,verified:false,outcome:{saveAttempted:false,stage:'open transfer menu'}};
 if(change==='amount')d.h.snapshots[p.bank.id].fields.amount='9.99';else{const row={id:'999',date:p.bank.date,account:p.walletAccount.account,amountCents:p.bank.amount};d.h.rows.push(row);d.h.snapshots[row.id]={...(await d.h.args.read(p.purchase)),identity:{business:p.business,transaction:row.id},fields:{...(await d.h.args.read(p.purchase)).fields,type:'Deposit',date:p.bank.date}};}
 const r=await runFundingRepairs({...d.args,proposals:[p],receipts:{[k]:old},approvals:{[k]:fundingFingerprint(p)},persist:async()=>{},mode:'apply'});assert.equal(d.h.writes,0);assert(!r.receipts[k].verified);}
});
test('counterpart link verifies directly without any list lookup',async()=>{const d=directHarness(),p=d.h.plan.actions.find(a=>a.transfer?.kind==='funding').transfer;await d.h.args.edit(p);d.h.snapshots[p.bank.id].transferLinks=[d.h.rows.at(-1).id];const r=await runFundingRepairs({...d.args,proposals:[p],approvals:{},persist:async()=>{},mode:'apply'});assert(r.results[0].verified);assert.equal(d.lookups,0);assert.equal(d.h.writes,1);});

test('real generated descriptions and dated labels adopt old uncertain saves through live export addresses',async()=>{
 const d=directHarness(),p=d.h.plan.actions.find(a=>a.transfer?.kind==='funding').transfer,originalSnapshots={[p.bank.id]:await d.h.args.read(p.bank),[p.purchase.id]:await d.h.args.read(p.purchase)};
 await d.h.args.edit(p);const id=d.h.rows.at(-1).id,description='Created Transfer: '+p.bank.description;
 d.h.snapshots[id].fields.description=description;
 d.h.snapshots[id].fields.category='Transfer from '+p.bank.primary.account+' - Jan 11, 2026 - '+p.bank.description;
 d.h.snapshots[p.bank.id].fields.category='Transfer to '+p.walletAccount.account+' - January 11, 2026 - '+description;
 const old={business:p.business,proposal:p,fingerprint:fundingFingerprint(p),originalSnapshots,beforeIds:[],saveAttempted:true,verified:false};
 const r=await runFundingRepairs({...d.args,proposals:[p],receipts:{[fundingKey(p)]:old},counterpartHints:{[fundingKey(p)]:[id]},persist:async()=>{},mode:'apply'});
 assert(r.results[0].verified);assert.equal(d.h.writes,1);assert.equal(d.lookups,0);
 // An obsolete export address never authorizes a repeated financial click.
 d.h.snapshots[id].fields.amount='9.99';const bad=await runFundingRepairs({...d.args,proposals:[p],receipts:{[fundingKey(p)]:old},counterpartHints:{[fundingKey(p)]:[id]},persist:async()=>{},mode:'apply'});
 assert(!bad.results[0].verified);assert.equal(d.h.writes,1);
});

test('a separate incoming payment already linked to the bank is never adopted as generated funding',async()=>{
 const d=directHarness(),p=d.h.plan.actions.find(a=>a.transfer?.kind==='funding').transfer;
 d.h.snapshots[p.bank.id].fields.category='Transfer to '+p.walletAccount.account+' - Jan 10, 2026 - Alex "Pizza"';
 const receipt=structuredClone(d.h.snapshots[p.purchase.id]);receipt.identity.transaction='777';receipt.fields.type='Deposit';receipt.fields.description='Alex "Pizza"';receipt.fields.date=p.bank.date;receipt.fields.category='Transfer from '+p.bank.primary.account;
 d.h.snapshots['777']=receipt;d.h.snapshots[p.bank.id].transferLinks=['777'];
 const r=await runFundingRepairs({...d.args,proposals:[p],approvals:{[fundingKey(p)]:fundingFingerprint(p)},persist:async()=>{},mode:'apply'});
 assert(!r.results[0].verified);assert.equal(d.h.writes,0);assert.match(r.results[0].message,/777.*Alex "Pizza"/);assert.match(r.results[0].message,/Existing receipt was preserved/);
});
test('old failed Save gets one guarded retry only with unchanged original and no opposite entry',async()=>{const d=directHarness(),p=d.h.plan.actions.find(a=>a.transfer?.kind==='funding').transfer,old={business:p.business,proposal:p,fingerprint:fundingFingerprint(p),originalSnapshots:{[p.bank.id]:await d.h.args.read(p.bank),[p.purchase.id]:await d.h.args.read(p.purchase)},beforeIds:[],saveAttempted:true,verified:false};let persisted={};const args={...d.args,proposals:[p],approvals:{[fundingKey(p)]:fundingFingerprint(p)},receipts:{[fundingKey(p)]:old},persist:async r=>persisted=structuredClone(r)};const r=await runFundingRepairs({...args,mode:'apply'});assert(r.results[0].verified);assert.equal(d.h.writes,1);assert.equal(persisted[fundingKey(p)].directRetryCount,1);assert.deepEqual(persisted[fundingKey(p)].previousAttempts[0],old);});
test('read-only recheck and a previously spent direct retry never retry an unchanged bank',async()=>{for(const mode of ['apply','recheck']){const d=directHarness(),p=d.h.plan.actions.find(a=>a.transfer?.kind==='funding').transfer,old={business:p.business,proposal:p,fingerprint:fundingFingerprint(p),originalSnapshots:{[p.bank.id]:await d.h.args.read(p.bank)},beforeIds:[],saveAttempted:true,verified:false,...(mode==='apply'?{directRetryCount:1}:{})};const r=await runFundingRepairs({...d.args,proposals:[p],approvals:{[fundingKey(p)]:fundingFingerprint(p)},receipts:{[fundingKey(p)]:old},persist:async()=>{},mode});assert(!r.results[0].verified);assert.equal(d.h.writes,0);}});
test('equal date/amount payments keep distinct counterparts on save and resume',async()=>{const d=directHarness(),p=d.h.plan.actions.find(a=>a.transfer?.kind==='funding').transfer,q=structuredClone(p);q.bank.id='31';q.purchase.id='21';q.source.sourceId='second';q.source.key+='2';for(const t of [q.bank,q.purchase]){d.h.snapshots[t.id]=structuredClone(d.h.snapshots[t.id==='31'?'30':'20']);d.h.snapshots[t.id].identity.transaction=t.id;d.h.rows.push({id:t.id,date:t.date,account:t.primary.account,description:t.description,amountCents:t.amount});}const r=await runFundingRepairs({...d.args,proposals:[p,q],approvals:Object.fromEntries([p,q].map(p=>[fundingKey(p),fundingFingerprint(p)])),persist:async()=>{},mode:'apply'});assert(r.results.every(r=>r.verified));assert.notEqual(r.receipts[fundingKey(p)].counterpartId,r.receipts[fundingKey(q)].counterpartId);assert.equal(d.h.writes,2);});

test('105 mixed repairs adopt 63 completed and write only 42 remaining, with full generated labels and no history rescan',async()=>{
 const d=directHarness(),h=d.h,plan=h.plan,base=plan.actions.find(a=>a.transfer?.kind==='funding');
 const add=t=>{plan.baseline.push(t);if(t.primary.account===base.walletAccount.account)plan.balanceCents+=t.direction==='in'?t.amount:-t.amount;h.snapshots[t.id]={...structuredClone(h.snapshots['20']),identity:{business:plan.business,transaction:t.id},fields:{date:t.date,description:t.description,account:t.primary.account,type:t.direction==='in'?'Deposit':'Withdrawal',amount:(t.amount/100).toFixed(2),category:t.categories[0]}};h.rows.push({id:t.id,date:t.date,account:t.primary.account,description:t.description,amountCents:t.amount});};
 for(let i=0;i<88;i++){
  const amount=100+i,bank=fictionalTransaction(String(10000+i),'2026-01-11',base.transfer.bank.primary.account,-amount,'Venmo '+i),purchase=fictionalTransaction(String(20000+i),'2026-01-10',base.walletAccount.account,-amount,'Fictional purchase '+i);
  add(bank);add(purchase);const source={...structuredClone(base.transfer.source),key:'venmo:@fictional:fund'+i,sourceId:'fund'+i,signedCents:-amount,amountCents:amount};plan.sources.push(source);
  plan.actions.push({...structuredClone(base),transfer:{...structuredClone(base.transfer),bank:fundingSnapshot(bank),purchase:fundingSnapshot(purchase),source,sourceKey:source.key,sourceId:source.sourceId,deltaCents:amount},deltaCents:amount});
 }
 const duplicate=plan.actions.find(a=>a.kind==='duplicate');
 for(let i=0;i<8;i++){
  const amount=30+i,drop=fictionalTransaction(String(40000+i),'2026-01-12',base.walletAccount.account,-amount,'Fictional meal '+i),keep=fictionalTransaction(String(41000+i),'2026-01-13',base.walletAccount.account,-amount,'Fictional meal '+i);add(drop);add(keep);
  const source={...structuredClone(plan.sources.find(r=>r.sourceId==='MEAL')),key:'venmo:@fictional:meal'+i,sourceId:'meal'+i,signedCents:-amount,amountCents:amount};plan.sources.push(source);
  plan.actions.push({...structuredClone(duplicate),record:fundingSnapshot(drop),keep:fundingSnapshot(keep),group:{waveIds:[drop.id,keep.id],sourceKeys:[source.key]},deltaCents:amount});
 }
 const fee=fictionalTransaction('50000','2026-01-25',base.walletAccount.account,-19,'Unsupported standalone fee');add(fee);plan.actions.push({...structuredClone(plan.actions.find(a=>a.kind==='fee')),record:fundingSnapshot(fee),deltaCents:19});
 const cash=plan.actions.find(a=>a.transfer?.kind==='cashout'),bank=fictionalTransaction('60000','2026-01-21',cash.transfer.bank.primary.account,250,'Venmo cashout','Rent');add(bank);
 const source={...structuredClone(cash.transfer.source),key:'venmo:@fictional:CASH2',sourceId:'CASH2',date:bank.date,signedCents:-250,amountCents:250};plan.sources.push(source);plan.actions.push({...structuredClone(cash),transfer:{...structuredClone(cash.transfer),bank:fundingSnapshot(bank),source,sourceKey:source.key,sourceId:source.sourceId,deltaCents:-250},deltaCents:-250});
 // Rebuild only this fictional statement's arithmetic and target, not real files.
 const proof=plan.statements[0];proof.walletMovementCents=plan.sources.reduce((n,r)=>n+((r.signedCents<0&&r.funding&&!/Venmo balance/i.test(r.funding))?0:r.signedCents),0);proof.endingCents=proof.beginningCents+proof.walletMovementCents;plan.projectedCents=plan.balanceCents+plan.actions.reduce((n,a)=>n+a.deltaCents,0);
 validateRepairPlan(plan,plan.business);assert.equal(plan.actions.length,105);
 const finished=plan.actions.filter(a=>a.kind==='duplicate'||a.kind==='opening'||a.kind==='fee'&&a.record.id==='50'),receipts={};
 await h.args.persist({receipts:Object.fromEntries(finished.map(a=>[repairKey(a),{saveAttempted:true}])),transferReceipts:{}});
 for(const a of finished){await h.args.mutate(a);receipts[repairKey(a)]={business:plan.business,action:a,fingerprint:repairFingerprint(a),saveAttempted:true,verified:true};}
 const fullLabels=p=>{const id=h.rows.at(-1).id,other=h.snapshots[id],description='Created Transfer: '+p.bank.description;other.fields.description=description;h.rows.at(-1).description=description;other.fields.category='Transfer '+(p.bank.direction==='out'?'from ':'to ')+p.bank.primary.account+' - Jan 11, 2026 - '+p.bank.description;h.snapshots[p.bank.id].fields.category='Transfer '+(p.bank.direction==='out'?'to ':'from ')+p.walletAccount.account+' - Jan 11, 2026 - '+description;};
 const completedFunding=plan.actions.filter(a=>a.transfer?.kind==='funding').slice(0,52),transferReceipts={};
 for(const a of completedFunding){const p=a.transfer,originalSnapshots={[p.bank.id]:await d.args.read(p.bank),[p.purchase.id]:await d.args.read(p.purchase)};await h.args.edit(p);fullLabels(p);transferReceipts[fundingKey(p)]={business:plan.business,proposal:p,fingerprint:fundingFingerprint(p),beforeIds:[],originalSnapshots,saveAttempted:true,verified:false};}
 assert.equal(h.writes,63);
 const latest=h.rows.map(row=>{const s=h.snapshots[row.id],t=fictionalTransaction(row.id,s.fields.date,s.fields.account,(s.fields.type==='Deposit'?1:-1)*Math.round(Number(s.fields.amount)*100),s.fields.description,/^Transfer /.test(s.fields.category)?'Transfer Clearing':s.fields.category);if(t.primary.account===base.walletAccount.account)t.primary.accountId=base.walletAccount.accountId;return t;});
 const hints=fundingExportHints(plan,latest);assert.equal(Object.keys(hints).length,52);
 const originalDirect=d.args.directTransfer,originalRead=d.args.read,purchaseReads=new Map();const args={...d.args,approvedFingerprint:JSON.stringify(plan),receipts,transferReceipts,counterpartHints:hints,read:async t=>{if(completedFunding.some(a=>a.transfer.purchase.id===t.id))purchaseReads.set(t.id,(purchaseReads.get(t.id)||0)+1);return originalRead(t);},directTransfer:async(p,s,options)=>{const r=await originalDirect(p,s,options);if(!options.checkOnly&&p.bank.direction==='out')fullLabels(p);return r;}};
 const result=await runVenmoRepairPlan({...args,mode:'apply'});
 assert.equal(Object.values(result.receipts).filter(r=>r.verified).length,105,JSON.stringify(result.results.filter(r=>r.ready===false)));
 assert.equal(h.writes,105);assert.equal(h.collections,0);assert.equal(result.results.filter(r=>r.ready===false).length,0);
 assert.equal(purchaseReads.size,52);assert([...purchaseReads.values()].every(n=>n===1),'recovery must not reopen the retained purchases again');
 const lookups=d.lookups;await runVenmoRepairPlan({...args,...result,mode:'apply'});assert.equal(h.writes,105);assert.equal(d.lookups,lookups);
});

test('105 prepared fixes resume from 11 verified, finish all 94 remaining, and never rescan history',async()=>{
 const d=directHarness(),h=d.h,plan=h.plan,base=plan.actions.find(a=>a.transfer?.kind==='funding');
 for(let i=0;i<98;i++){
  const amount=100+i,date='2026-01-11',bank=fictionalTransaction(String(10000+i),date,'(1111) Fictional Bank',-amount,'Venmo payment '+i),purchase=fictionalTransaction(String(20000+i),'2026-01-10',base.walletAccount.account,-amount,'Fictional purchase '+i);
  const source={...structuredClone(base.transfer.source),key:'venmo:@fictional:extra'+i,sourceId:'extra'+i,signedCents:-amount,amountCents:amount};
  plan.baseline.push(bank,purchase);plan.sources.push(source);plan.balanceCents-=amount;
  const a={...structuredClone(base),transfer:{...structuredClone(base.transfer),bank:fundingSnapshot(bank),purchase:fundingSnapshot(purchase),source,sourceKey:source.key,sourceId:source.sourceId,deltaCents:amount},deltaCents:amount};plan.actions.push(a);
  for(const t of [bank,purchase]){h.snapshots[t.id]={...structuredClone(h.snapshots['20']),identity:{business:plan.business,transaction:t.id},fields:{date:t.date,description:t.description,account:t.primary.account,type:'Withdrawal',amount:(t.amount/100).toFixed(2),category:'Tools'}};h.rows.push({id:t.id,date:t.date,account:t.primary.account,description:t.description,amountCents:t.amount});}
 }
 validateRepairPlan(plan,plan.business);assert.equal(plan.actions.length,105);
 // Seed the actual mix of 11 completed actions without repeating them.
 const completed=[plan.actions[0],plan.actions[2],...plan.actions.filter(a=>a.kind==='transfer').slice(0,9)],receipts={},transferReceipts={};
 await h.args.persist({receipts:Object.fromEntries(completed.filter(a=>a.kind!=='transfer').map(a=>[repairKey(a),{saveAttempted:true}])),transferReceipts:{}});
 for(const a of completed){if(a.kind==='transfer'){const before={};for(const t of [a.transfer.bank,a.transfer.purchase].filter(Boolean))before[t.id]=await h.args.read(t);await h.args.edit(a.transfer);transferReceipts[fundingKey(a.transfer)]={business:plan.business,proposal:a.transfer,fingerprint:fundingFingerprint(a.transfer),beforeIds:[],originalSnapshots:before,saveAttempted:true,verified:true,counterpartId:h.rows.at(-1).id};}else await h.args.mutate(a);receipts[repairKey(a)]={business:plan.business,action:a,fingerprint:repairFingerprint(a),saveAttempted:true,verified:true};}
 assert.equal(h.writes,11);const args={...d.args,approvedFingerprint:JSON.stringify(plan),receipts,transferReceipts};const r=await runVenmoRepairPlan({...args,mode:'apply'});
 assert.equal(h.writes,105);assert.equal(Object.values(r.receipts).filter(r=>r.verified).length,105);assert.equal(r.results.filter(r=>r.ready===false).length,0);assert.equal(h.collections,0);
 await runVenmoRepairPlan({...args,...r,mode:'apply'});assert.equal(h.writes,105);assert.equal(h.collections,0);
});
