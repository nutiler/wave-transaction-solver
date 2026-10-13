import {readWavePage} from './live-reader.js?build=0.99.31';
import {editWaveTransaction} from './editor.js?build=0.99.31';
import {readTransferMenu} from './transfer-menu.js';
import {waveListScan} from './list-scan.js';
import {openBackgroundTab,reopenSavedTransaction} from './workflow.js';
import {venmoRepairPage} from './venmo-repair-page.js?build=0.99.31';
import {assertDateScope} from './venmo-direct-runner.js';
const workers=new Map();

export function fundingWaveAdapter({api=globalThis.chrome,business,transactions=[],isCurrent=()=>true,stopRequested=()=>false,onProgress=()=>{},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now}){
 const tabs=workers.get(business)||{list:null,bank:null,purchase:null};tabs.history||={};workers.set(business,tabs);let activeBank=null;
 const current=()=>{if(!isCurrent())throw Error('Repair context changed.');};
 const script=async(tabId,func,args=[],allowEmpty=false)=>{current();const r=await api.scripting.executeScript({target:{tabId},func,args});current();if(!r[0]?.result&&!allowEmpty)throw Error('No Wave response returned.');return r[0]?.result||null;};
 const navigate=async(url,tabId=tabs.list,history=false)=>{const tab=await openBackgroundTab(api.tabs,url,tabId);if(!history)tabs.list=tab.id;for(let i=0;i<50;i++){current();const t=await api.tabs.get(tab.id);if(t.status==='complete'&&t.url===url&&!t.pendingUrl)return tab;await wait(300);}throw Error('Wave history did not finish loading.');};
 const known=transactions.filter(t=>t.primary).map(t=>({id:t.id,date:t.date,description:t.description,account:t.primary.account,amountCents:t.amount}));
 async function read(record){current();const role=record.primary&&!/\bVenmo\b/i.test(record.primary.account)?'bank':'purchase';const tab=await reopenSavedTransaction(api.tabs,tabs[role],business,record.id,isCurrent,wait,{now,timeoutMs:15000});tabs[role]=tab.id;const snapshot=await script(tab.id,readWavePage,[{waitForReady:{business,id:record.id,timeoutMs:15000}}]);current();if(!snapshot||snapshot.identity?.business!==business||snapshot.identity.transaction!==record.id){const error=Error('Exact record '+record.id+' was not readable: '+(snapshot?.problems?.join(' · ')||'Wave returned another transaction.'));error.liveDiagnostics={expectedId:record.id,identity:snapshot?.identity,problems:snapshot?.problems,currency:snapshot?.currency,structure:snapshot?.structure};throw error;}if(snapshot.problems?.includes('Timed out waiting for the exact transaction form.')){const error=Error('Exact record '+record.id+' form timed out: '+snapshot.problems.join(' · '));error.liveDiagnostics={expectedId:record.id,identity:snapshot.identity,problems:snapshot.problems,currency:snapshot.currency,structure:snapshot.structure};throw error;}if(role==='bank')activeBank={id:record.id,tabId:tab.id};return snapshot;}
 async function collect(years){
  const records=new Map();
  for(const year of years){
   if(stopRequested())throw Error('History check stopped; saved checkpoints are preserved.');
   const url='https://next.waveapps.com/'+business+'/transactions?startDate='+year+'-01-01&endDate='+year+'-12-31',request={business,mode:'ALL',year,known:known.filter(r=>r.date.startsWith(year+'-')),driver:'external',compact:true},storageKey='venmo:scan-tab:'+business+':'+year;
   let tab=null,report=null;
   // Store only the owned tab pointer. Rows stay in that live Wave page; an
   // incomplete retry reparses its currently loaded DOM before resuming.
   if(!tabs.history[year]&&api.storage?.session){const stored=await api.storage.session.get(storageKey);current();const pointer=stored?.[storageKey];if(pointer?.url===url&&Number.isInteger(pointer.tabId))tabs.history[year]=pointer.tabId;}
   if(tabs.history[year])try{const existing=await api.tabs.get(tabs.history[year]);if(existing.url===url&&existing.status==='complete'&&!existing.pendingUrl){report=await script(existing.id,waveListScan,[{...request,action:'resume'}],true);if(report){tab=existing;onProgress('Continuing '+year+' from the loaded Wave list; refreshing its rows.');}}}catch(e){current();if(!/No tab with id|Invalid tab ID/i.test(e.message))throw e;tabs.history[year]=null;}
   if(!report){tab=await navigate(url,tabs.history[year]??null,true);tabs.history[year]=tab.id;report=await script(tab.id,waveListScan,[{...request,action:'start'}]);}
   if(api.storage?.session){await api.storage.session.set({[storageKey]:{tabId:tab.id,url}});current();}
   let lastCount=-1,lastProgress=0,lastAdvance=now(),lastMarker='',started=now();
   while(report.running){
    const count=report.recordCount??report.records.length,marker=JSON.stringify([count,report.scroll,report.loadMoreClicks,report.expectedTotal,report.status]);if(marker!==lastMarker){lastMarker=marker;lastAdvance=now();}
    if(stopRequested()){await script(tab.id,waveListScan,[{action:'stop',compact:true}]);throw Error('History check stopped; loaded rows and saved checkpoints are preserved.');}
    if(now()-lastAdvance>45000||now()-started>1800000){await script(tab.id,waveListScan,[{action:'stop',compact:true}]);throw Error('Wave list stopped advancing at '+count+' rows: '+report.status+'. Loaded rows are retained; retry continues this live list. No incomplete history is used for a write.');}
    if(count!==lastCount||now()-lastProgress>=10000){lastCount=count;lastProgress=now();onProgress('Checking '+year+' live history · '+count+' transactions · '+report.status);}
    await wait(750);report=await script(tab.id,waveListScan,[{action:'step',compact:true}]);
   }
   if(report.business!==business||report.year!==year||report.filter!=='ALL'||report.completeness!=='count-confirmed')throw Error('Wave did not establish complete '+year+' history. '+(report.status||''));
   for(const r of report.records){if(!/^\d+$/.test(r.id||''))throw Error('A live transaction has no exact ID. Import a fresh Wave export and retry the check.');const old=records.get(r.id);if(old&&JSON.stringify(old)!==JSON.stringify(r))throw Error('Conflicting live transaction identities.');records.set(r.id,r);}
  }
  return {business,years,filter:'ALL',completeness:'count-confirmed',capturedAt:new Date().toISOString(),records:[...records.values()]};
 }
 async function openMenu(p,snapshot){
  // The owned bank tab stays open while the separate purchase tab is read.
  // Recheck all fields without another navigation before opening its menu.
  if(activeBank?.id!==p.bank.id)throw Error('Exact bank transaction tab is unavailable.');
  const fresh=await script(activeBank.tabId,readWavePage);if(fresh.identity?.business!==business||fresh.identity.transaction!==p.bank.id||JSON.stringify(fresh.fields)!==JSON.stringify(snapshot.fields))throw Error('Bank changed during live preflight.');
  const result=await script(activeBank.tabId,editWaveTransaction,[{business,id:p.bank.id,category:fresh.fields.category,expected:fresh.fields,liveOnly:true,openTransferMenu:true}]);
  if(!result.menuOpened||result.saveAttempted){const error=Error(result.problem||'Transfer menu did not open without saving.');error.code='WAVE_TRANSFER_MENU_UNAVAILABLE';error.recordId=p.bank.id;error.menuDiagnostics=result.menuDiagnostics||[];throw error;}
  return script(activeBank.tabId,readTransferMenu);
 }
 async function directTransfer(p,snapshot,{checkOnly=false}={}){
  // Purchase reads use another tab. Reopen the exact bank record, then perform
  // category → transfer → Venmo → Save as one owned operation.
  if(activeBank?.id!==p.bank.id)throw Error('Exact bank transaction tab is unavailable.');
  const fresh=await script(activeBank.tabId,readWavePage);current();
  if(JSON.stringify(fresh.fields)!==JSON.stringify(snapshot.fields))throw Error('Bank changed during its exact-record check.');
  const account=p.walletAccount.account,direction=p.bank.direction;
  return script(activeBank.tabId,editWaveTransaction,[{business,id:p.bank.id,category:'Transfer '+(direction==='out'?'to ':'from ')+account,expected:fresh.fields,liveOnly:true,preserveReviewed:true,transferCreate:{account,direction,label:account,confirmed:true,openMenu:true,checkOnly}}]);
 }
 async function lookupDates(startDate,endDate){
  current();if(stopRequested())throw Error('Focused lookup stopped.');
  const url='https://next.waveapps.com/'+business+'/transactions?startDate='+startDate+'&endDate='+endDate;
  const tab=await navigate(url),request={business,mode:'ALL',startDate,endDate,known:known.filter(r=>r.date>=startDate&&r.date<=endDate),driver:'external',compact:true};
  onProgress('Checking only '+startDate+(endDate!==startDate?' through '+endDate:'')+' for the saved counterpart…');
  let report=await script(tab.id,waveListScan,[{...request,action:'start'}]);const started=now();
  while(report.running){if(stopRequested()||now()-started>60000){await script(tab.id,waveListScan,[{action:'stop',compact:true}]);throw Error('Focused date lookup stopped; saved transfer remains checkpointed.');}await wait(200);report=await script(tab.id,waveListScan,[{action:'step',compact:true}]);}
  assertDateScope(report,business,startDate,endDate);return report;
 }
 async function edit(p,request){if(activeBank?.id!==p.bank.id)throw Error('Exact bank transaction tab is unavailable.');return script(activeBank.tabId,editWaveTransaction,[request]);}
 async function inspect(record){const role=record.primary&&!/\bVenmo\b/i.test(record.primary.account)?'bank':'purchase';if(!tabs[role])throw Error('Owned transaction tab is unavailable.');const extra=await script(tabs[role],venmoRepairPage,[{action:'inspect',business,id:record.id}]);if(extra.problem)throw Error(extra.problem);return extra;}
 async function mutate(action,fields){
  const creating=['receipt','external-funding'].includes(action.kind);let tabId;
  if(creating){const tab=await navigate('https://next.waveapps.com/'+business+'/transactions');tabId=tab.id;}
  else{await read(action.record);tabId=tabs.purchase;}
  const allocations=action.record?.postings.filter(p=>p.account!==action.record.primary.account).map(p=>[p.account,p.debit-p.credit]).sort();
  return script(tabId,venmoRepairPage,[{business,id:action.record?.id,kind:action.kind,...fields,targetCents:action.targetCents,categoryPath:action.categoryPath,split:action.record?.postings.length>2,allocations}]);
 }
 return {read,collect,openMenu,edit,lookupDates,directTransfer,inspect,mutate,engineBuild:'0.99.31'};
}
