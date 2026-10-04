import { transferPairs,checkTransferRecords } from './transfers.js';
export function installTransferReview({getState,read,inspect}){
 const $=id=>document.getElementById(id),make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 let context=null,checks=new Map(),generation=0,limit=100;
 const money=c=>'$'+(c/100).toFixed(2);
 function render(){
  generation++;const s=getState(),key=[s.dataset,s.business,s.workFrom];
  if(!context || key.some((v,i)=>v!==context[i])){context=key;checks.clear();generation++;limit=100;}
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
   card.append(make('p','In Wave, use Transfer to Bank, Credit Card, or Loan → Select Account with Matching Transaction. Choose the existing opposite record. This checker does not link, save, or create transactions.'));
   $('transferRows').append(card);
  }
  if(matches.length>limit){const more=make('button','Show more pairs');more.onclick=()=>{limit+=100;render();};$('transferRows').append(more);}
  const filtered=ambiguous.filter(t=>(t.description+' '+t.primary?.account+' '+money(t.amount)).toLowerCase().includes(query));
  if(filtered.length){const d=make('details');d.append(make('summary',filtered.length+' ambiguous matches — choose the counterpart manually'));for(const t of filtered){const row=make('p',t.date+' · '+t.primary.account+' · '+money(t.amount)+' · '+t.description+' — '+t.reason);const b=make('button','Inspect');b.className='secondary';b.onclick=()=>inspect(t);row.append(b);d.append(row);}$('transferRows').append(d);}
 }
 $('transferSearch').oninput=()=>{limit=100;render();};return {render};
}
