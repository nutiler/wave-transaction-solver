// Runs in the selected Wave list tab. Only scrolls and reads; no edit controls are clicked.
export function waveListScan(request,testContext){
 const doc=testContext?.document || document,loc=testContext?.location || location,win=testContext?.window || window,style=testContext?.getComputedStyle || getComputedStyle;
 const pause=testContext?.wait || (ms=>new Promise(resolve=>setTimeout(resolve,ms))),now=testContext?.now || Date.now;
 const key='__dandelionWaveListScanV1',tidy=s=>String(s || '').replace(/\s+/g,' ').trim();
 const valid=()=>{const u=new URL(loc.href);return u.origin==='https://next.waveapps.com' && u.pathname.replace(/\/$/,'')==='/'+request.business+'/transactions' && u.searchParams.get('status')==='NOT_VERIFIED';};
 if(request.action==='stop'){if(win[key])win[key].stop=true;return win[key]?.report || null;}
 if(request.action==='poll')return win[key]?.report || null;
 if(!/^[0-9a-f-]{36}$/i.test(request.business || '') || !valid())throw Error('Open the selected business Transactions list with status=NOT_VERIFIED.');
 if(win[key]?.report.running)throw Error('A list collection is already running in this tab.');
 const visible=el=>el && !el.hidden && !el.closest('[hidden],[aria-hidden="true"]') && style(el).display!=='none' && style(el).visibility!=='hidden' && el.getClientRects().length>0;
 const clean=el=>{if(!el)return '';const inputs=[...el.querySelectorAll('input:not([type="checkbox"]):not([type="hidden"])')];if(inputs.length===1)return tidy(inputs[0].value);const labels=el.querySelectorAll('.wv-select__label');if(labels.length===1)return tidy(labels[0].textContent);const clone=el.cloneNode(true);clone.querySelectorAll('svg,script,input,[aria-hidden="true"],.sr-only').forEach(n=>n.remove());return tidy(clone.textContent);};
 const date=text=>{if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;if(!/^[A-Za-z]{3,9} \d{1,2},? \d{4}$/.test(text))return null;const value=Date.parse(text+' UTC');return Number.isFinite(value)?new Date(value).toISOString().slice(0,10):null;};
 const amount=text=>{const s=tidy(text).replace(/USD\s*/i,'').replace(/[$,\s]/g,'');if(!/^[+-]?\d+(\.\d{1,2})?$/.test(s))return null;return Math.round(Math.abs(Number(s))*100);};
 const fingerprint=r=>JSON.stringify([r.date,tidy(r.description).toLowerCase(),tidy(r.account).toLowerCase(),r.amountCents]);
 const known=new Map();for(const t of request.known || []){if(typeof t.id!=='string' || !/^\d+$/.test(t.id))continue;const k=fingerprint(t);if(!known.has(k))known.set(k,[]);known.get(k).push(t.id);}
 const records=new Map(),problems=new Set();
 const state={stop:false,report:{format:'wave-solver-live-list',version:1,business:request.business,url:loc.href,filter:'NOT_VERIFIED',filterChipObserved:false,startedAt:new Date(now()).toISOString(),capturedAt:null,running:true,status:'Starting',records:[],expectedTotal:null,completeness:'unconfirmed',problems:[],rowDiagnostics:[]}};win[key]=state;
 const publish=status=>{state.report.status=status;state.report.records=[...records.values()];state.report.problems=[...problems];state.report.capturedAt=new Date(now()).toISOString();};
 const collect=()=>{
  const tables=[...doc.querySelectorAll('table,[role="table"],[role="grid"]')].filter(visible).filter(el=>{const text=clean(el);return /Description/i.test(text) && /Category/i.test(text) && /Amount/i.test(text);});
  const owners=tables.filter(el=>!tables.some(other=>other!==el && el.contains(other)));if(owners.length!==1){if(owners.length>1)throw Error('Multiple transaction tables are visible.');return null;}
  const table=owners[0],headers=[...table.querySelectorAll('thead th,[role="columnheader"]')].map(clean);
  const index=name=>headers.findIndex(h=>h.toLowerCase()===name.toLowerCase());
  const rows=[...table.querySelectorAll('tbody tr,[role="rowgroup"] [role="row"],tr.wv-table__row')].filter(visible),occurrences=new Map();
  if(!state.report.tableDiagnostics)state.report.tableDiagnostics={headers,headerHtml:table.querySelector('thead')?.outerHTML.slice(0,5000) || '',rowSamples:rows.slice(0,3).map(row=>row.outerHTML.slice(0,7000))};
  state.report.filterChipObserved=[...doc.querySelectorAll('button,span,a,div')].some(el=>visible(el) && el.children.length===0 && /^(Not Reviewed|Not Verified)$/i.test(tidy(el.textContent)));
  for(const row of rows){
   const cells=[...row.querySelectorAll(':scope > td,:scope > [role="cell"],:scope > [role="gridcell"]')];if(!cells.length)continue;
   const get=(name,fallback)=>clean(cells[index(name)>=0?index(name):fallback]);
   const r={id:null,identity:'unresolved',date:date(get('Date',1)),description:get('Description',2),account:get('Account',3),category:get('Category',4),amountText:get('Amount',5),amountCents:amount(get('Amount',5)),reviewed:'Unknown',reviewEvidence:null,sourceFilter:'NOT_VERIFIED'};
   if(!r.date || !r.description || r.amountCents===null){problems.add('Some visible rows could not be parsed; inspect table diagnostics.');continue;}
   r.uncategorized=/^Uncategorized(?: Expense| Income)?$/i.test(r.category);
   const ids=new Set();for(const el of [row,...row.querySelectorAll('[data-transaction-id],a[href]')]){
    const raw=el.getAttribute('data-transaction-id');if(raw && /^\d+$/.test(raw))ids.add(raw);
    const href=el.getAttribute('href');if(href){try{const u=new URL(href,loc.href),match=u.pathname.match(/^\/([0-9a-f-]{36})\/transactions\/(\d+)\/?$/i);if(u.origin==='https://next.waveapps.com' && match?.[1]===request.business)ids.add(match[2]);}catch{}}
   }
   if(ids.size===1){r.id=[...ids][0];r.identity='Wave transaction ID';}else if(ids.size>1)problems.add('Some rows expose multiple transaction IDs; those rows remain unresolved.');
   const k=fingerprint(r),candidates=known.get(k) || [];
   if(!r.id && !ids.size && candidates.length===1){r.id=candidates[0];r.identity='Unique full-field export match';}
   const statusAttribute=row.getAttribute('data-reviewed');if(statusAttribute==='true' || statusAttribute==='false'){r.reviewed=statusAttribute==='true'?'Reviewed':'Not reviewed';r.reviewEvidence='Row data-reviewed attribute';}
   const reviewLabels=[...row.querySelectorAll('[aria-label],[title]')].map(el=>tidy(el.getAttribute('aria-label') || el.getAttribute('title'))).filter(label=>/^(Reviewed|Transaction reviewed|Not reviewed|Transaction not reviewed)$/i.test(label));
   const statuses=new Set(reviewLabels.map(label=>/not reviewed/i.test(label)?'Not reviewed':'Reviewed'));if(statuses.size===1){const status=[...statuses][0];if(r.reviewed!=='Unknown' && r.reviewed!==status){r.reviewed='Unknown';r.reviewEvidence='Conflicting row indicators';}else{r.reviewed=status;r.reviewEvidence='Explicit row status label';}}else if(statuses.size>1){r.reviewed='Unknown';r.reviewEvidence='Conflicting row indicators';}
   const occurrence=(occurrences.get(k) || 0)+1;occurrences.set(k,occurrence);const rowKey=r.id?'id:'+r.id:'unresolved:'+k+':'+occurrence;
   records.set(rowKey,r);
   if(!r.id && state.report.rowDiagnostics.length<5 && !state.report.rowDiagnostics.some(d=>d.key===rowKey))state.report.rowDiagnostics.push({key:rowKey,html:row.outerHTML.slice(0,9000)});
  }
  const total=tidy(doc.body.textContent).match(/Showing\s+\d[\d,]*(?:\s*[-–]\s*\d[\d,]*)?\s+(?:of|out of)\s+(\d[\d,]*)\s+transactions/i);if(total)state.report.expectedTotal=Number(total[1].replace(/,/g,''));
  return table;
 };
 const scrollOwner=table=>{for(let el=table.parentElement;el && el!==doc.body;el=el.parentElement){if(/auto|scroll/.test(style(el).overflowY) && el.clientHeight>=100 && el.scrollHeight>el.clientHeight+2)return el;}return doc.scrollingElement || doc.documentElement;};
 state.done=(async()=>{
  const started=now();let stable=0,last='',ready=false;
  try{
   for(let n=0;n<450;n++){
    if(state.stop){publish('Stopped; partial collection retained');break;}
    if(!valid()){publish('Stopped because the business or filter changed');problems.add('The Wave list navigated away during collection.');break;}
    const table=collect();if(!table){if(ready || now()-started>30000)throw Error('Transaction table was not readable.');await pause(700);continue;}const firstTable=!ready;ready=true;
    const scroller=scrollOwner(table),bottom=scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-3;
    if(firstTable && scroller.scrollTop>0){scroller.scrollTop=0;await pause(700);continue;}
    const marker=JSON.stringify([records.size,scroller.scrollHeight,scroller.scrollTop]);stable=bottom && marker===last?stable+1:0;last=marker;
    publish('Collecting: '+records.size+' rows; '+state.report.records.filter(r=>r.id).length+' identified');
    const loading=[...doc.querySelectorAll('[aria-busy="true"],[role="progressbar"]')].some(visible);
    if(bottom && stable>=6 && !loading){const identified=state.report.records.filter(r=>r.id).length;if(state.report.expectedTotal!==null && identified===state.report.expectedTotal){state.report.completeness='count-confirmed';publish('Complete: observed transaction count matches the list total');}else{state.report.completeness='bottom-reached';publish('Reached bottom after repeated stable checks; total not independently confirmed');}break;}
    if(records.size>=20000 || now()-started>420000){publish('Collection limit reached; partial results retained');break;}
    scroller.scrollTop=Math.min(scroller.scrollTop+Math.max(100,Math.floor(scroller.clientHeight*0.7)),scroller.scrollHeight-scroller.clientHeight);
    await pause(bottom?1200:650);
   }
   if(state.report.status.startsWith('Collecting:'))publish('Scan step limit reached; partial collection retained');
  }catch(e){problems.add(e.message);publish('Collection stopped: '+e.message);}finally{if([...records.values()].some(r=>!r.id))problems.add('Rows without an exact ID or unique export match cannot be used to select bookkeeping actions. Identical unidentified rows may not be distinguishable across scroll frames.');state.report.running=false;publish(state.report.status);}
 })();
 return state.report;
}
