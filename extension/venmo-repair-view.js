import {projectDataFolder,loadLocalFeature,writeLocalRecords,claimVenmoLease,releaseVenmoLease} from './session.js';
import {importAccounting} from './model.js';
import {importVenmoEvidence,mergeServiceEvidence} from './service-solvers.js';
import {validateRepairPlan,repairKey,completedRepairBalance} from './venmo-reconciliation.js';
import {fundingKey} from './venmo-funding.js';
import {runVenmoRepairPlan,VENMO_REPAIR_ENGINE_VERSION} from './venmo-repair-runner.js?build=0.99.23';
import {VENMO_FUNDING_ENGINE_VERSION} from './venmo-funding-runner.js?build=0.99.23';
import {repairDiagnosticReport,persistRepairDiagnostics} from './venmo-repair-diagnostics.js';
import {activity,paintActivity} from './activity.js';
import {logEvent,logError} from './diagnostic-console.js';
import {unverifiedWaveReceipts} from './finance-home.js';

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const money=n=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(n/100);
const fundingState=(value,business)=>{if(!value)return {version:1,business,profileAccounts:{},approvals:{},receipts:{},actualBalances:{}};if(value.version!==1||value.business!==business||!value.receipts||typeof value.receipts!=='object'||Array.isArray(value.receipts)||Object.entries(value.receipts).some(([k,r])=>!r||r.business!==business||r.proposal?.business!==business||!r.proposal.bank?.primary||!Array.isArray(r.beforeIds)||k!==business+':'+r.proposal.bank.id))throw Error('Earlier funding checkpoints are invalid. Preserve them for inspection.');return value;};
async function fileAt(root,path){const parts=path.replace(/^data\//,'').split('/');if(parts.some(p=>!p||p==='.'||p==='..'||p.includes('\\')))throw Error('Invalid private repair file path.');let dir=root;for(const part of parts.slice(0,-1))dir=await dir.getDirectoryHandle(part);return (await dir.getFileHandle(parts.at(-1))).getFile();}
export async function loadPreparedVenmoRepair(root,business){
 const file=await fileAt(root,'venmo/venmo-repair-plan.local.json');if(file.size>30*1024*1024)throw Error('Repair plan is too large.');const plan=JSON.parse(await file.text());validateRepairPlan(plan,business);
 const bundles=[],statements=[];
 for(const p of plan.statements){const csv=await fileAt(root,p.source),parsed=importVenmoEvidence(await csv.text(),{name:p.source,period:p.period,profile:p.profileIdentity===plan.profile?'personal':'business'});bundles.push(parsed);if(parsed.controls.statement)statements.push(parsed.controls.statement);}
 const records=mergeServiceEvidence(bundles);validateRepairPlan(plan,business,{records,statements});
 const accounting=await fileAt(root,plan.waveSource),ledger=importAccounting(await accounting.text()),byID=new Map(ledger.transactions.map(t=>[t.id,t]));
 for(const t of plan.baseline)if(JSON.stringify(byID.get(t.id))!==JSON.stringify(t))throw Error('The archived Wave export differs from the prepared audit.');
 return {plan,transactions:ledger.transactions,records,statements};
}
export function installVenmoRepairView({parent,getState,makeAdapter,withRun=fn=>fn(),loadPrepared=async business=>{const root=await projectDataFolder();if(!root)return null;if(await root.queryPermission({mode:'read'})!=='granted')throw Error('Refresh your connected data folder to restore read access.');return loadPreparedVenmoRepair(root,business);}}){
 const section=el('section',undefined,'venmo-repair-workspace');section.id='venmoRepairBatch';parent.prepend(section);
 const status=el('p','Loading your prepared reconciliation…');status.id='venmoRepairStatus';status.setAttribute('role','status');
 const summary=el('div',undefined,'funding-balances'),details=el('details',undefined,'setup-options'),rows=el('div');details.append(el('summary','Review every prepared fix'),rows);
 const run=el('button','Do fixes'),check=el('button','Check fixes in Wave','secondary'),recheck=el('button','Recheck saved fixes','secondary'),refresh=el('button','Reload prepared findings','secondary'),stop=el('button','Stop after current fix','secondary');stop.hidden=true;
 const batchLabel=el('span'),bar=el('div',undefined,'bar');bar.append(run,check,recheck,refresh,stop,batchLabel);
 section.append(el('span','PREPARED RECONCILIATION','finance-eyebrow'),el('h2','Your Venmo fixes, ready to run'),el('p','Do fixes approves the exact changes displayed below. The app checks live records, preserves the retained payment categories, and verifies saved results.'),status,bar,summary,details);
 let owner=null,saved={version:1,plan:null,receipts:{}},loaded=null,legacy=null,running=false,loading=false,stopRequested=false,epoch=0,problem='';
 const busy=()=>running||loading||getState().busy;
 const builds=()=>({installed:globalThis.chrome?.runtime?.getManifest?.().version||null,repair:VENMO_REPAIR_ENGINE_VERSION,funding:VENMO_FUNDING_ENGINE_VERSION});
 const diagnostics=async(mode,detail,results=[])=>{if(!saved.plan)return;try{const report=repairDiagnosticReport({plan:saved.plan,receipts:saved.receipts,transferReceipts:legacy?.receipts,mode,detail,builds:builds(),results}),where=await persistRepairDiagnostics(report);logEvent('Venmo repair diagnostic report saved',{provider:'venmo',detail:where.location+' · '+report.verified+'/'+report.total+' verified · '+JSON.stringify(report.builds)});for(const a of report.actions.filter(a=>!a.verified&&a.reason!=='Not checked yet.'))logEvent('Venmo '+a.kind+' '+a.date+' · '+a.reason,{provider:'venmo',level:'warn'});}catch(e){logError(e,'Venmo diagnostic report could not be saved');}};
 const update=()=>{const s=getState(),plan=saved.plan;run.disabled=check.disabled=busy()||!s.extensionMode||s.sample||!plan||!!problem;run.disabled||=!!plan&&plan.actions.every(a=>saved.receipts[repairKey(a)]?.verified);recheck.disabled=busy()||!s.extensionMode||s.sample||!plan||!(Object.values(saved.receipts).some(r=>r.saveAttempted)||Object.values(legacy?.receipts||{}).some(r=>r.saveAttempted))||!!problem;refresh.disabled=running||loading||s.busy;};
 const link=(label,id)=>{const a=el('a',label);a.href='https://next.waveapps.com/'+owner+'/transactions/'+id;a.target='_blank';a.rel='noopener';return a;};
 function render(){
  summary.replaceChildren();rows.replaceChildren();batchLabel.textContent='';const p=saved.plan;if(p){const done=p.actions.filter(a=>saved.receipts[repairKey(a)]?.verified).length;batchLabel.textContent=p.actions.length+' prepared fixes · projected balance '+money(p.projectedCents);
   for(const [label,value] of [['Saved Wave balance',money(p.balanceCents)],['All planned fixes',p.actions.length+' changes'],['Projected after all fixes',money(p.projectedCents)],['Verified so far',done+' / '+p.actions.length]]){const c=el('div',undefined,'funding-balance-card');c.append(el('h3',label),el('p',value));summary.append(c);}
   const counts=Object.groupBy(p.actions,a=>a.kind);for(const [kind,actions] of Object.entries(counts)){const group=el('details');group.append(el('summary',actions.length+' '+kind.replaceAll('-',' ')+' fixes · '+money(actions.reduce((n,a)=>n+a.deltaCents,0))));for(const a of actions){const row=el('details',undefined,'funding-card');row.dataset.repair=repairKey(a);const record=a.record||a.transfer?.bank,source=a.source||a.transfer?.source,r=saved.receipts[repairKey(a)];row.append(el('summary',(record?.date||a.date)+' · '+money(a.deltaCents)+' · '+(r?.verified?'Verified':a.kind)),el('p',a.reason||a.transfer?.reason||''));if(record)row.append(el('p',record.primary.account+' · '+record.description+' · '+record.categories.join(' + ')),link('Open affected record',record.id));if(a.keep)row.append(el('p','Retain: '+a.keep.date+' · '+a.keep.description+' · '+a.keep.categories.join(' + ')),link('Open retained copy',a.keep.id));if(source)row.append(el('p','Venmo '+source.sourceId+' · '+source.date+' · '+[source.funding,source.destination].filter(Boolean).join(' ')),el('p',source.merchant+' · '+source.note));if(a.category)row.append(el('p','Deposit category: '+a.category+' · '+(a.categoryPath?.join(' → ')||'Income')));if(a.kind==='opening')row.append(el('p',money(a.record.amount)+' → '+money(a.targetCents)));if(r)row.append(el('p',r.message||'Saved result needs recheck.'));group.append(row);}rows.append(group);}
   const pending=Object.values(saved.receipts).filter(r=>r.saveAttempted&&!r.verified).length;summary.append(el('p',pending?pending+' saved fixes need verification. Do fixes rechecks these first. An unchanged opening amount can receive one guarded correction; deletions and deposits never repeat.':'Your prepared batch stays local and belongs only to this Wave business.'));
   for(const a of p.actions.filter(a=>a.kind==='external-funding'))summary.append(el('p',money(a.deltaCents)+' from '+a.source.funding+' has no matching Wave bank account. Prepared treatment: deposit from personal funds → '+a.category+'.','finance-actions-note'));
   summary.append(el('p','Projected balance after verified fixes: '+money(completedRepairBalance(p,saved.receipts))+'. Refresh the Wave export after completion to confirm the account balance.','finance-actions-note'));
  }
  update();
 }
 async function refreshPlan({force=false}={}){
  if(running||loading||getState().busy)return;if(!force&&owner===getState().business&&saved.plan&&loaded){render();return;}loading=true;problem='';const business=getState().business,token=++epoch;owner=business;update();
  try{
   saved={version:1,business,plan:null,receipts:{}};loaded=null;legacy=null;
   if(!business){status.textContent='Choose a Wave business to load its prepared findings.';return;}
   const restored=await loadLocalFeature('venmo:reconciliation:'+business),funding=await loadLocalFeature('venmo:funding:'+business);
   if(restored&&(restored.version!==1||restored.business!==business||!restored.receipts||typeof restored.receipts!=='object'||Array.isArray(restored.receipts)||Object.entries(restored.receipts).some(([k,r])=>r?.business!==business||r.action?.business!==business||k!==repairKey(r.action))))throw Error('Saved repair checkpoints are invalid. Preserve them for inspection.');
   legacy=fundingState(funding,business);
   loaded=await loadPrepared(business);if(token!==epoch||getState().business!==business)return;
   if(restored){saved=restored;if(loaded&&restored.plan&&JSON.stringify(loaded.plan)!==JSON.stringify(restored.plan)&&Object.values(restored.receipts).some(r=>r.saveAttempted))throw Error('A different repair package cannot replace saved attempts. Recover the original package first.');}
   if(loaded)saved={...saved,plan:loaded.plan};
   if(saved.plan){validateRepairPlan(saved.plan,business);await writeLocalRecords([{key:'venmo:reconciliation:'+business,value:saved}]);status.textContent='Prepared findings loaded: '+saved.plan.actions.length+' exact fixes. Inspect the preview, then press Do fixes.';}
   else status.textContent='No prepared repair package found in data/venmo. Connect or refresh your data folder in Data & setup.';
  }catch(e){problem=e.message;status.textContent='Prepared fixes unavailable: '+e.message;logError(e,'Prepared Venmo findings could not load');}
  finally{loading=false;render();if(owner===getState().business)await diagnostics('restored',status.textContent);if(owner!==getState().business)queueMicrotask(()=>void refreshPlan());}
 }
 async function execute(mode){
  if(busy()||!saved.plan||problem||!getState().extensionMode||getState().sample)return;running=true;stopRequested=false;stop.hidden=false;stop.disabled=false;const business=owner,plan=saved.plan,source=getState().transactions,lease=crypto.randomUUID(),task=activity.begin(mode==='apply'?'Applying prepared Venmo fixes':'Checking prepared Venmo fixes',{priority:10});let heartbeat=null,leaseValid=false,leaseDeadline=0,renewal=Promise.resolve(),failed=false,diagnosticResults=[];update();
  const current=()=>leaseValid&&Date.now()<leaseDeadline&&getState().business===business&&saved.plan===plan&&getState().transactions===source;
  const progress=message=>{status.textContent=message;task.update({detail:message});logEvent(message,{provider:'venmo',detail:'Prepared reconciliation'});};
  try{
   await paintActivity();const build=builds();logEvent('Venmo repair engine loaded',{provider:'venmo',detail:JSON.stringify(build)});if(build.installed&&[build.repair,build.funding].some(v=>v!==build.installed))throw Error('Loaded Venmo engine '+build.repair+' does not match installed extension '+build.installed+'. Close Solver tabs, reload the extension and reopen Solver. No Wave action started.');await claimVenmoLease(business,lease);leaseValid=true;leaseDeadline=Date.now()+240000;heartbeat=setInterval(()=>{renewal=renewal.then(()=>claimVenmoLease(business,lease)).then(()=>{leaseDeadline=Date.now()+240000;}).catch(e=>{leaseValid=false;logError(e,'Venmo run lease lost');});},30000);const fresh=await loadPrepared(business);if(!fresh||JSON.stringify(fresh.plan)!==JSON.stringify(plan))throw Error('Prepared files changed. Reload the findings and review the new preview before applying.');loaded=fresh;validateRepairPlan(plan,business,{records:loaded.records,statements:loaded.statements});
   // Re-read persisted locks; the older funding panel may have run since load.
   legacy=fundingState(await loadLocalFeature('venmo:funding:'+business),business);
   const pendingFunding=Object.values(legacy.receipts||{}).filter(r=>r.saveAttempted&&!r.verified&&!plan.actions.some(a=>a.kind==='transfer'&&fundingKey(a.transfer)===fundingKey(r.proposal)));
   if(pendingFunding.length)throw Error('An earlier transfer save needs its read-only recheck before this batch can write.');
   const adapter=makeAdapter({business,transactions:loaded.transactions,isCurrent:current,stopRequested:()=>stopRequested,onProgress:progress});
   if(build.installed&&adapter.engineBuild!==build.installed)throw Error('Loaded Venmo Wave adapter '+(adapter.engineBuild||'unknown')+' does not match installed extension '+build.installed+'. Close Solver tabs, reload the extension and reopen Solver. No Wave action started.');
   const result=await withRun(()=>runVenmoRepairPlan({plan,business,approvedFingerprint:mode==='apply'?JSON.stringify(plan):null,receipts:saved.receipts,transferReceipts:legacy.receipts||{},...adapter,mode,isCurrent:current,stopRequested:()=>stopRequested,onProgress:progress,hasLock:a=>{const ids=[a.record?.id,a.keep?.id,a.transfer?.bank.id,a.transfer?.purchase?.id].filter(Boolean);return unverifiedWaveReceipts(getState().receipts,business).some(({key,receipt:r})=>ids.some(id=>key===business+':'+id||r.ids?.includes(id)));},persist:async state=>{const next={...saved,business,receipts:state.receipts},funding={...legacy,receipts:state.transferReceipts};await writeLocalRecords([{key:'venmo:reconciliation:'+business,value:next},{key:'venmo:funding:'+business,value:funding}]);saved=next;legacy=funding;}}));
   const verified=plan.actions.filter(a=>result.receipts[repairKey(a)]?.verified).length,held=result.results.filter(r=>r.ready===false&&!r.verified).length;
   failed=held>0||!!result.stopped||(mode!=='check'&&verified<plan.actions.length);
   status.textContent=mode==='check'?result.results.filter(r=>r.ready).length+' checks passed · '+held+' held. Nothing changed.':(failed?'Batch incomplete: ':'')+verified+' / '+plan.actions.length+' fixes verified · '+held+' held.'+(result.stopped?' Stopped after the current fix.':'')+' Projected balance after verified fixes: '+money(completedRepairBalance(plan,result.receipts))+'.';
   const blockers=[...new Set(result.results.filter(r=>!r.verified&&r.ready===false&&r.message).map(r=>r.message))];
   if(blockers.length)status.textContent+=' '+blockers.slice(0,3).join(' · ');
   logEvent(failed?'Prepared Venmo batch incomplete':'Prepared Venmo batch finished',{provider:'venmo',level:failed?'warn':'info',detail:status.textContent});
   diagnosticResults=result.results;
  }catch(e){failed=true;status.textContent='Prepared fixes stopped: '+e.message+' Saved checkpoints are preserved; Recheck saved fixes never repeats a write.';logError(e,'Prepared Venmo fixes stopped');}
  finally{await diagnostics(mode,status.textContent,diagnosticResults);if(heartbeat)clearInterval(heartbeat);await renewal;try{await releaseVenmoLease(business,lease);}catch(e){logError(e,'Venmo run lease release failed');}running=false;stop.hidden=true;render();task.finish(status.textContent,{stopped:failed});}
 }
 run.onclick=()=>execute('apply');check.onclick=()=>execute('check');recheck.onclick=()=>execute('recheck');refresh.onclick=()=>refreshPlan({force:true});stop.onclick=()=>{stopRequested=true;stop.disabled=true;};
 return {refresh:refreshPlan,busy:()=>running};
}
