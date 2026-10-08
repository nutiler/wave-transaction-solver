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
let tabSerial=1;const closedTabs=[],mockTabs=new Map([[1,{id:1,title:'Synthetic PayPal reports',url:location.href}]]);
window.chrome={runtime:{id:'synthetic-paypal'},permissions:{contains:async()=>true,request:async()=>true},tabs:{query:async()=>[...mockTabs.values()],get:async id=>mockTabs.get(id),create:async options=>{const tab={id:++tabSerial,title:'Temporary synthetic PayPal',...options};mockTabs.set(tab.id,tab);return tab;},update:async(id,options)=>Object.assign(mockTabs.get(id),options),remove:async id=>{closedTabs.push(id);mockTabs.delete(id);}},downloads:{onCreated:{addListener:f=>createdListeners.add(f),removeListener:f=>createdListeners.delete(f)},onChanged:{addListener:f=>changedListeners.add(f),removeListener:f=>changedListeners.delete(f)},search:async({id})=>nativeItems.has(id)?[nativeItems.get(id)]:[]},scripting:{executeScript:async({args})=>{
 if(args[0].action==='read'&&missingReads-->0)return [{frameId:0}];
 if(nativeMode&&args[0].action==='download'){
  nativeDownloads++;const report=args[0],csv='Date,Name,Type,Status,Currency,Gross,Fee,Net,Transaction ID\n'+report.start+',Fictional Shop,Express Checkout Payment,Completed,USD,-10.00,0.00,-10.00,FAKENATIVE';
  const handle=await root.getFileHandle('Download.csv',{create:true}),stream=await handle.createWritable();await stream.write(csv);await stream.close();
  const item={id:100+nativeDownloads,filename:'C:/fictional-data/Download.csv',startTime:new Date().toISOString(),state:'complete',referrer:location.href,url:'https://www.paypal.com/activity/statement/fictional-download.csv'};nativeItems.set(item.id,item);for(const listener of createdListeners)listener(item);
  return [{frameId:0}]; // Chrome loses the script response during a native download.
 }
 return [{frameId:0,result:await paypalPage(args[0],context)}];
}}};
await import('./paypal-app.js');
$('fixtureRun').onclick=async()=>{const log=[],check=(v,name)=>{if(!v)throw Error(name);log.push('PASS '+name);};try{
 check($('run').disabled,'Missing destination keeps collection disabled');await $('folder').onclick();check(!$('run').disabled,'Saved folder and report tab enable Resume');$('year').value=String(new Date().getFullYear());const originalURL=URL.createObjectURL,originalClick=HTMLAnchorElement.prototype.click;const initialRun=$('run').onclick();check(!$('read').disabled&&!$('readDownload').disabled,'Diagnostics remain available during an active collection');await initialRun;check($('status').textContent.includes('Annual collection finished'),'Annual creation and collection complete before optional older CSVs');check(creates===1&&downloads===2,'Current-year request created and CSVs saved; PDF skipped');check(URL.createObjectURL===originalURL&&HTMLAnchorElement.prototype.click===originalClick,'Native blob hooks restored');check($('mockType').value==='All transactions'&&$('mockFormat').value==='CSV','Type and format changed and verified');check($('files').textContent.includes('2018/')&&$('files').textContent.includes(new Date().getFullYear()+'/'),'Older and new ranges displayed');const before=downloads;await $('run').onclick();check(downloads===before&&creates===1,'Resume verifies hashes and makes no duplicate downloads or requests');check(!$('run').disabled&&$('stop').disabled,'Busy state released');await $('read').onclick();check(JSON.parse($('diagnostics').textContent).reports.length===3,'Diagnostics parse exact report table rows');check(!$('diagnostics').textContent.includes('https://'),'Diagnostics contain no download links');
 const availability=document.createElement('p');availability.textContent='Data is updated as of October 7, 2026 at 11:29:59 PM PDT';mock.append(availability);
 const available=(await paypalPage({action:'read'},context)).availableThrough;
 check(available==='2026-10-07','Provider displayed available-data date is read independently of request date');
 availability.textContent='Data is updated as of Not a real date';check((await paypalPage({action:'read'},context)).availableThrough===null,'Unrecognized available-data labels do not invent a cutoff');availability.remove();
 let rejected=false;try{await paypalPage({action:'read'},{...context,location:{...location,pathname:'/signin'}});}catch{rejected=true;}check(rejected,'Signed-out route rejected');$('mockCreate').disabled=true;const outcome=await paypalPage({action:'create',type:'All transactions',format:'CSV',start:'2025-01-01',end:'2025-12-31'},context);check(outcome.notSubmitted&&creates===1,'Disabled Create never submits a report');$('mockCreate').disabled=false;
 // Provider action handlers may live on the inner PUI label, not its BUTTON.
 const originalCreateAction=$('mockCreate').onclick;$('mockCreate').onclick=null;
 $('mockCreate').setAttribute('data-testid','ActivityCreateReport');
 $('mockCreate').innerHTML='<div id="button_:fixture">Create Report</div>';
 $('mockCreate').firstElementChild.onclick=originalCreateAction;
 const nestedBefore=creates;
 const nestedPrepared=await paypalPage({action:'prepare',type:'All transactions',format:'CSV',start:'2022-01-01',end:'2022-12-31'},context);
 check(nestedPrepared.prepared&&creates===nestedBefore,'Preparation never clicks the nested Create Report label');
 const nestedCreated=await paypalPage({action:'create',type:'All transactions',format:'CSV',start:'2022-01-01',end:'2022-12-31'},context);
 check(nestedCreated.clicked&&nestedCreated.submitted&&creates===nestedBefore+1,'Nested PUI Create Report receives one click and its exact report row confirms submission');
 const nestedReport=(await paypalPage({action:'read'},context)).reports.find(r=>r.start==='2022-01-01');
 const nestedControl=reportRows.at(-1).querySelector('button'),downloadHandler=nestedControl.onclick;nestedControl.onclick=null;nestedControl.innerHTML='<div>Download</div>';nestedControl.firstElementChild.onclick=downloadHandler;
 const nestedDownloads=downloads,nestedCSV=await paypalPage({action:'download',...nestedReport},context);
 check(nestedCSV.text.includes('FAKE20220101')&&downloads===nestedDownloads+1,'Nested Download handler produces a captured CSV instead of waiting for a nonexistent browser download');
 reportRows.pop().remove();$('mockCreate').replaceChildren(document.createTextNode('Create Report'));$('mockCreate').onclick=originalCreateAction;creates=nestedBefore;
 // Observed provider BUTTONs have an empty value property and anchor-based menus.
 const nativeType=$('mockType').closest('label'),nativeFormat=$('mockFormat').closest('label');nativeType.hidden=nativeFormat.hidden=true;
 const dropdowns=document.createElement('section');dropdowns.innerHTML='<div><label for="dropdownMenuButton_Transactiontype">Transaction type</label><button type="button" id="dropdownMenuButton_Transactiontype">Balance affecting</button><ul hidden aria-labelledby="dropdownMenuButton_Transactiontype"><li><a><span>Balance affecting</span></a></li><li><a><span>All transactions</span></a></li></ul></div><div><label for="dropdownMenuButton_Format">Format</label><button type="button" id="dropdownMenuButton_Format">PDF</button><ul hidden aria-labelledby="dropdownMenuButton_Format"><li><a><span>PDF</span></a></li><li><a><span>CSV</span></a></li></ul></div>';mock.append(dropdowns);
 let menuOpens=0;for(const box of dropdowns.children){const trigger=box.querySelector('button'),menu=box.querySelector('ul');trigger.onmousedown=()=>{menuOpens++;menu.hidden=!menu.hidden;};for(const item of menu.querySelectorAll('span'))item.onmousedown=()=>{trigger.textContent=item.textContent;menu.hidden=true;};}
 const beforeDropdowns=await paypalPage({action:'read'},context);
 check(beforeDropdowns.fields.find(f=>f.name==='Transaction type').value==='Balance affecting'&&beforeDropdowns.fields.find(f=>f.name==='Format').value==='PDF','Empty-valued provider BUTTONs read their visible selected labels');
 const dropdownResult=await paypalPage({action:'prepare',type:'All transactions',format:'CSV',start:'2019-01-01',end:'2019-12-31'},context);
 check(dropdownResult.prepared&&menuOpens===2&&$('mockStart').value==='2019-01-01'&&$('mockEnd').value==='2019-12-31','Anchor menus select All transactions and CSV, then prepare the full 2019 calendar year');
 const afterDropdowns=await paypalPage({action:'read'},context);
 check(afterDropdowns.fields.find(f=>f.name==='Transaction type').value==='All transactions'&&afterDropdowns.fields.find(f=>f.name==='Format').value==='CSV','Provider button selection is verified through visible text');
 const repeatedDropdown=await paypalPage({action:'prepare',type:'All transactions',format:'CSV',start:'2019-01-01',end:'2019-12-31'},context);
 check(repeatedDropdown.prepared&&menuOpens===2,'Already-selected button dropdowns stay closed on repeat preparation');
 const formatTrigger=dropdowns.children[1].querySelector('button'),disabledOption=dropdowns.children[1].querySelectorAll('li')[1];formatTrigger.textContent='PDF';disabledOption.className='disabled';
 const disabledMenu=await paypalPage({action:'prepare',type:'All transactions',format:'CSV',start:'2019-01-01',end:'2019-12-31'},context);
 check(disabledMenu.notSubmitted&&creates===1,'Disabled anchor menu options never submit a report');
 dropdowns.remove();nativeType.hidden=nativeFormat.hidden=false;
 const crossYear=await paypalPage({action:'create',bridge:true,type:'All transactions',format:'CSV',start:'2019-01-01',end:'2020-01-01'},context);
 check(crossYear.notSubmitted&&creates===1,'January-to-January creation is rejected even though its duration is one year');
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
 check(boxed.clicked&&!boxed.submitted&&applies===1&&creates===2,'Date preparation clicks Create but does not claim submission without a report row');
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
 check(dateResult.clicked&&actualInputs[0].value==='1/1/2022'&&actualInputs[1].value==='12/31/2022','Read-only Date Range input opens From/To despite duplicate provider input IDs');
 actual.remove();
 // Match the observed PayPal calendar: dated TDs and non-focusable anchors, no semantic heading.
 const datedHost=document.createElement('section');datedHost.innerHTML='<label>Date range<input readonly value="Since last download"></label><div class="DateInputBox"><label for="start">From</label><input id="start"></div><div class="DateInputBox"><label for="end">To</label><input id="end"></div><div class="calendarWrapper"><div class="Calendar"></div></div>';mock.append(datedHost);
 const datedSummary=datedHost.querySelector('input'),datedInputs=datedHost.querySelectorAll('input:not([readonly])');let datedLocks=0,datedDismissals=0,datedOpen=false;const dismissDated=e=>{if(datedOpen&&!datedHost.contains(e.target)){datedOpen=false;datedDismissals++;}};document.addEventListener('click',dismissDated,true);
 for(const input of datedInputs){input.onclick=()=>{datedHost.querySelector('.Calendar').replaceChildren();};input.oninput=()=>{datedOpen=true;const table=document.createElement('table'),row=document.createElement('tr'),cell=document.createElement('td'),anchor=document.createElement('a');cell.id=input.value;anchor.textContent=input.value.split('/')[1];cell.append(anchor);row.append(cell);table.append(row);datedHost.querySelector('.Calendar').replaceChildren(table);cell.onclick=()=>{datedLocks++;input.dataset.committed=input.value;datedSummary.value=[...datedInputs].map(e=>e.dataset.committed||'10/7/2026').join('-');datedHost.querySelector('.Calendar').replaceChildren();};};input.onblur=()=>{input.value=input.dataset.committed||'10/7/2026';};}
 const datedResult=await paypalPage({action:'prepare',type:'All transactions',format:'CSV',start:'2025-01-01',end:'2025-12-31'},context);
 check(datedResult.prepared&&datedLocks===2&&datedDismissals===1&&!datedOpen&&datedSummary.value==='1/1/2025-12/31/2025','Observed dated TDs lock Jan 1 and Dec 31, then an outside click dismisses the date popup');document.removeEventListener('click',dismissDated,true);datedHost.remove();
 // Real GlyphIcon arrow spans, dated calendar tables and pointer-only popup handlers.
 const pointerHost=document.createElement('section');pointerHost.innerHTML='<label>Date range<input id="pointerSummary" value="12/10/2025-12/10/2025"></label><div id="pointerPanel" hidden><div class="DateInputBox"><label for="start">From</label><input id="start"><div class="calendarWrapper" tabindex="-1"><div class="Calendar"></div></div></div><div class="DateInputBox"><label for="end">To</label><input id="end"><div class="calendarWrapper"><div class="Calendar"></div></div></div></div>';mock.append(pointerHost);
 const pointerSummary=pointerHost.querySelector('#pointerSummary'),pointerPanel=pointerHost.querySelector('#pointerPanel'),pointerInputs=pointerHost.querySelectorAll('.DateInputBox input');let pointerMoves=0,pointerLocks=0,ignorePointerDays=false;
 const pointerSelected=['2025-12-10','2025-12-10'],pointerMonths=[2025*12+11,2025*12+11],usDate=iso=>Number(iso.slice(5,7))+'/'+Number(iso.slice(8,10))+'/'+iso.slice(0,4),pointerMonthLabels=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const renderPointer=i=>{const box=pointerInputs[i].closest('.DateInputBox'),shell=box.querySelector('.calendarWrapper'),cal=box.querySelector('.Calendar');cal.replaceChildren();const prev=document.createElement('span'),next=document.createElement('span');prev.className='GlyphIcon vx_icon vx_icon-arrow-left-small prev';next.className='GlyphIcon vx_icon vx_icon-arrow-right-small next';for(const [arrow,delta] of [[prev,-1],[next,1]])arrow.onmousedown=()=>{pointerMoves++;pointerMonths[i]+=delta;renderPointer(i);};const table=document.createElement('table'),caption=document.createElement('caption'),month=document.createElement('b'),year=document.createElement('strong');month.textContent=pointerMonthLabels[pointerMonths[i]%12];year.textContent=String(Math.floor(pointerMonths[i]/12));caption.append(month,year);table.append(caption);const body=document.createElement('tbody');for(let d=1;d<=new Date(Math.floor(pointerMonths[i]/12),pointerMonths[i]%12+1,0).getDate();d++){const row=document.createElement('tr'),cell=document.createElement('td'),anchor=document.createElement('a'),iso=Math.floor(pointerMonths[i]/12)+'-'+String(pointerMonths[i]%12+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');cell.id=usDate(iso);anchor.textContent=String(d);cell.append(anchor);cell.onmousedown=()=>{if(ignorePointerDays)return;pointerLocks++;pointerSelected[i]=iso;pointerInputs[i].value=usDate(iso);pointerSummary.value=pointerSelected.map(usDate).join('-');};row.append(cell);body.append(row);}table.append(body);cal.append(prev,table,next);};
 pointerSummary.onmousedown=()=>{pointerPanel.hidden=false;for(let i=0;i<2;i++)renderPointer(i);};for(const [i,input] of [...pointerInputs].entries()){input.value=usDate(pointerSelected[i]);input.onmousedown=()=>{pointerMonths[i]=Number(pointerSelected[i].slice(0,4))*12+Number(pointerSelected[i].slice(5,7))-1;renderPointer(i);};input.onblur=()=>{input.value=usDate(pointerSelected[i]);};}
 const pointerResult=await paypalPage({action:'prepare',type:'All transactions',format:'CSV',start:'2019-01-01',end:'2019-12-31'},context);
 check(pointerResult.prepared&&pointerMoves===155&&pointerLocks===2&&pointerSummary.value==='1/1/2019-12/31/2019','Pointer-only Date range opens automatically; exact GlyphIcon prev spans navigate both calendars to the full 2019 range');
 const pointerRead=await paypalPage({action:'read'},context);
 check(pointerRead.calendars.length===2&&pointerRead.calendars.every(c=>c.previous[0]?.tag==='SPAN'&&c.next[0]?.tag==='SPAN'),'Calendar diagnostics expose observed arrow tags and displayed months without page HTML');
 const forwardResult=await paypalPage({action:'prepare',type:'All transactions',format:'CSV',start:'2020-01-01',end:'2020-12-31'},context);
 check(forwardResult.prepared&&pointerMoves===179&&pointerLocks===4&&pointerSummary.value==='1/1/2020-12/31/2020','Exact GlyphIcon next spans advance both dates to the next full year without selecting the other calendar');
 ignorePointerDays=true;const ignoredDay=await paypalPage({action:'prepare',type:'All transactions',format:'CSV',start:'2021-01-01',end:'2021-12-31'},context);check(ignoredDay.notSubmitted&&pointerSummary.value==='1/1/2020-12/31/2020','A typed field cannot masquerade as a committed day when the calendar ignores selection');
 pointerHost.remove();
 // Controlled text fields are recreated after blur, just as a framework render would replace them.
 const controlled=document.createElement('section');controlled.innerHTML='<div><label>Date range<input readonly value="Since last download"></label></div><div id="controlledPanel"></div>';mock.append(controlled);
 let committed=['09/30/2026','10/07/2026'];const controlledSummary=controlled.querySelector('input');
 const renderControlled=()=>{const panel=controlled.querySelector('#controlledPanel');panel.innerHTML='<div><label for="start">From</label><input id="start"></div><div><label for="end">To</label><input id="end"></div>';for(const [i,input] of [...panel.querySelectorAll('input')].entries()){input.value=committed[i];input.addEventListener('blur',()=>{const value=input.value;queueMicrotask(()=>{committed[i]=value;controlledSummary.value=committed.join('-');renderControlled();});});}};
 renderControlled();$('mockCreate').onclick=()=>creates++;const beforeControlled=creates;
 const controlledResult=await paypalPage({action:'create',type:'All transactions',format:'CSV',start:'2023-01-01',end:'2023-12-31'},context);
 check(controlledResult.clicked&&creates===beforeControlled+1&&controlledSummary.value==='1/1/2023-12/31/2023','Real blur commits both dates across recreated controlled inputs');controlled.remove();
 // Reject text-only updates: only selecting actual calendar days commits the provider range.
 const calendarHost=document.createElement('section');calendarHost.innerHTML='<div><label>Date range<input readonly value="09/30/2026-10/07/2026"></label></div><div><label for="start">From</label><input id="start"></div><div><label for="end">To</label><input id="end"></div><section id="mockCalendar" hidden></section>';mock.append(calendarHost);
 const lockOrder=[];let selectedDates=['09/30/2026','10/07/2026'],activeDate=0,shownMonth=2026*12+8,monthMoves=0,calendarDays=0,duplicateDay=false,freezeMonth=false;
 const calendarSummary=calendarHost.querySelector('input'),calendarInputs=calendarHost.querySelectorAll('input:not([readonly])'),monthLabels=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const drawCalendar=()=>{const panel=calendarHost.querySelector('#mockCalendar');panel.hidden=false;panel.replaceChildren();const header=document.createElement('div'),previous=document.createElement('button'),heading=document.createElement('span'),next=document.createElement('button');previous.setAttribute('aria-label','Previous month');next.setAttribute('aria-label','Next month');previous.textContent='<';next.textContent='>';heading.textContent=monthLabels[shownMonth%12]+' '+Math.floor(shownMonth/12);header.append(previous,heading,next);panel.append(header);for(const [button,delta] of [[previous,-1],[next,1]])button.onclick=()=>{monthMoves++;if(!freezeMonth)shownMonth+=delta;drawCalendar();};const count=new Date(Math.floor(shownMonth/12),shownMonth%12+1,0).getDate();for(let d=1;d<=count;d++){const button=document.createElement('button');button.textContent=String(d);button.onclick=()=>{calendarDays++;lockOrder.push(activeDate===0?'from':'to');selectedDates[activeDate]=String(shownMonth%12+1)+'/'+d+'/'+Math.floor(shownMonth/12);calendarInputs[activeDate].value=selectedDates[activeDate];calendarSummary.value=selectedDates.join('-');panel.hidden=true;};panel.append(button);}if(duplicateDay){const duplicate=document.createElement('button');duplicate.textContent='1';panel.append(duplicate);}};
 for(const [i,input] of [...calendarInputs].entries()){input.value=selectedDates[i];input.onblur=()=>{input.value=selectedDates[i];};input.onclick=()=>{activeDate=i;const parts=selectedDates[i].split('/');shownMonth=Number(parts[2])*12+Number(parts[0])-1;drawCalendar();};}
 const calendarBefore=creates;const calendarResult=await paypalPage({action:'create',type:'All transactions',format:'CSV',start:'2024-11-01',end:'2024-12-31'},context);
 check(lockOrder.slice(0,2).join(',')==='from,to','From calendar day is locked before To is touched');
 check(calendarResult.clicked&&creates===calendarBefore+1&&calendarDays===2&&monthMoves>0&&calendarSummary.value==='11/1/2024-12/31/2024','Rejected typed dates fall back to bounded calendar navigation and exact committed range');
 for(const input of calendarInputs)input.readOnly=true;
 const readOnlyBefore=creates,readOnlyResult=await paypalPage({action:'create',type:'All transactions',format:'CSV',start:'2024-10-01',end:'2024-10-31'},context);
 check(readOnlyResult.clicked&&creates===readOnlyBefore+1&&calendarSummary.value==='10/1/2024-10/31/2024','Calendar-only read-only date inputs can select and verify the range');
 for(const input of calendarInputs)input.readOnly=false;
 duplicateDay=true;const ambiguous=await paypalPage({action:'create',type:'All transactions',format:'CSV',start:'2024-09-01',end:'2024-09-30'},context);
 check(ambiguous.notSubmitted&&creates===readOnlyBefore+1,'Duplicate calendar day candidates cannot create a report');
 duplicateDay=false;freezeMonth=true;const movesBefore=monthMoves;const frozen=await paypalPage({action:'create',type:'All transactions',format:'CSV',start:'2024-09-01',end:'2024-09-30'},context);
 check(frozen.notSubmitted&&monthMoves===movesBefore+1&&creates===readOnlyBefore+1,'A calendar that fails to move stops after one navigation click');
 const manuallyPrepared=creates;calendarHost.querySelector('#mockCalendar').hidden=true;calendarSummary.value='08/01/2024-08/31/2024';for(const input of calendarInputs)input.parentElement.hidden=true;
 const preparedResult=await paypalPage({action:'create',type:'All transactions',format:'CSV',start:'2024-08-01',end:'2024-08-31'},context);
 check(preparedResult.clicked&&creates===manuallyPrepared+1,'Resume uses an already committed exact date range without requiring an open calendar');
 calendarHost.remove();
oldRange.hidden=oldStart.hidden=oldEnd.hidden=false;$('mockCreate').onclick=originalCreate;
 addReport('2025-01-01','2025-12-31');addReport('2025-01-01','2025-12-31');
 const duplicateReports=(await paypalPage({action:'read'},context)).reports.filter(r=>r.start==='2025-01-01');
 check(duplicateReports.length===2&&duplicateReports[0].rowToken!==duplicateReports[1].rowToken,'Duplicate report rows receive distinct ephemeral identities');
 const selected=await paypalPage({action:'download',...duplicateReports[1]},context);
 check(selected.text.includes('2025-01-01'),'Exact selected duplicate CSV downloads without an ambiguous-row failure');
 const bridged=await paypalPage({action:'read',bridge:true},{...context,location:{...location,pathname:'/signin'}});
 check(bridged.helperError?.message.includes('signed-in'),'Provider errors are returned across the injection boundary');

 nativeMode=true;saved.get('paypal:downloader').download={type:'All transactions',format:'CSV',start:'2025-01-01',end:'2025-12-31',downloadId:999};const countBefore=creates;await $('run').onclick();
 check($('status').textContent.includes('Annual collection finished')&&nativeDownloads===1&&creates===countBefore,'A missing saved download ID recovers the exact CSV, including a native first-party route outside reports');
 check(createdListeners.size===0&&changedListeners.size===0&&!saved.get('paypal:downloader').download,'Verified native CSV clears its download checkpoint and releases listeners');
 nativeMode=false;
 check(closedTabs.length>=3&&mockTabs.has(1),'Successful collection closes temporary working tabs and keeps the user report tab');
 // End-to-end Submitted -> Refresh -> Download, after all missing years have been created.
 const submittedYears=[],waitingButtons=[],batchBefore=creates;let batchRefreshes=0;
 $('mockCreate').onclick=()=>{creates++;const from=$('mockStart').value,to=$('mockEnd').value;submittedYears.push(from);addReport(from,to);const row=reportRows.at(-1),button=row.querySelector('button');button.hidden=true;row.lastElementChild.append(document.createTextNode('Submitted'));waitingButtons.push(button);};
 $('mockRefresh').onclick=()=>{if(!submittedYears.length)return;batchRefreshes++;if(submittedYears.length!==4)throw Error('Refresh happened before all four missing years were submitted');for(const button of waitingButtons){button.hidden=false;for(const node of [...button.parentElement.childNodes])if(node!==button)node.remove();}};
 for(const year of [2021,2022,2023,2024])saved.get('paypal:downloader').entries['All transactions:'+year+'-01-01:'+year+'-12-31:CSV']={type:'All transactions',format:'CSV',start:year+'-01-01',end:year+'-12-31',status:'requested'};
 $('year').value='2021';await $('run').onclick();
 check(creates===batchBefore+4&&submittedYears.every(value=>value.endsWith('-01-01')),'One click recovers stale click-only checkpoints and submits every missing calendar year');
 check(batchRefreshes===1&&$('status').textContent.includes('Annual collection finished'),'Submitted rows become Download through automatic Refresh, then the batch finishes');
 check(saved.get('paypal:downloader').entries['All transactions:2021-01-01:2021-12-31:CSV'].hash,'The oldest requested CSV is validated and saved locally');
 check(mockTabs.size===1&&mockTabs.has(1),'Completed batch closes its working tab after all requested files save');
 // Full capacity: immediately click Create before any legacy downloads.
 while(reportRows.length<12)addReport((2000+reportRows.length)+'-01-01',(2000+reportRows.length)+'-12-31');
 const newest=reportRows.find(row=>row.textContent.includes('2024-01-01'));newest.remove();reportRows.splice(reportRows.indexOf(newest),1);addReport('2012-01-01','2012-12-31');
 delete saved.get('paypal:downloader').entries['All transactions:2024-01-01:2024-12-31:CSV'];
 for(const row of reportRows){const control=row.querySelector('button');if(control?.onclick){const handler=control.onclick;control.onclick=null;control.innerHTML='<div>Download</div>';control.firstElementChild.onclick=handler;}}
 let createdBeforeArchive=false,fullCreate=0;const capacityDownloads=downloads;
 $('mockRefresh').onclick=null;$('mockCreate').onclick=null;$('mockCreate').innerHTML='<div id="button_:capacity">Create Report</div>';
 $('mockCreate').firstElementChild.onclick=()=>{fullCreate++;createdBeforeArchive=downloads===capacityDownloads;addReport($('mockStart').value,$('mockEnd').value);};
 $('year').value='2024';await $('run').onclick();
 check(createdBeforeArchive&&fullCreate===1&&$('status').textContent.includes('Annual collection finished'),'A full twelve-row list clicks nested Create immediately before any older CSV downloads and finishes without manual Resume');

$('fixtureResult').textContent=log.join('\n');
 }catch(e){$('fixtureResult').textContent=log.join('\n')+'\nFAIL '+e.message;}};

const helperPreview=document.createElement('button');helperPreview.textContent='Show helper preview';document.querySelector('main').prepend(helperPreview);
helperPreview.onclick=()=>{mock.hidden=true;$('fixtureRun').hidden=$('fixtureResult').hidden=helperPreview.hidden=true;};
