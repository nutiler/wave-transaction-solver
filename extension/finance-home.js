import {loadLocalFeature,saveLocalFeature} from './session.js';
import {receiptLocallyResolved} from './saved-recovery.js';
// Presentation state for the daily workflow. This module never writes to Wave.
export function financeFreshness({lastVisit, lastScan, now = Date.now()} = {}) {
  const age = value => value && Number.isFinite(Date.parse(value)) ? Math.max(0, (now - Date.parse(value)) / 86400000) : null;
  const awayDays = age(lastVisit), scanDays = age(lastScan);
  return {awayDays, scanDays, catchUp: awayDays !== null && awayDays >= 30};
}
export function financeReturnState(prior={},now=Date.now()) {
 const fresh=financeFreshness({lastVisit:prior.lastVisit,now});
 return {...prior,lastVisit:new Date(now).toISOString(),...(fresh.catchUp?{catchUpRequired:true,catchUpAwayDays:Math.floor(fresh.awayDays)}:{})};
}

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function unverifiedWaveReceipts(receipts={},business) {
 return Object.entries(receipts).filter(([key,r])=>key.startsWith(business+':')&&(r?.saveAttempted||r?.attempted)&&!(r.categoryVerified&&r.reviewedVerified||r.verified&&r.reviewed)&&!receiptLocallyResolved(key,r,business)).map(([key,receipt])=>({key,receipt}));
}
export function financeSummary(model,queue={}) {
 const results=Object.values(queue.results||{}),decisions=Object.values(queue.decisions||{}),locked=results.some(r=>['executing','uncertain'].includes(r.status));
 const approved=decisions.filter(d=>!queue.results?.[d.key]||queue.results[d.key].status==='queued').length;
 const review=(model?.items||[]).filter(i=>i.editable&&(!queue.decisions?.[i.key]||queue.results?.[i.key]?.status==='attention')&&!queue.deferred?.[i.key]).length;
 const exceptions=(model?.items||[]).filter(i=>!i.editable).length+results.filter(r=>['attention','uncertain','executing'].includes(r.status)).length;
 return {approved,review,exceptions,verified:results.filter(r=>r.status==='done').length,locked};
}
export function installFinanceHome({parent,getState,command,openData}) {
 const box=el('div',undefined,'finance-overview'),identity=el('div',undefined,'finance-identity'),name=el('strong'),id=el('small'),scan=el('p'),pill=el('span',undefined,'finance-pill');
 identity.append(el('span','WAVE BUSINESS','finance-eyebrow'),name,id);box.append(identity,pill,scan);
 const steps=el('ol',undefined,'finance-sequence');steps.setAttribute('aria-label','Scan, review, approve, apply and verify');
 for(const [i,label] of ['Scan','Review','Approve','Apply','Verify'].entries()){const li=el('li');li.append(el('span',String(i+1)),el('strong',label));steps.append(li);}box.append(steps);
 const metrics=el('div',undefined,'finance-metrics'),values=[];
 for(const [label,kind] of [['To review','review'],['Locally approved','approved'],['Needs attention','exceptions'],['Verified','verified']]){const card=el('div');card.dataset.kind=kind;const v=el('strong','—');values.push(v);card.append(v,el('span',label));metrics.append(card);}box.append(metrics);
 const catchup=el('div',undefined,'finance-catchup'),catchupText=el('p'),catchupButton=el('button','Refresh catch-up evidence','secondary'),catchupDone=el('button','I refreshed the exports I need','secondary');catchupButton.onclick=openData;catchupDone.onclick=async()=>{const business=owner;if(!business||business!==getState().business)return;catchupDone.disabled=true;try{const latest=await loadLocalFeature('finance:home:'+business)||saved;saved={...latest,catchUpRequired:false,catchUpRefreshedAt:new Date().toISOString()};await saveLocalFeature('finance:home:'+business,saved);refresh();}finally{catchupDone.disabled=false;}};catchup.append(catchupText,catchupButton,catchupDone);catchup.hidden=true;box.append(catchup);parent.append(box);
 let owner=null,saved={},previousVisit=null,restoring=false,lastCapture=null;
 async function restore(){const business=getState().business;if(owner===business||restoring)return;restoring=true;owner=business;saved={};try{const prior=business?await loadLocalFeature('finance:home:'+business):null;if(business!==getState().business)return;saved=prior||{};previousVisit=saved.lastVisit;lastCapture=saved.lastSuccessfulScan;if(business){saved=financeReturnState(saved);await saveLocalFeature('finance:home:'+business,saved);}}catch(e){scan.textContent='Scan freshness could not be restored: '+e.message;}finally{restoring=false;if(owner!==getState().business){owner=null;void restore();}refresh();}}
 function refresh(){const s=getState(),raw=command()?.snapshot(),snapshot=raw?.state?.business===s.business?raw:null,summary=financeSummary(snapshot?.model,snapshot?.state),report=s.report?.business===s.business?s.report:null;
  const legacy=unverifiedWaveReceipts(s.receipts,s.business).filter(e=>!Object.values(snapshot?.state?.decisions||{}).some(d=>['uncertain','executing'].includes(snapshot.state.results[d.key]?.status)&&e.key.split(':').some(id=>d.ids.includes(id))));summary.locked||=legacy.length>0;summary.exceptions+=legacy.length;
  const displayName=s.businessLabel?.split(' · ')[0];name.textContent=s.business?(displayName&&displayName!=='Wave'&&!displayName.includes(s.business)?displayName:'Connected Wave business'):'Choose your Wave business';id.textContent=s.business||'Set up your connection once in Data & setup.';
  for(const [i,key] of ['review','approved','exceptions','verified'].entries())values[i].textContent=snapshot?.model||Object.keys(snapshot?.state?.decisions||{}).length||summary.locked?String(summary[key]):'—';
  const currentScan=report&&!report.running&&report.completeness==='count-confirmed'?report.capturedAt:null;
  if(s.business&&owner===s.business&&currentScan&&currentScan!==lastCapture&&!restoring){lastCapture=currentScan;saved={...saved,lastSuccessfulScan:currentScan};void saveLocalFeature('finance:home:'+s.business,saved).catch(()=>{});}
  const timestamp=currentScan||(owner===s.business?saved.lastSuccessfulScan:null);scan.textContent=timestamp?'Last successful live scan · '+new Date(timestamp).toLocaleString()+(report?.persistenceError?' · Scan completed; local saving needs attention. Reload the updated extension and scan again.':''):'No successful live scan yet. Your exports are optional for daily work.';
  catchup.hidden=!s.business||owner!==s.business||!saved.catchUpRequired;
  catchupText.textContent='Welcome back. After '+(saved.catchUpAwayDays||30)+' days away, check provider dates and refresh the exports you need, then scan Wave. This guide stays here until you confirm. A folder refresh does not prove export coverage.';
  const clear=snapshot?.model&&!summary.review&&!summary.approved&&!summary.exceptions;pill.textContent=s.busy||command()?.busy()?'Working':snapshot?.preparationFailure?'Scan needs retry':summary.locked?'Saved result needs check':s.business?summary.approved?'Ready to apply':summary.exceptions&&!summary.review?'Needs your input':clear?'Up to date':snapshot?.model?'Ready to review':'Ready to scan':'Setup needed';pill.dataset.state=s.busy||command()?.busy()?'running':snapshot?.preparationFailure||summary.locked?'error':s.business?summary.exceptions&&!summary.review?'paused':'ready':'paused';
  const stage=s.busy||command()?.busy()||snapshot?.preparationFailure?0:summary.locked?4:summary.approved?3:snapshot?.model?1:0;
  [...steps.children].forEach((li,i)=>{li.dataset.state=i===stage?'current':i<stage?'complete':'next';if(i===stage)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
 }
 document.addEventListener('finance-data',async()=>{if(owner){const latest=await loadLocalFeature('finance:home:'+owner);if(latest)saved=latest;refresh();}});
 return {restore,refresh};
}
