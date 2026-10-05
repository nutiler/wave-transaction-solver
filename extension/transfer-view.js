import { checkTransferMenu } from './transfer-menu.js';
import { transferPairs,checkTransferRecords } from './transfers.js';
export function installTransferReview({getState,read,inspect,openMenuRecord,captureMenu,applyTransfer,receipt}){
 const $=id=>document.getElementById(id),make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 let context=null,checks=new Map(),menus=new Map(),generation=0,limit=100;
 const money=c=>'$'+(c/100).toFixed(2);
 function render(){
  generation++;const s=getState(),key=[s.dataset,s.business,s.workFrom];
  if(!context || key.some((v,i)=>v!==context[i])){context=key;checks.clear();menus.clear();generation++;limit=100;}
  const pairs=transferPairs(s.queue),query=$('transferSearch').value.toLowerCase();
  const matches=pairs.filter(p=>(p.out.description+' '+p.in.description+' '+p.out.primary.account+' '+p.in.primary.account+' '+p.out.date+' '+p.in.date+' '+money(p.out.amount)).toLowerCase().includes(query));
  const ambiguous=s.queue.filter(t=>t.kind==='Ambiguous transfer');
  $('transferStatus').textContent=pairs.length+' unique candidate pairs; '+checks.size+' checked this session, from '+s.workFrom+'. '+ambiguous.length+' ambiguous transactions. Showing '+Math.min(limit,matches.length)+' of '+matches.length+' matching pairs. Full-history matches are not proof of a live transfer or reviewed status.';
  $('transferRows').replaceChildren();
  if(!matches.length)$('transferRows').append(make('p','No unique transfer pairs in this view.'));
  for(const pair of matches.slice(0,limit)){
   const card=make('details');card.className='transfer-card';card.append(make('summary',money(pair.out.amount)+' · '+pair.out.primary.account+' → '+pair.in.primary.account));
   const table=make('table'),body=make('tbody');
   for(const [label,t] of [['Money out',pair.out],['Money in',pair.in]]){const tr=make('tr');tr.append(make('th',label),make('td',t.date+' · '+t.primary.account),make('td',t.description),make('td',money(t.amount)));body.append(tr);}
   table.append(body);card.append(table,make('p',pair.out.reason));
   const actions=make('div');actions.className='bar';
   const liveResults=make('div');const check=make('button','Check both sides in Wave');check.disabled=!s.extensionMode || s.sample || !s.business;
   check.onclick=async()=>{const token=++generation;check.disabled=true;liveResults.replaceChildren();const result=make('p','Checking both existing records in background tabs…');liveResults.append(result);try{
    const current=()=>generation===token && getState().dataset===s.dataset && getState().business===s.business && getState().workFrom===s.workFrom;
    const verified=await checkTransferRecords(pair,s.business,read,current);if(!verified){result.textContent='Check cancelled because the review context changed. Run it again when ready.';return;}checks.set(pair.key,verified);$('transferStatus').textContent=$('transferStatus').textContent.replace(/\d+ checked this session/,checks.size+' checked this session');result.textContent=verified.message;
    for(const side of verified.sides){const d=make('details');d.append(make('summary',(side.id===pair.out.id?'Money out':'Money in')+': '+(side.matches?'Fields match':'Inspect changes')+' · Reviewed: '+side.reviewed));const ul=make('ul');for(const c of side.checks)ul.append(make('li',c.field+': '+c.state+' · Export: '+c.exported+' · Live: '+c.live));for(const problem of side.problems)ul.append(make('li',problem));d.append(ul);liveResults.append(d);}
   }catch(e){result.textContent=e.message;}finally{check.disabled=false;}};
   actions.append(check);
   for(const [label,t] of [['Inspect money out',pair.out],['Inspect money in',pair.in]]){const b=make('button',label);b.className='secondary';b.onclick=()=>inspect(t);actions.append(b);}
   card.append(actions,liveResults);
   if(checks.has(pair.key))liveResults.append(make('p',checks.get(pair.key).message+' Recheck for fresh live details.'));
   const menuPanel=make('details');menuPanel.className='transfer-menu-tools';menuPanel.append(make('summary','Transfer setup · menu check and copy/paste'));
   menuPanel.append(make('p','Open the money-out record, then in Wave choose Category → Transfer to Bank, Credit Card, or Loan. Leave the matching-transaction submenu open and return here.'));
   const menuActions=make('div');menuActions.className='bar';const openMenu=make('button','Open money-out in Wave');openMenu.className='secondary';openMenu.disabled=!s.extensionMode || s.sample;openMenu.onclick=async()=>{try{await openMenuRecord(pair.out);}catch(e){menuStatus.textContent=e.message;}};
   const readMenu=make('button','Read transfer menu'),copy=make('button','Copy transfer diagnostics');readMenu.disabled=!s.extensionMode || s.sample;copy.className='secondary';
   const menuStatus=make('p'),pre=make('pre'),paste=make('textarea');menuStatus.setAttribute('role','status');paste.rows=5;paste.placeholder='Paste the copied transfer-menu JSON here to check it';paste.setAttribute('aria-label','Paste transfer menu diagnostics');
   const saved=menus.get(pair.key);if(saved){pre.textContent=JSON.stringify(saved,null,2);paste.value=pre.textContent;}copy.disabled=!saved;
   readMenu.onclick=async()=>{readMenu.disabled=true;const token=++generation;try{const report=await captureMenu(pair.out);if(generation!==token || getState().dataset!==s.dataset || getState().business!==s.business)return;report.expectedCounterpart={id:pair.in.id,account:pair.in.primary.account,date:pair.in.date,description:pair.in.description,amountCents:pair.in.amount};menus.set(pair.key,report);pre.textContent=JSON.stringify(report,null,2);paste.value=pre.textContent;copy.disabled=false;menuStatus.textContent=checkTransferMenu(report,pair,s.business).message;updateTransferActions();}catch(e){menuStatus.textContent=e.message;}finally{readMenu.disabled=false;}};
   copy.onclick=async()=>{try{await navigator.clipboard.writeText(pre.textContent);menuStatus.textContent='Transfer diagnostics copied. Paste them into this chat or the check box below.';}catch{menuPanel.open=true;const range=document.createRange();range.selectNodeContents(pre);const selected=window.getSelection();selected.removeAllRanges();selected.addRange(range);menuStatus.textContent='Diagnostics selected. Press Ctrl+C to copy.';}};
   const checkPaste=make('button','Check pasted diagnostics');checkPaste.className='secondary';checkPaste.onclick=()=>{try{if(paste.value.length>1000000)throw Error('Paste a transfer diagnostic report under 1 MB.');const report=JSON.parse(paste.value);menuStatus.textContent=checkTransferMenu(report,pair,s.business).message;}catch(e){menuStatus.textContent=e.message;}};
   menuActions.append(openMenu,readMenu,copy);menuPanel.append(menuActions,menuStatus,pre,paste,checkPaste);card.append(menuPanel);
   const setActions=make('div');setActions.className='bar';
   const setTransfer=make('button','Set transfer and request review'),recheck=make('button','Recheck saved transfer'),copyResult=make('button','Copy transfer result');recheck.className='secondary';copyResult.className='secondary';
   const setStatus=make('p');setStatus.setAttribute('role','status');
   const resultPanel=make('details'),resultPre=make('pre');resultPanel.append(make('summary','Transfer result diagnostics'),resultPre);
   function updateTransferActions(){const r=receipt?.(pair);let ready=false;try{ready=checkTransferMenu(menus.get(pair.key),pair,s.business).ready;}catch{}setTransfer.disabled=!s.extensionMode || s.sample || !ready || !!r?.saveAttempted;recheck.disabled=!s.extensionMode || !r?.saveAttempted;copyResult.disabled=!r;if(r){setStatus.textContent=r.message;resultPre.textContent=JSON.stringify(r,null,2);}}
   const run=async verify=>{setStatus.textContent=verify?'Reopening both records to check the saved result…':'Checking both records, selecting the existing match, and requesting review…';setTransfer.disabled=true;recheck.disabled=true;try{const r=await applyTransfer(pair,verify);setStatus.textContent=r.message;resultPre.textContent=JSON.stringify(r,null,2);}catch(e){setStatus.textContent=e.message;}finally{updateTransferActions();}};
   setTransfer.onclick=()=>run(false);recheck.onclick=()=>run(true);
   copyResult.onclick=async()=>{try{await navigator.clipboard.writeText(resultPre.textContent);setStatus.textContent='Transfer result copied.';}catch{resultPanel.open=true;const range=document.createRange();range.selectNodeContents(resultPre);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);setStatus.textContent='Result selected. Press Ctrl+C to copy.';}};
   updateTransferActions();setActions.append(setTransfer,recheck,copyResult);card.append(make('p','Read the matching submenu first. Set transfer links this one existing pair and requests reviewed status. It excludes create-transfer entries. Both records are checked again before editing and reopened after Save; uncertain saves stay locked.'),setActions,setStatus,resultPanel);
   $('transferRows').append(card);
  }
  if(matches.length>limit){const more=make('button','Show more pairs');more.onclick=()=>{limit+=100;render();};$('transferRows').append(more);}
  const filtered=ambiguous.filter(t=>(t.description+' '+t.primary?.account+' '+money(t.amount)).toLowerCase().includes(query));
  if(filtered.length){const d=make('details');d.append(make('summary',filtered.length+' ambiguous matches — choose the counterpart manually'));for(const t of filtered){const row=make('p',t.date+' · '+t.primary.account+' · '+money(t.amount)+' · '+t.description+' — '+t.reason);const b=make('button','Inspect');b.className='secondary';b.onclick=()=>inspect(t);row.append(b);d.append(row);}$('transferRows').append(d);}
 }
 $('transferSearch').oninput=()=>{limit=100;render();};return {render};
}
