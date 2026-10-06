// Runs in the selected Wave list tab. Loads more rows and briefly selects all to count; never edits transactions.
export function waveListScan(request,testContext){
 const doc=testContext?.document || document,loc=testContext?.location || location,win=testContext?.window || window,style=testContext?.getComputedStyle || getComputedStyle;
 const pause=testContext?.wait || (ms=>new Promise(resolve=>setTimeout(resolve,ms))),now=testContext?.now || Date.now;
 const key='__dandelionWaveListScanV1',tidy=s=>String(s || '').replace(/\s+/g,' ').trim();
 const mode=request.mode==='ALL'?'ALL':'NOT_VERIFIED';
 const year=Number.isInteger(request.year)&&request.year>=1900&&request.year<=2200?request.year:null;
 const valid=()=>{const u=new URL(loc.href);return u.origin==='https://next.waveapps.com' && u.pathname.replace(/\/$/,'')==='/'+request.business+'/transactions' && (mode==='ALL'?(year?[...u.searchParams.keys()].length===2&&u.searchParams.get('startDate')===year+'-01-01'&&u.searchParams.get('endDate')===year+'-12-31':u.search===''):u.searchParams.get('status')==='NOT_VERIFIED');};
 if(request.action==='stop'){if(win[key])win[key].stop=true;return win[key]?.report || null;}
 if(request.action==='poll')return win[key]?.report || null;
 if(!/^[0-9a-f-]{36}$/i.test(request.business || '') || !valid())throw Error(mode==='ALL'?'Open the selected business Transactions list with no URL filters.':'Open the selected business Transactions list with status=NOT_VERIFIED.');
 if(win[key]?.report.running)throw Error('A list collection is already running in this tab.');
 const visible=el=>el && !el.hidden && !el.closest('[hidden],[aria-hidden="true"]') && style(el).display!=='none' && style(el).visibility!=='hidden' && el.getClientRects().length>0;
 const clean=el=>{if(!el)return '';const inputs=[...el.querySelectorAll('input:not([type="checkbox"]):not([type="hidden"])')];if(inputs.length===1)return tidy(inputs[0].value);const labels=el.querySelectorAll('.wv-select__label');if(labels.length===1)return tidy(labels[0].textContent);const clone=el.cloneNode(true);clone.querySelectorAll('svg,script,input,[aria-hidden="true"],.sr-only,[role="tooltip"]').forEach(n=>n.remove());return tidy(clone.textContent);};
 const date=text=>{if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;if(!/^[A-Za-z]{3,9} \d{1,2},? \d{4}$/.test(text))return null;const value=Date.parse(text+' UTC');return Number.isFinite(value)?new Date(value).toISOString().slice(0,10):null;};
 const amount=text=>{const s=tidy(text).replace(/USD\s*/i,'').replace(/[$,\s]/g,'');if(!/^[+-]?\d+(\.\d{1,2})?$/.test(s))return null;return Math.round(Math.abs(Number(s))*100);};
 const fingerprint=r=>JSON.stringify([r.date,tidy(r.description).toLowerCase(),tidy(r.account).toLowerCase(),r.amountCents]);
 const known=new Map();for(const t of request.known || []){if(typeof t.id!=='string' || !/^\d+$/.test(t.id))continue;const k=fingerprint(t);if(!known.has(k))known.set(k,[]);known.get(k).push(t.id);}
 const records=new Map(),problems=new Set();
 const state={stop:false,report:{format:'wave-solver-live-list',version:1,suggestionDetectionVersion:2,business:request.business,url:loc.href,filter:mode,year,filterChipObserved:false,startedAt:new Date(now()).toISOString(),capturedAt:null,running:true,status:'Starting',records:[],expectedTotal:null,completeness:'unconfirmed',problems:[],rowDiagnostics:[]}};win[key]=state;
 const publish=status=>{state.report.status=status;state.report.records=[...records.values()];state.report.problems=[...problems];state.report.capturedAt=new Date(now()).toISOString();};
 const collect=()=>{
  state.report.filterChipObserved=[...doc.querySelectorAll('button,span,a,div')].some(el=>visible(el) && /^(Not Reviewed|Not Verified)$/i.test(clean(el)));
  if(mode==='ALL'){const filters=[...doc.querySelectorAll('button,[role=button]')].filter(visible).map(clean).filter(text=>/^[1-9]\d* filters?$/i.test(text));const searches=[...doc.querySelectorAll('input')].filter(visible).filter(input=>/search transactions/i.test(input.getAttribute('placeholder') || input.getAttribute('aria-label') || '') && input.value.trim());if(state.report.filterChipObserved || filters.some(text=>Number(text.match(/^\d+/)[0])>(year?1:0)) || searches.length)throw Error('The all-transactions list still has active filters or a search. Clear them in Wave and collect again.');}
  const tables=[...doc.querySelectorAll('table,[role="table"],[role="grid"]')].filter(visible).filter(el=>{const text=clean(el);return /Description/i.test(text) && /Category/i.test(text) && /Amount/i.test(text);});
  const owners=tables.filter(el=>!tables.some(other=>other!==el && el.contains(other)));if(owners.length!==1){if(owners.length>1)throw Error('Multiple transaction tables are visible.');return null;}
  const table=owners[0],headerRow=table.querySelector('thead tr,[role="row"]:has([role="columnheader"])');
  const headers=headerRow?[...headerRow.children].map(clean):[...table.querySelectorAll('[role="columnheader"]')].map(clean);
  const index=name=>headers.findIndex(h=>h.toLowerCase()===name.toLowerCase());
  if(['Date','Description','Account','Category','Amount'].some(name=>index(name)<0))throw Error('Transaction column headers are not readable.');
  const dataRows=root=>[...root.querySelectorAll('tbody tr,[role="rowgroup"] [role="row"],tr.wv-table__row')].filter(row=>visible(row) && !row.closest('thead') && !row.querySelector('[role="columnheader"]'));
  const shape=row=>{const cells=[...row.children];return cells.length>=headers.length && date(clean(cells[index('Date')])) && amount(clean(cells[index('Amount')]))!==null;};
  let root=table;
  // Wave may render the sticky header and transaction body in separate sibling tables.
  if(!dataRows(root).some(shape))for(let parent=table.parentElement;parent;parent=parent.parentElement){if(dataRows(parent).some(shape)){root=parent;break;}if(parent===doc.body)break;}
  const rows=dataRows(root),occurrences=new Map();
  state.report.tableDiagnostics={headers,headerHtml:table.querySelector('thead')?.outerHTML.slice(0,5000) || '',rowSamples:rows.slice(0,3).map(row=>row.outerHTML.slice(0,7000)),nearbyTables:[...doc.querySelectorAll('table,[role="table"],[role="grid"]')].filter(visible).slice(0,4).map(t=>({class:t.className,rows:t.querySelectorAll('tr,[role="row"]').length,rowSamples:[...t.querySelectorAll('tr,[role="row"]')].filter(row=>!row.closest('thead')).slice(0,2).map(row=>row.outerHTML.slice(0,7000)),html:t.outerHTML.slice(0,3500)}))};


  for(const row of rows){
   const cells=[...row.querySelectorAll(':scope > td,:scope > [role="cell"],:scope > [role="gridcell"]')];if(!cells.length)continue;
   const get=(name,fallback)=>clean(cells[index(name)>=0?index(name):fallback]);
   const r={id:null,identity:'unresolved',date:date(get('Date',1)),description:get('Description',2),account:get('Account',3),category:get('Category',4),amountText:get('Amount',5),amountCents:amount(get('Amount',5)),reviewed:'Unknown',reviewEvidence:null,sourceFilter:mode};
   if(year && r.date && !r.date.startsWith(year+'-'))throw Error('A row falls outside the requested year. Wait for the date filter to load.');
   if(!r.date || !r.description || r.amountCents===null){problems.add('Some visible rows could not be parsed; inspect table diagnostics.');if(state.report.rowDiagnostics.length<5)state.report.rowDiagnostics.push({problem:'Unreadable row fields',html:row.outerHTML.slice(0,9000)});continue;}
   const suggestionButtons=[...row.querySelectorAll('button,[role="button"]')].filter(visible).filter(button=>[button.getAttribute('aria-label'),button.getAttribute('title'),tidy(button.textContent),...((button.getAttribute('aria-describedby') || '').split(/\s+/).map(id=>doc.getElementById(id)?.textContent)),...[...button.querySelectorAll('svg title,[role="tooltip"]')].map(el=>el.textContent)].some(text=>/^(?:ConfirmAutocatIcon|Confirm (?:the )?auto.updated category)$/i.test(tidy(text))));
   r.waveSuggestion=suggestionButtons.length===1;r.suggestionControlDisabled=suggestionButtons.some(button=>button.disabled || button.getAttribute('aria-disabled')==='true');if(suggestionButtons.length)r.suggestionControls=suggestionButtons.map(button=>button.outerHTML.slice(0,3500));
   r.uncategorized=/^Uncategorized(?: Expense| Income)?$/i.test(r.category);
   let foreignIdentity=false;const ids=new Set();for(const el of [row,...row.querySelectorAll('[data-transaction-id],[data-testid^="BulkCheckbox"],a[href]')]){
    const testId=el.getAttribute('data-testid');if(testId?.startsWith('BulkCheckbox')){try{const payload=testId.slice('BulkCheckbox'.length);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(payload))throw Error('Invalid encoded identity');const decoded=atob(payload),match=decoded.match(/^Business:([0-9a-f-]{36});Transaction:(\d+)$/i);if(match){if(match[1].toLowerCase()===request.business.toLowerCase())ids.add(match[2]);else foreignIdentity=true;}}catch{/* Unrecognized metadata never becomes an ID. */}}
    const raw=el.getAttribute('data-transaction-id');if(raw && /^\d+$/.test(raw))ids.add(raw);
    const href=el.getAttribute('href');if(href){try{const u=new URL(href,loc.href),match=u.pathname.match(/^\/([0-9a-f-]{36})\/transactions\/(\d+)\/?$/i);if(u.origin==='https://next.waveapps.com' && match?.[1]===request.business)ids.add(match[2]);}catch{}}
   }
   if(foreignIdentity){problems.add('A row exposes a different business identity; that row remains unresolved.');}else if(ids.size===1){r.id=[...ids][0];r.identity='Wave transaction ID';}else if(ids.size>1)problems.add('Some rows expose multiple transaction IDs; those rows remain unresolved.');
   const k=fingerprint(r),candidates=known.get(k) || [];
   if(!r.id && !ids.size && !foreignIdentity && candidates.length===1){r.id=candidates[0];r.identity='Unique full-field export match';}
   const evidence=[];
   const statusAttribute=row.getAttribute('data-reviewed');if(statusAttribute==='true' || statusAttribute==='false')evidence.push({status:statusAttribute==='true'?'Reviewed':'Not reviewed',reason:'Row data-reviewed attribute'});
   const reviewLabels=[...row.querySelectorAll('[aria-label],[title]')].map(el=>tidy(el.getAttribute('aria-label') || el.getAttribute('title'))).filter(label=>/^(Reviewed|Transaction reviewed|Not reviewed|Transaction not reviewed)$/i.test(label));
   for(const label of reviewLabels)evidence.push({status:/not reviewed/i.test(label)?'Not reviewed':'Reviewed',reason:'Explicit row status label'});
   const reviewIcons=[...row.querySelectorAll('.transactions-list-v2__row__verify-icon')];
   for(const icon of reviewIcons){if(icon.classList.contains('transactions-list-v2__row__verify-icon--unverified'))evidence.push({status:'Not reviewed',reason:'Wave row unverified marker'});if(icon.classList.contains('transactions-list-v2__row__verify-icon--verified') || icon.classList.contains('transactions-list-v2__row__verify-icon--true'))evidence.push({status:'Reviewed',reason:'Wave row verified marker'});}
   r.reviewControlDisabled=reviewIcons.some(icon=>icon.disabled || icon.getAttribute('aria-disabled')==='true' || icon.classList.contains('transactions-list-v2__row__verify-icon--unverified--is-disabled'));
   r.reviewMarkers=reviewIcons.map(icon=>[...icon.classList].filter(name=>name.startsWith('transactions-list-v2__row__verify-icon--')));
   const statuses=new Set(evidence.map(item=>item.status));if(statuses.size===1){r.reviewed=[...statuses][0];r.reviewEvidence=[...new Set(evidence.map(item=>item.reason))].join('; ');}else if(statuses.size>1)r.reviewEvidence='Conflicting row indicators';
   const occurrence=(occurrences.get(k) || 0)+1;occurrences.set(k,occurrence);const rowKey=r.id?'id:'+r.id:'unresolved:'+k+':'+occurrence;
   records.set(rowKey,r);
   if(!r.id && state.report.rowDiagnostics.length<5 && !state.report.rowDiagnostics.some(d=>d.key===rowKey))state.report.rowDiagnostics.push({key:rowKey,html:row.outerHTML.slice(0,9000)});
  }
  const total=tidy(doc.body.textContent).match(/Showing\s+\d[\d,]*(?:\s*[-–]\s*\d[\d,]*)?\s+(?:of|out of)\s+(\d[\d,]*)\s+transactions/i);if(total)state.report.expectedTotal=Number(total[1].replace(/,/g,''));
  return rows.find(shape)?.closest('table') || table;
 };
 const scrollOwner=table=>{for(let el=table.parentElement;el && el!==doc.body;el=el.parentElement){if(/auto|scroll/.test(style(el).overflowY) && el.clientHeight>=100 && el.scrollHeight>el.clientHeight+2)return el;}return doc.scrollingElement || doc.documentElement;};
 const named=el=>tidy(el.getAttribute('aria-label') || clean(el));
 const loadButtons=()=>[...doc.querySelectorAll('button,[role="button"],a')].filter(el=>visible(el) && /^Load more transactions?$/i.test(named(el)));
 const disabled=el=>el.disabled || el.getAttribute('aria-disabled')==='true';
 const selectControls=()=>[...doc.querySelectorAll('input[type="checkbox"],[role="checkbox"]')].filter(el=>{
  const labels=[...(el.labels || [])].filter(visible).map(clean);
  const parent=el.closest('label');if(parent && visible(parent))labels.push(clean(parent));
  for(let container=el.parentElement,n=0;container && n<2;n++,container=container.parentElement){if(visible(container) && container.querySelectorAll('input[type="checkbox"],[role="checkbox"]').length===1)labels.push(clean(container));}
  const labelled=(el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id=>doc.getElementById(id)).filter(visible).map(clean).join(' ');
  return (visible(el) || labels.length) && [el.getAttribute('aria-label'),labelled,...labels].some(t=>/^Select all(?: transactions)?$/i.test(tidy(t)));
 });
 const checked=el=>el.matches('input')?el.checked:el.getAttribute('aria-checked')==='true';
 const mixed=el=>el.indeterminate || el.getAttribute('aria-checked')==='mixed';
 const verifyTotal=async()=>{
  const controls=selectControls();state.report.countDiagnostics={selectControls:controls.map(el=>el.outerHTML.slice(0,3000))};
  if(controls.length!==1 || disabled(controls[0])){problems.add('Select All count check unavailable; total was not independently checked by selection.');return;}
  const control=controls[0];if(checked(control) || mixed(control)){problems.add('Existing selection preserved; Select All count check skipped.');return;}
  const container=control.closest('label') || control.parentElement;
  const currentControl=()=>{if(control.isConnected)return control;if(container?.isConnected){const options=[...container.querySelectorAll('input[type="checkbox"],[role="checkbox"]')];if(options.length===1)return options[0];}const options=selectControls();return options.length===1?options[0]:null;};
  let created=false;
  try{
   if(state.stop || !valid())return;
   control.click();created=true;
   for(let i=0;i<12;i++){
    await pause(300);if(state.stop || !valid())return;
    const counts=new Set([...doc.querySelectorAll('span,div,p,strong')].filter(visible).map(el=>tidy(el.textContent)).map(t=>t.match(/^([\d,]+) selected$/i)?.[1]).filter(Boolean).map(n=>Number(n.replace(/,/g,''))));
    if(counts.size===1 && currentControl() && checked(currentControl())){state.report.expectedTotal=[...counts][0];state.report.totalEvidence='Select All selected count';state.report.countDiagnostics.selectedTotal=state.report.expectedTotal;return;}
   }
   problems.add('Select All selected count was unreadable.');
  }finally{
   if(created && valid()){
    const current=currentControl();if(current && !disabled(current) && (checked(current) || mixed(current))){current.click();await pause(300);}
    const remaining=currentControl();if(!remaining || checked(remaining) || mixed(remaining))problems.add('Selection cleanup could not be confirmed; check the Wave tab.');
   }else if(created)problems.add('Page changed during counting; selection cleanup could not be confirmed.');
  }
 };
 state.done=(async()=>{
  const started=now();let stable=0,last='',ready=false,loadPending=null,emptyTicks=0;
  try{
   for(let n=0;n<(mode==='ALL'?3000:450);n++){
    if(state.stop){publish('Stopped; partial collection retained');break;}
    if(!valid()){publish('Stopped because the business or filter changed');problems.add('The Wave list navigated away during collection.');break;}
    const table=collect();const empty=year && !records.size && ![...doc.querySelectorAll('[aria-busy="true"],[role="progressbar"]')].some(visible) && [...doc.querySelectorAll('p,div,span')].some(el=>visible(el)&&/^(No transactions|No transactions found|No transactions to display)\.?$/i.test(clean(el)));if(empty){emptyTicks++;if(emptyTicks>=6){state.report.expectedTotal=0;state.report.totalEvidence='Explicit stable empty year list';state.report.completeness='count-confirmed';publish('Complete: no transactions in '+year);break;}await pause(700);continue;}emptyTicks=0;if(!table){if(ready || now()-started>30000)throw Error('Transaction table was not readable.');await pause(700);continue;}const firstTable=!ready;ready=true;
    const scroller=scrollOwner(table),bottom=scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-3;
    if(firstTable && scroller.scrollTop>0){scroller.scrollTop=0;await pause(700);continue;}
    const marker=JSON.stringify([records.size,scroller.scrollHeight,scroller.scrollTop]);stable=bottom && marker===last?stable+1:0;last=marker;
    publish('Collecting: '+records.size+' rows; '+state.report.records.filter(r=>r.id).length+' identified');
    const loading=[...doc.querySelectorAll('[aria-busy="true"],[role="progressbar"]')].some(visible);
    if(records.size>=(mode==='ALL'?100000:20000) || now()-started>(mode==='ALL'?1800000:420000)){publish('Collection limit reached; partial results retained');break;}
    const more=loadButtons();if(more.length>1)throw Error('Multiple Load More Transactions controls found.');
    if(loadPending){
     if(records.size>loadPending.count || !more.length){loadPending=null;stable=0;}
     else if(now()-loadPending.at>30000)throw Error('Load More Transactions did not produce more rows within 30 seconds.');
     else{publish('Waiting for more transactions to load');await pause(700);continue;}
    }
    if(bottom && more.length){
     stable=0;if(!loading && !disabled(more[0])){loadPending={count:records.size,at:now()};state.report.loadMoreClicks=(state.report.loadMoreClicks || 0)+1;more[0].click();}
     await pause(700);continue;
    }
    if(bottom && stable>=6 && !loading){await verifyTotal();if(state.stop || !valid()){publish('Stopped during count verification; partial results retained');break;}const identified=state.report.records.filter(r=>r.id).length;if(state.report.expectedTotal!==null && identified===state.report.expectedTotal){state.report.completeness='count-confirmed';publish('Complete: identified transaction count matches '+(state.report.totalEvidence || 'the list total'));}else{state.report.completeness='bottom-reached';publish('Reached bottom after repeated stable checks; total not independently confirmed');}break;}
    if(records.size>=(mode==='ALL'?100000:20000) || now()-started>(mode==='ALL'?1800000:420000)){publish('Collection limit reached; partial results retained');break;}
    scroller.scrollTop=Math.min(scroller.scrollTop+Math.max(100,Math.floor(scroller.clientHeight*0.7)),scroller.scrollHeight-scroller.clientHeight);
    await pause(bottom?1200:650);
   }
   if(state.report.status.startsWith('Collecting:'))publish('Scan step limit reached; partial collection retained');
  }catch(e){problems.add(e.message);publish('Collection stopped: '+e.message);}finally{if([...records.values()].some(r=>!r.id))problems.add('Rows without an exact ID or unique export match cannot be used to select bookkeeping actions. Identical unidentified rows may not be distinguishable across scroll frames.');state.report.running=false;publish(state.report.status);}
 })();
 return state.report;
}

