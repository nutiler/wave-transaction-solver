// Self-contained DOM adapter: injected only into PayPal's Activity Download page.
export async function paypalPage(request={},testContext) {
 let submitted=false;
 try{
 const doc=testContext?.document||document,loc=testContext?.location||location,win=doc.defaultView||window;
 const pause=testContext?.pause||(()=>new Promise(resolve=>setTimeout(resolve,250)));
 const text=e=>String(e?.innerText||e?.textContent||'').trim().replace(/\s+/g,' ');
 const visible=e=>!!e&&e.isConnected&&!e.hidden&&e.getAttribute('aria-hidden')!=='true'&&e.getClientRects().length>0&&win.getComputedStyle(e).visibility!=='hidden';
 const all=selector=>[...doc.querySelectorAll(selector)].filter(visible),clickable=()=>all('button,a,[role="button"]');
 const exact=(elements,value)=>elements.filter(e=>text(e).toLowerCase()===value.toLowerCase());
 const actionTarget=control=>{const candidates=[...control.querySelectorAll('div,span')].filter(visible).filter(e=>text(e)===text(control));const leaves=candidates.filter(e=>!candidates.some(child=>child!==e&&e.contains(child)));return leaves.length===1?leaves[0]:control;};
 const activate=e=>{if(!e)return;const common={bubbles:true,cancelable:true,view:win,button:0,detail:1};if(win.PointerEvent)e.dispatchEvent(new win.PointerEvent('pointerdown',{...common,buttons:1,pointerId:1,pointerType:'mouse',isPrimary:true}));e.dispatchEvent(new win.MouseEvent('mousedown',{...common,buttons:1}));if(win.PointerEvent)e.dispatchEvent(new win.PointerEvent('pointerup',{...common,buttons:0,pointerId:1,pointerType:'mouse',isPrimary:true}));e.dispatchEvent(new win.MouseEvent('mouseup',{...common,buttons:0}));if(typeof e.click==='function')e.click();else e.dispatchEvent(new win.MouseEvent('click',common));};
 if(loc.origin!=='https://www.paypal.com'||!/^\/reports\/dlog\/?$/.test(loc.pathname))throw Error('Open the signed-in PayPal Activity download page.');
 if(!all('h1,h2,h3,h4,span,p,div').some(e=>/^Activity report$/i.test(text(e))))throw Error('PayPal reports are not ready. Wait for the Activity report page to load.');
 const date=value=>{let v=text({textContent:value}),m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)v=m[3]+'-'+m[request.dateOrder==='dmy'?2:1].padStart(2,'0')+'-'+m[request.dateOrder==='dmy'?1:2].padStart(2,'0');else if(!/^\d{4}-\d{2}-\d{2}$/.test(v)){const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];m=v.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*|\s+)(\d{4})$/);if(!m)return null;const month=months.indexOf(m[1].slice(0,3).toLowerCase())+1;if(!month)return null;v=m[3]+'-'+String(month).padStart(2,'0')+'-'+m[2].padStart(2,'0');}return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:null;};
 const identity=row=>{const cells=[...row.querySelectorAll('td,[role="cell"]')].map(text);if(cells.length<5)return null;const range=cells[2].split(/\s+[–—-]\s+|\s*[–—]\s*|\s*-\s*(?=[A-Za-z])|\s+to\s+/i);if(range.length!==2)return null;const start=date(range[0]),end=date(range[1]),type=cells[0],format=cells[3].toUpperCase();if(!start||!end||end<start||!['All transactions','Balance affecting'].includes(type)||!['CSV','PDF','TAB'].includes(format))return null;const buttons=exact([...row.querySelectorAll('a,button,[role="button"]')].filter(visible),'Download');return {type,start,end,format,requestDate:date(cells[1]),ready:buttons.length===1&&!buttons[0].disabled,status:buttons.length===1?'Ready':cells[4]};};
 const reportRows=()=>{
  const found=all('table,[role="table"]').filter(table=>{const headers=[...table.querySelectorAll('thead th,thead td,th,[role="columnheader"]')].map(text);return ['Report type','Date range','Format','Action'].every(label=>headers.some(h=>h.toLowerCase()===label.toLowerCase()));}).flatMap(table=>[...table.querySelectorAll('tr,[role="row"]')].filter(visible).map(row=>({row,report:identity(row)})).filter(r=>r.report));
  const seen=new Set();for(const entry of found){let token=entry.row.getAttribute('data-wave-solver-report');if(!token||seen.has(token)){token=win.crypto.randomUUID();entry.row.setAttribute('data-wave-solver-report',token);}seen.add(token);entry.report.rowToken=token;}
  return found;
 };
 const labelText=e=>{const copy=e.cloneNode(true);copy.querySelectorAll('select,input,button,[role="combobox"]').forEach(child=>child.remove());return text(copy);};
 const label=e=>{const aria=e.getAttribute('aria-label'),ids=(e.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean);return aria||ids.map(id=>text(doc.getElementById(id))).filter(Boolean).join(' ')||(e.labels?[...e.labels].map(labelText).join(' '):'');};
 const field=pattern=>{
  const controls='select,input:not([type="hidden"]):not([type="password"]),[role="combobox"],button';
  const known=['Transaction type','Date range','Format','Start date','End date','From','To','Start','End'];
  const candidates=all(controls).filter(e=>pattern.test(label(e)||'')||known.some(name=>pattern.test(name)&&text(e).toLowerCase().startsWith(name.toLowerCase()+' ')));
  if(candidates.length===1)return candidates[0];
  const nearby=all('label,legend').filter(e=>pattern.test(labelText(e))).flatMap(l=>[...l.parentElement.querySelectorAll(controls)].filter(visible)),unique=[...new Set(nearby)];
  if(unique.length===1)return unique[0];
  const dateFields=all('input:not([type="hidden"]):not([type="password"])').filter(e=>pattern.test(String(e.name||e.id).replace(/[_-]/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^(start|end)$/i,'$1 date')));
  if(dateFields.length===1)return dateFields[0];
  // PayPal also uses a small clickable DIV containing the label and selected value.
  const boxes=all('span,div,p,label').filter(e=>pattern.test(text(e))).map(e=>{
   for(let parent=e.parentElement,depth=0;parent&&depth<3;parent=parent.parentElement,depth++){
    const value=text(parent);if(value.length>150||/Create Report|Activity report/i.test(value))break;
    const nested=[...parent.querySelectorAll(controls)].filter(visible);if(nested.length===1)return nested[0];
    if(parent.matches('[role="button"],[role="combobox"],[tabindex]')||parent.tagName==='DIV'&&value!==text(e)&&value.toLowerCase().startsWith(text(e).toLowerCase()))return parent;
   }return null;
  }).filter(Boolean);
  const distinct=[...new Set(boxes)];return distinct.length===1?distinct[0]:null;
 };
 const startPattern=/^(Start date|From date|From|Start)$/i,endPattern=/^(End date|To date|To|End)$/i;
 const chosen=e=>String(e?.tagName==='SELECT'?text(e.selectedOptions[0]):e?.tagName==='INPUT'?e.value:text(e)).replace(/^(Transaction type|Date range|Format)\s*/i,'').trim();
 const listState=()=>{const tables=all('table,[role="table"]').filter(table=>['Report type','Date range','Format','Action'].every(name=>[...table.querySelectorAll('th,[role="columnheader"]')].some(e=>text(e).toLowerCase()===name.toLowerCase())));const rows=tables.flatMap(table=>[...table.querySelectorAll('tr,[role="row"]')].filter(visible).filter(row=>row.querySelector('td,[role="cell"]')));const root=all('h1,h2,h3,h4').find(e=>/^Activity report$/i.test(text(e)))?.closest('section,[data-test-id="DLOG-page"],[data-testid="DLOG-page"]')||doc;const loading=all('[role="progressbar"],[aria-busy="true"],[data-testid="spinner"],[data-test-id="spinner"]').filter(e=>root.contains(e));return {reportListComplete:tables.length===1&&rows.every(row=>!!identity(row))&&!loading.length&&!all('[role="alert"]').some(e=>/error|invalid|failed|try again/i.test(text(e))),reportListRows:rows.length};};
 const calendarDiagnostics=()=>{const wrappers=all('.calendarWrapper'),roots=wrappers.length?wrappers:all('.Calendar');return roots.slice(0,4).map(root=>{const cells=[...root.querySelectorAll('td[id]')].filter(visible),ids=cells.map(e=>e.id).filter(id=>/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(id));return {dateCells:ids.length,months:[...new Set(ids.map(id=>{const parts=id.split('/');return parts[2]+'-'+parts[0].padStart(2,'0');}))],previous:[...root.querySelectorAll('.prev,[aria-label*="Previous"],[aria-label*="previous"]')].filter(visible).map(e=>({tag:e.tagName,disabled:!!e.closest('[disabled],[aria-disabled="true"],.disabled')})),next:[...root.querySelectorAll('.next,[aria-label*="Next"],[aria-label*="next"]')].filter(visible).map(e=>({tag:e.tagName,disabled:!!e.closest('[disabled],[aria-disabled="true"],.disabled')}))};});};
 const availableThrough=()=>{const values=all('p,div,span').map(text).map(value=>value.match(/^Data is updated as of\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})(?:\s|$)/i)).filter(Boolean).map(match=>date(match[1])).filter(Boolean);const unique=[...new Set(values)];return unique.length===1?unique[0]:null;};
 const snapshot=()=>({availableThrough:availableThrough(),...listState(),calendars:calendarDiagnostics(),format:'wave-solver-paypal-controls',version:1,reportPage:true,reports:reportRows().map(x=>x.report),fields:['Transaction type','Date range','Format','Start date','End date'].map(name=>{const e=field(name==='Start date'?startPattern:name==='End date'?endPattern:new RegExp('^'+name+'$','i'));return {name,found:!!e,value:chosen(e)||'',tag:e?.tagName||'',role:e?.getAttribute('role')||'',inputType:e?.getAttribute('type')||'',id:e?.id||'',readOnly:!!e?.readOnly};}),error:all('[role="alert"]').map(text).join(' ').slice(0,300)});
 if(!request.action||request.action==='read')return snapshot();
 if(request.action==='refresh'){const found=exact(clickable(),'Refresh');if(found.length!==1||found[0].disabled)throw Error('Cannot identify the report Refresh button.');found[0].click();await pause();return snapshot();}
 if(['prepare','create'].includes(request.action)) {
  if(!date(request.start)||!date(request.end)||request.end<request.start||request.start.slice(0,4)!==request.end.slice(0,4)||Date.parse(request.end)-Date.parse(request.start)>366*86400000||request.type!=='All transactions'||request.format!=='CSV')throw Error('Invalid annual report request.');
  const before=reportRows().filter(x=>x.report.type===request.type&&x.report.start===request.start&&x.report.end===request.end&&x.report.format==='CSV');if(before.length&&!request.forceNew)return {existing:true};
  async function select(pattern,wanted){const e=field(pattern);if(!e)return false;if(chosen(e)?.toLowerCase()===wanted.toLowerCase())return true;if(e.disabled||e.getAttribute('aria-disabled')==='true')return false;
   if(e.tagName==='SELECT'){const matches=[...e.options].filter(o=>text(o).toLowerCase()===wanted.toLowerCase()&&!o.disabled);if(matches.length!==1)return false;const setter=Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype,'value').set;setter.call(e,matches[0].value);e.dispatchEvent(new win.Event('input',{bubbles:true}));e.dispatchEvent(new win.Event('change',{bubbles:true}));await pause();return chosen(field(pattern))?.toLowerCase()===wanted.toLowerCase();}
   function choices(){
    let linked=[...new Set([...(e.getAttribute('aria-controls')||'').split(/\s+/).filter(Boolean).map(id=>doc.getElementById(id)),...all('[aria-labelledby]').filter(menu=>e.id&&(menu.getAttribute('aria-labelledby')||'').split(/\s+/).includes(e.id))].filter(visible))].filter(root=>root.querySelector('a,button,li,[role="option"],[role="menuitem"]'));
    linked=linked.filter(child=>!linked.some(parent=>child!==parent&&parent.contains(child)));if(linked.length>1)return [];
    const candidates=all('[role="option"],[role="menuitem"],[role="button"],button,a,li,span,div').filter(option=>option!==e&&!option.contains(e)&&!option.closest('table,[role="table"]')&&(!linked.length||linked[0].contains(option)));
    const found=exact(candidates,wanted);return found.filter(parent=>!found.some(child=>child!==parent&&parent.contains(child)));
   }
   let found=choices();if(!found.length){activate(e);for(let i=0;i<12;i++){await pause();found=choices();if(found.length)break;}}
   if(found.length!==1||found[0].closest('[disabled],[aria-disabled="true"],.disabled'))return false;
   activate(found[0]);for(let i=0;i<12;i++){await pause();if(chosen(field(pattern))?.toLowerCase()===wanted.toLowerCase())return true;}return false;
  }
  if(!await select(/^Transaction type$/i,'All transactions')||!await select(/^Format$/i,'CSV'))return {notSubmitted:true,message:'Set Transaction type to All transactions and Format to CSV in PayPal, then Resume. Nothing requested.'};
  const rangeExact=()=>{const values=chosen(field(/^Date range$/i)).match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]+\s+\d{1,2}(?:,\s*|\s+)\d{4}/g)||[];return values.length===2&&date(values[0])===request.start&&date(values[1])===request.end;};
  if(!rangeExact()){
   const range=field(/^Date range$/i);
   if(range&&(!field(startPattern)||!field(endPattern))){
    if(range.tagName==='SELECT'){for(const option of ['Custom','Custom date range','Custom range']){if(await select(/^Date range$/i,option))break;}}
    else{activate(range);for(let i=0;i<12;i++){await pause();if(field(startPattern)&&field(endPattern))break;}if((!field(startPattern)||!field(endPattern))&&doc.activeElement!==range){range.focus?.();await pause();}if(!field(startPattern)||!field(endPattern)){
     let custom=all('[role="option"],[role="menuitem"],button,li').filter(e=>/^(Custom|Custom date range|Custom range)$/i.test(text(e)));
     if(custom.length===1){activate(custom[0]);await pause();}
    }}
   }
   const start=field(startPattern),end=field(endPattern);
   if(!start||!end||start.tagName!=='INPUT'||end.tagName!=='INPUT'||[start,end].some(e=>e.disabled))return {notSubmitted:true,message:'Open Date range and choose Custom dates. Read/copy report controls with the date panel open, then Resume. Nothing requested.'};

   // Type FROM, select its calendar day to commit, then do TO. Reacquire each rendered field.
   const sequence=date(end.value)&&request.start>date(end.value)?[[endPattern,request.end],[startPattern,request.start]]:[[startPattern,request.start],[endPattern,request.end]];
   const monthNames=['january','february','march','april','may','june','july','august','september','october','november','december'];
   const monthValue=e=>{const m=text(e).match(/^([A-Za-z]+)\s*(\d{4})$/),month=m&&monthNames.indexOf(m[1].toLowerCase());return m&&month>=0?Number(m[2])*12+month:null;};
   const enabled=e=>!e.disabled&&!e.closest('[disabled],[aria-disabled="true"],.disabled');
   const cellDate=e=>{const m=String(e.id||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'):date(e.id);};
   const scope=input=>{const box=input?.closest('.DateInputBox');return box&&[...box.querySelectorAll('.Calendar,.calendarWrapper')].some(visible)?box:doc;};
   const calendar=input=>{
    const root=scope(input),found=[];
    // Derive the displayed month from the provider's dated TDs. The heading may
    // be split into separate month/year nodes or live in a table caption.
    const tables=all('.Calendar table,.calendarWrapper table').filter(table=>root.contains(table));
    for(const table of [...new Set(tables)]){
     const cells=[...table.querySelectorAll('td[id]')].filter(visible).filter(e=>cellDate(e));if(cells.length<7)continue;
     const counts=new Map();for(const cell of cells){const key=cellDate(cell).slice(0,7);counts.set(key,(counts.get(key)||0)+1);}const ranked=[...counts].sort((a,b)=>b[1]-a[1]);if(!ranked.length||ranked[0][1]<7||ranked[1]?.[1]===ranked[0][1])continue;
     const month=Number(ranked[0][0].slice(0,4))*12+Number(ranked[0][0].slice(5,7))-1,panel=table.closest('.calendarWrapper')||table.closest('.Calendar')||table.parentElement;
     let headings=[...panel.querySelectorAll('h2,h3,h4,span,div,p,caption,th,b,strong,[aria-live]')].filter(visible).filter(e=>monthValue(e)===month);headings=headings.filter(e=>!headings.some(child=>child!==e&&e.contains(child)));
     found.push({heading:headings.length===1?headings[0]:null,panel,cells,days:cells,month});
    }
    if(found.length)return found.length===1?found[0]:null;
    let headings=all('h2,h3,h4,span,div,p,caption,th,b,strong,[aria-live]').filter(e=>root.contains(e)&&monthValue(e)!==null);headings=headings.filter(e=>!headings.some(child=>child!==e&&e.contains(child)));
    for(const heading of headings){for(let panel=heading.parentElement,depth=0;panel&&panel!==doc.body&&depth<6;panel=panel.parentElement,depth++){
     let days=[...panel.querySelectorAll('button,a,[role="button"],[role="gridcell"],td,span,div')].filter(visible).filter(e=>/^(?:[1-9]|[12]\d|3[01])$/.test(text(e)));days=days.filter(e=>!days.some(child=>child!==e&&e.contains(child)));
     if(days.length>=7&&days.length<=42){found.push({heading,panel,days,month:monthValue(heading)});break;}
    }}return found.length===1?found[0]:null;
   };
   function dated(input,iso){return all('.Calendar td[id],.calendarWrapper td[id]').filter(e=>scope(input).contains(e)&&cellDate(e)===iso&&enabled(e));}
   function committed(pattern,iso){if(date(field(pattern)?.value)!==iso)return false;const values=chosen(field(/^Date range$/i)).match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/g)||[];return values.length!==2||date(values[pattern===startPattern?0:1])===iso;}
   async function chooseDay(input,pattern,iso){const cells=dated(input,iso);if(cells.length>1)return false;if(!cells.length)return null;const actions=[...cells[0].querySelectorAll('a,button')].filter(visible);if(actions.length>1||actions[0]&&!enabled(actions[0]))return false;activate(actions[0]||cells[0]);await pause();return committed(pattern,iso);}
   async function pick(pattern,iso){
    let input=field(pattern);if(!input)return false;let selected=await chooseDay(input,pattern,iso);if(selected!==null)return selected;
    let cal=calendar(input);if(!cal){activate(input);await pause();input=field(pattern);cal=calendar(input);}
    if(!cal){const box=input.closest('.DateInputBox')||input.parentElement,buttons=[...box.querySelectorAll('button,[role="button"]')].filter(visible);if(buttons.length===1){activate(buttons[0]);await pause();cal=calendar(field(pattern));}}
    if(!cal)return null;const target=Number(iso.slice(0,4))*12+Number(iso.slice(5,7))-1;if(Math.abs(target-cal.month)>120)return false;
    for(let step=0;cal.month!==target&&step<120;step++){
     const direction=target<cal.month?-1:1,controls=[...cal.panel.querySelectorAll('button,a,[role="button"],[tabindex],svg,span,div')].filter(visible).filter(e=>!cal.days.some(day=>day===e||day.contains(e)));
     const description=e=>[e.getAttribute('aria-label'),e.title,e.getAttribute('data-icon'),typeof e.className==='string'?e.className:'',text(e)].join(' ');
     let nav=controls.filter(e=>new RegExp(direction<0?'previous|prev|back|(?:arrow|chevron)[-_ ]?left':'next|forward|(?:arrow|chevron)[-_ ]?right','i').test(description(e))||new RegExp(direction<0?'^(?:<|\u2039|\u00ab|\u2190|\u276e)$':'^(?:>|\u203a|\u00bb|\u2192|\u276f)$').test(text(e)));
     if(!nav.length&&cal.heading){const hr=cal.heading.getBoundingClientRect(),firstDay=Math.min(...cal.days.map(e=>e.getBoundingClientRect().top));nav=controls.filter(e=>!text(e).match(/\d|[A-Za-z]/)&&(()=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<firstDay&&Math.abs((r.top+r.bottom)/2-(hr.top+hr.bottom)/2)<Math.max(hr.height,r.height)&& (direction<0?r.right<=hr.left:r.left>=hr.right);})());}
     nav=nav.filter(e=>!nav.some(child=>child!==e&&e.contains(child)));const targets=[...new Set(nav.map(e=>{const arrow=e.closest('.prev,.next');return arrow&&cal.panel.contains(arrow)?arrow:e.closest('button,a,[role="button"],[tabindex]')||e;}))];
     if(targets.length!==1||!enabled(targets[0]))return false;const previous=cal.month;activate(targets[0]);for(let i=0;i<8;i++){await pause();cal=calendar(field(pattern));if(cal&&cal.month!==previous)break;}if(!cal||cal.month!==previous+direction)return false;
    }
    if(cal.month!==target)return false;selected=await chooseDay(field(pattern),pattern,iso);if(selected!==null)return selected;
    const day=Number(iso.slice(8,10)),days=cal.days.filter(e=>Number(text(e))===day&&enabled(e)&&!/(outside|other)[-_ ]?month/i.test(e.className||''));
    if(days.length!==1)return false;activate(days[0]);await pause();return committed(pattern,iso);
   }
   for(const [pattern,iso] of sequence){
    let input=field(pattern);if(!input||input.disabled)return {notSubmitted:true,message:'PayPal date controls changed. Nothing requested.'};
    input.focus();activate(input);await pause();input=field(pattern);if(!input||input.disabled)return {notSubmitted:true,message:'PayPal date controls changed after opening the calendar. Nothing requested.'};
    if(!input.readOnly){
     const month=String(Number(iso.slice(5,7))),day=String(Number(iso.slice(8,10))),value=input.type==='date'?iso:(request.dateOrder==='dmy'?day+'/'+month:month+'/'+day)+'/'+iso.slice(0,4);
     Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set.call(input,value);
     input.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));input.dispatchEvent(new win.Event('change',{bubbles:true}));(field(pattern)||input).dispatchEvent(new win.KeyboardEvent('keyup',{bubbles:true,key:value.slice(-1),code:'Digit'+value.slice(-1)}));await pause();
    }
    if(await pick(pattern,iso)===false){
     // Only the oldest FROM boundary may advance, and only to a date visibly
     // selectable in this same provider calendar. Never infer a day or alter TO.
     let adjusted=false;
     if(pattern===startPattern&&request.oldestBoundary){
      const cal=calendar(field(pattern)),target=Number(iso.slice(0,4))*12+Number(iso.slice(5,7))-1;
      if(cal?.month===target&&cal.cells){
       const unavailable=cal.cells.filter(e=>cellDate(e)===iso),selectable=cal.cells.filter(e=>enabled(e)&&cellDate(e)>=iso&&cellDate(e)<=request.end&&[...e.querySelectorAll('a,button')].filter(visible).some(enabled)).sort((a,b)=>cellDate(a).localeCompare(cellDate(b)));
       if(unavailable.length===1&&!enabled(unavailable[0])&&selectable.length){const earliest=cellDate(selectable[0]);if(await chooseDay(field(pattern),pattern,earliest)){request.originalStart=request.start;request.start=earliest;adjusted=true;}}
      }
     }
     if(!adjusted)return {notSubmitted:true,calendarBoundary:pattern===startPattern&&!!request.oldestBoundary,message:'PayPal could not lock the exact calendar day. Nothing requested.'};
    }
    field(pattern)?.blur();await pause();
    if(date(field(pattern)?.value)!==(pattern===startPattern?request.start:request.end))return {notSubmitted:true,message:'PayPal did not commit the requested date. Nothing requested.'};
   }
   const fieldsExact=()=>date(field(startPattern)?.value)===request.start&&date(field(endPattern)?.value)===request.end;
   if(!fieldsExact())return {notSubmitted:true,message:'PayPal did not retain the requested start/end dates. Nothing requested.'};
   // Commit an open custom-date panel before creating the report.
   let panel=field(startPattern)?.parentElement;while(panel&&!panel.contains(field(endPattern)))panel=panel.parentElement;
   const apply=panel&&panel!==doc.body?[...panel.querySelectorAll('button,[role="button"]')].filter(visible).filter(e=>/^(Apply|Done|Save|Set dates|Confirm)$/i.test(text(e))):[];
   if(apply.length>1)return {notSubmitted:true,message:'Custom date panel has multiple confirmation controls. Apply the dates manually, then Resume.'};
   if(apply.length===1){if(apply[0].disabled)return {notSubmitted:true,message:'Custom dates cannot be applied yet. Nothing requested.'};apply[0].click();await pause();}
  }
  // Close the date popup with an outside click before Create; some provider handlers
  // consume the first outside click only to dismiss the calendar.
  const headings=all('h1,h2,h3,h4').filter(e=>/^Activity report$/i.test(text(e)));if(headings.length===1){activate(headings[0]);await pause();}
  const selectedRange=chosen(field(/^Date range$/i))||'',rangeDates=selectedRange.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]+\s+\d{1,2}(?:,\s*|\s+)\d{4}/g)||[];
  const rangeMatches=rangeDates.length===2&&date(rangeDates[0])===request.start&&date(rangeDates[1])===request.end;
  const inputsMatch=date(field(startPattern)?.value)===request.start&&date(field(endPattern)?.value)===request.end;
  if(!(rangeMatches||inputsMatch&&/^(Custom|Custom date range|Custom range)$/i.test(selectedRange))||chosen(field(/^Transaction type$/i))!=='All transactions'||chosen(field(/^Format$/i)).toUpperCase()!=='CSV')return {notSubmitted:true,message:'PayPal’s displayed dates/type/format do not match the requested report. Nothing requested.'};
  if(request.action==='prepare')return {prepared:true,start:request.start,end:request.end,originalStart:request.originalStart||null};
  const create=exact(clickable(),'Create Report');if(create.length!==1||create[0].disabled)return {notSubmitted:true,message:'Create Report is unavailable. Check the date range in PayPal, then Resume.'};
  submitted=true;activate(actionTarget(create[0]));await pause();const after=reportRows().filter(x=>x.report.type===request.type&&x.report.start===request.start&&x.report.end===request.end&&x.report.format==='CSV');
  const confirmed=request.forceNew?after.length>before.length||after.filter(x=>!x.report.ready).length>before.filter(x=>!x.report.ready).length:after.length>0;
  return {clicked:true,submitted:confirmed,newReportToken:confirmed?after[0]?.report.rowToken:null};
 }
 if(request.action!=='download')throw Error('Unsupported PayPal report action.');
 const selected=reportRows().filter(x=>x.report.type===request.type&&x.report.start===request.start&&x.report.end===request.end&&x.report.format==='CSV'&&x.report.ready);
 const identified=request.rowToken?selected.filter(x=>x.report.rowToken===request.rowToken):selected;
 if(identified.length!==1)throw Error('The exact ready CSV report could not be identified. Read the report list again; nothing downloaded.');
 const control=exact([...identified[0].row.querySelectorAll('a,button,[role="button"]')].filter(visible),'Download')[0];
 const href=control.getAttribute('href');
 if(href&&!href.startsWith('#')&&!/^javascript:/i.test(href)) {
  const url=new URL(href,loc.href);if(url.origin!==loc.origin||url.username||url.password||!/^\/reports\//.test(url.pathname))throw Error('The download link is outside PayPal Reports. Download this CSV manually and drop it in data/paypal.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{const response=await win.fetch(url.href,{method:'GET',credentials:'include',redirect:'error',signal:controller.signal});if(!response.ok||!response.body)throw Error('PayPal CSV download failed; log in again and Resume.');const reader=response.body.getReader(),chunks=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>30*1024*1024){await reader.cancel();throw Error('Report exceeds 30 MB. Request a shorter period.');}chunks.push(part.value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}if(bytes[0]===80&&bytes[1]===75)throw Error('PayPal returned a ZIP. Download it manually, extract its CSVs into data/paypal, or request shorter periods.');return {text:new TextDecoder().decode(bytes)};}finally{clearTimeout(timer);}
 }
 // Capture only the CSV blob produced by this explicitly selected report download.
 const original=win.URL.createObjectURL,originalClick=win.HTMLAnchorElement.prototype.click,blobs=new Map(),captured=new Set(),captures=[];let error=null;
 win.URL.createObjectURL=function(blob){const url=original.call(this,blob);if(blob instanceof win.Blob&&blob.size<=30*1024*1024)blobs.set(url,blob);return url;};
 win.HTMLAnchorElement.prototype.click=function(){const blob=blobs.get(this.href),csv=blob&&(/\.csv$/i.test(this.download||'')||/^(text\/csv|application\/csv|text\/comma-separated-values)(?:;|$)/i.test(blob.type||''));if(csv){if(!captured.has(this.href)){captured.add(this.href);captures.push(blob.text().then(value=>{if(value.startsWith('PK'))throw Error('PayPal returned a ZIP; extract its CSVs manually into data/paypal.');return value;}));}return;}return originalClick.call(this);};
 try{submitted=true;activate(actionTarget(control));for(let i=0;i<20&&!captures.length;i++)await pause();if(captures.length!==1)throw Error('No single CSV blob was produced. Download the report manually and drop it in data/paypal.');const value=await captures[0];if(loc.origin!=='https://www.paypal.com'||!/^\/reports\/dlog\/?$/.test(loc.pathname))throw Error('PayPal left the report page during download. Nothing saved.');return {text:value};}catch(e){error=e;throw error;}finally{win.URL.createObjectURL=original;win.HTMLAnchorElement.prototype.click=originalClick;}
 }catch(error){
  if(!request.bridge)throw error;
  const message=String(error?.message||'Provider controls could not be read.').replace(/https?:\/\/\S+/g,'[URL]').slice(0,400);
  return {helperError:{message,retryable:/not ready|Wait for|wait for|not.*loaded|context.*destroyed/i.test(message)},downloadStarted:request.action==='download'&&submitted,notSubmitted:['generate','prepare','create','request'].includes(request.action)&&!submitted};
 }
}
