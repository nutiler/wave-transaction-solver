import {compareLive,normalize} from './model.js';
import {assertLiveStructure} from './live-records.js';
import {evidenceSnapshot} from './service-solvers.js';

const day=s=>Date.parse(s+'T00:00:00Z')/86400000;
const near=(a,b,n)=>Number.isFinite(day(a))&&Number.isFinite(day(b))&&Math.abs(day(a)-day(b))<=n;
const movement=p=>p.debit-p.credit;
const endpoint=p=>/^(Cash and Bank|Credit Card)$/.test(p.type);
const key=p=>p.accountId||p.account;
const bankEnding=p=>p.account.match(/\((\d{4})\)/)?.[1]||'';
const words=s=>normalize(s||'');
const supporting=(description,r)=>[r.merchant,r.note].some(s=>words(s).length>=4&&words(description).includes(words(s)));
export const fundingVersion=1;
export const fundingKey=p=>p.business+':'+p.bank.id;
export function fundingFingerprint(p){return JSON.stringify([p.business,p.kind,p.bank,p.purchase||null,p.walletAccount,p.source]);}
export function fundingSnapshot(record){return {id:record.id,date:record.date,description:record.description,primary:{account:record.primary.account,accountId:record.primary.accountId},direction:record.direction,amount:record.amount,categories:[...record.categories],postings:record.postings.map(p=>({...p}))};}

