import {cents,normalize} from './model.js';
import {evidenceSnapshot} from './service-solvers.js';
import {fundingFingerprint,fundingSnapshot,assertFundingRecord} from './venmo-funding.js';

export const repairFormat='wave-solver-venmo-repair-plan';
const day=d=>Date.parse(d+'T00:00:00Z')/86400000;
const near=(a,b,n)=>Math.abs(day(a)-day(b))<=n;
const signed=t=>t.direction==='in'?t.amount:-t.amount;
const identity=a=>a.accountId||a.account;
export const repairKey=a=>a.business+':'+a.kind+':'+(a.record?.id||a.source?.key||a.transfer?.bank.id);
export const repairFingerprint=a=>JSON.stringify(a);
export function repairYears(plan){return [...new Set(plan.actions.flatMap(a=>{const date=a.record?.date||a.source?.date||a.transfer.bank.date;return [-20,20].map(n=>new Date((day(date)+n)*86400000).getUTCFullYear());}))].sort();}
export function effectiveWalletMovement(r){return (r.signedCents<0&&r.funding&&!/Venmo balance/i.test(r.funding))||(r.signedCents>0&&r.destination&&!/Venmo balance/i.test(r.destination))?0:r.signedCents;}
export function validateRepairPlan(plan,business,{records,statements}={}){
 if(plan?.format!==repairFormat||plan.version!==1||plan.business!==business||!Array.isArray(plan.actions)||!plan.actions.length||plan.actions.length>500||!Array.isArray(plan.baseline)||!Array.isArray(plan.sources)||!Array.isArray(plan.statements))throw Error('This repair package is not for the selected Wave business.');
 if(!/^[0-9a-f-]{36}$/i.test(business||''))throw Error('Choose a Wave business.');
 const source=new Map(plan.sources.map(r=>[r.key,r])),ledger=new Map(plan.baseline.map(t=>[t.id,t])),proofs=new Map();
 if(source.size!==plan.sources.length||ledger.size!==plan.baseline.length)throw Error('Duplicate identities in the repair package.');
 for(const p of plan.statements){const k=p.profileIdentity+':'+p.period;if(proofs.has(k)||!/^\d{4}-\d{2}$/.test(p.period)||![p.beginningCents,p.endingCents,p.walletMovementCents].every(Number.isSafeInteger)||!p.reconciles||p.beginningCents+p.walletMovementCents!==p.endingCents)throw Error('Monthly statement balances do not reconcile.');const activity=plan.sources.filter(r=>r.profileIdentity===p.profileIdentity&&r.date.startsWith(p.period));if(activity.reduce((n,r)=>n+effectiveWalletMovement(r),0)!==p.walletMovementCents)throw Error('Statement activity differs from its balance proof.');proofs.set(k,p);}
 if(records){const actual=new Map(records.map(r=>[r.key,r]));for(const r of plan.sources)if(!actual.has(r.key)||actual.get(r.key).conflict||actual.get(r.key).issues?.length||JSON.stringify(evidenceSnapshot(actual.get(r.key)))!==JSON.stringify(evidenceSnapshot(r)))throw Error('Venmo source evidence changed. Rebuild the repair package.');}
 if(statements)for(const p of plan.statements){const actual=statements.find(s=>s.profileIdentity===p.profileIdentity&&s.period===p.period);if(!actual||['beginningCents','endingCents','walletMovementCents','reconciles'].some(k=>actual[k]!==p[k]))throw Error('Statement balance proof changed or is missing.');}
 const ids=new Set(),targets=new Set(),bankIds=new Set(),purchaseIds=new Set();
 const original=t=>{const live=ledger.get(t?.id);if(!live||JSON.stringify(fundingSnapshot(live))!==JSON.stringify(t))throw Error('Repair baseline differs from the exact original record.');};
 const evidence=r=>{const s=source.get(r?.key);if(!s||s.conflict||s.issues?.length||s.currency!=='USD'||JSON.stringify(evidenceSnapshot(s))!==JSON.stringify(evidenceSnapshot(r)))throw Error('Repair source is missing, conflicting or changed.');return s;};
 for(const a of plan.actions){
  const k=repairKey(a);if(a.business!==business||ids.has(k)||!Number.isSafeInteger(a.deltaCents)||!a.walletAccount?.account||!/\bVenmo\b/i.test(a.walletAccount.account))throw Error('Malformed or repeated repair.');ids.add(k);
  if(a.record){original(a.record);if(targets.has(a.record.id))throw Error('A transaction cannot receive two corrections.');targets.add(a.record.id);if(a.record.primary.account!==a.walletAccount.account)throw Error('Correction belongs to another wallet.');}
  if(a.kind==='transfer'){
   const p=a.transfer,r=evidence(p.source);original(p.bank);if(p.purchase)original(p.purchase);
   if(p.business!==business||identity(p.walletAccount)!==identity(a.walletAccount)||a.deltaCents!==p.deltaCents||bankIds.has(p.bank.id)||p.bank.amount!==r.amountCents||p.bank.primary.account.match(/\((\d{4})\)/)?.[1]!==r.accountEnding||!near(p.bank.date,r.date,7)||r.feeCents||r.signedCents>=0)throw Error('Transfer has no unique exact bank/source allocation.');
   if(p.kind==='funding'){if(r.kind!=='Purchase'||r.status!=='Complete'||!r.funding||/Venmo balance/i.test(r.funding)||!p.purchase||p.purchase.primary.account!==a.walletAccount.account||p.purchase.direction!=='out'||p.purchase.amount!==r.amountCents||!near(p.purchase.date,r.date,3)||purchaseIds.has(p.purchase.id)||p.bank.direction!=='out'||p.deltaCents!==r.amountCents)throw Error('Funding payment allocation is invalid.');purchaseIds.add(p.purchase.id);}
   else if(p.kind!=='cashout'||r.kind!=='Transfer'||!/^Standard Transfer$/.test(r.type)||!['Issued','Complete'].includes(r.status)||p.bank.direction!=='in'||p.deltaCents!==-r.amountCents)throw Error('Cash-out source does not confirm the bank receipt.');
   bankIds.add(p.bank.id);
  }else if(a.kind==='opening'){
   const proof=proofs.get(a.profile+':'+a.record.date.slice(0,7));if(!proof||a.record.direction!=='in'||a.record.description!=='Starting balance'||a.record.postings.length!==2||a.record.categories.length!==1||!Number.isSafeInteger(a.targetCents)||a.targetCents<0)throw Error('Starting balance needs a simple record and its opening-month statement.');
   const before=plan.sources.filter(r=>r.profileIdentity===a.profile&&r.date.startsWith(proof.period)&&r.date<a.record.date).reduce((n,r)=>n+effectiveWalletMovement(r),0);
   if(a.targetCents!==proof.beginningCents+before||a.deltaCents!==a.targetCents-a.record.amount||plan.baseline.some(t=>t.primary?.account===a.walletAccount.account&&t.id!==a.record.id&&t.date<a.record.date))throw Error('Starting balance is not derived from the actual opening date.');
  }else if(a.kind==='duplicate'){
   original(a.keep);if(a.record.id===a.keep.id||a.keep.primary.account!==a.walletAccount.account||signed(a.keep)!==signed(a.record)||!near(a.keep.date,a.record.date,3)||a.deltaCents!==-signed(a.record)||!Array.isArray(a.group?.waveIds)||!Array.isArray(a.group?.sourceKeys)||!a.group.waveIds.includes(a.keep.id)||!a.group.waveIds.includes(a.record.id))throw Error('Duplicate correction needs its exact retained copy.');
   const rows=a.group.waveIds.map(id=>ledger.get(id)),rs=a.group.sourceKeys.map(key=>source.get(key));if(new Set(a.group.waveIds).size!==rows.length||new Set(a.group.sourceKeys).size!==rs.length||rows.some(t=>!t||t.primary?.account!==a.walletAccount.account||signed(t)!==signed(a.record))||rs.some(r=>!r||r.profileIdentity!==a.profile||r.signedCents!==signed(a.record))||rows.length!==rs.length+1||!rs.every(r=>rows.some(t=>near(t.date,r.date,3))))throw Error('Statement counts do not establish one extra wallet entry.');
  }else if(a.kind==='fee'){
   const proof=proofs.get(a.profile+':'+a.record.date.slice(0,7)),rs=plan.sources.filter(r=>r.profileIdentity===a.profile&&r.date.startsWith(a.record.date.slice(0,7)));
   if(!proof||!proof.reconciles||a.record.direction!=='out'||!/fee/i.test(a.record.description)||rs.some(r=>r.feeCents)||rs.some(r=>r.signedCents===signed(a.record)&&near(r.date,a.record.date,3))||a.deltaCents!==a.record.amount)throw Error('Standalone fee needs a reconciled monthly statement with no supporting fee activity.');
  }else if(a.kind==='receipt'||a.kind==='external-funding'){
   const r=evidence(a.source);if(r.profileIdentity!==a.profile||!a.category||!Array.isArray(a.categoryPath)||!a.description||!/^\d{4}-\d{2}-\d{2}$/.test(a.date)||a.date!==r.date||!proofs.has(a.profile+':'+r.date.slice(0,7)))throw Error('Deposit needs an exact source, date, profile and category.');
   if(a.kind==='receipt'&&(r.status!=='Complete'||r.signedCents<=0||r.kind!=='Incoming payment'||r.destination!=='Venmo balance'||a.deltaCents!==r.signedCents||plan.baseline.some(t=>t.primary?.account===a.walletAccount.account&&t.direction==='in'&&t.amount===r.amountCents&&near(t.date,r.date,3))))throw Error('This receipt is not proven missing.');
   if(a.kind==='external-funding'&&(r.status!=='Complete'||r.kind!=='Purchase'||r.signedCents>=0||r.feeCents||!r.funding||!/Personal Checking/i.test(r.funding)||/Venmo balance/i.test(r.funding)||a.deltaCents!==r.amountCents||a.categoryPath.join()!=='Deposit from Personal'||!/^Owner/i.test(a.category)||plan.baseline.some(t=>t.primary?.account!==a.walletAccount.account&&t.primary?.account.match(/\((\d{4})\)/)?.[1]===r.accountEnding)))throw Error('External personal funding treatment is not approved.');
  }else throw Error('Unsupported repair action.');
 }
 for(const a of plan.actions.filter(a=>a.kind==='duplicate'))if(purchaseIds.has(a.record.id))throw Error('A funding payment selected for removal cannot also be retained.');
 const wallets=new Set(plan.actions.map(a=>a.walletAccount.account)),baselineBalance=plan.baseline.reduce((n,t)=>n+t.postings.filter(p=>wallets.has(p.account)&&p.type==='Cash and Bank').reduce((v,p)=>v+p.debit-p.credit,0),0);
 const projected=plan.balanceCents+plan.actions.reduce((n,a)=>n+a.deltaCents,0);if(!Number.isSafeInteger(plan.balanceCents)||baselineBalance!==plan.balanceCents||projected!==plan.projectedCents)throw Error('Repair balance effects do not add up.');
 return plan;
}
export function repairRecordFields(t){return {date:t.date,description:t.description,account:t.primary.account,type:t.direction==='in'?'Deposit':'Withdrawal',amount:(t.amount/100).toFixed(2),category:t.categories[0]};}
export function assertRepairSnapshot(a,s,{after=false}={}){
 const t=a.record,fields=s?.fields;
 if(!t||!fields||s.identity?.business!==a.business||s.identity.transaction!==t.id||s.currency!=='USD')throw Error('Exact USD wallet record could not be confirmed.');
 const expected=repairRecordFields(t);if(after&&a.kind==='opening')expected.amount=(a.targetCents/100).toFixed(2);
 for(const k of ['date','description','account','type','amount'])if(k==='amount'?cents(fields[k])!==cents(expected[k]):fields[k]!==expected[k])throw Error(k==='amount'?'Live amount changed for '+a.kind+' on '+t.date+': expected USD '+expected[k]+', found USD '+fields[k]+'. Repair held.':'Live '+k+' changed; repair held.');
 if(t.postings.length===2&&t.categories.length===1){if(s.problems?.length||s.structure?.singleCategory!==true||s.structure.split!==false||fields.category!==expected.category)throw Error('Live category or structure changed; repair held.');}
 else{const allocations=t.postings.filter(p=>p.account!==t.primary.account).map(p=>[p.account,p.debit-p.credit]).sort(),actual=s.repairDetails?.allocations?.map(p=>[p.category,p.amountCents]).sort();if(s.structure?.split!==true||s.problems?.some(p=>!/^Category:/.test(p))||JSON.stringify(actual)!==JSON.stringify(allocations))throw Error('Exact live split allocations could not be verified.');}
 if(s.repairDetails?.protected&&['duplicate','fee'].includes(a.kind))throw Error('This copy has a receipt, notes, customer/vendor, or reconciliation protection. Inspect it before removing it.');
}
export function assertRetainedCopy(a,s){assertFundingRecord(a.keep,s,a.business);}
export const sameDepositRow=(a,r)=>r.account===a.walletAccount.account&&r.amountCents===a.deltaCents&&near(r.date,a.date,3);
export function completedRepairBalance(plan,receipts){return plan.balanceCents+plan.actions.filter(a=>receipts[repairKey(a)]?.verified).reduce((n,a)=>n+a.deltaCents,0);}
export function normalizeDepositCategory(a,label){return label===a.category||a.categoryPath?.[0]==='Refund for Expense'&&normalize(label)===normalize('Refund for '+a.category)||a.categoryPath?.[0]==='Deposit from Personal'&&normalize(label)===normalize('Deposit from Personal '+a.category);}
