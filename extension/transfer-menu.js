// Read-only inspection of Wave's matching-transaction submenu.
export function readTransferMenu(testContext){
 const doc=testContext?.document || document,loc=testContext?.location || location,style=testContext?.getComputedStyle || getComputedStyle;
 const tidy=x=>String(x || '').replace(/\s+/g,' ').trim();
 const visible=e=>e && !e.hidden && !e.closest('[hidden],[aria-hidden="true"]') && style(e).display!=='none' && style(e).visibility!=='hidden' && e.getClientRects().length>0;
 const clean=e=>{const c=e.cloneNode(true);c.querySelectorAll('script,svg,[aria-hidden="true"],.sr-only,[role="tooltip"]').forEach(n=>n.remove());return tidy(c.textContent);};
 const url=new URL(loc.href),match=url.origin==='https://next.waveapps.com' && url.pathname.match(/^\/([0-9a-f-]{36})\/transactions\/(\d+)\/?$/i);
 const result={format:'wave-solver-transfer-menu',version:1,identity:match?{business:match[1],transaction:match[2]}:null,capturedAt:new Date().toISOString(),matchingGroups:0,createGroups:0,matchingOptions:[],createOptions:[],menuHtml:[],problems:[]};
 if(!match){result.problems.push('Open the exact transaction before reading its menu.');return result;}
 const matchingText='Select Account with Matching Transaction',createText='Select Account to Create Transfer';
 const headingNodes=(root,text)=>[...root.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p,strong,b,legend')].filter(e=>visible(e) && clean(e)===text).filter(e=>![...e.children].some(c=>visible(c) && clean(c)===text));
 const searches=[...doc.querySelectorAll('input')].filter(e=>visible(e) && /search\s+categories/i.test(tidy(e.placeholder || e.getAttribute('aria-label'))));
 const roots=new Set();
 // The section heading remains visible even when Wave changes the search markup.
 for(const heading of headingNodes(doc,matchingText)){
  for(let e=heading.parentElement,i=0;e && e!==doc.body && i<9;e=e.parentElement,i++){
   if(e.querySelector('textarea,input[type="password"],input[type="date"]'))break;
   const inputs=[...e.querySelectorAll('input')].filter(visible);
   if(inputs.length || e.matches('.wv-select__menu,[role="listbox"],[role="menu"]')){roots.add(e);break;}
  }
 }
 // Preserve useful popup markup when the user has only opened the first menu.
 if(!roots.size){for(const input of searches){for(let e=input.parentElement,i=0;e && e!==doc.body && i<9;e=e.parentElement,i++){
  if(e.querySelector('textarea,input[type="password"],input[type="date"]'))break;
  if(e.matches('.wv-select__menu,[role="listbox"],[role="menu"]') || tidy(e.textContent).includes('Transfer to Bank, Credit Card, or Loan')){roots.add(e);break;}
 }}}
 const snapshot=e=>{const c=e.cloneNode(true);c.querySelectorAll('script,textarea,input[type="password"]').forEach(n=>n.remove());for(const input of c.querySelectorAll('input'))input.removeAttribute('value');return c.outerHTML.slice(0,30000);};
 result.menuHtml=[...roots].slice(0,2).map(snapshot);
 result.searchControls=searches.slice(0,4).map(e=>({tag:e.tagName,type:e.type,placeholder:e.placeholder,ariaLabel:e.getAttribute('aria-label'),class:e.className}));
 if(roots.size!==1){result.problems.push(roots.size?'Multiple transfer menus are visible. Close extra menus and read again.':'No matching submenu was detected. Leave the matching-transaction submenu open in the money-out transaction tab.');return result;}
 const menu=[...roots][0],matching=headingNodes(menu,matchingText),create=headingNodes(menu,createText);result.matchingGroups=matching.length;result.createGroups=create.length;
 const follows=(a,b)=>!!(a.compareDocumentPosition(b)&4);
 const nodes=[...menu.querySelectorAll('[role="option"],[role="menuitem"],[role="menuitemradio"],li,button,a,.wv-list__item,.wv-dropdown__item,.wv-select__option,.wv-select__menu__option')].filter(visible);
 const options=nodes.filter(e=>!nodes.some(child=>child!==e && e.contains(child) && clean(child)===clean(e)));
 for(const e of options){const text=clean(e);if(!text || text.includes(matchingText) || text.includes(createText))continue;
  const item={text,tag:e.tagName,role:e.getAttribute('role'),checked:e.getAttribute('aria-checked'),disabled:e.getAttribute('aria-disabled')==='true' || !!e.disabled,transactionId:e.getAttribute('data-transaction-id') || e.querySelector('[data-transaction-id]')?.getAttribute('data-transaction-id') || null,href:e.getAttribute('href') || e.querySelector('a[href]')?.getAttribute('href') || null,html:e.outerHTML.slice(0,6000)};
  if(matching.length===1 && follows(matching[0],e) && (!create.length || create.every(h=>follows(e,h))))result.matchingOptions.push(item);
  else if(create.length===1 && follows(create[0],e))result.createOptions.push(item);
 }
 if(matching.length!==1)result.problems.push('Could not identify one matching-transaction section.');
 if(!result.matchingOptions.length)result.problems.push('No recognizable matching options captured. The menu HTML is included for selector inspection.');
 return result;
}
export function checkTransferMenu(report,pair,business){
 if(!report || report.format!=='wave-solver-transfer-menu' || report.version!==1 || report.identity?.business!==business || report.identity?.transaction!==pair.out.id || !Array.isArray(report.matchingOptions) || !Array.isArray(report.problems))throw Error('Paste diagnostics for this pair’s money-out transaction and selected Wave business.');
 if(report.problems.length || report.matchingGroups!==1)return {ready:false,message:'Menu is incomplete or ambiguous. Copy these diagnostics so the selector can be checked.'};
 const t=pair.in,date=new Date(t.date+'T00:00:00Z');
 const dates=[t.date,...['short','long'].map(month=>new Intl.DateTimeFormat('en-US',{month,day:'numeric',year:'numeric',timeZone:'UTC'}).format(date))];
 const normalize=s=>String(s || '').replace(/[—–]/g,'-').replace(/\s+/g,' ').trim();
 const labels=dates.map(d=>normalize(t.primary.account+' - '+d+' - '+t.description));
 const validHref=href=>{if(!href)return true;try{const u=new URL(href,'https://next.waveapps.com');return u.origin==='https://next.waveapps.com' && u.pathname==='/'+business+'/transactions/'+t.id;}catch{return false;}};
 const candidates=report.matchingOptions.filter(o=>o && typeof o.text==='string' && labels.includes(normalize(o.text).replace(/^Transfer to /i,'')) && !o.disabled && (!o.transactionId || o.transactionId===t.id) && validHref(o.href));
 return {ready:candidates.length===1,message:candidates.length===1?'One exact existing matching-transaction option was found. Copy the diagnostics for the final Set transfer integration. No transfer was set or reviewed.':'An exact unique counterpart could not be confirmed. Copy the diagnostics for selector inspection; create-transfer options are excluded.',candidate:candidates.length===1?candidates[0].text:null};
}
