import {fundingKey,fundingFingerprint,fundingYears,assertFundingRecord,assertFundingCollection,fundingLiveCounterparts,fundingCategoryMatches,prepareFundingCreate,verifyFundingRepair,verifyFundingBatch} from './venmo-funding.js';
export const VENMO_FUNDING_ENGINE_VERSION='0.99.24';

// Every possible financial click has a durable checkpoint. A lost response is
// recovered by reading the saved result, never by retrying creation.
export async function runFundingRepairs({proposals,business,approvals={},receipts={},collect,read,openMenu,edit,persist,isCurrent=()=>true,stopRequested=()=>false,onProgress=()=>{},mode='check',hasLock=()=>false}){
 const current=()=>{if(!isCurrent())throw Error('Business or source history changed. Repair stopped.');};
 if(!['check','apply','recheck'].includes(mode)||!proposals.length||proposals.some(p=>p.business!==business))throw Error('Choose repairs for one Wave business.');
 const saved={...receipts},results=[],attempts=[],years=fundingYears(proposals);let stoppedError=null,batchReport=null,batchResults=new Map();
 const checkpoint=async(key,value)=>{current();const next={...saved,[key]:value};await persist(next);Object.assign(saved,next);};
 const snapshotsFor=async p=>{const s={};for(const t of [p.bank,p.purchase].filter(Boolean)){current();s[t.id]=await read(t,business);current();}return s;};
 const verify=async(p,report)=>{
  const k=fundingKey(p),receipt=saved[k];if(!receipt?.saveAttempted)return null;
  if(batchReport===report&&batchResults.has(k))return batchResults.get(k);
  if(receipt.fingerprint!==fundingFingerprint(p))return {verified:false,message:'Original repair proposal changed. Recover its stored proposal and recheck; no creation will repeat.'};
  const snapshots=await snapshotsFor(p);
  for(const r of report.records.filter(r=>r.account===p.walletAccount.account&&r.amountCents===p.bank.amount&&r.date===p.bank.date&&r.description==='Created Transfer')){current();snapshots[r.id]=await read({id:r.id},business);}
  const group=Object.values(saved).filter(r=>r.saveAttempted&&r.proposal?.business===business&&r.proposal.bank.date===p.bank.date&&r.proposal.bank.amount===p.bank.amount&&r.proposal.bank.primary.account===p.bank.primary.account&&r.proposal.walletAccount.account===p.walletAccount.account&&r.proposal.kind===p.kind).map(r=>r.proposal);
  if(group.length>1){for(const other of group)if(other.bank.id!==p.bank.id)Object.assign(snapshots,await snapshotsFor(other));const checked=verifyFundingBatch(group,snapshots,report,saved);if(batchReport!==report){batchReport=report;batchResults=new Map();}for(const [key,result] of Object.entries(checked)){await checkpoint(key,{...saved[key],...result,snapshots,checkedAt:new Date().toISOString()});batchResults.set(key,result);}return checked[k];}
  const result=verifyFundingRepair(p,snapshots,report,receipt);
  await checkpoint(k,{...receipt,...result,snapshots,checkedAt:new Date().toISOString()});return result;
 };
 onProgress('Collecting complete Wave history for '+years.join(', ')+'…');
 let report=await collect(years,business);current();assertFundingCollection(report,business,years);
 if(mode==='recheck'){
  for(const p of proposals){if(stopRequested())break;current();const result=await verify(p,report);results.push({key:fundingKey(p),...(result||{verified:false,message:'No saved attempt exists.'})});onProgress('Rechecked '+results.length+' of '+proposals.length+' saved outcomes.');}
  return {results,receipts:saved};
 }
 // Existing counterparts that belong to earlier verified repairs are not
 // available to the next equal-amount payment. Re-establish their saved proof
 // before excluding them from duplicate detection; never infer assignment.
 report.verifiedAssignments=[];
 for(const previous of Object.values(saved).filter(r=>r.verified&&r.proposal?.business===business)){
  const old=previous.proposal,ids=[previous.counterpartId,...(previous.groupVerification?.counterpartIds||[])].filter(Boolean);
  if(!ids.some(id=>report.records.some(r=>r.id===id))||!proposals.some(p=>p.walletAccount.account===old.walletAccount.account&&p.bank.amount===old.bank.amount&&Math.abs(Date.parse(p.bank.date)-Date.parse(old.bank.date))<=20*86400000))continue;
  const result=await verify(old,report);if(!result?.verified)throw Error('An existing transfer assignment could not be reverified. No new creation started.');
  report.verifiedAssignments.push({business,bankIds:result.groupVerification?.bankIds||[old.bank.id],counterpartIds:result.groupVerification?.counterpartIds||[result.counterpartId]});
 }
 try{
  for(const p of proposals){
   if(stopRequested())break;current();const k=fundingKey(p),previous=saved[k];
   if(previous?.saveAttempted){const result=await verify(previous.proposal||p,report);results.push({key:k,...result,skipped:true});if(!result?.verified&&mode==='apply')throw Error('A previous creation is still unverified. Recheck saved repairs before continuing.');continue;}
   if(hasLock(p)){results.push({key:k,ready:false,message:'Held: an unfinished bookkeeping save involves this bank or Venmo record. Resolve it before repair.'});continue;}
   let snapshots,request;
   try{
   snapshots=await snapshotsFor(p);
   if(fundingCategoryMatches(snapshots[p.bank.id]?.fields?.category,p.bank.direction,p.walletAccount.account,{date:p.bank.date,description:'Created Transfer'})){
    results.push({key:k,ready:false,message:'Bank already shows this transfer. Refresh accounting history to confirm both sides; no creation was attempted.'});continue;
   }
   assertFundingRecord(p.bank,snapshots[p.bank.id],business);if(p.purchase)assertFundingRecord(p.purchase,snapshots[p.purchase.id],business);
   const possible=fundingLiveCounterparts(p,report);
   for(const row of possible){current();row.directionEvidence=await read({id:row.id},business);current();}
   // Reading same-amount wallet candidates uses the purchase tab, so the owned
   // bank dialog remains available for its transfer menu.
   if(fundingLiveCounterparts(p,report).length){results.push({key:k,ready:false,message:'Live Wave has a same-amount opposite Venmo record. Inspect it before creating anything.'});continue;}
   const menu=await openMenu(p,snapshots[p.bank.id],business);current();
   request=prepareFundingCreate(p,snapshots,menu,report);
   }catch(e){current();if(e.code==='WAVE_TRANSFER_MENU_UNAVAILABLE')throw e;results.push({key:k,ready:false,message:'Held before creation: '+e.message});onProgress('Held before creation: '+e.message+' Checking the next selected record.');continue;}
   if(mode==='check'){results.push({key:k,ready:true,message:'Live bank, Venmo purchase, complete history and create-transfer account checked. Nothing changed.'});continue;}
   if(approvals[k]!==fundingFingerprint(p))throw Error('Approve this exact repair proposal locally before applying.');
   const receipt={version:1,business,fingerprint:fundingFingerprint(p),proposal:p,originalSnapshots:snapshots,beforeIds:report.records.map(r=>r.id),saveAttempted:true,verified:false,stage:'creation-checkpoint',startedAt:new Date().toISOString(),message:'Creation checkpoint saved. Any interruption must be rechecked without repeating creation.'};
   await checkpoint(k,receipt);attempts.push(p);current();
   const outcome=await edit(p,request,business);current();
   await checkpoint(k,{...saved[k],outcome:outcome||null,stage:'verify-counterpart',message:outcome?.problem||'Transfer requested; checking its counterpart.'});
   if(!outcome||outcome.problem||!outcome.saveAttempted)throw Error(outcome?.problem||'Creation response is incomplete. Recheck this saved outcome; creation is locked.');
   const fresh=await read(p.bank,business);current();assertFundingRecord(p.bank,fresh,business,{ignoreCategory:true});
   if(!fundingCategoryMatches(fresh.fields.category,p.bank.direction,p.walletAccount.account,{date:p.bank.date,description:'Created Transfer'}))throw Error('Bank transfer category did not verify. Recheck only.');
   await checkpoint(k,{...saved[k],bankSnapshot:fresh,bankVerified:true});
   results.push({key:k,created:true,verified:false,message:'Bank transfer saved; counterpart verification pending.'});
   onProgress('Saved '+attempts.length+' transfer'+(attempts.length===1?'':'s')+'; continuing exact-record checks.');
  }
 }catch(e){stoppedError=e;}finally{
  // Even after a lost response, try a read-only recovery. Failure leaves the
  // durable attempt locked across reloads and never authorizes a second save.
  if(attempts.length&&isCurrent()){
   try{onProgress('Collecting saved transfer counterparts to verify both sides…');report=await collect(fundingYears(attempts),business);current();assertFundingCollection(report,business,fundingYears(attempts));for(const p of attempts){const result=await verify(p,report),item=results.find(r=>r.key===fundingKey(p));if(item)Object.assign(item,result);else results.push({key:fundingKey(p),...result});}}
   catch(e){for(const p of attempts){const k=fundingKey(p);if(!saved[k].verified&&isCurrent())await checkpoint(k,{...saved[k],message:'Saved-result check stopped: '+e.message});}}
  }
 }
 if(stoppedError&&(stoppedError.code==='WAVE_TRANSFER_MENU_UNAVAILABLE'||!attempts.length||attempts.some(p=>!saved[fundingKey(p)]?.verified)))throw stoppedError;
 return {results,receipts:saved,stoppedReason:stoppedError?.message||null};
}
