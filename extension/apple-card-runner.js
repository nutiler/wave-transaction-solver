import {waveListScan} from './list-scan.js';
import {readWavePage} from './live-reader.js';
import {readWaveChart} from './chart-reader.js';
import {validateCatalog} from './catalog.js';
import {appleWavePage} from './apple-card-wave.js';
import {openBackgroundTab,waitForLiveSnapshot} from './workflow.js';
import {planAppleImport,beginAppleUpload,verifyAppleUpload,appleWaveCSV} from './apple-card.js';

export function appleImportRunner({scope,chrome,state,save,publishHistory=async()=>{},progress=()=>{},current=()=>true,pause=ms=>new Promise(r=>setTimeout(r,ms))}){
 let listTab=null,recordTab=null,uploadTab=null;
 const check=()=>{if(!current())throw Error('Stopped. Saved import checkpoints are retained.');};
 const inject=async(id,func,request)=>{check();const result=(await chrome.scripting.executeScript({target:{tabId:id},func,args:[request]}))[0]?.result;if(!result)throw Error('No response returned from the working tab.');check();if(result.problem){const error=Error(result.problem);error.outcome=result;throw error;}return result;};
 async function navigate(url,id=null){check();const tab=await openBackgroundTab(chrome.tabs,url,id);for(let n=0;n<60;n++){check();const live=await chrome.tabs.get(tab.id);if(live.status==='complete'&&live.url===url&&!live.pendingUrl)return tab.id;await pause(500);}throw Error('Wave is still loading. Resume once the page is ready.');}
 async function waitUpload(){for(let n=0;n<40;n++){check();await pause(300);try{const status=await inject(uploadTab,appleWavePage,{...scope,action:'inspect'});if(status.phase!=='navigation')return status;}catch(e){if(n===39)throw e;}}throw Error('Wave upload form is not ready. Open More → Upload transactions and Resume.');}
 async function bindAccount(){
  uploadTab=await navigate(scope.accountURL,uploadTab);await inject(uploadTab,appleWavePage,{...scope,action:'open'});await waitUpload();const binding=await inject(uploadTab,appleWavePage,{...scope,action:'account'});if(!/apple.*card/i.test(binding.accountName))throw Error('The supplied account ID does not identify an Apple Card account.');scope.accountName=binding.accountName;
  const chartTab=await navigate('https://next.waveapps.com/'+scope.business+'/accounting/charts');const catalog=validateCatalog(await inject(chartTab,readWaveChart,scope.business),scope.business),accounts=catalog.groups.flatMap(g=>g.accounts.map(a=>({...a,group:g.name}))).filter(a=>a.name===scope.accountName);
  if(accounts.length!==1||accounts[0].group!=='Liabilities & Credit Cards'||!/^Credit Cards?$/i.test(accounts[0].section||''))throw Error('The target must be a uniquely named credit-card account in Chart of Accounts.');
  if(binding.currency&&binding.currency!=='USD')throw Error('The Wave account currency must be USD.');if(!binding.currency&&!state().currencyConfirmedAt)throw Error('Check the Wave Apple Card account is USD, then confirm the currency in Setup.');
  return scope;
 }
 async function history(statement){
  const years=[...new Set(statement.records.map(r=>Number(r.date.slice(0,4))))].sort(),all=[];
  for(const year of years){progress('Reading all Wave transactions for '+year+' (reviewed and unreviewed)…');listTab=await navigate('https://next.waveapps.com/'+scope.business+'/transactions?startDate='+year+'-01-01&endDate='+year+'-12-31',listTab);let report=await inject(listTab,waveListScan,{action:'start',mode:'ALL',business:scope.business,year});
   while(report.running){check();progress(year+' · '+report.records.length+' records read');await pause(700);report=await inject(listTab,waveListScan,{action:'poll',mode:'ALL',business:scope.business});}
   if(report.business!==scope.business||report.filter!=='ALL'||report.year!==year||report.completeness!=='count-confirmed'||report.expectedTotal!==report.records.length||report.records.some(r=>!/^\d+$/.test(r.id||'')||!r.date?.startsWith(year+'-')))throw Error('Complete identified Wave history was not established for '+year+'. Nothing imported.');all.push(...report.records.filter(r=>r.account===scope.accountName));
  }
  const records=[];for(const [i,row] of all.entries()){
   check();progress('Checking Apple Card record '+(i+1)+' of '+all.length);const signed=String(row.amountText||'').trim(),prior=Object.values(state().verified||{}).find(v=>v.waveId===row.id);let direction=/^\s*[-−]/.test(signed)?'out':/^\s*\+/.test(signed)?'in':null;
   if(!direction&&prior&&prior.date===row.date&&Math.abs(prior.amountCents)===row.amountCents)direction=prior.amountCents>0?'out':'in';
   if(!direction||/\.{3}|…/.test(row.description)){recordTab=await navigate('https://next.waveapps.com/'+scope.business+'/transactions/'+row.id,recordTab);const snapshot=await waitForLiveSnapshot(()=>inject(recordTab,readWavePage),current,pause);if(snapshot?.identity?.business!==scope.business||snapshot.identity.transaction!==row.id||snapshot.currency!=='USD'||snapshot.problems?.length||snapshot.fields.account!==scope.accountName||snapshot.fields.date!==row.date||Math.round(Number(snapshot.fields.amount.replace(/[$,]/g,''))*100)!==row.amountCents)throw Error('An Apple Card live record has unreadable or changed account, amount, date or currency.');direction=snapshot.fields.type==='Withdrawal'?'out':snapshot.fields.type==='Deposit'?'in':null;row.description=snapshot.fields.description;}
   records.push({...row,currency:'USD',direction});
  }
  const report={business:scope.business,accountId:scope.accountId,accountName:scope.accountName,currency:'USD',accountType:'Credit Card',records,years,expectedTotal:records.length,completeness:'count-confirmed',capturedAt:new Date().toISOString()};await publishHistory({...report,filter:'APPLE_CARD'});return report;
 }
 async function prepare(statement){await bindAccount();const read=await history(statement),plan=planAppleImport(statement,read,scope,state()),verified={...state().verified};if(!state().pending?.attempted)for(const x of plan.existing)verified[x.record.key]={waveId:x.waveId,date:x.record.date,amountCents:x.record.amountCents,verifiedAt:new Date().toISOString()};await save({...state(),business:scope.business,accountId:scope.accountId,accountName:scope.accountName,verified});return plan;}
 async function upload(statement,expected,saveFile=async()=>{}){
  if(state().pending?.attempted)throw Error('A prior import needs read-only verification before another upload.');
  const plan=await prepare(statement);if(plan.sourceHash!==expected.sourceHash||JSON.stringify(plan.missing.map(r=>r.key))!==JSON.stringify(expected.missing.map(r=>r.key)))throw Error('Wave changed since the preview. Review the refreshed missing rows before importing.');if(plan.held.length||!plan.missing.length)throw Error('No unambiguous missing rows are ready to import.');
  const csv=appleWaveCSV(plan.missing),filename='apple-card-missing-'+plan.sourceHash.slice(0,16)+'.csv';await saveFile(filename,csv);check();
  uploadTab=await navigate(scope.accountURL,uploadTab);await inject(uploadTab,appleWavePage,{...scope,action:'open'});await waitUpload();await inject(uploadTab,appleWavePage,{...scope,action:'account'});
  const staged=beginAppleUpload(state(),plan);await save({...staged,pending:{...staged.pending,phase:'file-submission'}});
  if(!current()){await save({...state(),pending:null});throw Error('Stopped before uploading the file. No import was submitted.');}
  try{await inject(uploadTab,appleWavePage,{...scope,action:'file',csv,filename});}catch(e){if(e.outcome?.stagingAttempted===false)await save({...state(),pending:null});throw e;}
  for(let n=0;n<8;n++){const step=await waitUpload();progress('Wave CSV import · '+step.phase);if(['Confirm date','Confirm amounts','Select description','Upload my statement'].includes(step.phase))await save({...state(),pending:{...state().pending,attempted:false,phase:'mapping'}});if(step.phase==='Upload my statement')break;await inject(uploadTab,appleWavePage,{...scope,action:'advance',records:plan.missing});if(n===7)throw Error('CSV mapping did not reach final confirmation. Nothing finalized.');}
  // This checkpoint is durable before the only ledger-creation action.
  await save(beginAppleUpload(state(),plan));if(!current()){await save({...state(),pending:null});throw Error('Stopped before final import. Nothing submitted.');}try{const result=await inject(uploadTab,appleWavePage,{...scope,action:'final',records:plan.missing});await save({...state(),pending:{...state().pending,outcome:result}});}catch(e){if(e.outcome?.finalAttempted===false){await save({...state(),pending:null,history:[...(state().history||[]).slice(-99),{...state().pending,phase:'not-submitted',outcome:e.outcome,verifiedAt:new Date().toISOString()}]});throw Error('Final import was not submitted: '+e.message);}await save({...state(),pending:{...state().pending,error:e.message}});throw Error('Import outcome needs verification: '+e.message+'. Recheck reads Wave only; it will not repeat the upload.');}
  await pause(2000);return recheck(statement);
 }
 async function recheck(statement){
  const pending=state().pending;if(!pending?.attempted)throw Error('There is no uncertain import to recheck.');await bindAccount();const read=await history({records:[...statement.records,...pending.records]}),result=verifyAppleUpload(state(),read,scope);if(result.verified)await save(result.state);else await save({...state(),pending:{...state().pending,checkedAt:new Date().toISOString(),matched:result.matched,missing:result.missing}});return result;
 }
 async function stop(){try{if(listTab!==null)await chrome.scripting.executeScript({target:{tabId:listTab},func:waveListScan,args:[{action:'stop',business:scope.business}]});}catch{}}
 return {prepare,upload,recheck,stop};
}
