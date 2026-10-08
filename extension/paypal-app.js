import {watchHelperStatus} from './helper-status.js';
import {helperTabs} from './helper-tabs.js';
import {paypalCSVDownload,paypalDownloadRecovery} from './paypal-download.js';
import {observeNativeDownload} from './download-files.js';
import {helperCall} from './helper-bridge.js';
import {paypalOrigins,paypalReportURL,paypalReportKey} from './paypal.js';
import {freshPayPalBatch,runFreshPayPalCollection,archiveCollectedPayPalReport,verifyCollectedPayPalReport,importCollectedPayPalReport} from './paypal-collection.js';
import {paypalPage} from './paypal-page.js';
import {loadLocalFeature,saveLocalFeature,projectDataFolder,rememberDataFolder} from './session.js';
import {activity,paintActivity} from './activity.js';
const $=id=>document.getElementById(id),real=typeof chrome!=='undefined'&&!!chrome.runtime?.id;
let state={version:2,folder:null,dateOrder:'mdy',batch:null,downloads:{}},connected=false,busy=false,generation=0,diagnostics=null;
const working=real?helperTabs(chrome.tabs):null;let workingTab=null;
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const save=()=>saveLocalFeature('paypal:downloader',state);
function paint(){
 for(const id of ['connect','open','folder','tabs','refreshTabs','dateOrder'])$(id).disabled=busy;
 for(const id of ['read','readDownload'])$(id).disabled=!real||!connected;
 $('copy').disabled=!diagnostics;$('stop').disabled=!busy;
 $('run').disabled=busy||!real||!connected||!state.folder;$('resume').disabled=$('run').disabled||!state.batch;
 $('setup').textContent=!real?'Open this helper from the installed extension.':!connected?'Connect PayPal, then choose your project data folder.':!state.folder?'Choose your project data folder.':'Ready · Files go to data/paypal';
 const reports=state.batch?.reports||[],saved=reports.filter(r=>r.downloadState==='saved').length,imported=reports.filter(r=>r.importState==='saved').length;
 $('coverage').textContent=reports.length?saved+' / '+reports.length+' original CSVs saved · '+imported+' / '+reports.length+' imported':'Start fresh collects every available year, including 2025.';
 $('limits').textContent=state.batch?'This batch: '+state.batch.earliest+' through '+state.batch.through:'The fresh run uses the earliest date in PayPal’s seven-year window and its latest available data date.';
 $('files').replaceChildren();
 for(const entry of reports){
  const row=document.createElement('tr'),values=[entry.start.slice(0,4),entry.start+' to '+entry.end,
   ({planned:'Not requested',requesting:'Creating',uncertain:'Checking submission',submitted:'Created',rejected:'Needs attention'})[entry.requestState],
   ({pending:'Waiting',downloading:'Downloading',saved:'Saved',failed:'Retry needed'})[entry.downloadState],
   ({pending:'After download',saved:(entry.count??0)+' events',failed:'Needs repair'})[entry.importState]];
  for(const [index,value] of values.entries()){const cell=document.createElement('td');cell.textContent=value;if(index===1&&entry.boundaryNote){const note=document.createElement('small');note.textContent='Earliest date verified in PayPal';note.style.display='block';cell.append(note);}if(index>=2){cell.className='helper-state-cell';cell.dataset.state=index===2?entry.requestState==='submitted'?'complete':entry.requestState==='rejected'?'error':entry.requestState==='uncertain'?'paused':'running':index===3?entry.downloadState==='saved'?'complete':entry.downloadState==='failed'?'error':'waiting':entry.importState==='saved'?'complete':entry.importState==='failed'?'error':'ready';}row.append(cell);}if(entry.message||entry.boundaryNote)row.title=entry.message||entry.boundaryNote;$('files').append(row);
 }
 $('progress').max=reports.length||1;$('progress').value=saved;
}
async function refreshTabs(){
 if(!real)return;connected=await chrome.permissions.contains({permissions:['downloads'],origins:paypalOrigins});const selected=$('tabs').value;$('tabs').replaceChildren();if(!connected)return;
 for(const tab of await chrome.tabs.query({url:paypalOrigins})){try{const u=new URL(tab.url);if(u.origin!=='https://www.paypal.com'||!/^\/reports\/dlog\/?$/.test(u.pathname))continue;const o=document.createElement('option');o.value=tab.id;o.textContent=tab.title||'PayPal reports';$('tabs').append(o);}catch{}}
 if([...$('tabs').options].some(o=>o.value===selected))$('tabs').value=selected;
}
async function page(action,request={}){
 const tabId=workingTab||Number($('tabs').value);if(!tabId)throw Error('Open PayPal reports and refresh the tab list.');
 const tab=await chrome.tabs.get(tabId),url=new URL(tab.url);if(url.origin!=='https://www.paypal.com'||!/^\/reports\/dlog\/?$/.test(url.pathname))throw Error('Sign in to PayPal and reopen its report page.');
 const token=generation;return helperCall({current:()=>generation===token,request:{dateOrder:state.dateOrder,...request,action},onWait:message=>{$('status').textContent=message;},execute:args=>chrome.scripting.executeScript({target:{tabId},world:['prepare','create','download'].includes(action)?'MAIN':'ISOLATED',func:paypalPage,args:[args]})});
}
const guarded=fn=>async()=>{if(busy)return;busy=true;paint();try{await fn();}catch(e){$('status').textContent=e.message;}finally{busy=false;paint();}};
$('connect').onclick=guarded(async()=>{if(!real)throw Error('Use the installed extension.');if(!await chrome.permissions.request({permissions:['downloads'],origins:paypalOrigins}))throw Error('PayPal access was not granted.');await refreshTabs();$('status').textContent='PayPal connected.';});
$('open').onclick=guarded(async()=>{workingTab=await working.open('paypal',paypalReportURL,true);await refreshTabs();$('tabs').value=String(workingTab);$('status').textContent='Sign in if needed, then Start fresh.';});
$('refreshTabs').onclick=guarded(refreshTabs);
$('folder').onclick=guarded(async()=>{const root=await showDirectoryPicker({id:'wave-data-downloads',mode:'readwrite',startIn:'desktop'});await rememberDataFolder(root);state.folder=await root.getDirectoryHandle('paypal',{create:true});await save();$('setupPanel').open=!connected;$('status').textContent='Destination saved. Start fresh is ready.';});
$('dateOrder').onchange=()=>{state.dateOrder=$('dateOrder').value;save();};
const inspect=fn=>async()=>{try{await fn();}catch(e){$('diagnostics').textContent=e.message;}finally{paint();}};
$('read').onclick=inspect(async()=>{diagnostics=await page('read');$('diagnostics').textContent=JSON.stringify(diagnostics,null,2);});
$('readDownload').onclick=inspect(async()=>{const reports=[];for(const pending of Object.values(state.downloads||{})){const item=pending.downloadId===undefined?null:(await chrome.downloads.search({id:pending.downloadId}))[0];reports.push({start:pending.start,end:pending.end,downloadId:pending.downloadId??null,state:item?.state||'not found',csvRecognized:item?paypalCSVDownload(item):false,exists:item?.exists??null});}diagnostics={format:'wave-solver-paypal-download-status',version:2,reports};$('diagnostics').textContent=JSON.stringify(diagnostics,null,2);});
$('copy').onclick=inspect(async()=>{if(!diagnostics)throw Error('Read report controls first.');await navigator.clipboard.writeText(JSON.stringify(diagnostics,null,2));});
async function downloadCSV(report,current,onProgress){
 // A fresh batch downloads the new report. Prior raw responses are never a substitute.
 const root=await projectDataFolder();if(!root)throw Error('Choose the project data folder.');
 for(let attempt=0;attempt<2;attempt++){
  const key=paypalReportKey(report),pending=state.downloads?.[key]?.batchId===state.batch.id?state.downloads[key]:null;
  const recovery=await paypalDownloadRecovery(chrome.downloads,pending);if(recovery.stale){delete state.downloads[key];await save();}
  const result=await observeNativeDownload({downloads:chrome.downloads,inbox:root,current,timeoutMs:120000,startTimeoutMs:15000,accept:paypalCSVDownload,resumeId:recovery.resumeId??null,
   checkpoint:async value=>{state.downloads[key]={batchId:state.batch.id,type:report.type,start:report.start,end:report.end,format:report.format,...value};await save();},onProgress,
   trigger:recovery.retry?async()=>{
    const info=await page('read'),newest=info.reports.find(r=>paypalReportKey(r)===paypalReportKey(report));
    if(!newest?.ready)throw Error('The newest report for this year is not ready yet. Resume keeps its submission.');
    try{const response=await page('download',newest);if(response.text!==undefined)return {file:new File([response.text],'paypal-report.csv')};}
    catch(error){if(!error.downloadStarted&&!error.retryable)throw error;}
   }:null});
  if(!result.waiting)return result.file.text();
  if(result.notStarted&&attempt===0)continue;
  throw Error(result.notStarted?'This year’s CSV download did not start. Resume retries its download.':'This year’s CSV is still downloading. Resume continues the recorded download.');
 }
 throw Error('No CSV was produced for this year.');
}
async function persistBatch(batch){
 state.batch=batch;await save();
 const batches=await state.folder.getDirectoryHandle('batches',{create:true}),dir=await batches.getDirectoryHandle(batch.id,{create:true}),file=await dir.getFileHandle('collection.local.json',{create:true}),stream=await file.createWritable();
 try{await stream.write(JSON.stringify({format:'wave-solver-paypal-collection',...batch},null,2));await stream.close();}catch(e){await stream.abort?.();throw e;}paint();
}
async function run(fresh){
 if(busy)return;const runId=++generation,current=()=>generation===runId;busy=true;$('status').textContent='Preparing PayPal collection…';paint();const task=activity.begin('Collecting every PayPal year');
 try{
  if(!real||!connected||!state.folder)throw Error('Finish Connect and destination setup first.');
  workingTab=await working.open('paypal',paypalReportURL);await refreshTabs();$('tabs').value=String(workingTab);
  const root=await projectDataFolder();if(root){if(await root.requestPermission({mode:'readwrite'})!=='granted')throw Error('Allow access to the project data folder.');state.folder=await root.getDirectoryHandle('paypal',{create:true});}
  if(await state.folder.requestPermission({mode:'readwrite'})!=='granted')throw Error('Allow access to data/paypal.');
  state.dateOrder=$('dateOrder').value;
  if(fresh){const provider=await page('read');state.batch=freshPayPalBatch(today(),provider.availableThrough||today());delete state.download;state.downloads={};await persistBatch(state.batch);}
  if(!state.batch)throw Error('Start fresh first.');await paintActivity();
  const result=await runFreshPayPalCollection({batch:state.batch,current,read:()=>page('read'),prepare:r=>page('prepare',r),request:r=>page('create',r),refresh:()=>page('refresh'),
   download:r=>downloadCSV(r,current,m=>{$('status').textContent=r.start.slice(0,4)+': '+m;}),
   archive:async(r,text)=>{const saved=await archiveCollectedPayPalReport(state.folder,r,text);if(state.downloads?.[paypalReportKey(r)]){delete state.downloads[paypalReportKey(r)];await save();}return saved;},
   verify:r=>verifyCollectedPayPalReport(state.folder,r),importReport:r=>importCollectedPayPalReport(state.folder,r,state.dateOrder),persist:persistBatch,
   progress:(batch,counts)=>{paint();$('status').textContent=counts.waiting?'Waiting for '+counts.waiting+' new reports; refreshing automatically ('+Math.floor(counts.elapsed/1000)+'s / 600s).':counts.downloaded+'/'+counts.total+' originals saved · '+counts.imported+' imported. Check each year below.';task.update({detail:$('status').textContent,completed:counts.downloaded,total:counts.total});}});
  diagnostics={format:'wave-solver-paypal-batch-status',version:1,batchId:state.batch.id,...result,reports:state.batch.reports};$('diagnostics').textContent=JSON.stringify(diagnostics,null,2);
  $('status').textContent=result.stopped?'Stopped. Resume continues this batch.':result.paused?'Paused: '+result.message+' Sign in, then Resume this batch.':result.complete?result.downloaded+'/'+result.total+' yearly CSVs downloaded and verified. '+result.imported+' imported'+(result.imported<result.total?'; import details are in Advanced.':'. Refresh data folder in the Command center.'):'This batch has '+result.downloaded+'/'+result.total+' originals saved. Resume checks the remaining years; existing submissions stay protected.';
  if(result.complete){await working.finish();workingTab=null;await refreshTabs();}
 }catch(e){$('status').textContent='Stopped: '+e.message;}finally{busy=false;task.finish();paint();}
}
$('run').onclick=()=>run(true);$('resume').onclick=()=>run(false);
$('stop').onclick=()=>{generation++;$('status').textContent='Stopping. Saved originals and request checkpoints remain available.';};
try{
 const saved=await loadLocalFeature('paypal:downloader');
 if(saved?.version===2)state=saved;
 else if(saved?.version===1){state={...state,folder:saved.folder,dateOrder:saved.dateOrder||'mdy',legacyEntries:saved.entries||{}};}
 const root=await projectDataFolder();if(root)state.folder=await root.getDirectoryHandle('paypal',{create:true});
}catch(e){$('status').textContent='Setup could not be restored: '+e.message;}
state.downloads||={};$('dateOrder').value=state.dateOrder;await refreshTabs();$('setupPanel').open=!connected||!state.folder;paint();

watchHelperStatus(document,{busy:()=>busy});
