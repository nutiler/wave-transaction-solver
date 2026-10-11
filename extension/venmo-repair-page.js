// Executed in the owned Wave tab. No imports or private application APIs.
export async function venmoRepairPage(request={},context){
 const doc=context?.document||document,loc=context?.location||location,style=context?.getComputedStyle||getComputedStyle,pause=context?.wait||(ms=>new Promise(r=>setTimeout(r,ms)));
 const tidy=v=>String(v??'').replace(/\s+/g,' ').trim(),visible=e=>!!e&&!e.hidden&&!e.closest('[hidden],[aria-hidden="true"]')&&style(e).display!=='none'&&style(e).visibility!=='hidden'&&e.getClientRects().length>0;
 const text=e=>{const c=e.cloneNode(true);c.querySelectorAll('svg,[aria-hidden="true"],[role="tooltip"],.sr-only').forEach(n=>n.remove());return tidy(c.textContent)||tidy(e.getAttribute('aria-label'))||tidy(e.title);};
 const enabled=e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true';
 const accessible=e=>[text(e),e.getAttribute('aria-label'),e.title,...(e.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>doc.getElementById(id)?.textContent),...(e.getAttribute('aria-describedby')||'').split(/\s+/).map(id=>doc.getElementById(id)?.textContent),...[...e.querySelectorAll('svg title,svg[aria-label],svg[data-testid]')].flatMap(n=>[n.textContent,n.getAttribute('aria-label'),n.getAttribute('data-testid')])].map(tidy);
 const cash=v=>{const s=tidy(v).replace(/[$,]/g,'');if(!/^-?\d+(?:\.\d{1,2})?$/.test(s))throw Error('Amount is unreadable.');return Math.round(Number(s)*100);};
 const scope=()=>{const u=new URL(loc.href),base='/'+request.business+'/transactions';if(!/^[0-9a-f-]{36}$/i.test(request.business||'')||u.origin!=='https://next.waveapps.com'||(request.kind==='receipt'||request.kind==='external-funding'?u.pathname!==base&&u.pathname!==base+'/':u.pathname!==base+'/'+request.id))throw Error('Wave is not showing the exact approved business/record.');};
 const button=(root,names)=>[...root.querySelectorAll('button,[role="button"],a,[role="menuitem"]')].filter(e=>visible(e)&&names.includes(text(e))).filter(e=>![...e.querySelectorAll('button,[role="button"],a,[role="menuitem"]')].some(c=>visible(c)&&names.includes(text(c))));
 const dialog=()=>{const ds=[...doc.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(visible),roots=ds.filter(e=>!ds.some(o=>o!==e&&o.contains(e)));if(roots.length===1)return roots[0];const headings=[...doc.querySelectorAll('h1,h2,h3,h4')].filter(e=>visible(e)&&/^(Edit transaction|Add deposit|Add transaction)$/.test(text(e)));if(headings.length===1)for(let e=headings[0].parentElement;e&&e!==doc.body;e=e.parentElement)if(e.querySelectorAll('input').length>=3&&button(e,['Save']).length===1)return e;throw Error('Cannot identify one Wave transaction form.');};
 const field=(root,name)=>{const selector='input:not([type="hidden"]):not([type="checkbox"]),select,.wv-select,[role="combobox"]';const named=[...root.querySelectorAll(selector)].filter(e=>visible(e)&&tidy(e.getAttribute('aria-label'))===name);if(named.length===1)return named[0];const found=new Set();for(const l of [...root.querySelectorAll('label,span')].filter(e=>visible(e)&&!e.children.length&&text(e)===name)){const linked=l.control||doc.getElementById(l.htmlFor);if(linked&&root.contains(linked)&&visible(linked)){found.add(linked);continue;}for(let e=l.parentElement;e&&e!==root;e=e.parentElement){const others=[...e.querySelectorAll('label,span')].filter(n=>!n.children.length&&['Date','Description','Account','Type','Amount','Category'].includes(text(n))&&text(n)!==name);if(others.length)break;const controls=[...e.querySelectorAll(selector)].filter(visible),top=controls.filter(c=>!controls.some(o=>o!==c&&o.contains(c)));if(top.length===1){found.add(top[0]);break;}}}if(found.size!==1)throw Error(name+' control is missing or ambiguous.');return [...found][0];};
 const value=(e,covered=false)=>e.tagName==='INPUT'?tidy(e.value):e.tagName==='SELECT'?tidy(e.selectedOptions[0]?.textContent):(()=>{const l=[...e.querySelectorAll('.wv-select__label')].filter(n=>covered||visible(n));if(l.length!==1)throw Error('Selected dropdown label is ambiguous.');return text(l[0]);})();
 const set=(input,v)=>{if(input.tagName!=='INPUT'||!enabled(input))throw Error('Editable input is unavailable.');const setter=Object.getOwnPropertyDescriptor(doc.defaultView.HTMLInputElement.prototype,'value')?.set;if(!setter)throw Error('Input setter unavailable.');setter.call(input,v);input.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));input.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));};
 const extra=root=>{
  const notes=[...root.querySelectorAll('textarea')].filter(visible).some(e=>tidy(e.value));
  const attachments=[...root.querySelectorAll('a[href],img')].filter(visible).some(e=>e.tagName==='IMG'&&!e.closest('button')&&/receipt|attachment/i.test(e.getAttribute('alt')||e.parentElement?.className||'')||e.tagName==='A'&&/receipt|attachment|download/i.test(text(e)+' '+e.getAttribute('href')));
  const reconciled=[...root.querySelectorAll('span,strong,div')].some(e=>visible(e)&&!e.children.length&&/^Reconciled$/.test(text(e)));
  const relations=[...root.querySelectorAll('input,select')].filter(visible).some(e=>/customer|vendor|tag/i.test(e.name||e.getAttribute('aria-label')||'')&&tidy(e.value));
  const allocations=[],seen=new Set(),account=(()=>{try{return value(field(root,'Account'));}catch{return '';}})();
  for(const selected of [...root.querySelectorAll('.wv-select__label,select')].filter(visible)){
   const category=selected.tagName==='SELECT'?tidy(selected.selectedOptions[0]?.textContent):text(selected);if(!category||category===account||/^(Split transaction|Multiple categories|Deposit|Withdrawal)$/.test(category))continue;
   for(let row=selected.parentElement,n=0;row&&row!==root&&n<7;row=row.parentElement,n++){
    if([...row.querySelectorAll('label,span')].some(e=>!e.children.length&&['Date','Description','Account','Type'].includes(text(e))))break;
    const categories=[...row.querySelectorAll('.wv-select__label,select')].filter(visible),inputs=[...row.querySelectorAll('input')].filter(e=>visible(e)&&!['hidden','checkbox'].includes(e.type)&&/^-?\d+(?:\.\d{1,2})?$/.test(tidy(e.value)));
    if(categories.length===1&&inputs.length===1){if(!seen.has(inputs[0])){seen.add(inputs[0]);allocations.push({category,amountCents:cash(inputs[0].value)});}break;}
    if(categories.length>1||inputs.length>1)break;
   }
  }
  const currencies=new Set([...root.querySelectorAll('span,div')].filter(e=>visible(e)&&!e.children.length&&/^(USD|CAD|EUR|GBP|AUD)$/.test(text(e))).map(text));
  return {notes:!!notes,attachments,reconciled,relations,protected:!!(notes||attachments||reconciled||relations),allocations,currency:currencies.size===1?[...currencies][0]:null};
 };
 const assertFields=(expected,amountOverride)=>{scope();const root=dialog();for(const name of ['Date','Description','Account','Type','Amount']){let actual;try{actual=value(field(root,name));}catch(e){if(name!=='Amount'||!request.split)throw e;const rows=extra(root).allocations;if(!rows.length)throw e;actual=(rows.reduce((n,r)=>n+r.amountCents,0)/100).toFixed(2);}const want=amountOverride!==undefined&&name==='Amount'?amountOverride:expected[name.toLowerCase()];if(name==='Amount'?cash(actual)!==cash(want):actual!==tidy(want))throw Error(name+' changed before the action.');}if(expected.category!==undefined&&!request.split&&value(field(root,'Category'))!==tidy(expected.category))throw Error('Category changed before the action.');const currencies=[...root.querySelectorAll('span,div')].filter(e=>visible(e)&&!e.children.length&&/^(USD|CAD|EUR|GBP|AUD)$/.test(text(e))).map(text);if(!currencies.length||currencies.some(c=>c!=='USD'))throw Error('Explicit USD currency is required.');return root;};
 async function choose(root,name,label,path=[]){
  let control=field(root,name);if(!path.length&&value(control)===label)return;
  if(control.tagName==='SELECT'){if(path.length)throw Error('Category branch is not available in this native selector.');const choices=[...control.options].filter(o=>tidy(o.textContent)===label&&!o.disabled);if(choices.length!==1)throw Error('Exact '+name+' option is unavailable.');control.value=choices[0].value;control.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));return;}
  const trigger=control.querySelector('.wv-select__toggle')||control;if(!enabled(trigger))throw Error(name+' is disabled.');trigger.click();
  for(const target of [...path,label]){let choices=[];for(let n=0;n<20;n++){const candidates=[...doc.querySelectorAll('.wv-select__menu__option,.wv-select__option,.wv-dropdown__item,[role="option"],[role="menuitem"],[role="menuitemradio"],.wv-list__item,button,li')].filter(e=>visible(e)&&text(e)===target);choices=candidates.filter(e=>!candidates.some(o=>o!==e&&e.contains(o)));if(choices.length===1)break;await pause(100);}if(choices.length!==1||!enabled(choices[0]))throw Error('Cannot identify exact '+name+' menu option '+target+'.');scope();choices[0].click();await pause(100);}
 }
 let mutationAttempted=false,saveConfirmationAttempted=false,stage='preflight';
 const alerts=root=>new Set([...root.querySelectorAll('[role="alert"]')].filter(visible).map(text));
 const warningHeading='If you change the amount, your books will be out-of-sync',warningBody="You've already matched this transaction. Are you sure you want to make these changes?";
 const warningText=e=>text(e).replace(/[’]/g,"'").replace(/[‑–]/g,'-');
 const openingConfirmation=root=>{
  const matches=e=>e!==root&&visible(e)&&warningText(e).includes(warningHeading)&&warningText(e).includes(warningBody)&&button(e,['Save changes']).length>0;
  let candidates=[...doc.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(matches);
  // Wave also renders some confirmation overlays without a dialog role.
  if(!candidates.length)for(const heading of [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],p,strong,div')].filter(e=>visible(e)&&warningText(e)===warningHeading))for(let e=heading.parentElement;e&&e!==doc.body&&e!==root;e=e.parentElement){if(matches(e)){candidates.push(e);break;}}
  candidates=[...new Set(candidates)].filter(e=>!candidates.some(other=>other!==e&&e.contains(other)));
  if(candidates.length>1)throw Error('Multiple opening-amount confirmations are open.');
  return candidates[0]||null;
 };
 const openingGuard=root=>{
  const controls=Object.fromEntries(['Date','Description','Account','Type','Amount','Category'].map(name=>[name,field(root,name)])),values=Object.fromEntries(Object.entries(controls).map(([name,e])=>[name,value(e)])),currencies=[...root.querySelectorAll('span,div')].filter(e=>visible(e)&&!e.children.length&&text(e)==='USD');
  return ()=>{scope();if(!root.isConnected||!currencies.length||currencies.some(e=>!root.contains(e)||text(e)!=='USD'))throw Error('Opening form identity or currency changed before confirmation.');for(const [name,e] of Object.entries(controls))if(!root.contains(e)||!e.isConnected||(name==='Amount'?cash(value(e,true))!==cash(values[name]):value(e,true)!==values[name]))throw Error(name+' changed before opening confirmation.');};
 };
 const settleSave=async(root,priorAlerts,guard)=>{let confirmed=null;for(let n=0;n<100;n++){
  await pause(150);
  if(guard){const confirmation=openingConfirmation(root);if(confirmation){const save=button(confirmation,['Save changes']);if(save.length!==1||!enabled(save[0]))throw Error('Opening Save changes confirmation is missing, disabled or ambiguous.');if(!saveConfirmationAttempted){guard();saveConfirmationAttempted=true;stage='opening confirmation submitted';confirmed=confirmation;save[0].click();}continue;}}
  if((!root.isConnected||root.hidden||root.closest('[hidden]')||style(root).display==='none'||style(root).visibility==='hidden')&&(!confirmed||!confirmed.isConnected||!visible(confirmed)))return;
  const errors=[...root.querySelectorAll('[role="alert"],.wv-form-field__error,[aria-invalid="true"]')].filter(e=>visible(e)&&(!e.matches('[role="alert"]')||!priorAlerts.has(text(e))));if(errors.length)throw Error('Wave did not finish Save: '+(errors.map(e=>text(e)).filter(Boolean).join('; ')||'a field is invalid')+'. Saved outcome remains locked for recheck.');
 }throw Error('Wave has not closed the transaction form after Save. Saved outcome remains locked; recheck before continuing.');};
 try{
  scope();
  if(request.action==='inspect')return extra(dialog());
  if(['receipt','external-funding'].includes(request.kind)){
   stage='open deposit';const add=button(doc,['Add transaction']);if(add.length!==1||!enabled(add[0]))throw Error('Add transaction is missing or disabled.');add[0].click();let deposits=[];for(let n=0;n<20;n++){deposits=button(doc,['Add deposit']);if(deposits.length===1)break;await pause(100);}if(deposits.length!==1||!enabled(deposits[0]))throw Error('Add deposit is missing or ambiguous.');scope();deposits[0].click();let root;for(let n=0;n<30;n++){try{root=dialog();break;}catch{await pause(100);}}if(!root)throw Error('Deposit form did not open.');
   await choose(root,'Account',request.target.account);if(value(field(root,'Type'))!=='Deposit')throw Error('New transaction is not a deposit.');await choose(root,'Category',request.target.category,request.categoryPath||[]);
   // Account/category changes can rebuild a new form and reset its text fields.
   // Resolve those first, then reacquire controls and verify every target value.
   root=dialog();for(const [name,target] of [['Date',request.target.date],['Description',request.target.description],['Amount',request.target.amount]]){set(field(root,name),target);await pause(100);root=dialog();}
   const expected={...request.target,category:undefined};root=assertFields(expected);const category=value(field(root,'Category'));if(category!==request.target.category&&category!=='Refund for '+request.target.category&&category!=='Deposit from Personal '+request.target.category)throw Error('New deposit category did not verify.');const save=button(root,['Save']);if(save.length!==1||!enabled(save[0]))throw Error('Deposit Save unavailable.');scope();const priorAlerts=alerts(root);mutationAttempted=true;stage='deposit submitted';save[0].click();await settleSave(root,priorAlerts);return {mutationAttempted,stage,formClosed:true};
  }
  let root=assertFields(request.expected);const details=extra(root);
  if(request.kind==='opening'){
   if(!Number.isSafeInteger(request.targetCents)||request.targetCents<0)throw Error('Invalid opening amount.');set(field(root,'Amount'),(request.targetCents/100).toFixed(2));root=assertFields(request.expected,(request.targetCents/100).toFixed(2));const save=button(root,['Save']);if(save.length!==1||!enabled(save[0]))throw Error('Opening balance Save unavailable.');const priorAlerts=alerts(root),guard=openingGuard(root);mutationAttempted=true;stage='opening submitted';save[0].click();await settleSave(root,priorAlerts,guard);return {mutationAttempted,saveConfirmationAttempted,stage,formClosed:true};
  }
  if(!['duplicate','fee'].includes(request.kind)||details.protected)throw Error('Deletion is blocked by protected details or unsupported action.');
  if(request.split){const actual=details.allocations.map(p=>[p.category,p.amountCents]).sort();if(JSON.stringify(actual)!==JSON.stringify(request.allocations))throw Error('Split fee allocation changed.');}
  const trash=[...root.querySelectorAll('button,[role="button"]')].filter(e=>visible(e)&&accessible(e).some(n=>/^(Delete(?: transaction)?|delete icon|TrashIcon|DeleteIcon)$/i.test(n)));if(trash.length!==1||!enabled(trash[0]))throw Error('Cannot identify one exact Delete transaction control.');assertFields(request.expected);mutationAttempted=true;trash[0].click();
  for(let n=0;n<15;n++){await pause(100);const confirmations=[...doc.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(e=>visible(e)&&/delete/i.test(text(e))&&e!==root);if(confirmations.length>1)throw Error('Multiple deletion confirmations are open.');if(confirmations.length===1){const confirm=button(confirmations[0],['Delete','Delete transaction']);if(confirm.length!==1||!enabled(confirm[0]))throw Error('Deletion confirmation is ambiguous.');scope();confirm[0].click();break;}if(!visible(root))break;}
  return {mutationAttempted,stage:'deletion requested'};
 }catch(e){return {mutationAttempted,saveConfirmationAttempted,stage,problem:e.message,controlDiagnostics:(()=>{try{return [...dialog().querySelectorAll('button,[role="button"]')].filter(visible).map(e=>({names:accessible(e).filter(Boolean),disabled:!enabled(e)}));}catch{return [];}})()};}
}
