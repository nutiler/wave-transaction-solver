import {readWavePage} from './live-reader.js';
import {editWaveTransaction} from './editor.js';
import {readTransferMenu} from './transfer-menu.js';
import {waveListScan} from './list-scan.js';
import {openBackgroundTab,reopenSavedTransaction,waitForLiveSnapshot} from './workflow.js';
const workers=new Map();

export function fundingWaveAdapter({api=globalThis.chrome,business,transactions=[],isCurrent=()=>true,onProgress=()=>{}}){
 const tabs=workers.get(business)||{list:null,bank:null,purchase:null};workers.set(business,tabs);let activeBank=null;
 const current=()=>{if(!isCurrent())throw Error('Repair context changed.');};
 const script=async(tabId,func,args=[])=>{current();const r=await api.scripting.executeScript({target:{tabId},func,args});current();if(!r[0]?.result)throw Error('No Wave response returned.');return r[0].result;};
 const navigate=async url=>{const tab=await openBackgroundTab(api.tabs,url,tabs.list);tabs.list=tab.id;for(let i=0;i<50;i++){current();const t=await api.tabs.get(tab.id);if(t.status==='complete'&&t.url===url&&!t.pendingUrl)return tab;await new Promise(resolve=>setTimeout(resolve,300));}throw Error('Wave history did not finish loading.');};
 const known=transactions.filter(t=>t.primary).map(t=>({id:t.id,date:t.date,description:t.description,account:t.primary.account,amountCents:t.amount}));
 async function read(record){current();const role=record.primary&&/Wells Fargo/i.test(record.primary.account)?'bank':'purchase';const tab=await reopenSavedTransaction(api.tabs,tabs[role],business,record.id,isCurrent);tabs[role]=tab.id;const snapshot=await waitForLiveSnapshot(()=>script(tab.id,readWavePage),isCurrent);current();if(!snapshot||snapshot.identity?.business!==business||snapshot.identity.transaction!==record.id)throw Error('Wave returned another transaction.');if(role==='bank')activeBank={id:record.id,tabId:tab.id};return snapshot;}
 async function collect(years){
  const records=new Map();
  for(const year of years){
   const tab=await navigate('https://next.waveapps.com/'+business+'/transactions?startDate='+year+'-01-01&endDate='+year+'-12-31');
   let report=await script(tab.id,waveListScan,[{action:'start',business,mode:'ALL',year,known:known.filter(r=>r.date.startsWith(year+'-'))}]);
   for(let i=0;report.running&&i<600;i++){onProgress('Checking '+year+' live history · '+report.records.length+' transactions collected…');await new Promise(resolve=>setTimeout(resolve,500));report=await script(tab.id,waveListScan,[{action:'poll'}]);}
   if(report.running){await script(tab.id,waveListScan,[{action:'stop'}]);throw Error('History scan timed out. No complete collection established.');}
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
  if(!result.menuOpened||result.saveAttempted)throw Error(result.problem||'Transfer menu did not open without saving.');
  return script(activeBank.tabId,readTransferMenu);
 }
 async function edit(p,request){if(activeBank?.id!==p.bank.id)throw Error('Exact bank transaction tab is unavailable.');return script(activeBank.tabId,editWaveTransaction,[request]);}
 return {read,collect,openMenu,edit};
}