// Ledger entries are distinct from source evidence. No balance plug or synthetic
// purchase is proposed: a missing purchase requires a separate import review.
export function auditVenmoFunding({business,sourceBusiness=business,transactions=[],records=[],profileAccounts={}}){
 if(!/^[0-9a-f-]{36}$/i.test(business||''))return {business,accounts:[],proposals:[],held:[],message:'Choose a Wave business first.'};
 const byId=new Map();for(const t of transactions){const old=byId.get(t.id);if(old&&JSON.stringify(old.postings)!==JSON.stringify(t.postings))throw Error('Conflicting copies of a Wave transaction; refresh accounting history.');byId.set(t.id,t);}
 const all=[...byId.values()],paymentAccounts=new Map();
 for(const t of all)for(const p of t.postings.filter(endpoint))paymentAccounts.set(key(p),{account:p.account,accountId:p.accountId,type:p.type});
 const accounts=[...paymentAccounts.values()].filter(p=>/\bVenmo\b/i.test(p.account)).map(p=>{const postings=all.flatMap(t=>t.postings.filter(x=>key(x)===key(p))),dates=postings.map(x=>x.date).sort();return {...p,balanceCents:postings.reduce((n,x)=>n+movement(x),0),earliest:dates[0],latest:dates.at(-1),rows:postings.length};});
 const walletRows=all.flatMap(t=>t.postings.filter(p=>accounts.some(a=>key(a)===key(p))).map(p=>({t,p,signed:movement(p)})));
 const banks=all.filter(t=>t.primary&&t.primary.type==='Cash and Bank'&&!/\bVenmo\b/i.test(t.primary.account)&&/\bVenmo\b/i.test(t.description)&&t.amount>0);
 const sourceMap=new Map(),conflicts=new Set();
 for(const r of records.filter(r=>r.provider==='venmo')){const id=r.profileIdentity+':'+r.sourceId,old=sourceMap.get(id);if(old&&JSON.stringify(evidenceSnapshot(old))!==JSON.stringify(evidenceSnapshot(r)))conflicts.add(id);sourceMap.set(id,r);}
 const sources=[...sourceMap.values()].filter(r=>!conflicts.has(r.profileIdentity+':'+r.sourceId)&&!r.conflict&&!r.issues?.length&&r.currency==='USD'&&r.feeCents===0&&r.accountEnding&&r.signedCents<0&&((r.kind==='Purchase'&&r.bankExpected&&/^(Complete|Completed|Settled)$/i.test(r.status))||(r.kind==='Transfer'&&/^(Standard|Instant) Transfer$/i.test(r.type)&&/^(Issued|Complete|Completed|Settled)$/i.test(r.status))));
 const compatible=(t,r)=>t.amount===r.amountCents&&bankEnding(t.primary)===r.accountEnding&&near(t.date,r.date,7)&&t.direction===(r.kind==='Transfer'?'in':'out');
 const proposals=[],held=[];
 for(const t of banks){
  const h={bank:t,status:'Needs evidence',reason:'No unique fee-free statement payment confirms the amount, date, direction and exact bank funding/destination account.'};
  if(sourceBusiness!==business){held.push({...h,reason:'Venmo evidence belongs to another business. Import evidence for this business.'});continue;}
  const matches=sources.filter(r=>compatible(t,r));
  if(matches.length!==1){const fees=[...sourceMap.values()].filter(r=>r.feeCents&&r.currency==='USD'&&r.accountEnding===bankEnding(t.primary)&&near(t.date,r.date,7)&&t.direction===(r.kind==='Transfer'?'in':'out')&&[r.amountCents,r.amountCents-Math.abs(r.feeCents),r.amountCents+Math.abs(r.feeCents)].includes(t.amount));held.push({...h,status:matches.length?'Ambiguous statement match':fees.length?'Fee-bearing movement':h.status,reason:matches.length?'Several statement movements match this bank record. Choose the exact one before changing anything.':fees.length?'Possible fee-bearing movement: statement amount and bank proceeds differ. Inspect gross amount and fees; no automatic split or adjustment is proposed.':h.reason,feeEvidence:fees});continue;}
  const r=matches[0];h.payment=r;
  if(banks.filter(b=>compatible(b,r)).length!==1){held.push({...h,status:'Ambiguous bank match',reason:'Several Wells Fargo records could use the same Venmo statement payment.'});continue;}
  const identity=String(r.profileIdentity||'').replace(/^@/,'');
  const mapped=profileAccounts[r.profileIdentity];
  const wallets=accounts.filter(a=>mapped?key(a)===mapped:new RegExp('(?:^|[^a-z0-9])'+identity.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:[^a-z0-9]|$)','i').test(a.account));
  if(!identity||wallets.length!==1){held.push({...h,status:'Choose Venmo account',reason:'Map this exact Venmo profile to one payment account.'});continue;}
  const wallet=wallets[0],kind=r.kind==='Transfer'?'cashout':'funding';
  if(t.date<wallet.earliest||r.date<wallet.earliest){held.push({...h,status:'Before Venmo opening history',reason:'This movement predates the Venmo account’s recorded opening history. Check its opening balance instead of adding a historical transfer.'});continue;}
  if(t.postings.length!==2||t.categories.length!==1){held.push({...h,status:'Split or complex record',reason:'Only simple single-category bank records can be repaired.'});continue;}
  const possible=walletRows.filter(w=>key(w.p)===key(wallet)&&w.signed===(kind==='funding'?-t.amount:t.amount)&&near(w.t.date,r.date,3));
  const purchases=kind==='funding'?possible.filter(w=>supporting(w.p.description,r)&&w.t.primary&&w.t.postings.length===2&&w.t.categories.length===1):[];
  if(kind==='funding'&&purchases.length!==1){held.push({...h,status:possible.length?'Confirm Venmo purchase':'Venmo purchase missing',reason:possible.length?'No unique Venmo purchase is supported by the recipient or note.':'The Venmo purchase is missing. A funding deposit alone would overstate its balance.'});continue;}
  const purchase=kind==='funding'?purchases[0].t:null;
  if(purchase&&sources.filter(other=>other.kind==='Purchase'&&other.profileIdentity===r.profileIdentity&&other.signedCents===r.signedCents&&near(other.date,purchase.date,3)&&supporting(purchase.description,other)).length!==1){held.push({...h,status:'Ambiguous Venmo purchase',reason:'Several statement payments could explain the same Venmo purchase.'});continue;}
  const counterparts=walletRows.filter(w=>key(w.p)===key(wallet)&&w.signed===(kind==='funding'?t.amount:-t.amount)&&near(w.t.date,t.date,20));
  if(counterparts.length){held.push({...h,status:'Existing counterpart — inspect',reason:'A same-amount opposite Venmo movement exists within 20 days. Inspect it; do not create another.',counterparts:counterparts.map(w=>w.t)});continue;}
  proposals.push({version:fundingVersion,business,kind,bank:fundingSnapshot(t),purchase:purchase?fundingSnapshot(purchase):null,walletAccount:wallet,source:evidenceSnapshot(r),sourceKey:r.key,sourceId:r.sourceId,merchant:r.merchant,note:r.note,sourceDate:r.date,profile:r.profileIdentity,deltaCents:kind==='funding'?t.amount:-t.amount,reason:kind==='funding'?'Externally funded Venmo purchase has no funding deposit in the saved ledger.':'Statement cash-out reached Wells Fargo, but its Venmo withdrawal is missing in the saved ledger.'});
 }
 return {business,accounts,proposals,held,statementCount:sourceMap.size,sourceConflicts:conflicts.size,message:transactions.length?'Saved accounting history; live checks are required before any repair.':'Import Wave accounting history and Venmo statements in Data & setup.'};
}

export function assertFundingRecord(record,snapshot,business,{ignoreCategory=false}={}){
 assertLiveStructure(record,snapshot);
 if(snapshot?.currency!=='USD'||snapshot.structure?.singleCategory!==true||snapshot.structure?.split!==false)throw Error('Live currency or single-category structure is not confirmed. Nothing changed.');
 if(snapshot?.identity?.business!==business||snapshot.problems?.length)throw Error('Wrong business or unreadable live record. Nothing changed.');
 const checks=compareLive(record,snapshot).checks.filter(c=>!ignoreCategory||c.field!=='Category');
 const category=record.categories?.[0],refund=record.direction==='in'&&record.categories?.length===1&&snapshot.fields?.type==='Deposit'&&record.postings?.some(p=>p.account===category&&['Expense','Expenses'].includes(p.group))&&normalize(snapshot.fields.category)===normalize('Refund for '+category);
 if(refund){const check=checks.find(c=>c.field==='Category');if(check)check.state='Match';}
 if(checks.some(c=>c.state!=='Match'))throw Error('Live '+checks.filter(c=>c.state!=='Match').map(c=>c.field).join(', ')+' changed. Refresh the audit; nothing changed.');
}
const transferCategory=(direction,account)=>'Transfer '+(direction==='out'?'to ':'from ')+account;
export function fundingCategoryMatches(label,direction,account,other=null){
 const tidy=s=>String(s||'').replace(/[—–]/g,'-').replace(/\s+/g,' ').trim();
 const base=transferCategory(direction,account),actual=tidy(label);
 if(actual===tidy(base))return true;
 if(!other)return false;
 const dates=[other.date,...['short','long'].map(month=>new Intl.DateTimeFormat('en-US',{month,day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(other.date+'T00:00:00Z')))];
 return dates.some(date=>actual===tidy(base+' - '+date+' - '+other.description));
}
export function assertFundingCollection(report,business,years){
 if(report?.business!==business||report.completeness!=='count-confirmed'||report.filter!=='ALL'||!Array.isArray(report.records)||!years.every(y=>report.years?.includes(y))||report.records.some(r=>!/^\d+$/.test(r.id||''))||new Set(report.records.map(r=>r.id)).size!==report.records.length)throw Error('Complete live history with exact transaction IDs is required; no creation was attempted.');
}
export function fundingYears(proposals){return [...new Set(proposals.flatMap(p=>[-20,20].map(n=>new Date((day(p.bank.date)+n)*86400000).getUTCFullYear())))].sort();}
export function fundingLiveCounterparts(p,report){return report.records.filter(r=>{if(r.account!==p.walletAccount.account||r.amountCents!==p.bank.amount||!near(r.date,p.bank.date,20)||r.id===p.purchase?.id)return false;if(report.verifiedAssignments?.some(a=>a.business===p.business&&!a.bankIds.includes(p.bank.id)&&a.counterpartIds.includes(r.id)))return false;const s=r.directionEvidence,f=s?.fields,amount=String(f?.amount??'').replace(/[$,]/g,'');if(s?.identity?.business===p.business&&s.identity.transaction===r.id&&s.currency==='USD'&&!s.problems?.length&&f.account===r.account&&f.date===r.date&&/^\d+(?:\.\d{1,2})?$/.test(amount)&&Math.round(Number(amount)*100)===r.amountCents&&['Deposit','Withdrawal'].includes(f.type))return f.type===(p.kind==='funding'?'Deposit':'Withdrawal');return true;});}
export function prepareFundingCreate(p,snapshots,menu,report){
 assertFundingCollection(report,p.business,fundingYears([p]));
 assertFundingRecord(p.bank,snapshots[p.bank.id],p.business);if(p.purchase)assertFundingRecord(p.purchase,snapshots[p.purchase.id],p.business);
 for(const t of [p.bank,p.purchase].filter(Boolean))if(!report.records.some(r=>r.id===t.id&&r.date===t.date&&r.account===t.primary.account&&r.amountCents===t.amount))throw Error('An original record is absent or changed in the complete live collection.');
 if(fundingLiveCounterparts(p,report).length)throw Error('A same-amount Venmo record exists in live Wave. Inspect it instead of creating a duplicate.');
 if(menu?.format!=='wave-solver-transfer-menu'||menu.identity?.business!==p.business||menu.identity?.transaction!==p.bank.id||menu.matchingGroups!==1||menu.createGroups!==1||!Array.isArray(menu.matchingOptions)||!Array.isArray(menu.createOptions)||!Array.isArray(menu.problems)||menu.problems.some(s=>s!=='No recognizable matching options captured. The menu HTML is included for selector inspection.'))throw Error('Transfer creation menu is incomplete or ambiguous.');
 const assigned=new Set((report.verifiedAssignments||[]).filter(a=>a.business===p.business&&!a.bankIds.includes(p.bank.id)).flatMap(a=>a.counterpartIds));
 if(menu.matchingOptions.some(o=>String(o.text||'').includes(p.walletAccount.account)&&!assigned.has(o.transactionId)))throw Error('Wave offers an existing Venmo match. Inspect it; creation is blocked.');
 const options=menu.createOptions.filter(o=>o.text===p.walletAccount.account&&!o.disabled&&!o.transactionId&&!o.href);
 if(options.length!==1)throw Error('Cannot identify one exact Venmo account under Select Account to Create Transfer.');
 return {business:p.business,id:p.bank.id,category:transferCategory(p.bank.direction,p.walletAccount.account),expected:{...snapshots[p.bank.id].fields},liveOnly:true,preserveReviewed:true,transferCreate:{account:p.walletAccount.account,direction:p.bank.direction,label:options[0].text,confirmed:true}};
}
export function verifyFundingRepair(p,snapshots,report,receipt){
 try{
  assertFundingCollection(report,p.business,fundingYears([p]));
  assertFundingRecord(p.bank,snapshots[p.bank.id],p.business,{ignoreCategory:true});
  if(p.purchase)assertFundingRecord(p.purchase,snapshots[p.purchase.id],p.business);
  const bank=snapshots[p.bank.id],created=report.records.filter(r=>r.account===p.walletAccount.account&&r.amountCents===p.bank.amount&&r.date===p.bank.date&&r.description==='Created Transfer'&&!receipt.beforeIds.includes(r.id));
  if(created.length!==1)throw Error('The exact new transfer counterpart has not been established. Recheck only; never create again.');
  const row=created[0],s=snapshots[row.id];
  const counterpart={id:row.id,date:row.date,description:row.description,primary:{account:p.walletAccount.account},direction:p.bank.direction==='out'?'in':'out',amount:p.bank.amount,categories:[s?.fields?.category||''],postings:[{},{}]};
  assertFundingRecord(counterpart,s,p.business);
  if(!fundingCategoryMatches(bank.fields.category,p.bank.direction,p.walletAccount.account,counterpart)||!fundingCategoryMatches(s.fields.category,counterpart.direction,p.bank.primary.account,p.bank))throw Error('Both exact reciprocal transfer categories must verify.');
  if(receipt.originalSnapshots?.[p.bank.id]?.reviewed!==bank.reviewed)throw Error('The bank reviewed status changed unexpectedly. Inspect Wave.');
  if(p.purchase&&receipt.originalSnapshots?.[p.purchase.id]?.reviewed!==snapshots[p.purchase.id].reviewed)throw Error('The Venmo purchase reviewed status changed unexpectedly. Inspect Wave.');
  return {verified:true,counterpartId:row.id,message:'Both transfer sides verified. The Venmo payment and its category are unchanged.'};
 }catch(e){return {verified:false,message:e.message};}
}
export function projectedVenmoBalance(account,proposals,selected){return account.balanceCents+proposals.filter(p=>key(p.walletAccount)===key(account)&&selected.has(fundingKey(p))).reduce((n,p)=>n+p.deltaCents,0);}

// Equal-date/equal-amount bank payments can create indistinguishable labels.
// Verify the entire count-preserving group, rather than pretending one label
// establishes an individual association or treating both new rows as duplicates.
export function verifyFundingBatch(proposals,snapshots,report,receipts){
 const failed=message=>Object.fromEntries(proposals.map(p=>[fundingKey(p),{verified:false,message}]));
 try{
  if(proposals.length<2)throw Error('A batch verification needs several actual bank movements.');
  const first=proposals[0];assertFundingCollection(report,first.business,fundingYears(proposals));
  if(new Set(proposals.map(p=>p.bank.id)).size!==proposals.length||proposals.some(p=>p.business!==first.business||p.walletAccount.account!==first.walletAccount.account||p.bank.date!==first.bank.date||p.bank.amount!==first.bank.amount||p.bank.primary.account!==first.bank.primary.account||p.kind!==first.kind))throw Error('Transfer group differs in account, direction, date or amount.');
  for(const p of proposals){const r=receipts[fundingKey(p)];if(!r?.saveAttempted||r.fingerprint!==fundingFingerprint(p))throw Error('Every bank movement needs its own durable creation checkpoint.');assertFundingRecord(p.bank,snapshots[p.bank.id],p.business,{ignoreCategory:true});if(p.purchase)assertFundingRecord(p.purchase,snapshots[p.purchase.id],p.business);if(r.originalSnapshots[p.bank.id].reviewed!==snapshots[p.bank.id].reviewed||p.purchase&&r.originalSnapshots[p.purchase.id].reviewed!==snapshots[p.purchase.id].reviewed)throw Error('Original reviewed status changed.');}
  const before=new Set(proposals.flatMap(p=>receipts[fundingKey(p)].beforeIds)),known=new Set(proposals.flatMap(p=>{const r=receipts[fundingKey(p)];return r.verified?[r.counterpartId,...(r.groupVerification?.counterpartIds||[])].filter(Boolean):[];}));
  const rows=report.records.filter(r=>r.account===first.walletAccount.account&&r.amountCents===first.bank.amount&&r.date===first.bank.date&&r.description==='Created Transfer'&&(!before.has(r.id)||known.has(r.id)));
  if(rows.length!==proposals.length)throw Error('New counterpart count does not match the bank movement count.');
  const used=new Set();
  for(const p of proposals){const candidates=rows.filter(row=>{if(used.has(row.id))return false;const s=snapshots[row.id],t={id:row.id,date:row.date,description:row.description,primary:{account:p.walletAccount.account},direction:p.bank.direction==='out'?'in':'out',amount:p.bank.amount,categories:[s?.fields?.category||''],postings:[{},{}]};try{assertFundingRecord(t,s,p.business);return fundingCategoryMatches(snapshots[p.bank.id].fields.category,p.bank.direction,p.walletAccount.account,t)&&fundingCategoryMatches(s.fields.category,t.direction,p.bank.primary.account,p.bank);}catch{return false;}});if(!candidates.length)throw Error('A reciprocal transfer side is missing or differs.');used.add(candidates[0].id);}
  const group={bankIds:proposals.map(p=>p.bank.id).sort(),counterpartIds:rows.map(r=>r.id).sort()};
  return Object.fromEntries(proposals.map(p=>[fundingKey(p),{verified:true,groupVerification:group,message:proposals.length+' equal-amount transfer pairs verified together by exact new count, reciprocal categories and unchanged purchases.'}]));
 }catch(e){return failed(e.message);}
}
