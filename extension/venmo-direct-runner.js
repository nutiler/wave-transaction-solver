import {assertFundingRecord, fundingKey, fundingFingerprint, fundingCategoryMatches, fundingCreatedDescriptions, accountLabel} from './venmo-funding.js';

// The prepared batch names every bank record. Read those records directly;
// query only the posting day when Wave does not expose its counterpart link.
export async function runDirectFundingRepairs({proposals,business,approvals={},receipts={},counterpartHints={},read,lookupDates,directTransfer,persist,isCurrent=()=>true,stopRequested=()=>false,onProgress=()=>{},mode='check',hasLock=()=>false}) {
 const saved={...receipts},results=[];
 const current=()=>{if(!isCurrent())throw Error('Business or source history changed. Repair stopped.');};
 const checkpoint=async(k,r)=>{current();const next={...saved,[k]:r};await persist(next);Object.assign(saved,next);};
 // This broad target check is read-only. Verification below still requires
 // the exact generated description/date and both reciprocal categories.
 const targetsWallet=(p,label)=>{const tidy=v=>String(v||'').replace(/[—–]/g,'-').replace(/\s+/g,' ').trim(),base=tidy('Transfer '+(p.bank.direction==='out'?'to ':'from ')+p.walletAccount.account),actual=tidy(label);return actual===base||actual.startsWith(base+' - ');};
 const snapshotsFor=async p=>{const s={};for(const t of [p.bank,p.purchase].filter(Boolean)){current();s[t.id]=await read(t,business);current();}return s;};
 const verify=async(p,receipt,snapshots)=>{
  const bank=snapshots[p.bank.id];assertFundingRecord(p.bank,bank,business,{ignoreCategory:true});
  const liveDiagnostics={identity:bank.identity,currency:bank.currency,transferLabel:bank.fields.category,transferLinks:bank.transferLinks||[],counterpartCandidates:[]};
  if(p.purchase)assertFundingRecord(p.purchase,snapshots[p.purchase.id],business);
  const expected=receipt?.originalSnapshots;
  for(const t of [p.bank,p.purchase].filter(Boolean))if(expected?.[t.id]&&expected[t.id].reviewed!==snapshots[t.id].reviewed)throw Error('Original reviewed status changed.');
  if(!targetsWallet(p,bank.fields.category))return {verified:false,message:'Exact bank record is not saved as the approved Venmo transfer.'};
  let candidates=[];
  const linked=[...new Set((bank.transferLinks||[]).filter(id=>id!==p.bank.id))];
  const hints=counterpartHints[fundingKey(p)];
  if(linked.length===1)candidates=[{id:linked[0]}];
  else if(Array.isArray(hints)&&hints.length&&hints.every(id=>/^\d+$/.test(id)))candidates=hints.map(id=>({id}));
  else {const report=await lookupDates(p.bank.date,p.bank.date);assertDateScope(report,business,p.bank.date,p.bank.date);candidates=report.records.filter(r=>accountLabel(r.account)===accountLabel(p.walletAccount.account)&&r.amountCents===p.bank.amount&&r.date===p.bank.date&&r.id!==p.purchase?.id);}
  const reserved=new Set(Object.entries(saved).filter(([k,r])=>k!==fundingKey(p)&&r.verified).flatMap(([,r])=>[r.counterpartId,...(r.groupVerification?.counterpartIds||[])].filter(Boolean)));
  const matches=[];
  for(const row of candidates.filter(r=>!reserved.has(r.id))){current();const s=await read({id:row.id},business);current();
   liveDiagnostics.counterpartCandidates.push({id:row.id,identity:s.identity,currency:s.currency,fields:s.fields,problems:s.problems});
   if(linked.length===1&&s.identity?.business===business&&s.identity.transaction===row.id&&s.currency==='USD'&&!s.problems?.length&&!fundingCreatedDescriptions(p).includes(s.fields?.description))return {verified:false,liveDiagnostics,message:'Bank is linked to existing wallet record '+row.id+' ('+s.fields?.description+'), rather than the missing generated funding entry. Existing receipt was preserved. Inspect this relationship: https://next.waveapps.com/'+business+'/transactions/'+p.bank.id};
   const other={id:row.id,date:p.bank.date,description:s.fields?.description,primary:{account:p.walletAccount.account},direction:p.bank.direction==='out'?'in':'out',amount:p.bank.amount,categories:[s.fields?.category],postings:[{},{}]};
   try{assertFundingRecord(other,s,business);if(fundingCreatedDescriptions(p).includes(s.fields.description)&&fundingCategoryMatches(s.fields.category,other.direction,p.bank.primary.account,p.bank)&&fundingCategoryMatches(bank.fields.category,p.bank.direction,p.walletAccount.account,other))matches.push({id:row.id,s});}catch{/* A same-amount real receipt is not a generated funding deposit. */}
  }
  const available=matches;
  if(available.length!==1)return {verified:false,liveDiagnostics,message:'Saved bank transfer found, but its exact reciprocal Venmo record is '+(available.length?'ambiguous':'not yet readable')+'. No second Save will be attempted.'};
  return {verified:true,counterpartId:available[0].id,bankSnapshot:bank,counterpartSnapshot:available[0].s,message:'Exact bank transfer and reciprocal Venmo entry verified; purchase preserved. No full-history scan.'};
 };
 for(const [index,p] of proposals.entries()){
  if(stopRequested())break;current();const k=fundingKey(p),previous=saved[k];
  if(previous?.verified){results.push({key:k,verified:true,skipped:true,message:previous.message});continue;}
  onProgress('Fix '+(index+1)+' / '+proposals.length+' · '+p.bank.date+' · $'+(p.bank.amount/100).toFixed(2)+' · '+p.bank.id+' · reading exact bank record');
  try{
   if(previous?.fingerprint&&previous.fingerprint!==fundingFingerprint(p))throw Error('Stored transfer proposal changed; recover its original checkpoint.');
   const snapshots=await snapshotsFor(p),bank=snapshots[p.bank.id];
   assertFundingRecord(p.bank,bank,business,{ignoreCategory:true});if(p.purchase)assertFundingRecord(p.purchase,snapshots[p.purchase.id],business);
   const already=targetsWallet(p,bank.fields.category);
   let retry=false;
   // A spent recovery that definitively stopped in menu navigation made no
   // financial click. Keep its history/lock and repeat the unchanged-original
   // and absent-counterpart proof before allowing explicit Do fixes to resume.
   const navigationOnly=previous?.outcome?.saveAttempted===false&&previous.outcome.stage==='open transfer menu';
   if(previous?.saveAttempted&&!already&&mode==='apply'&&(!previous.directRetryCount||navigationOnly)&&previous.originalSnapshots?.[p.bank.id]&&JSON.stringify(previous.originalSnapshots[p.bank.id].fields)===JSON.stringify(bank.fields)&&previous.originalSnapshots[p.bank.id].reviewed===bank.reviewed){
    // An old failed Save can be recovered only after reloading the exact
    // unchanged bank form and proving no opposite wallet side on its day.
    // The explicit Do fixes approval allows one guarded category assignment.
    const report=await lookupDates(p.bank.date,p.bank.date);assertDateScope(report,business,p.bank.date,p.bank.date);let opposite=false;
    for(const row of report.records.filter(r=>accountLabel(r.account)===accountLabel(p.walletAccount.account)&&r.amountCents===p.bank.amount&&r.id!==p.purchase?.id)){const s=await read({id:row.id},business);current();if(s.identity?.business!==business||s.identity.transaction!==row.id||s.currency!=='USD'||s.problems?.length||!['Deposit','Withdrawal'].includes(s.fields?.type))throw Error('A possible prior counterpart is unreadable; no retry.');if(s.fields.type===(p.bank.direction==='out'?'Deposit':'Withdrawal'))opposite=true;}
    retry=!opposite;
   }
   if((previous?.saveAttempted&&!retry)||already){
    const result=await verify(p,previous,snapshots);await checkpoint(k,{...previous,version:1,business,proposal:p,fingerprint:fundingFingerprint(p),beforeIds:previous?.beforeIds||[],saveAttempted:!!previous?.saveAttempted,preexisting:already&&!previous?.saveAttempted,...result,checkedAt:new Date().toISOString()});
    results.push({key:k,...result,ready:result.verified?undefined:false,skipped:true});continue;
   }
   if(mode==='recheck'){results.push({key:k,verified:false,message:'No saved attempt; nothing changed.'});continue;}
   if(/^Transfer (?:to|from) /i.test(bank.fields.category))throw Error('Bank already has a different transfer relationship; inspect it before changing accounts.');
   if(hasLock(p))throw Error('Another unfinished Wave save involves this exact record.');
   // Keep live identity, amount and purchase checks, but a prior category choice
   // is not a reason to reject the user's approved reclassification to transfer.
   if(mode==='check'){const outcome=await directTransfer(p,bank,{checkOnly:true});current();if(outcome.problem)throw Error(outcome.problem);results.push({key:k,ready:true,message:'Exact bank record and Venmo account option checked; nothing saved.'});continue;}
   if(approvals[k]!==fundingFingerprint(p))throw Error('Approve this exact repair proposal before applying.');
   await checkpoint(k,{version:1,business,proposal:p,fingerprint:fundingFingerprint(p),originalSnapshots:snapshots,beforeIds:[],saveAttempted:true,verified:false,stage:'direct-transfer-checkpoint',startedAt:new Date().toISOString(),message:'Exact bank transfer checkpoint saved before selecting Venmo.',...(retry?{directRetryCount:1,previousAttempts:[...(previous.previousAttempts||[]),previous]}:{})});
   let outcome;try{outcome=await directTransfer(p,bank,{checkOnly:false});}catch(e){outcome={saveAttempted:true,problem:e.message};}current();
   await checkpoint(k,{...saved[k],outcome,stage:'verify-exact-transfer',saveAttempted:!!previous?.saveAttempted||outcome.saveAttempted!==false,message:outcome.problem||'Transfer saved; checking exact result.'});
   if(outcome.saveAttempted===false){results.push({key:k,ready:false,message:outcome.problem||'Transfer was not saved.'});continue;}
   const fresh=await snapshotsFor(p),result=await verify(p,saved[k],fresh);
   await checkpoint(k,{...saved[k],...result,checkedAt:new Date().toISOString()});results.push({key:k,...result,ready:result.verified?undefined:false});
   onProgress((result.verified?'Verified':'Needs inspection')+' · '+p.bank.id+' · '+result.message);
  }catch(e){current();const r=saved[k];await checkpoint(k,{...r,version:1,business,proposal:p,fingerprint:fundingFingerprint(p),beforeIds:r?.beforeIds||[],saveAttempted:!!r?.saveAttempted,verified:false,message:e.message,checkedAt:new Date().toISOString(),liveDiagnostics:e.liveDiagnostics||null});results.push({key:k,ready:false,message:e.message});onProgress('Held '+p.bank.id+': '+e.message+' Continuing with the next exact record.');}
 }
 return {results,receipts:saved,stopped:stopRequested()};
}

export function assertDateScope(report,business,start,end){
 if(report?.business!==business||report.scope!=='date-range'||report.startDate!==start||report.endDate!==end||report.completeness!=='count-confirmed'||!Array.isArray(report.records)||report.records.some(r=>!/^\d+$/.test(r.id||'')||!/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')||r.date<start||r.date>end)||new Set(report.records.map(r=>r.id)).size!==report.records.length)throw Error('The focused posting-date lookup did not establish its exact scope.');
}
