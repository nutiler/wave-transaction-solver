import {paypalPage} from './paypal-page.js';
import {importPayPalCSV} from './paypal-csv.js';
const $=id=>document.getElementById(id),saved=new Map();
function folder(name='paypal'){const dirs=new Map(),files=new Map();return {name,requestPermission:async()=> 'granted',getDirectoryHandle:async(name,{create=false}={})=>{if(!dirs.has(name)){if(!create)throw Object.assign(Error('missing'),{name:'NotFoundError'});dirs.set(name,folder(name));}return dirs.get(name);},getFileHandle:async(name,{create=false}={})=>{if(!files.has(name)){if(!create)throw Object.assign(Error('missing'),{name:'NotFoundError'});files.set(name,'');}return {getFile:async()=>({text:async()=>files.get(name)}),createWritable:async()=>({write:async text=>files.set(name,text),close:async()=>{},abort:async()=>{}})};}};}
Object.defineProperty(window,'indexedDB',{value:{open:()=>{const request={result:{transaction:()=>{const tx={objectStore:()=>({get:key=>{const r={};setTimeout(()=>{r.result=saved.get(key);setTimeout(()=>tx.oncomplete?.(),0);},0);return r;},put:(value,key)=>{saved.set(key,value);setTimeout(()=>tx.oncomplete?.(),0);}})};return tx;},close(){}}};setTimeout(()=>request.onsuccess?.(),0);return request;}}});
const root=folder('data');window.showDirectoryPicker=async()=>root;
const mock=document.createElement('section');mock.innerHTML='<h2>Activity report</h2><p>Synthetic PayPal controls for DOM verification only.</p><label>Transaction type<select id="mockType"><option>Balance affecting</option><option>All transactions</option></select></label><label>Format<select id="mockFormat"><option>CSV</option><option>PDF</option></select></label><label>Date range<select id="mockRange"><option>Custom</option></select></label><label>Start date<input id="mockStart" type="date"></label><label>End date<input id="mockEnd" type="date"></label><button id="mockCreate">Create Report</button><button id="mockRefresh">Refresh</button><table><thead><tr><th>Report type</th><th>Request date</th><th>Date range</th><th>Format</th><th>Action</th></tr></thead><tbody id="mockRows"></tbody></table>';document.querySelector('main').append(mock);
let creates=0,downloads=0,missingReads=2,nativeMode=false,nativeDownloads=0;const reportRows=[],createdListeners=new Set(),changedListeners=new Set(),nativeItems=new Map();
function addReport(start,end,type='All transactions',format='CSV'){const tr=document.createElement('tr'),range=start==='2025-01-01'?'Jan 1,2025-Dec 31,2025':start==='2018-01-01'?'Jan 1,2018 - Dec 31,2018':start+' - '+end;for(const value of [type,'Synthetic',range,format]){const td=document.createElement('td');td.textContent=value;tr.append(td);}const td=document.createElement('td'),button=document.createElement('button');button.textContent='Download';button.onclick=()=>{downloads++;const text='Date,Name,Type,Status,Currency,Gross,Fee,Net,Transaction ID,Reference Txn ID,Payment Source,Item Title,Note\n'+start+',Fictional Shop,Express Checkout Payment,Completed,USD,-10.00,0.00,-10.00,FAKE'+start.replaceAll('-','')+',,CreditCard,Fictional item,Sample';const url=URL.createObjectURL(new Blob([text],{type:'text/csv'})),anchor=document.createElement('a');anchor.href=url;anchor.download='Download.csv';anchor.click();URL.revokeObjectURL(url);};td.append(button);tr.append(td);$('mockRows').append(tr);reportRows.push(tr);}
addReport('2018-01-01','2018-12-31');addReport('2017-01-01','2017-12-31','All transactions','PDF');
$('mockCreate').onclick=()=>{creates++;addReport($('mockStart').value,$('mockEnd').value,$('mockType').value,$('mockFormat').value);};
const location={origin:'https://www.paypal.com',pathname:'/reports/dlog',href:'https://www.paypal.com/reports/dlog'},context={document,location,pause:async()=>{}};
window.chrome={runtime:{id:'synthetic-paypal'},permissions:{contains:async()=>true,request:async()=>true},tabs:{query:async()=>[{id:1,title:'Synthetic PayPal reports',url:location.href}],get:async()=>({id:1,url:location.href}),create:async()=>({id:1}),update:async()=>({id:1})},downloads:{onCreated:{addListener:f=>createdListeners.add(f),removeListener:f=>createdListeners.delete(f)},onChanged:{addListener:f=>changedListeners.add(f),removeListener:f=>changedListeners.delete(f)},search:async({id})=>nativeItems.has(id)?[nativeItems.get(id)]:[]},scripting:{executeScript:async({args})=>{
 if(args[0].action==='read'&&missingReads-->0)return [{frameId:0}];
 if(nativeMode&&args[0].action==='download'){
  nativeDownloads++;const report=args[0],csv='Date,Name,Type,Status,Currency,Gross,Fee,Net,Transaction ID\n'+report.start+',Fictional Shop,Express Checkout Payment,Completed,USD,-10.00,0.00,-10.00,FAKENATIVE';
  const handle=await root.getFileHandle('Download.csv',{create:true}),stream=await handle.createWritable();await stream.write(csv);await stream.close();
  const item={id:100+nativeDownloads,filename:'C:/fictional-data/Download.csv',startTime:new Date().toISOString(),state:'complete',referrer:location.href,url:'https://www.paypal.com/reports/fictional-download.csv'};nativeItems.set(item.id,item);for(const listener of createdListeners)listener(item);
  return [{frameId:0}]; // Chrome loses the script response during a native download.
 }
 return [{frameId:0,result:await paypalPage(args[0],context)}];
}}};
await import('./paypal-app.js');
$('fixtureRun').onclick=async()=>{const log=[],check=(v,name)=>{if(!v)throw Error(name);log.push('PASS '+name);};try{
 check($('run').disabled,'Missing destination keeps collection disabled');await $('folder').onclick();check(!$('run').disabled,'Saved folder and report tab enable Resume');$('year').value=String(new Date().getFullYear());const originalURL=URL.createObjectURL,originalClick=HTMLAnchorElement.prototype.click;await $('run').onclick();check($('status').textContent.includes('Annual collection finished'),'Available older CSV then annual creation complete');check(creates===1&&downloads===2,'Old CSV saved before one current-year request; PDF skipped');check(URL.createObjectURL===originalURL&&HTMLAnchorElement.prototype.click===originalClick,'Native blob hooks restored');check($('mockType').value==='All transactions'&&$('mockFormat').value==='CSV','Type and format changed and verified');check($('files').textContent.includes('2018/')&&$('files').textContent.includes(new Date().getFullYear()+'/'),'Older and new ranges displayed');const before=downloads;await $('run').onclick();check(downloads===before&&creates===1,'Resume verifies hashes and makes no duplicate downloads or requests');check(!$('run').disabled&&$('stop').disabled,'Busy state released');await $('read').onclick();check(JSON.parse($('diagnostics').textContent).reports.length===3,'Diagnostics parse exact report table rows');check(!$('diagnostics').textContent.includes('https://'),'Diagnostics contain no download links');
 let rejected=false;try{await paypalPage({action:'read'},{...context,location:{...location,pathname:'/signin'}});}catch{rejected=true;}check(rejected,'Signed-out route rejected');$('mockCreate').disabled=true;const outcome=await paypalPage({action:'create',type:'All transactions',format:'CSV',start:'2025-01-01',end:'2025-12-31'},context);check(outcome.notSubmitted&&creates===1,'Disabled Create never submits a report');$('mockCreate').disabled=false;
 const source=reportRows[0],button=source.querySelector('button'),anchor=document.createElement('a');anchor.href='https://www.paypal.com/myaccount/transfer';anchor.textContent='Download';button.replaceWith(anchor);rejected=false;try{await paypalPage({action:'download',type:'All transactions',format:'CSV',start:'2018-01-01',end:'2018-12-31'},context);}catch{rejected=true;}check(rejected,'Off-report download endpoint rejected');anchor.replaceWith(button);
 const parsed=importPayPalCSV('Date,Name,Type,Status,Currency,Gross,Fee,Net,Transaction ID\n2025-01-01,Fictional,Payment Refund,Completed,USD,10.00,0.00,10.00,FAKEREFUND');check(parsed.records[0].kind==='Refund','Refund stays separate from purchases');
 const oldRange=$('mockRange').closest('label'),oldStart=$('mockStart').closest('label'),oldEnd=$('mockEnd').closest('label');
 oldRange.hidden=oldStart.hidden=oldEnd.hidden=true;
 const box=document.createElement('div');box.innerHTML='<span>Date range</span><span id="boxedValue">Past 3 months</span>';mock.append(box);
 const panel=document.createElement('section');panel.hidden=true;panel.innerHTML='<label>From<input name="startDate" type="text"></label><label>To<input name="endDate" type="text"></label><button>Apply</button>';mock.append(panel);
 let applies=0;box.onclick=()=>{panel.hidden=false;};
 panel.querySelector('button').onclick=()=>{applies++;$('boxedValue').textContent=panel.querySelector('[name="startDate"]').value+' - '+panel.querySelector('[name="endDate"]').value;panel.hidden=true;};
 const originalCreate=$('mockCreate').onclick;$('mockCreate').onclick=()=>creates++;
 const boxed=await paypalPage({action:'create',type:'All transactions',format:'CSV',start:'2024-01-01',end:'2024-12-31'},context);
 check(boxed.submitted&&applies===1&&creates===2,'Boxed Date range opens custom panel, fills dates, applies and verifies displayed range');
 panel.querySelector('button').onclick=()=>{panel.hidden=true;$('boxedValue').textContent='Past 3 months';};
 const wrong=await paypalPage({action:'create',type:'All transactions',format:'CSV',start:'2023-01-01',end:'2023-12-31'},context);
 check(wrong.notSubmitted&&creates===2,'Preset date range cannot submit after custom dates fail to apply');
 $('mockCreate').onclick=originalCreate;box.remove();panel.remove();oldRange.hidden=oldStart.hidden=oldEnd.hidden=false;

 check(createdListeners.size===0&&changedListeners.size===0,'Text-download fallback releases native download listeners');
 // PayPal's real Date Range summary is a read-only text input. Its menu has From/To directly.
 oldRange.hidden=oldStart.hidden=oldEnd.hidden=true;
 const actual=document.createElement('section');actual.innerHTML='<div><label for="text-input-undefined">Date Range</label><input id="text-input-undefined" readonly value="Since last download"></div><div id="actualDatePanel" hidden><div><label for="text-input-undefined">From</label><input id="text-input-undefined" name="startDate"></div><div><label for="text-input-undefined">To</label><input id="text-input-undefined" name="endDate"></div></div>';mock.append(actual);
 const summary=actual.querySelector('input'),actualInputs=actual.querySelectorAll('[name]');
 summary.onclick=()=>actual.querySelector('#actualDatePanel').hidden=false;
 for(const input of actualInputs)input.onchange=()=>{if([...actualInputs].every(e=>e.value))summary.value=actualInputs[0].value+' - '+actualInputs[1].value;};
 $('mockCreate').onclick=()=>creates++;
 const dateResult=await paypalPage({action:'create',type:'All transactions',format:'CSV',start:'2022-01-01',end:'2022-12-31'},context);
 check(dateResult.submitted&&actualInputs[0].value==='01/01/2022'&&actualInputs[1].value==='12/31/2022','Read-only Date Range input opens From/To despite duplicate provider input IDs');
 actual.remove();oldRange.hidden=oldStart.hidden=oldEnd.hidden=false;$('mockCreate').onclick=originalCreate;
 addReport('2025-01-01','2025-12-31');addReport('2025-01-01','2025-12-31');
 const duplicateReports=(await paypalPage({action:'read'},context)).reports.filter(r=>r.start==='2025-01-01');
 check(duplicateReports.length===2&&duplicateReports[0].rowToken!==duplicateReports[1].rowToken,'Duplicate report rows receive distinct ephemeral identities');
 const selected=await paypalPage({action:'download',...duplicateReports[1]},context);
 check(selected.text.includes('2025-01-01'),'Exact selected duplicate CSV downloads without an ambiguous-row failure');
 const bridged=await paypalPage({action:'read',bridge:true},{...context,location:{...location,pathname:'/signin'}});
 check(bridged.helperError?.message.includes('signed-in'),'Provider errors are returned across the injection boundary');

 nativeMode=true;const countBefore=creates;await $('run').onclick();
 check($('status').textContent.includes('Annual collection finished')&&nativeDownloads===1&&creates===countBefore,'Native PayPal CSV is collected when Chrome loses the script response; duplicate reports do not block the run');
 check(createdListeners.size===0&&changedListeners.size===0&&!saved.get('paypal:downloader').download,'Verified native CSV clears its download checkpoint and releases listeners');
 nativeMode=false;
$('fixtureResult').textContent=log.join('\n');
 }catch(e){$('fixtureResult').textContent=log.join('\n')+'\nFAIL '+e.message;}};

const helperPreview=document.createElement('button');helperPreview.textContent='Show helper preview';document.querySelector('main').prepend(helperPreview);
helperPreview.onclick=()=>{mock.hidden=true;$('fixtureRun').hidden=$('fixtureResult').hidden=helperPreview.hidden=true;};
