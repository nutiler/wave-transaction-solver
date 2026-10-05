import {compareLive} from './model.js';
import {prepareCategoryEdit,verifyCategoryResult} from './editor.js';
export function expenseCandidates(queue){return queue.filter(t=>t.kind==='Merchant rule' && t.direction==='out' && t.amount>0 && t.primary && t.postings?.length===2 && t.categories?.length===1 && typeof t.proposed==='string');}
export function prepareExpenseBatch(t,snapshot,options){
 if(!expenseCandidates([t]).length || options.sample || !options.business)throw Error('Only approved-rule single-category purchases can run.');
 const target=verifyCategoryResult(t,snapshot,options.business,t.proposed);
 if(!target.reviewedVerified){
  const actions=(snapshot?.controls || []).filter(c=>/^(Reviewed|Mark (as )?reviewed|Mark (as )?(unreviewed|not reviewed)|Unreview)$/i.test(c));
  const checkbox=snapshot?.reviewCheckbox;
  if(actions.length+(typeof checkbox?.checked==='boolean'?1:0)!==1){
   const updates=(snapshot?.controls || []).includes('Review updates');
   const error=Error(updates?'Wave shows Review updates instead of a reviewed-state control. Resolve its suggested updates manually; this expense was not edited.':'Cannot identify one reviewed-state control. This expense was not edited. Copy expense diagnostics.');error.diagnostics={snapshot,reviewDiagnostics:snapshot?.reviewDiagnostics || []};throw error;
  }
  if(target.categoryVerified && (checkbox?.disabled || snapshot?.reviewActions?.some(a=>/^Mark (as )?reviewed$/i.test(a.name) && a.disabled))){const error=Error('The review control is disabled. This expense was not edited.');error.diagnostics={snapshot};throw error;}
 }

 if(target.categoryVerified){
  return {state:target.reviewedVerified?'completed':'review',request:{business:options.business,id:t.id,category:snapshot.fields.category,expected:{...snapshot.fields},reviewOnly:true}};
 }
 const comparison=compareLive(t,snapshot || {fields:{}});
 const problems=[...(snapshot?.problems || [])];
 if(snapshot?.identity?.business!==options.business)problems.push('Wrong or unreadable Wave business.');
 if(problems.length || comparison.checks.some(c=>c.state!=='Match')){
  const error=Error('Live expense differs from the export and approved category. Nothing applied. '+[...problems,...comparison.checks.filter(c=>c.state!=='Match').map(c=>c.field+' '+c.state+' (export: '+c.exported+'; live: '+c.live+')')].join('; '));error.diagnostics={checks:comparison.checks,problems,snapshot};throw error;
 }
 if(snapshot.reviewed==='Reviewed' || (snapshot.controls || []).some(c=>/^(Reviewed|Mark (as )?(unreviewed|not reviewed)|Unreview)$/i.test(c))){const error=Error('Already reviewed in another category. Inspect its purpose before replacing it.');error.diagnostics={checks:comparison.checks,snapshot};throw error;}
 return {state:'change',request:prepareCategoryEdit(t,snapshot,{...options,shortlist:new Set([t.id]),queue:[t],loadedPlan:null})};
}
export function installExpenseBatch({getState,receipt,apply,inspect}){
 const $=id=>document.getElementById(id),make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const section=make('section'),fold=make('details');fold.className='step';fold.id='expenseBatch';const summary=make('summary','Known expenses · approved rules');summary.setAttribute('role','heading');summary.setAttribute('aria-level','2');fold.append(summary);
 const body=make('div');body.className='step-body';const search=make('input');search.placeholder='Merchant, account, category, or date';search.setAttribute('aria-label','Find known expense');
 body.append(make('p','Select expenses matched by your approved rules. Matching categories are confirmed and reviewed without changing them. Changed records need attention; uncertain saves stop the run.'),search);const rows=make('div');body.append(rows);fold.append(body);section.append(fold);$('fold-transfers').parentElement.before(section);
 let selected=new Set(),context=null,running=false,message='',limit=100,completedLimit=100;
 const money=c=>'$'+(c/100).toFixed(2),eligible=t=>{const r=receipt(t);return !r?.reviewedVerified && r?.stage!=='expense-preflight' && (!r?.saveAttempted || (r.categoryVerified && !r.reviewAttempted));};
 function render(){
  if(running)return;const s=getState(),key=[s.dataset,s.business,s.workFrom];if(!context || key.some((v,i)=>v!==context[i])){context=key;selected.clear();message='';limit=100;completedLimit=100;}
  const all=expenseCandidates(s.queue),completed=all.filter(t=>receipt(t)?.reviewedVerified),attention=all.filter(t=>receipt(t)?.stage==='expense-preflight'),matches=all.filter(t=>!receipt(t)?.reviewedVerified && (t.description+' '+t.primary.account+' '+t.proposed+' '+t.date).toLowerCase().includes(search.value.toLowerCase()));
  for(const t of matches)if(!eligible(t))selected.delete(t.id);
  rows.replaceChildren(make('p',matches.length+' pending known expenses; '+completed.length+' completed; '+attention.length+' need attention. From '+s.workFrom+'.'));
  const bar=make('div');bar.className='bar';const selectAll=make('button','Select matching expenses'),clear=make('button','Clear expense selection'),run=make('button','Run selected expenses'),count=make('span');selectAll.className=clear.className='secondary';
  const chosen=()=>matches.filter(t=>selected.has(t.id) && eligible(t));const update=()=>{const list=chosen();count.textContent=list.length+' selected · '+money(list.reduce((sum,t)=>sum+t.amount,0));run.disabled=!s.extensionMode || s.sample || !s.business || !list.length;};selectAll.onclick=()=>{for(const t of matches)if(eligible(t))selected.add(t.id);render();};clear.onclick=()=>{selected.clear();render();};
  run.onclick=async()=>{const list=chosen();running=true;let stop=false,done=0,skipped=0,needsAttention=0,currentRecord=null;const panel=make('div');panel.className='transfer-run-progress';const progress=make('p'),pause=make('button','Stop after current expense');pause.onclick=()=>{stop=true;pause.disabled=true;};panel.append(progress,pause);document.body.append(panel);
   try{for(const t of list){if(stop)break;const now=getState();if(now.business!==s.business || now.dataset!==s.dataset || now.workFrom!==s.workFrom)throw Error('Session changed.');currentRecord=t;progress.textContent=(done+skipped+needsAttention+1)+' of '+list.length+' · '+t.description+' · '+money(t.amount)+' · '+t.proposed;const r=await apply(t);if(r.needsAttention)needsAttention++;else if(r.skipped)skipped++;else if(r.reviewedVerified)done++;else throw Error(r.message || 'Saved expense could not be verified.');selected.delete(t.id);}message=done+' expenses completed; '+skipped+' already reviewed skipped; '+needsAttention+' need attention.'+(stop?' Stopped after current expense.':'');}
   catch(e){message=done+' expenses completed; '+needsAttention+' need attention. Stopped'+(currentRecord?' at '+currentRecord.description+' · '+money(currentRecord.amount)+' · ID '+currentRecord.id:'')+': '+e.message;}finally{running=false;panel.remove();render();}};
  update();bar.append(selectAll,clear,run,count);const status=make('p',message);status.setAttribute('role','status');rows.append(bar,status);
  for(const t of matches.slice(0,limit)){
   const r=receipt(t),card=make('details');card.className='transfer-card';card.append(make('summary',t.description+' · '+money(t.amount)+' → '+t.proposed+(r?.stage==='expense-preflight'?' · Needs attention':r?.saveAttempted?' · Saved attempt':'')));const box=make('input');box.type='checkbox';box.checked=selected.has(t.id);box.disabled=!eligible(t);box.setAttribute('aria-label','Select expense '+t.id);box.onchange=()=>{if(box.checked)selected.add(t.id);else selected.delete(t.id);update();};const choice=make('label',' Include in expense run');choice.prepend(box);card.append(choice,make('p',t.date+' · '+t.primary.account+' · Export category: '+t.categories[0]),make('p',t.reason));
   const inspectButton=make('button','Inspect expense');inspectButton.className='secondary';inspectButton.onclick=()=>inspect(t);card.append(inspectButton);
   if(r){card.append(make('p',r.message));const diagnostics=make('details');diagnostics.append(make('summary','Expense result diagnostics'),make('pre',JSON.stringify(r,null,2)));const copy=make('button','Copy expense diagnostics');copy.className='secondary';copy.onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(r,null,2));copy.textContent='Copied';}catch{diagnostics.open=true;const range=document.createRange();range.selectNodeContents(diagnostics.querySelector('pre'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);copy.textContent='Selected; press Ctrl+C';}};card.append(diagnostics,copy);const retry=make('button',r.stage==='expense-preflight'?'Retry expense preflight':'Recheck saved expense');retry.className='secondary';retry.onclick=async()=>{retry.disabled=true;try{const result=await apply(t,r.stage==='expense-preflight'?'run':'recheck');message=result.message;}catch(e){message=e.message;}finally{render();}};card.append(retry);}
   rows.append(card);
  }
  if(matches.length>limit){const more=make('button','Show more expenses');more.onclick=()=>{limit+=100;render();};rows.append(more);}
  if(completed.length){const d=make('details');d.append(make('summary',completed.length+' completed expenses'));for(const t of completed.slice(0,completedLimit)){const item=make('details');item.append(make('summary',t.description+' · '+money(t.amount)+' · '+t.proposed),make('pre',JSON.stringify(receipt(t),null,2)));d.append(item);}if(completed.length>completedLimit){const more=make('button','Show more completed expenses');more.onclick=()=>{completedLimit+=100;render();};d.append(more);}rows.append(d);}
 }
 search.oninput=()=>{limit=100;render();};return {render};
}

// Editor preflight returns before any category, review, or Save click.
export function recoverStoppedExpenseReceipt(receipt){
 if(receipt?.stage!=='expense-edit' || !receipt.saveAttempted || !receipt.originalSnapshot?.identity?.transaction || receipt.editOutcome?.stage!=='preflight' || receipt.editOutcome.saveAttempted!==false || !receipt.editOutcome.problem)return receipt;
 const {previousAttempts=[],...previous}=receipt;
 return {...receipt,saveAttempted:false,reviewAttempted:false,stage:'expense-preflight',previousAttempts:[...previousAttempts,previous],message:receipt.editOutcome.problem+' Stopped before editing; moved to Needs attention. Use Retry expense preflight after inspecting the Wave dialog.'};
}
