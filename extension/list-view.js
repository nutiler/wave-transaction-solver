import {waveListScan} from './list-scan.js';
import {openBackgroundTab} from './workflow.js';
export function scopedListIds(report){return new Set((report?.records || []).filter(r=>typeof r.id==='string' && /^\d+$/.test(r.id) && r.reviewed!=='Reviewed' && ['Wave transaction ID','Unique full-field export match'].includes(r.identity)).map(r=>r.id));}
export function installLiveList({getState,onRunning,onScope,refreshExpenses}){
 const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const section=make('section'),fold=make('details');fold.className='step';fold.id='liveList';const summary=make('summary','Live Not Reviewed list');summary.setAttribute('role','heading');summary.setAttribute('aria-level','2');fold.append(summary);const body=make('div');body.className='step-body';
 const start=make('button','Collect Not Reviewed transactions'),stop=make('button','Stop collecting'),download=make('button','Download collected list'),copy=make('button','Copy list diagnostics');stop.className=download.className=copy.className='secondary';
 const view=make('select');view.setAttribute('aria-label','Collected transaction categories');for(const [value,text] of [['all','All Not Reviewed list rows'],['uncategorized','Uncategorized expenses and income']]){const o=make('option',text);o.value=value;view.append(o);}
 const scope=make('input');scope.type='checkbox';const scopeLabel=make('label',' Limit known-expense batches to identified rows from this collection');scopeLabel.prepend(scope);
 const expenses=make('button','Open known-expense runner');expenses.className='secondary';expenses.onclick=()=>{refreshExpenses();const panel=document.getElementById('expenseBatch');panel.open=true;panel.scrollIntoView({block:'start',behavior:'smooth'});const heading=panel.querySelector('summary');heading.tabIndex=-1;heading.focus({preventScroll:true});};
 const bar=make('div');bar.className='bar';bar.append(start,stop,download,copy);const status=make('p');status.setAttribute('role','status');const results=make('div');
 body.append(make('p','Opens the selected business with the Not Reviewed filter and scrolls through its transaction list, pressing Load More Transactions until it disappears. Select All briefly checks the total, then the selection is cleared. Categories and explicit visible statuses are recorded. The list filter is recorded separately; unreadable statuses remain Unknown. No transactions are edited.'),bar,status,view,scopeLabel,expenses,results);fold.append(body);section.append(fold);document.getElementById('expenseBatch').parentElement.before(section);
 let reports={},scopes={},busy=false,tabId=null,limit=100,currentBusiness=null;
 const selectedReport=()=>reports[getState().business];
 const applyScope=()=>{const business=getState().business;scope.checked=!!scopes[business];onScope(scope.checked && reports[business]?scopedListIds(reports[business]):null);};
 function render(){const s=getState(),r=selectedReport();if(currentBusiness!==s.business){currentBusiness=s.business;limit=100;}applyScope();start.disabled=busy || s.busy || !s.extensionMode || s.sample || !s.business;stop.disabled=!busy;download.disabled=copy.disabled=!r;scope.disabled=busy || !r || !scopedListIds(r).size;
  results.replaceChildren();if(!r){status.textContent='No live list collected for this business.';return;}
  const list=(r.records || []).filter(row=>view.value!=='uncategorized' || row.uncategorized),identified=r.records.filter(row=>row.id).length;
  status.textContent=r.status+' · '+r.records.length+' rows, '+identified+' identified; '+r.records.filter(row=>row.uncategorized).length+' uncategorized; '+r.records.filter(row=>row.reviewed==='Unknown').length+' unknown review statuses. Captured '+r.capturedAt+'.';
  const table=make('table'),head=make('tr');for(const text of ['Date / ID','Description / Account','Category','Amount','Review status'])head.append(make('th',text));const thead=make('thead');thead.append(head);table.append(thead);const tbody=make('tbody');for(const row of list.slice(0,limit)){const tr=make('tr');tr.append(make('td',(row.date || 'Unknown')+' · '+(row.id || 'ID unresolved')),make('td',row.description+' · '+row.account),make('td',row.category || 'Unknown'),make('td',row.amountText),make('td',row.reviewed+(row.reviewEvidence?' · '+row.reviewEvidence:'')));tbody.append(tr);}table.append(tbody);results.append(make('p','Showing '+Math.min(limit,list.length)+' of '+list.length+' rows. Filter source: NOT_VERIFIED. Completion evidence: '+r.completeness+'.'),table);
  if(list.length>limit){const more=make('button','Show more collected transactions');more.onclick=()=>{limit+=100;render();};results.append(more);}
  if(r.problems?.length){const d=make('details');d.append(make('summary','Collection diagnostics'),make('pre',JSON.stringify({status:r.status,filterChipObserved:r.filterChipObserved,expectedTotal:r.expectedTotal,problems:r.problems,rowDiagnostics:r.rowDiagnostics,tableDiagnostics:r.tableDiagnostics,countDiagnostics:r.countDiagnostics,totalEvidence:r.totalEvidence,loadMoreClicks:r.loadMoreClicks},null,2)));results.append(d);}
 }
 const persist=async()=>{if(getState().extensionMode)await chrome.storage.local.set({solverLiveLists:reports,solverLiveListScopes:scopes});};
 scope.onchange=async()=>{scopes[getState().business]=scope.checked;applyScope();await persist();refreshExpenses();};view.onchange=()=>{limit=100;render();};
 copy.onclick=async()=>{const r=selectedReport();try{await navigator.clipboard.writeText(JSON.stringify({...r,records:undefined},null,2));copy.textContent='Copied';}catch{status.textContent='Clipboard unavailable. Download the collected list to retain diagnostics.';}};
 download.onclick=()=>{const blob=new Blob([JSON.stringify(selectedReport(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=make('a');a.href=url;a.download='wave-live-not-reviewed.local.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 stop.onclick=async()=>{stop.disabled=true;if(tabId!==null)await chrome.scripting.executeScript({target:{tabId},func:waveListScan,args:[{action:'stop'}]});};
 start.onclick=async()=>{const s=getState(),business=s.business;if(busy || s.busy || !business)return;busy=true;onRunning(true);render();let report=null;
  try{
   const tab=await openBackgroundTab(chrome.tabs,'https://next.waveapps.com/'+business+'/transactions?status=NOT_VERIFIED',tabId);tabId=tab.id;
   for(let i=0;i<30;i++){const current=await chrome.tabs.get(tabId);if(current.status==='complete' && current.url==='https://next.waveapps.com/'+business+'/transactions?status=NOT_VERIFIED' && !current.pendingUrl)break;await new Promise(resolve=>setTimeout(resolve,500));}
   if(getState().business!==business)throw Error('Business changed. Collection cancelled.');
   const known=(s.dataset?.transactions || []).filter(t=>t.primary).map(t=>({id:t.id,date:t.date,description:t.description,account:t.primary.account,amountCents:t.amount}));
   report=(await chrome.scripting.executeScript({target:{tabId},func:waveListScan,args:[{action:'start',business,known}]}))[0]?.result;if(!report)throw Error('No list collection response.');
   while(report.running){reports[business]=report;render();await new Promise(resolve=>setTimeout(resolve,1400));if(getState().business!==business)await chrome.scripting.executeScript({target:{tabId},func:waveListScan,args:[{action:'stop'}]});report=(await chrome.scripting.executeScript({target:{tabId},func:waveListScan,args:[{action:'poll'}]}))[0]?.result;if(!report)throw Error('The collection tab was closed or reloaded. Partial results retained.');}
   reports[business]=report;await persist();
  }catch(e){if(report){report={...report,running:false,status:'Collection interrupted: '+e.message,completeness:'unconfirmed'};reports[business]=report;await persist();}else status.textContent=e.message;}
  finally{busy=false;onRunning(false);if(report)render();else{start.disabled=false;stop.disabled=true;}refreshExpenses();}
 };
 const ready=(async()=>{if(getState().extensionMode){const stored=await chrome.storage.local.get(['solverLiveLists','solverLiveListScopes']);reports=stored.solverLiveLists || {};scopes=stored.solverLiveListScopes || {};}render();})();
 return {render,ready};
}
