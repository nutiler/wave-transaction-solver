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
 if(loc.origin!=='https://www.paypal.com'||!/^\/reports\/dlog\/?$/.test(loc.pathname))throw Error('Open the signed-in PayPal Activity download page.');
 if(!all('h1,h2,h3,h4,span,p,div').some(e=>/^Activity report$/i.test(text(e))))throw Error('PayPal reports are not ready. Wait for the Activity report page to load.');
 const date=value=>{let v=text({textContent:value}),m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)v=m[3]+'-'+m[request.dateOrder==='dmy'?2:1].padStart(2,'0')+'-'+m[request.dateOrder==='dmy'?1:2].padStart(2,'0');else if(!/^\d{4}-\d{2}-\d{2}$/.test(v)){const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];m=v.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*|\s+)(\d{4})$/);if(!m)return null;const month=months.indexOf(m[1].slice(0,3).toLowerCase())+1;if(!month)return null;v=m[3]+'-'+String(month).padStart(2,'0')+'-'+m[2].padStart(2,'0');}return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:null;};
 const identity=row=>{const cells=[...row.querySelectorAll('td,[role="cell"]')].map(text);if(cells.length<5)return null;const range=cells[2].split(/\s+[–—-]\s+|\s*[–—]\s*|\s*-\s*(?=[A-Za-z])|\s+to\s+/i);if(range.length!==2)return null;const start=date(range[0]),end=date(range[1]),type=cells[0],format=cells[3].toUpperCase();if(!start||!end||end<start||!['All transactions','Balance affecting'].includes(type)||!['CSV','PDF','TAB'].includes(format))return null;const buttons=exact([...row.querySelectorAll('a,button,[role="button"]')].filter(visible),'Download');return {type,start,end,format,ready:buttons.length===1&&!buttons[0].disabled,status:buttons.length===1?'Ready':cells[4]};};
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
 const snapshot=()=>({...listState(),format:'wave-solver-paypal-controls',version:1,reportPage:true,reports:reportRows().map(x=>x.report),fields:['Transaction type','Date range','Format','Start date','End date'].map(name=>{const e=field(name==='Start date'?startPattern:name==='End date'?endPattern:new RegExp('^'+name+'$','i'));return {name,found:!!e,value:chosen(e)||'',tag:e?.tagName||'',role:e?.getAttribute('role')||'',inputType:e?.getAttribute('type')||'',id:e?.id||'',readOnly:!!e?.readOnly};}),error:all('[role="alert"]').map(text).join(' ').slice(0,300)});
 if(!request.action||request.action==='read')return snapshot();
 if(request.action==='refresh'){const found=exact(clickable(),'Refresh');if(found.length!==1||found[0].disabled)throw Error('Cannot identify the report Refresh button.');found[0].click();await pause();return snapshot();}
 if(['prepare','create'].includes(request.action)) {
  if(!date(request.start)||!date(request.end)||request.end<request.start||request.start.slice(0,4)!==request.end.slice(0,4)||Date.parse(request.end)-Date.parse(request.start)>366*86400000||request.type!=='All transactions'||request.format!=='CSV')throw Error('Invalid annual report request.');
  const before=reportRows().filter(x=>x.report.type===request.type&&x.report.start===request.start&&x.report.end===request.end&&x.report.format==='CSV');if(before.length)return {existing:true};
  async function select(pattern,wanted){const e=field(pattern);if(!e)return false;if(chosen(e)?.toLowerCase()===wanted.toLowerCase())return true;if(e.disabled||e.getAttribute('aria-disabled')==='true')return false;
   if(e.tagName==='SELECT'){const matches=[...e.options].filter(o=>text(o).toLowerCase()===wanted.toLowerCase()&&!o.disabled);if(matches.length!==1)return false;const setter=Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype,'value').set;setter.call(e,matches[0].value);e.dispatchEvent(new win.Event('input',{bubbles:true}));e.dispatchEvent(new win.Event('change',{bubbles:true}));await pause();return chosen(field(pattern))?.toLowerCase()===wanted.toLowerCase();}
   e.click();await pause();
   const linked=[...new Set([...(e.getAttribute('aria-controls')||'').split(/\s+/).filter(Boolean).map(id=>doc.getElementById(id)),...all('[aria-labelledby]').filter(menu=>e.id&&(menu.getAttribute('aria-labelledby')||'').split(/\s+/).includes(e.id))].filter(visible))];
   if(linked.length>1)return false;
   const candidates=all('[role="option"],[role="menuitem"],[role="button"],button,a,li,span,div').filter(option=>!linked.length||linked[0].contains(option));
   let choices=exact(candidates,wanted);choices=choices.filter(parent=>!choices.some(child=>child!==parent&&parent.contains(child)));
   if(choices.length!==1||choices[0].closest('[disabled],[aria-disabled="true"],.disabled'))return false;
   choices[0].click();for(let i=0;i<12;i++){await pause();if(chosen(field(pattern))?.toLowerCase()===wanted.toLowerCase())return true;}return false;
  }
  if(!await select(/^Transaction type$/i,'All transactions')||!await select(/^Format$/i,'CSV'))return {notSubmitted:true,message:'Set Transaction type to All transactions and Format to CSV in PayPal, then Resume. Nothing requested.'};
  const rangeExact=()=>{const values=chosen(field(/^Date range$/i)).match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]+\s+\d{1,2}(?:,\s*|\s+)\d{4}/g)||[];return values.length===2&&date(values[0])===request.start&&date(values[1])===request.end;};
  if(!rangeExact()){
   const range=field(/^Date range$/i);
   if(range&&(!field(startPattern)||!field(endPattern))){
    if(range.tagName==='SELECT'){for(const option of ['Custom','Custom date range','Custom range']){if(await select(/^Date range$/i,option))break;}}
    else{range.click();for(let i=0;i<12;i++){await pause();if(field(startPattern)&&field(endPattern))break;}if(!field(startPattern)||!field(endPattern)){
     let custom=all('[role="option"],[role="menuitem"],button,li').filter(e=>/^(Custom|Custom date range|Custom range)$/i.test(text(e)));
     if(custom.length===1){custom[0].click();await pause();}
    }}
   }
   const start=field(startPattern),end=field(endPattern);
   if(!start||!end||start.tagName!=='INPUT'||end.tagName!=='INPUT'||[start,end].some(e=>e.disabled))return {notSubmitted:true,message:'Open Date range and choose Custom dates. Read/copy report controls with the date panel open, then Resume. Nothing requested.'};

   // Type FROM, select its calendar day to commit, then do TO. Reacquire each rendered field.
   const sequence=date(end.value)&&request.start>date(end.value)?[[endPattern,request.end],[startPattern,request.start]]:[[startPattern,request.start],[endPattern,request.end]];
   const monthNames=['january','february','march','april','may','june','july','august','september','october','november','december'];
   const monthValue=e=>{const m=text(e).match(/^([A-Za-z]+)\s+(\d{4})$/),month=m&&monthNames.indexOf(m[1].toLowerCase());return m&&month>=0?Number(m[2])*12+month:null;};
   const calendar=()=>{
    let headings=all('h2,h3,h4,span,div,p,[aria-live]').filter(e=>monthValue(e)!==null);headings=headings.filter(e=>!headings.some(child=>child!==e&&e.contains(child)));
    const found=[];for(const heading of headings){for(let panel=heading.parentElement,depth=0;panel&&panel!==doc.body&&depth<5;panel=panel.parentElement,depth++){
     let days=[...panel.querySelectorAll('button,a,[role="button"],[role="gridcell"],td,span,div')].filter(visible).filter(e=>/^(?:[1-9]|[12]\d|3[01])$/.test(text(e)));days=days.filter(e=>!days.some(child=>child!==e&&e.contains(child)));
     if(days.length>=7&&days.length<=42){found.push({heading,panel,days,month:monthValue(heading)});break;}
    }}return found.length===1?found[0]:null;
   };
   const enabled=e=>!e.disabled&&!e.closest('[disabled],[aria-disabled="true"]');
   async function pick(pattern,iso){
    const input=field(pattern);if(!input)return false;
    // Observed PayPal calendars identify TDs by the full date (for example 12/10/2025).
    // The nested anchor has no href; its click bubbles to the provider's day handler.
    const dated=all('.Calendar td[id],.calendarWrapper td[id]').filter(e=>date(e.id)===iso&&enabled(e));
    if(dated.length>1)return false;
    if(dated.length===1){const anchors=[...dated[0].querySelectorAll('a,button')].filter(visible);if(anchors.length>1)return false;(anchors[0]||dated[0]).click();await pause();return date(field(pattern)?.value)===iso;}
    let cal=calendar();if(!cal){input.click();await pause();cal=calendar();}
    if(!cal){const box=input.closest('.DateInputBox')||input.parentElement,buttons=[...box.querySelectorAll('button,[role="button"]')].filter(visible);if(buttons.length===1){buttons[0].click();await pause();cal=calendar();}}
    if(!cal)return null;const target=Number(iso.slice(0,4))*12+Number(iso.slice(5,7))-1;if(Math.abs(target-cal.month)>120)return false;
    for(let step=0;cal.month!==target&&step<120;step++){
     const direction=target<cal.month?-1:1,controls=[...cal.panel.querySelectorAll('button,a,[role="button"],[tabindex],svg,span')].filter(visible).filter(e=>!cal.days.includes(e));
     let nav=controls.filter(e=>new RegExp(direction<0?'previous|prev|back':'next|forward','i').test([e.getAttribute('aria-label'),e.title,text(e)].join(' ')));
     if(!nav.length){const header=cal.heading.parentElement,hr=cal.heading.getBoundingClientRect();nav=controls.filter(e=>header.contains(e)&&!text(e).match(/\d/)&&(()=>{const r=e.getBoundingClientRect();return direction<0?r.right<=hr.left:r.left>=hr.right;})());}
     nav=nav.filter(e=>!nav.some(child=>child!==e&&e.contains(child)));
     if(nav.length!==1||!enabled(nav[0]))return false;const previous=cal.month,targetControl=nav[0].closest('button,a,[role="button"],[tabindex]')||nav[0];if(typeof targetControl.click==='function')targetControl.click();else targetControl.dispatchEvent(new win.MouseEvent('click',{bubbles:true}));await pause();cal=calendar();if(!cal||cal.month!==previous+direction)return false;
    }
    if(cal.month!==target)return false;const day=Number(iso.slice(8,10)),days=cal.days.filter(e=>Number(text(e))===day&&enabled(e)&&!/(outside|other)[-_ ]?month/i.test(e.className||''));
    if(days.length!==1)return false;days[0].click();await pause();return date(field(pattern)?.value)===iso;
   }
   for(const [pattern,iso] of sequence){
    const input=field(pattern);if(!input||input.disabled)return {notSubmitted:true,message:'PayPal date controls changed. Nothing requested.'};
    input.focus();input.click();await pause();
    if(!input.readOnly){
     const month=String(Number(iso.slice(5,7))),day=String(Number(iso.slice(8,10))),value=input.type==='date'?iso:(request.dateOrder==='dmy'?day+'/'+month:month+'/'+day)+'/'+iso.slice(0,4);
     Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set.call(input,value);
     input.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));input.dispatchEvent(new win.Event('change',{bubbles:true}));await pause();
    }
    if(await pick(pattern,iso)===false)return {notSubmitted:true,message:'PayPal could not lock the exact calendar day. Nothing requested.'};
    field(pattern)?.blur();await pause();
    if(date(field(pattern)?.value)!==iso)return {notSubmitted:true,message:'PayPal did not commit the requested date. Nothing requested.'};
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
  const headings=all('h1,h2,h3,h4').filter(e=>/^Activity report$/i.test(text(e)));if(headings.length===1){headings[0].click();await pause();}
  const selectedRange=chosen(field(/^Date range$/i))||'',rangeDates=selectedRange.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]+\s+\d{1,2}(?:,\s*|\s+)\d{4}/g)||[];
  const rangeMatches=rangeDates.length===2&&date(rangeDates[0])===request.start&&date(rangeDates[1])===request.end;
  const inputsMatch=date(field(startPattern)?.value)===request.start&&date(field(endPattern)?.value)===request.end;
  if(!(rangeMatches||inputsMatch&&/^(Custom|Custom date range|Custom range)$/i.test(selectedRange))||chosen(field(/^Transaction type$/i))!=='All transactions'||chosen(field(/^Format$/i)).toUpperCase()!=='CSV')return {notSubmitted:true,message:'PayPal’s displayed dates/type/format do not match the requested report. Nothing requested.'};
  if(request.action==='prepare')return {prepared:true};
  const create=exact(clickable(),'Create Report');if(create.length!==1||create[0].disabled)return {notSubmitted:true,message:'Create Report is unavailable. Check the date range in PayPal, then Resume.'};
  submitted=true;create[0].click();await pause();const confirmed=reportRows().some(x=>x.report.type===request.type&&x.report.start===request.start&&x.report.end===request.end&&x.report.format==='CSV');return {clicked:true,submitted:confirmed};
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
 const original=win.URL.createObjectURL,originalClick=win.HTMLAnchorElement.prototype.click,urls=new Set(),captures=[];let error=null;
 win.URL.createObjectURL=function(blob){const url=original.call(this,blob);if(blob instanceof win.Blob&&blob.size<=30*1024*1024){urls.add(url);captures.push(blob.text().then(value=>{if(value.startsWith('PK'))throw Error('PayPal returned a ZIP; extract its CSVs manually into data/paypal.');return value;}));}return url;};
 win.HTMLAnchorElement.prototype.click=function(){if(urls.has(this.href))return;return originalClick.call(this);};
 try{submitted=true;control.click();for(let i=0;i<20&&!captures.length;i++)await pause();if(captures.length!==1)throw Error('No single CSV blob was produced. Download the report manually and drop it in data/paypal.');const value=await captures[0];if(loc.origin!=='https://www.paypal.com'||!/^\/reports\/dlog\/?$/.test(loc.pathname))throw Error('PayPal left the report page during download. Nothing saved.');return {text:value};}catch(e){error=e;throw error;}finally{win.URL.createObjectURL=original;win.HTMLAnchorElement.prototype.click=originalClick;}
 }catch(error){
  if(!request.bridge)throw error;
  const message=String(error?.message||'Provider controls could not be read.').replace(/https?:\/\/\S+/g,'[URL]').slice(0,400);
  return {helperError:{message,retryable:/not ready|Wait for|wait for|not.*loaded|context.*destroyed/i.test(message)},downloadStarted:request.action==='download'&&submitted,notSubmitted:['generate','prepare','create','request'].includes(request.action)&&!submitted};
 }
}
