import {expenseCandidates} from './expense-batch.js';
import {matchingRules} from './rules.js';
import {debugSlot,debugLink} from './workspace-ui.js';
const tidy=s=>String(s || '').replace(/\s+/g,' ').trim();
export function suggestionAudit(report,queue,rules,business,from='2025-01-01'){
 const result={rows:[],counts:{},scanned:report?.records?.length || 0,detected:0,eligible:[],needsRefresh:report?.suggestionDetectionVersion!==2};
 const byId=new Map(queue.map(t=>[t.id,t])),counts=new Map();for(const row of report?.records || [])counts.set(row.id,(counts.get(row.id)||0)+1);
 for(const row of report?.records || []){
  const t=byId.get(row.id);let reason='Not a detected Wave suggestion';
  if(row.waveSuggestion===true){result.detected++;
   if(report.business!==business)reason='Collected for another business';
   else if(report.running)reason='Collection still running';
   else if(counts.get(row.id)!==1 || row.identity!=='Wave transaction ID')reason='Unconfirmed or duplicate transaction identity';
   else if(row.suggestionControlDisabled)reason='Suggestion control disabled';
   else if(row.reviewed==='Reviewed')reason='Already reviewed';
   else if(row.date<from)reason='Before the working period';
   else if(!t)reason='Not in the imported working queue';
   else if(!expenseCandidates([t]).length)reason=t.kind==='Unclassified'?'No approved expense rule':t.kind || 'Not an eligible outgoing purchase';
   else if(row.date!==t.date || tidy(row.description)!==tidy(t.description) || tidy(row.account)!==tidy(t.primary.account) || row.amountCents!==t.amount)reason='Live identity fields differ from export';
   else {const matches=matchingRules(t.description,rules,t,business),categories=new Set(matches.map(rule=>rule.category));if(!matches.length)reason='Approved rule excludes this transaction';else if(categories.size!==1 || !categories.has(t.proposed))reason='Approved rules conflict or changed';else if(tidy(row.category)!==tidy(t.proposed))reason='Wave category differs from approved category';else {reason='Ready to confirm';result.eligible.push({...t,suggestionRow:row});}}
  }
  result.counts[reason]=(result.counts[reason] || 0)+1;
  if(row.waveSuggestion===true)result.rows.push({id:row.id,description:row.description,waveCategory:row.category,approvedCategory:t?.proposed || null,reason});
 }
 return result;
}
export function suggestionCandidates(report,queue,rules,business,from='2025-01-01'){return suggestionAudit(report,queue,rules,business,from).eligible;}
// Injected into the collected Wave list. Never clicks a category, Save, or a generic review button.
export function waveSuggestionAction(request,testContext){
 const doc=testContext?.document || document,loc=testContext?.location || location,style=testContext?.getComputedStyle || getComputedStyle;
 const tidy=s=>String(s || '').replace(/\s+/g,' ').trim();
 const visible=e=>e && !e.hidden && !e.closest('[hidden],[aria-hidden="true"]') && style(e).display!=='none' && style(e).visibility!=='hidden' && e.getClientRects().length>0;
 let clicked=false;const result={clicked:false,confirmed:false,problems:[],controls:[],rowHtml:null};
 try{
  const u=new URL(loc.href);if(!/^[0-9a-f-]{36}$/i.test(request?.business || '') || !/^\d+$/.test(request?.id || '') || u.origin!=='https://next.waveapps.com' || u.pathname.replace(/\/$/,'')!=='/'+request.business+'/transactions' || u.searchParams.get('status')!=='NOT_VERIFIED')throw Error('The collected Not Reviewed list is not open for this business. Collect it again.');
  const clean=e=>{if(!e)return '';const inputs=[...e.querySelectorAll('input:not([type="checkbox"]):not([type="hidden"])')];if(inputs.length===1)return tidy(inputs[0].value);const labels=e.querySelectorAll('.wv-select__label');if(labels.length===1)return tidy(labels[0].textContent);const clone=e.cloneNode(true);clone.querySelectorAll('svg,script,input,[aria-hidden="true"],.sr-only,[role="tooltip"]').forEach(n=>n.remove());return tidy(clone.textContent);};
  const ids=row=>{const ids=new Set();for(const el of [row,...row.querySelectorAll('[data-transaction-id],[data-testid^="BulkCheckbox"],a[href]')]){const raw=el.getAttribute('data-transaction-id');if(raw && /^\d+$/.test(raw))ids.add(raw);const encoded=el.getAttribute('data-testid');if(encoded?.startsWith('BulkCheckbox')){try{const m=atob(encoded.slice(12)).match(/^Business:([0-9a-f-]{36});Transaction:(\d+)$/i);if(m){if(m[1].toLowerCase()!==request.business.toLowerCase())throw Error('Foreign identity');ids.add(m[2]);}}catch{ids.add('unreadable');}}const href=el.getAttribute('href');if(href){const url=new URL(href,loc.href),m=url.pathname.match(/^\/([0-9a-f-]{36})\/transactions\/(\d+)\/?$/i);if(m){if(url.origin!=='https://next.waveapps.com' || m[1]!==request.business)ids.add('foreign');else ids.add(m[2]);}}}return ids;};
  const rows=[...doc.querySelectorAll('tbody tr,tr.wv-table__row')].filter(row=>visible(row) && !row.closest('thead') && ids(row).has(request.id));
  if(rows.length!==1 || ids(rows[0]).size!==1)throw Error('Cannot identify exactly one live transaction row. Collect the list again.');
  const row=rows[0];result.rowHtml=row.outerHTML.slice(0,12000);
  const headers=[...doc.querySelectorAll('thead tr')].filter(visible).map(r=>[...r.children].map(clean)).filter(h=>['Date','Description','Account','Category','Amount'].every(n=>h.includes(n)));
  if(headers.length!==1)throw Error('Cannot identify transaction column headers.');
  const cells=[...row.children],field=n=>clean(cells[headers[0].indexOf(n)]);
  const money=s=>{const v=tidy(s).replace(/USD\s*/i,'').replace(/[$,\s]/g,'');return /^[+-]?\d+(\.\d{1,2})?$/.test(v)?Math.round(Math.abs(Number(v))*100):NaN;};
  const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)?s:/^[A-Za-z]{3,9} \d{1,2},? \d{4}$/.test(s) && Number.isFinite(Date.parse(s+' UTC'))?new Date(s+' UTC').toISOString().slice(0,10):null;
  const fields={date:date(field('Date')),description:field('Description'),account:field('Account'),category:field('Category'),amountCents:money(field('Amount'))};result.fields=fields;
  const buttons=[...row.querySelectorAll('button,[role="button"]')].filter(visible);
  const labels=button=>[button.getAttribute('aria-label'),button.getAttribute('title'),clean(button),...((button.getAttribute('aria-describedby') || '').split(/\s+/).map(id=>doc.getElementById(id)?.textContent)),...button.querySelectorAll('svg title,[role="tooltip"]')].map(v=>tidy(typeof v==='string'?v:v?.textContent)).filter(Boolean);
  result.controls=buttons.map(b=>({labels:labels(b),disabled:!!b.disabled || b.getAttribute('aria-disabled')==='true',html:b.outerHTML.slice(0,3500)}));
  const confirm=buttons.filter(b=>labels(b).some(s=>/^(?:ConfirmAutocatIcon|Confirm (?:the )?auto.updated category)$/i.test(s)));
  result.suggestionVisible=confirm.length===1;
  if(request.action==='inspect')return result;
  if(request.action!=='confirm' || !request.expected)throw Error('Invalid suggestion confirmation request.');
  for(const key of ['date','description','account','category','amountCents'])if(fields[key]!==request.expected[key])throw Error(key+' changed. No suggestion confirmed.');
  if(!request.category || fields.category!==request.category)throw Error('Wave suggestion differs from the approved category.');
  if(confirm.length!==1)throw Error('Cannot identify one Confirm the auto-updated category control. Copy suggestion diagnostics.');
  if(confirm[0].disabled || confirm[0].getAttribute('aria-disabled')==='true')throw Error('Wave suggestion confirmation is disabled.');
  clicked=true;confirm[0].click();result.clicked=true;result.confirmed=true;
 }catch(e){result.clicked=clicked;result.problems.push(e.message);}
 return result;
}
export function installSuggestionReview({getState,report,receipt,run,recheck,inspect,refresh}){
 const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const section=make('section'),fold=make('details');fold.className='step';fold.id='waveSuggestions';const summary=make('summary','Confirm Wave’s suggestions');summary.setAttribute('role','heading');summary.setAttribute('aria-level','2');fold.append(summary);const body=make('div');body.className='step-body';fold.append(body);section.append(fold);document.getElementById('expenseBatch').parentElement.before(section);
 const debug=debugSlot('suggestionTools','Wave suggestion confirmation diagnostics');let selected=new Set(),running=false,message='',context=null;
 function render(){if(running)return;const s=getState(),key=[s.dataset,s.business,s.workFrom];if(!context || key.some((v,i)=>v!==context[i])){context=key;selected.clear();message='';}
  const audit=suggestionAudit(report(),s.queue,s.rules,s.business,s.workFrom),all=audit.eligible,pending=all.filter(t=>!receipt(t)?.reviewedVerified);const eligible=t=>!receipt(t)?.attempted;const known=new Set(pending.filter(eligible).map(t=>t.id));for(const id of selected)if(!known.has(id))selected.delete(id);
  body.replaceChildren(make('p','Collect the live Not Reviewed list first. Suggestions already matching an approved merchant rule can be confirmed with Wave’s thumbs-up, then marked reviewed. Different categories, incoming transactions, transfers and uncertain records stay out.'),make('p',pending.length+' matching suggestions; '+all.filter(t=>receipt(t)?.reviewedVerified).length+' completed. '+pending.filter(t=>receipt(t)?.attempted).length+' saved attempts need a recheck.'));
  body.append(make('p',!report()?'No live collection is loaded. Click Refresh Wave suggestions to collect it.':audit.needsRefresh?'The saved collection predates this suggestion detector. Refresh Wave suggestions to check the thumbs-up controls again.':audit.scanned+' scanned transactions; '+audit.detected+' Wave suggestions detected. '+Object.entries(audit.counts).filter(([reason])=>reason!=='Not a detected Wave suggestion').map(([reason,count])=>count+' '+reason.toLowerCase()).join('; ')+'.'));
  const refreshButton=make('button','Refresh Wave suggestions');refreshButton.disabled=!!s.busy || !s.extensionMode || s.sample || !s.business;refreshButton.onclick=async()=>{refreshButton.disabled=true;try{await refresh();message='Live suggestions refreshed and saved merchant rules checked.';}catch(e){message=e.message;}finally{render();}};body.append(refreshButton);
  const bar=make('div');bar.className='bar';const select=make('button','Select matching suggestions'),clear=make('button','Clear suggestion selection'),apply=make('button','Confirm selected suggestions'),count=make('span');select.className=clear.className='secondary';const update=()=>{count.textContent=selected.size+' selected';apply.disabled=!!s.busy || !s.extensionMode || s.sample || !selected.size;};select.onclick=()=>{selected=new Set(known);render();};clear.onclick=()=>{selected.clear();render();};select.disabled=!known.size || s.busy;update();bar.append(select,clear,apply,count);body.append(bar,make('p',message),debugLink('suggestionTools'));
  apply.onclick=async()=>{running=true;let done=0,stop=false;const panel=make('div');panel.className='transfer-run-progress';const progress=make('p'),pause=make('button','Stop after current suggestion');pause.onclick=()=>{stop=true;pause.disabled=true;};panel.append(progress,pause);document.body.append(panel);try{for(const t of pending.filter(t=>selected.has(t.id))){if(stop)break;const now=getState();if(now.business!==s.business || now.dataset!==s.dataset || now.workFrom!==s.workFrom)throw Error('Session changed.');progress.textContent=t.description+' · $'+(t.amount/100).toFixed(2)+' · '+t.proposed;const result=await run(t);if(!result.reviewedVerified)throw Error(result.message || 'Suggestion result needs a recheck.');done++;selected.delete(t.id);}message=done+' suggestions confirmed and reviewed.'+(stop?' Stopped after current suggestion.':'');}catch(e){message=done+' completed. Stopped: '+e.message;}finally{running=false;panel.remove();render();}};
  debug.replaceChildren(make('pre',JSON.stringify({scanned:audit.scanned,detected:audit.detected,needsRefresh:audit.needsRefresh,counts:audit.counts,rows:audit.rows},null,2)));
  if(!all.length && audit.rows.length){const why=make('details');why.append(make('summary','Why suggestions are not ready'));for(const row of audit.rows)why.append(make('p',row.description+' · Wave: '+row.waveCategory+' · Approved: '+(row.approvedCategory || 'No approved target')+' · '+row.reason));body.append(why);}for(const t of pending){const row=make('div');row.className='transfer-card';const box=make('input');box.type='checkbox';box.checked=selected.has(t.id);box.disabled=!eligible(t);box.setAttribute('aria-label','Select suggestion '+t.id);box.onchange=()=>{if(box.checked)selected.add(t.id);else selected.delete(t.id);update();};const label=make('label',t.description+' · $'+(t.amount/100).toFixed(2));label.prepend(box);row.append(label,make('p',t.date+' · '+t.primary.account+' → '+t.proposed));const open=make('button','Inspect suggestion');open.className='secondary';open.onclick=()=>inspect(t);row.append(open);
   const r=receipt(t);if(r){row.append(make('p',r.message));const check=make('button','Recheck saved suggestion');check.className='secondary';check.onclick=async()=>{check.disabled=true;try{const result=await recheck(t);message=result.message;}catch(e){message=e.message;}finally{render();}};row.append(check);debug.append(make('pre',JSON.stringify(r,null,2)));}
   body.append(row);
  }
  const copy=make('button','Copy suggestion diagnostics');copy.className='secondary';copy.onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify({business:s.business,audit:{scanned:audit.scanned,detected:audit.detected,needsRefresh:audit.needsRefresh,counts:audit.counts,rows:audit.rows,eligibleIds:audit.eligible.map(t=>t.id)},records:report()?.records?.filter(r=>r.waveSuggestion),collectionDiagnostics:report()?.tableDiagnostics,receipts:all.map(t=>({id:t.id,result:receipt(t)}))},null,2));copy.textContent='Copied';}catch{copy.textContent='Clipboard unavailable';}};debug.append(copy);
 }
 return {render};
}
