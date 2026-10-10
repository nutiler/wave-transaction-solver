import {validateRepairPlan,repairKey,repairFingerprint,repairYears,assertRepairSnapshot,assertRetainedCopy,repairRecordFields,sameDepositRow,normalizeDepositCategory} from './venmo-reconciliation.js';
import {runFundingRepairs} from './venmo-funding-runner.js';
import {fundingKey,fundingFingerprint,assertFundingCollection,assertFundingRecord} from './venmo-funding.js';
import {cents} from './model.js';
import {evidenceSnapshot} from './service-solvers.js';

// A package is an exact preview, not a general instruction to balance an account.
// The Do fixes click approves that package; every write is checkpointed first.
export async function runVenmoRepairPlan({plan,business,approvedFingerprint,receipts={},transferReceipts={},collect,read,inspect,mutate,openMenu,edit,persist,isCurrent=()=>true,stopRequested=()=>false,hasLock=()=>false,onProgress=()=>{},mode='check'}){
 validateRepairPlan(plan,business);if(!['check','apply','recheck'].includes(mode))throw Error('Unsupported repair mode.');
 if(mode==='apply'&&approvedFingerprint!==JSON.stringify(plan))throw Error('Approve the displayed exact repair batch with Do fixes.');
 const current=()=>{if(!isCurrent())throw Error('Business or repair data changed.');};
 let saved={...receipts},transfers={...transferReceipts},report=null,dirty=false;const results=[],years=repairYears(plan);
 const checkpoint=async(k,r)=>{current();const next={...saved,[k]:r};await persist({receipts:next,transferReceipts:transfers});saved=next;};
 const refresh=async(force=false)=>{current();if(!report||force||dirty){onProgress('Reading complete live history once for this repair stage…');report=await collect(years,business);current();assertFundingCollection(report,business,years);dirty=false;}return report;};
 const snapshot=async(a,t=a.record)=>{current();const s=await read(t,business);current();if(inspect)s.repairDetails=await inspect(t,business);current();if(s.structure?.split&&s.repairDetails?.allocations?.length){const row=report.records.find(r=>r.id===t.id),sum=s.repairDetails.allocations.reduce((n,p)=>n+p.amountCents,0);if(row?.account===t.primary.account&&row.amountCents===sum&&s.identity?.transaction===row.id&&s.identity.business===business){if(!s.fields.amount){s.fields.amount=(sum/100).toFixed(2);s.problems=s.problems.filter(p=>!/^Amount:/.test(p));s.repairDetails.amountEvidence='Exact live-list total plus independently read split allocation sum';}if(!s.currency)s.currency=s.repairDetails.currency;}}return s;};
 const checkDeposit=async(a,rows,beforeIds=[])=>{const candidates=rows.filter(r=>sameDepositRow(a,r)&&!beforeIds.includes(r.id)),matches=[];for(const row of candidates){const s=await read({id:row.id},business);current();if(s.identity?.business!==business||s.identity.transaction!==row.id||s.currency!=='USD'||s.problems?.length)throw Error('Possible duplicate deposit is unreadable.');if(s.fields.type==='Deposit')matches.push({row,s});}return matches;};
 const verifyMutation=async a=>{
  const k=repairKey(a),receipt=saved[k];if(!receipt?.saveAttempted)return null;
  if(receipt.fingerprint!==repairFingerprint(a))throw Error('Stored repair proposal differs; inspect its checkpoint without repeating the mutation.');
  let result={verified:false,message:'Saved outcome is not yet confirmed.'};
  if(['duplicate','fee'].includes(a.kind)){
   if(!report.records.some(r=>r.id===a.record.id)){
    if(a.keep){const s=await read(a.keep,business);current();assertRetainedCopy(a,s);if(receipt.retainedSnapshot?.reviewed!==s.reviewed)throw Error('Retained copy reviewed state changed.');}
    result={verified:true,message:'Removed record is absent from complete live history; retained copy checked.'};
   }
  }else if(a.kind==='opening'){
   const s=await snapshot(a);assertRepairSnapshot(a,s,{after:true});if(receipt.originalSnapshot.reviewed!==s.reviewed)throw Error('Opening reviewed status changed unexpectedly.');result={verified:true,message:'Exact opening amount and all unchanged fields verified.'};
  }else{
   const matches=await checkDeposit(a,report.records,receipt.beforeIds);
   const exact=matches.filter(({s})=>s.fields.date===a.date&&s.fields.description===a.description&&s.fields.account===a.walletAccount.account&&cents(s.fields.amount)===a.deltaCents&&normalizeDepositCategory(a,s.fields.category)&&s.structure?.singleCategory===true&&s.structure.split===false);
   if(exact.length===1&&matches.length===1)result={verified:true,createdId:exact[0].row.id,message:'One exact new wallet deposit verified; source retained in the checkpoint.'};
  }
  await checkpoint(k,{...receipt,...result,checkedAt:new Date().toISOString()});return result;
 };
 await refresh();
 // Recover the older funding tool's receipts before removing a copy it may
 // reference. Verified transfers are adopted; their creation never repeats.
 if(mode!=='recheck'){
  const prior=plan.actions.filter(a=>a.kind==='transfer'&&transfers[fundingKey(a.transfer)]?.saveAttempted);
  if(prior.length){
   for(const a of prior){const old=transfers[fundingKey(a.transfer)].proposal;if(!old||old.business!==business||old.walletAccount.account!==a.walletAccount.account||JSON.stringify(evidenceSnapshot(old.source))!==JSON.stringify(evidenceSnapshot(a.transfer.source)))throw Error('Earlier transfer attempt uses different source evidence or wallet.');}
   const recovered=await runFundingRepairs({proposals:prior.map(a=>transfers[fundingKey(a.transfer)].proposal),business,receipts:transfers,read,openMenu,edit,collect:async()=>report,persist:async next=>{await persist({receipts:saved,transferReceipts:next});transfers=next;},isCurrent,stopRequested,onProgress,mode:'recheck'});
   if(recovered.results.some(r=>!r.verified))throw Error('An earlier transfer save remains unverified. No new repair was started.');
   for(const a of prior){const p=a.transfer,k=fundingKey(p),old=transfers[k],originalSnapshots={...old.originalSnapshots};if(p.purchase){const s=await read(p.purchase,business);current();assertFundingRecord(p.purchase,s,business);originalSnapshots[p.purchase.id]=s;}if(old.fingerprint!==fundingFingerprint(p)){const next={...transfers,[k]:{...old,proposal:p,fingerprint:fundingFingerprint(p),originalSnapshots,adoptedFrom:{proposal:old.proposal,fingerprint:old.fingerprint,originalSnapshots:old.originalSnapshots},message:'Existing verified transfer adopted with the retained duplicate copy; no Wave write.'}};await persist({receipts:saved,transferReceipts:next});transfers=next;}if(mode==='apply')await checkpoint(repairKey(a),{business,action:a,fingerprint:repairFingerprint(a),saveAttempted:true,verified:true,transferKey:k,message:'Previously saved transfer rechecked and adopted; creation skipped.'});}
  }
 }
 // Recovery is entirely read-only, including uncertain deletions and deposits.
 if(mode==='recheck'){
  for(const a of plan.actions.filter(a=>a.kind!=='transfer')){if(stopRequested())break;try{const result=await verifyMutation(a);if(result)results.push({key:repairKey(a),...result});}catch(e){results.push({key:repairKey(a),verified:false,message:e.message});}}
 }else{
  // Remove proven excess copies before funding, so the retained purchase is used.
  for(const a of plan.actions.filter(a=>['duplicate','fee','opening'].includes(a.kind))){
   if(stopRequested())break;current();const k=repairKey(a),previous=saved[k];
   if(previous?.saveAttempted){results.push({key:k,...await verifyMutation(a)});if(!saved[k].verified&&mode==='apply')throw Error('A saved correction needs verification before further writes.');continue;}
   try{
    if(hasLock(a))throw Error('Another unfinished Wave save involves this record.');
    const row=report.records.find(r=>r.id===a.record.id);
    if(!row){if(['duplicate','fee'].includes(a.kind)){if(a.keep)assertRetainedCopy(a,await read(a.keep,business));if(mode==='apply')await checkpoint(k,{business,action:a,fingerprint:repairFingerprint(a),saveAttempted:false,verified:true,preexisting:true,message:'Record already absent in complete live history. No deletion repeated.'});results.push({key:k,ready:false,verified:true,skipped:true,message:'Record already absent. No deletion repeated.'});continue;}throw Error('Opening record is missing from live history.');}
    const s=await snapshot(a);if(a.kind==='opening'&&cents(s.fields.amount)===a.targetCents){assertRepairSnapshot(a,s,{after:true});if(mode==='apply')await checkpoint(k,{business,action:a,fingerprint:repairFingerprint(a),saveAttempted:false,verified:true,preexisting:true,message:'Opening already has the exact target amount; no Save repeated.'});results.push({key:k,verified:true,skipped:true,message:'Opening already has the target amount. Nothing saved.'});continue;}
    assertRepairSnapshot(a,s);let retainedSnapshot;if(a.keep){retainedSnapshot=await read(a.keep,business);current();assertRetainedCopy(a,retainedSnapshot);}
    if(mode==='check'){results.push({key:k,ready:true,message:'Original and retained fields checked. Nothing changed.'});continue;}
    const receipt={business,action:a,fingerprint:repairFingerprint(a),originalSnapshot:s,retainedSnapshot:retainedSnapshot||null,beforeIds:report.records.map(r=>r.id),saveAttempted:true,verified:false,startedAt:new Date().toISOString(),message:'Write checkpoint saved; uncertain outcomes may only be rechecked.'};
    await checkpoint(k,receipt);onProgress('Applying '+a.kind+' · '+a.record.date+' · '+a.record.id);const outcome=await mutate(a,{expected:repairRecordFields(a.record)},business);current();
    await checkpoint(k,{...saved[k],outcome});dirty=true;
    if(!outcome?.mutationAttempted){await checkpoint(k,{...saved[k],saveAttempted:false,message:outcome?.problem||'No financial click was made.'});throw Error(outcome?.problem||'Mutation was not attempted.');}
    if(outcome.problem)throw Error(outcome.problem);
    if(a.kind==='opening'){const fresh=await snapshot(a);assertRepairSnapshot(a,fresh,{after:true});if(fresh.reviewed!==s.reviewed)throw Error('Reviewed state changed.');await checkpoint(k,{...saved[k],verified:true,message:'Opening amount verified.'});}
    results.push({key:k,applied:true,message:'Saved; final verification pending.'});
   }catch(e){if(saved[k]?.saveAttempted&&!saved[k].verified){await checkpoint(k,{...saved[k],message:e.message});throw e;}await checkpoint(k,{business,action:a,fingerprint:repairFingerprint(a),saveAttempted:false,verified:false,message:'Held: '+e.message});results.push({key:k,ready:false,message:'Held: '+e.message});}
  }
  if(mode==='apply'&&dirty){await refresh(true);for(const a of plan.actions.filter(a=>saved[repairKey(a)]?.saveAttempted&&!saved[repairKey(a)].verified)){const v=await verifyMutation(a);if(!v?.verified)throw Error('Saved correction needs a read-only recheck: '+a.record?.id);}}
 }
 const transferActions=plan.actions.filter(a=>a.kind==='transfer'&&(mode==='recheck'?transfers[fundingKey(a.transfer)]?.saveAttempted:!transfers[fundingKey(a.transfer)]?.verified));
 if(transferActions.length&&!stopRequested()){
  const proposals=transferActions.map(a=>a.transfer),approvals=Object.fromEntries(proposals.map(p=>[fundingKey(p),fundingFingerprint(p)]));let calls=0;
  const result=await runFundingRepairs({proposals,business,approvals,receipts:transfers,read,openMenu,edit,persist:async next=>{current();await persist({receipts:saved,transferReceipts:next});transfers=next;},isCurrent,stopRequested,hasLock:p=>hasLock({kind:'transfer',transfer:p}),onProgress,mode,collect:async()=>{const r=await refresh(calls++>0);return r;}});
  results.push(...result.results);transfers=result.receipts;
  for(const r of result.results.filter(r=>r.ready===false)){const a=transferActions.find(a=>fundingKey(a.transfer)===r.key);if(a)await checkpoint(repairKey(a),{business,action:a,fingerprint:repairFingerprint(a),saveAttempted:false,verified:false,message:r.message});}
 }
 if(mode!=='recheck')for(const a of plan.actions.filter(a=>['receipt','external-funding'].includes(a.kind))){
  if(stopRequested())break;current();const k=repairKey(a);
  if(saved[k]?.saveAttempted){await refresh(true);results.push({key:k,...await verifyMutation(a)});if(!saved[k].verified&&mode==='apply')throw Error('A previous deposit remains unverified.');continue;}
  try{
   if(hasLock(a))throw Error('Another Wave save involves this source.');await refresh();const existing=await checkDeposit(a,report.records);
   if(existing.length){results.push({key:k,ready:false,skipped:true,message:'A same-amount live deposit exists. No additional deposit created.'});continue;}
   if(mode==='check'){results.push({key:k,ready:true,message:'Complete history establishes no same-amount deposit. Nothing created.'});continue;}
   await checkpoint(k,{business,action:a,fingerprint:repairFingerprint(a),beforeIds:report.records.map(r=>r.id),saveAttempted:true,verified:false,startedAt:new Date().toISOString(),message:'Deposit checkpoint saved; never create again without verification.'});
   onProgress('Creating supported '+a.kind+' · '+a.date);const outcome=await mutate(a,{target:{date:a.date,description:a.description,account:a.walletAccount.account,type:'Deposit',amount:(a.deltaCents/100).toFixed(2),category:a.category}},business);current();await checkpoint(k,{...saved[k],outcome});dirty=true;
   if(!outcome?.mutationAttempted){await checkpoint(k,{...saved[k],saveAttempted:false,message:outcome?.problem||'No Save was clicked.'});throw Error(outcome?.problem||'Deposit was not attempted.');}if(outcome.problem)throw Error(outcome.problem);results.push({key:k,applied:true,message:'Deposit requested; final verification pending.'});
  }catch(e){if(saved[k]?.saveAttempted&&!saved[k].verified){await checkpoint(k,{...saved[k],message:e.message});throw e;}await checkpoint(k,{business,action:a,fingerprint:repairFingerprint(a),saveAttempted:false,verified:false,message:'Held: '+e.message});results.push({key:k,ready:false,message:'Held: '+e.message});}
 }
 if(mode==='apply'&&dirty)await refresh(true);
 for(const a of plan.actions.filter(a=>a.kind!=='transfer'&&saved[repairKey(a)]?.saveAttempted)){const r=await verifyMutation(a);const row=results.find(r=>r.key===repairKey(a));if(row)Object.assign(row,r);else results.push({key:repairKey(a),...r});}
 for(const a of transferActions){const r=transfers[fundingKey(a.transfer)];if(r?.verified)saved[repairKey(a)]={business,action:a,fingerprint:repairFingerprint(a),saveAttempted:true,verified:true,transferKey:fundingKey(a.transfer),message:r.message};}
 await persist({receipts:saved,transferReceipts:transfers});
 return {receipts:saved,transferReceipts:transfers,results,stopped:stopRequested()};
}