// Only opens the Sort menu and its exact oldest-first option, then reads the first dated row.
export async function discoverOldestWaveYear(request,testContext){
 const doc=testContext?.document || document,loc=testContext?.location || location,style=testContext?.getComputedStyle || getComputedStyle,pause=testContext?.wait || (ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 const url=new URL(loc.href);if(url.origin!=='https://next.waveapps.com' || url.pathname.replace(/\/$/,'')!=='/'+request.business+'/transactions' || url.search)throw Error('Oldest-year discovery requires the unfiltered business Transactions page.');
 const visible=el=>!el.hidden&&!el.closest('[hidden],[aria-hidden="true"]')&&style(el).display!=='none'&&style(el).visibility!=='hidden'&&el.getClientRects().length>0;
 const text=el=>{const clone=el.cloneNode(true);clone.querySelectorAll('svg,[aria-hidden="true"]').forEach(n=>n.remove());return clone.textContent.replace(/\s+/g,' ').trim();};
 for(const table of doc.querySelectorAll('table'))for(let parent=table.parentElement;parent;parent=parent.parentElement)if(parent.scrollHeight>parent.clientHeight)parent.scrollTop=0;if(doc.scrollingElement)doc.scrollingElement.scrollTop=0;
 let sorts=[];for(let n=0;n<20;n++){sorts=[...doc.querySelectorAll('button,[role="button"]')].filter(el=>visible(el)&&/^Sort$/i.test(text(el)));if(sorts.length)break;await pause(500);}if(sorts.length!==1)throw Error('Cannot identify the Sort button. Open oldest-first manually and copy collection diagnostics.');sorts[0].click();await pause(300);
 const choices=[...doc.querySelectorAll('button,[role="menuitem"],[role="option"],li,div')].filter(el=>visible(el)&&/^Oldest to newest$/i.test(text(el)));const leaf=choices.filter(el=>!choices.some(other=>other!==el&&el.contains(other)));if(leaf.length!==1)throw Error('Cannot identify the exact Oldest to newest option.');leaf[0].click();
 const firstDate=()=>{for(const row of doc.querySelectorAll('tbody tr,tr.wv-table__row,[role="row"]')){if(!visible(row)||row.closest('thead'))continue;for(const cell of row.querySelectorAll('td,[role="cell"]')){const t=text(cell);if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;if(/^[A-Za-z]{3,9} \d{1,2},? \d{4}$/.test(t)){const n=Date.parse(t+' UTC');if(Number.isFinite(n))return new Date(n).toISOString().slice(0,10);}}}return null;};
 let previous=null,stable=0;for(let n=0;n<20;n++){await pause(n===0?1500:500);if(loc.href!==url.href)throw Error('Wave navigated during oldest-year discovery.');const date=firstDate();if(date && date===previous)stable++;else stable=0;previous=date;if(stable>=2){const year=Number(date.slice(0,4));if(year<1900||year>2200)throw Error('Unexpected oldest transaction year.');return {year,date,sort:'Oldest to newest',capturedAt:new Date().toISOString()};}}
 throw Error('Could not read a stable oldest transaction date after sorting.');
}
