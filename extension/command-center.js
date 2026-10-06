import {recordSnapshot} from './plan.js';
import {merchantText,normalize,matchingRules,nonPurchaseReason} from './rules.js';
import {evidenceSnapshot,serviceSuggestion,sourceReviewStatuses} from './service-solvers.js';
import {sourceGroupKey} from './automation.js';
import {transferPairs} from './transfers.js';
import {compareCollectedRows} from './inspection.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const day=s=>Date.parse(s+'T00:00:00Z')/86400000;
export function categoryIndex(catalog,transactions=[]){
 const groups=new Map();for(const g of catalog?.groups||[])for(const a of g.accounts)groups.set(a.name,g.name);
 for(const t of transactions)for(const p of t.postings||[])if(!groups.has(p.account)&&['Expense','Income','Equity'].includes(p.group))groups.set(p.account,p.group==='Expense'?'Expenses':p.group);
 return [...groups].filter(([name,group])=>['Expenses','Income','Equity'].includes(group)&&!/(?:Uncategorized|Needs Review)|^(?:Transfer|Retained Earnings|Opening balance)/i.test(name)).map(([name,group])=>({name,group}));
}
export function rankedCategories(categories,treatment,preferred=[],query=''){
 const allowed=categories.filter(c=>treatment==='income'?c.group==='Income':['personal-deposit','personal-withdrawal'].includes(treatment)?c.group==='Equity':['Expenses','Equity'].includes(c.group));
 const words=normalize(query).split(' ').filter(Boolean);
 return allowed.filter(c=>words.every(w=>normalize(c.name).includes(w))).sort((a,b)=>{const ai=preferred.indexOf(a.name),bi=preferred.indexOf(b.name);return (ai<0?999:ai)-(bi<0?999:bi)||a.name.localeCompare(b.name);});
}
export function descriptionSuggestion(t,source,max=255){
 if(!source)return t.description;
 const parts=source.provider==='amazon'?(source.items||[]).map(i=>i.productCategory||i.title):[source.merchant,source.note];
 const addition=[...new Set(parts.filter(v=>v&&!/^amazon$|not stated/i.test(v)))].join('; ').replace(/\s+/g,' ').trim();
 if(!addition||normalize(t.description).includes(normalize(addition)))return t.description;
 const available=max-t.description.length-3;if(available<12)return t.description;
 const detail=addition.length>available?addition.slice(0,available-1).trimEnd()+'…':addition;
 return t.description+' — '+detail;
}
export function feeTransferEvidence(records,transactions=[],accountMap={}){
 const result=[],seen=new Set();
 for(const r of records){if(r.kind!=='Transfer'||!r.feeCents||r.conflict||r.currency!=='USD')continue;
  const fee=Math.abs(r.feeCents);let gross=null,net=null,reason='Source states a fee but does not establish gross and net.';
  if(Number.isSafeInteger(r.grossCents)&&r.grossCents+r.feeCents===r.signedCents&&Math.abs(r.grossCents)-fee===Math.abs(r.signedCents)){gross=Math.abs(r.grossCents);net=Math.abs(r.signedCents);}
  else if(r.provider==='venmo'&&/instant/i.test(r.type)&&r.signedCents<0&&r.amountCents>fee){gross=r.amountCents;net=gross-fee;reason='Venmo instant-transfer source lists the gross transfer and deducted fee.';}
  if(!gross||!net){result.push({key:'fee:'+r.key,source:r,grossCents:r.amountCents,netCents:null,feeCents:fee,ids:[],state:'Needs source review',reason,executable:false});continue;}
  const near=t=>t.primary&&Math.abs(day(t.date)-day(r.date))<=7;
  const ending=r.accountEnding,accounts=[...new Set(transactions.filter(t=>t.primary).map(t=>t.primary.account))],matches=ending?accounts.filter(a=>new RegExp('(?:^|\\D)'+ending+'(?:\\D|$)').test(a)):[];
  const bank=accountMap[r.instrumentKey]||(matches.length===1?matches[0]:'');
  const outs=transactions.filter(t=>near(t)&&t.direction==='out'&&t.amount===gross&&new RegExp(r.provider,'i').test(t.primary.account));
  const ins=transactions.filter(t=>near(t)&&t.direction==='in'&&t.amount===net&&bank&&t.primary.account===bank&&new RegExp(r.provider,'i').test(t.description));
  const out=outs.length===1?outs[0]:null,incoming=ins.length===1?ins[0]:null,ids=out&&incoming&&out.primary.account!==incoming.primary.account?[out.id,incoming.id]:[];
  if(ids.some(id=>seen.has(id))){result.push({key:'fee:'+r.key,source:r,grossCents:gross,netCents:net,feeCents:fee,ids,state:'Ambiguous fee allocation',reason:'Another source already claims a transfer side.',executable:false});continue;}
  ids.forEach(id=>seen.add(id));result.push({key:'fee:'+r.key,source:r,grossCents:gross,netCents:net,feeCents:fee,ids,state:ids.length?'Source-supported fee transfer':'Unmatched fee transfer',reason:ids.length?'Gross minus explicit source fee equals the deposit. Wave needs a split/fee allocation; the equal-amount matcher must not execute this pair.':reason+' A unique source-account withdrawal and bank deposit are still needed.',executable:false});
 }
 return result;
}
function historyPreferences(transactions,categories){
 const allowed=new Set(categories.map(c=>c.name)),map=new Map();
 for(const t of transactions){if(!t.primary||t.categories.length!==1||!allowed.has(t.categories[0]))continue;const k=normalize(merchantText(t.description)),group=map.get(k)||new Map(),weight=/^202[34]/.test(t.date)?3:/^202[012]/.test(t.date)?0.5:1;group.set(t.categories[0],(group.get(t.categories[0])||0)+weight);map.set(k,group);}
 return map;
}
export function prepareCommandModel({business,transactions=[],queue=[],rules=[],catalog,reports=[],records=[],matches=[],accountMap={},proposals=[],from='2025-01-01',receipts={}}){
 const categories=categoryIndex(catalog,transactions),names=categories.map(c=>c.name),bySource=new Map(records.map(r=>[r.key,r])),sources=new Map(),history=historyPreferences(transactions,categories),reviewed=sourceReviewStatuses(reports,business);
 for(const m of matches){if(m.state!=='Candidate'||m.candidates.length!==1)continue;const r=bySource.get(m.key);if(!r||r.conflict)continue;const id=m.candidates[0];if(!sources.has(id))sources.set(id,[]);sources.get(id).push(r);}
 const list=reports.filter(r=>r?.business===business&&!r.running&&r.filter==='NOT_VERIFIED').sort((a,b)=>Date.parse(b.capturedAt)-Date.parse(a.capturedAt))[0],live=list?new Map(list.records.map(r=>[r.id,r])):null;
 const comparisons=new Map(compareCollectedRows(list,transactions,{business,from}).map(c=>[c.id,c]));
 const fees=feeTransferEvidence(records,transactions,accountMap),feeIDs=new Set(fees.flatMap(f=>f.ids));
 const pairs=transferPairs(queue).filter(p=>![p.out.id,p.in.id].some(id=>feeIDs.has(id))),pairIDs=new Set(pairs.flatMap(p=>[p.out.id,p.in.id])),items=[];
 for(const pair of pairs){if(!live)continue;if([pair.out,pair.in].every(t=>t.date<from||reviewed.get(t.id)?.reviewed==='Reviewed'))continue;if(live&&![pair.out,pair.in].some(t=>live.has(t.id)))continue;items.push({key:'transfer:'+pair.key,ids:[pair.out.id,pair.in.id],transactions:[pair.out,pair.in],merchant:'Transfer: '+pair.out.primary.account+' → '+pair.in.primary.account,treatment:'transfer',category:'',description:pair.out.description,preferred:[],provenance:'Transfer candidate',reason:'Equal amount, opposite directions and different accounts. Confirm these existing records belong together.',groupKey:'transfer:'+pair.key,source:null,editable:true,pair});}
 for(const t of queue){if(!live||t.date<from||pairIDs.has(t.id)||feeIDs.has(t.id)||reviewed.get(t.id)?.reviewed==='Reviewed'||live&&!live.has(t.id))continue;const receipt=receipts[business+':'+t.id];if(receipt?.reviewedVerified)continue;
  const rs=sources.get(t.id)||[],source=rs.length===1?rs[0]:null,key=normalize(merchantText(t.description)),prefs=[...(history.get(key)||new Map())].sort((a,b)=>b[1]-a[1]).map(([name])=>name);
  const hits=matchingRules(t.description,rules,t,business),targets=[...new Set(hits.map(h=>h.category))],proposal=proposals.filter(p=>p.rule&&matchingRules(t.description,[p.rule],t,business).length),suggested=[...new Set(proposal.map(p=>p.rule.category))];
  const signal=source?serviceSuggestion(source,rules,names,t,business):null;
  let treatment=t.direction==='out'?'purchase':'',category='',provenance='Needs your decision',reason=t.reason||'Choose the treatment and category.';
  const sourceRefund=source?.kind==='Refund',returnWording=/\b(refund|return|reversal)\b/i.test(t.description),policyReturn=/\babercrombie\b/i.test(merchantText(t.description))&&t.direction==='in';
  if(t.direction==='in'&&(sourceRefund||returnWording||policyReturn)){treatment='refund';reason=policyReturn?'Your stated retailer-return policy. Confirm this is a return.':'Refund evidence: return money to the original purchase category.';}
  else if(t.direction==='in'&&targets.length===1&&categories.find(c=>c.name===targets[0])?.group==='Income'){treatment='income';category=targets[0];provenance='Approved incoming rule';}
  if(t.direction==='out'&&targets.length===1){category=targets[0];provenance='Approved merchant rule';reason=hits[0].name;}
  else if(category){reason=hits[0]?.name||reason;}
  else if(t.sourceEvidence&&t.proposed&&names.includes(t.proposed)&&t.direction==='out'){category=t.proposed;provenance='Approved source choice';reason=t.reason;}
  else if(signal?.category){category=signal.category;provenance='Source suggestion';reason=signal.reason;}
  else if(suggested.length===1){category=suggested[0];provenance='Rule proposal — not approved';reason=proposal[0].reason;}
  else if(prefs.length){category=prefs[0];provenance='Historical suggestion';reason='Weighted toward your 2023–2024 bookkeeping. History alone does not establish purpose.';}
  if(source?.provider==='amazon'&&source.kind==='Purchase'&&source.items?.length&&source.items.every(i=>/^therapeutic massage equipment$/i.test(i.productCategory||''))&&!source.allocationNeedsReview){category=names.find(n=>/^Personal Miscellaneous\b/.test(n))||'';provenance='Your stated personal item';reason='Therapeutic massage equipment; you identified this purchase as personal.';}
  if(policyReturn){category=names.find(n=>/^Personal Miscellaneous\b/.test(n))||category;provenance='Your stated refund policy';}
  const allowed=rankedCategories(categories,treatment,[category,...prefs]);if(!allowed.some(c=>c.name===category))category='';
  const processorPurchase=/\b(?:paypal|venmo)\b/i.test(merchantText(t.description))&&!/\b(?:transfer|loan|repayment|cash|atm|autopay|card payment|credit crd)\b/i.test(t.description);
  const personalCash=t.direction==='out'&&/\b(?:atm|cash withdrawal)\b/i.test(t.description),unknownCheck=/\bcheck\b/i.test(t.description)&&!source;
  if(personalCash){treatment='personal-withdrawal';category='';provenance='Cash withdrawal — needs your decision';reason='Choose a personal category only if this was personal cash. Business cash needs separate receipt/allocation evidence.';}if(unknownCheck){category='';provenance='Check payee needs your input';reason='Bank wording does not identify the purpose. Choose a category from your own payee or receipt records.';}
  const structure=t.primary&&t.postings.length===2&&t.categories.length===1&&!t.existingTransfer&&!/loan/i.test(t.primary.type),blocked=['Ambiguous transfer','Existing multi-account'].includes(t.kind)||!structure||(t.direction==='out'&&nonPurchaseReason(t)&&!source&&!processorPurchase&&!personalCash&&!unknownCheck);
  if(targets.length>1){category='';provenance='Conflicting rules';reason='Choose between conflicting categories.';}
  if(rs.length>1){category='';reason='Several sources claim this charge; review the source allocation.';}
  const sourceCandidates=source?[]:records.filter(r=>!r.conflict&&r.currency==='USD'&&['Purchase','Refund','Incoming payment'].includes(r.kind)&&Math.abs(day(t.date)-day(r.date))<=7&&[r.bankAmountCents,r.amountCents].includes(t.amount)&&new RegExp(r.provider==='amazon'?'amazon|amzn':r.provider,'i').test(t.description)).slice(0,5);
  const merchant=source?.merchant||(targets.length===1?hits[0].name:merchantText(t.description).replace(/\s+(?:#|store\s*#?\s*)\d{1,6}\s*$/i,''))||t.description,groupKey=JSON.stringify([normalize(merchant),t.direction,t.primary?.account,treatment,category,source?sourceGroupKey(source):'',blocked?t.id:'']);
  items.push({key:t.id,ids:[t.id],transactions:[t],merchant,treatment,category,description:descriptionSuggestion(t,source),preferred:[...new Set([category,...suggested,...prefs].filter(Boolean))],provenance,reason,source,sourceCandidates,groupKey,editable:!blocked,blocked:blocked?(/loan|repayment/i.test(t.description)||/loan/i.test(t.primary?.type)?'Loan principal and interest need a supported allocation; the desk will not invent one.':structure?'Card payment or ambiguous transfer needs a supported counterpart.':'Split or multi-account structure requires individual handling.'):'',comparison:comparisons.get(t.id),receipt});
 }
 if(live){const exportIDs=new Set(transactions.map(t=>t.id));for(const r of live.values())if(r.date>=from&&!exportIDs.has(r.id)&&r.reviewed!=='Reviewed'){const t={id:r.id,date:r.date,description:r.description||'Unreadable description',primary:{account:r.account||'Unknown account'},amount:r.amountCents,direction:'unknown'};items.push({key:'missing:'+r.id,ids:[r.id],transactions:[t],merchant:t.description,treatment:'',category:'',description:t.description,preferred:[],provenance:'Missing from export',reason:'Import a fresh accounting.csv so this record has complete ledger postings.',groupKey:'missing:'+r.id,source:null,editable:false,blocked:'No accounting export snapshot; no edit can be queued.'});}}
 for(const f of fees){if(f.source.date<from||f.ids.length&&f.ids.every(id=>reviewed.get(id)?.reviewed==='Reviewed'))continue;items.push({...f,key:f.key,merchant:f.source.provider+' fee-adjusted transfer',transactions:f.ids.map(id=>transactions.find(t=>t.id===id)),treatment:'fee-transfer',category:'',description:'',preferred:[],provenance:f.state,source:f.source,groupKey:f.key,editable:false,blocked:f.reason});}
 const groups=new Map();for(const item of items){if(!groups.has(item.groupKey))groups.set(item.groupKey,{key:item.groupKey,merchant:item.merchant,items:[]});groups.get(item.groupKey).items.push(item);}
 return {business,from,categories,items,groups:[...groups.values()].sort((a,b)=>a.items.length-b.items.length||a.merchant.localeCompare(b.merchant)),comparisons:[...comparisons.values()],records,transactions,queue,preparedAt:new Date().toISOString(),capture:list?.capturedAt||null,complete:!!list&&list.completeness==='count-confirmed',stats:{transactions:transactions.length,sources:records.length,reviewed:[...reviewed.values()].filter(r=>r.reviewed==='Reviewed').length,pending:items.length,transferPairs:pairs.length,feeTransfers:fees.length}};
}
export function stageCommandItem(item,choice,model){
 if(!item?.editable)throw Error(item?.blocked||'This item cannot be queued.');
 const treatment=choice.treatment||item.treatment,category=choice.category||'',description=choice.description??item.description;
 if(treatment==='transfer'){if(!item.pair||item.pair.out.amount!==item.pair.in.amount)throw Error('Only equal existing transfer pairs can be queued.');}
 else{if(!['purchase','refund','income','personal-deposit','personal-withdrawal'].includes(treatment))throw Error('Choose purchase, refund, income or personal deposit.');const t=item.transactions[0];if((['purchase','personal-withdrawal'].includes(treatment))!==(t.direction==='out'))throw Error('Treatment disagrees with money direction.');if(!rankedCategories(model.categories,treatment).some(c=>c.name===category))throw Error('Choose an exact category appropriate for this treatment.');if(typeof description!=='string'||!description.trim()||description.length>255&&description!==t.description)throw Error('Description must be nonempty; additions are limited to 255 characters.');}
 return {key:item.key,business:model.business,treatment,category,description,ids:[...item.ids],expected:item.transactions.map(recordSnapshot),sources:item.source?[{key:item.source.key,expected:evidenceSnapshot(item.source)}]:[],approvedAt:new Date().toISOString(),requestReview:true,merchant:item.merchant};
}
export function validateCommandDecision(d,model){
 if(!d||d.business!==model.business||!Array.isArray(d.ids)||!d.ids.length||!Array.isArray(d.expected)||d.expected.length!==d.ids.length||new Set(d.ids).size!==d.ids.length||!d.requestReview)return 'Decision belongs to a changed business or malformed queue.';
 if(!['purchase','refund','income','personal-deposit','personal-withdrawal','transfer'].includes(d.treatment))return 'Choose a supported transaction treatment.';
 if(!model.complete)return 'Prepare a count-confirmed live snapshot before execution.';
 for(const [i,id] of d.ids.entries()){const t=model.transactions.find(t=>t.id===id);if(!t||t.date<model.from||!same(recordSnapshot(t),d.expected[i]))return 'Export snapshot changed; inspect before execution.';}
 if(d.treatment!=='transfer'){const t=model.transactions.find(t=>t.id===d.ids[0]);if(d.ids.length!==1||(['purchase','personal-withdrawal'].includes(d.treatment))!==(t.direction==='out')||!t.primary||t.postings.length!==2||t.categories.length!==1||t.existingTransfer||/loan/i.test(t.primary.type))return 'Direction or record structure cannot use this decision.';if(typeof d.description!=='string'||!d.description.trim()||(d.description.length>255&&d.description!==t.description))return 'Description is invalid.';}else if(d.ids.length!==2)return 'A transfer decision must contain exactly two existing records.';
 if(d.sources&&!Array.isArray(d.sources))return 'Malformed source snapshot.';
 for(const src of d.sources||[]){const r=model.records.find(r=>r.key===src.key);if(!r||!same(evidenceSnapshot(r),src.expected))return 'Source evidence changed; approve the revised evidence.';}
 if(d.treatment!=='transfer'&&!rankedCategories(model.categories,d.treatment).some(c=>c.name===d.category))return 'Selected category is no longer available for this treatment.';
 if(d.treatment==='transfer'&&model.items.some(i=>i.treatment==='fee-transfer'&&i.ids.some(id=>d.ids.includes(id))))return 'Source-supported fees need a separate allocation, not an ordinary transfer.';
 if(d.treatment==='transfer'&&!transferPairs(model.queue).some(p=>[p.out.id,p.in.id].every(id=>d.ids.includes(id))))return 'Transfer pairing is no longer uniquely supported.';
 return null;
}
export function decisionRecord(t,d){return {...t,kind:'Merchant rule',proposed:d.category,commandDecision:d,intent:d.treatment,approvedDescription:d.description};}
export function approvedCommandRecord(t){const d=t?.commandDecision;return !!d&&d.requestReview&&d.ids?.length===1&&d.ids[0]===t.id&&d.category===t.proposed&&same(recordSnapshot(t),d.expected[0])&&['purchase','refund','income','personal-deposit','personal-withdrawal'].includes(d.treatment)&&(['purchase','personal-withdrawal'].includes(d.treatment))===(t.direction==='out');}
export async function executeCommandQueue({decisions,model,checkpoint,execute,refresh,stopped=()=>false,current=()=>true,progress=()=>{}}){
 const result={completed:0,attention:[],stopped:false,uncertain:false};
 for(const [index,d] of decisions.entries()){if(stopped()||!current()){result.stopped=true;break;}const problem=validateCommandDecision(d,model);if(problem){await checkpoint(d.key,{status:'attention',message:problem});result.attention.push({key:d.key,message:problem});continue;}
  progress({index,total:decisions.length,decision:d});await checkpoint(d.key,{status:'executing',startedAt:new Date().toISOString()});let out;
  try{out=await execute(d);}catch(e){out={needsAttention:true,saveAttempted:true,message:e.message};}
  const verified=d.treatment==='transfer'?out?.verified&&out.reviewed:out?.categoryVerified&&out.reviewedVerified&&out.descriptionVerified!==false;
  if(verified){await checkpoint(d.key,{status:'done',result:out,verifiedAt:new Date().toISOString()});result.completed++;continue;}
  const safe=out?.needsAttention&&out.saveAttempted===false,status=safe?'attention':'uncertain';await checkpoint(d.key,{status,result:out,message:out?.message||'Saved result is not verified.'});result.attention.push({key:d.key,message:out?.message||'Verification failed.'});
  if(!safe){result.stopped=true;result.uncertain=true;break;}
 }
 if(current())try{await refresh();}catch(e){result.attention.push({message:'Final refresh: '+e.message});}return result;
}
export function createCommandStore({business,initial={},persist,delay=80,onError=()=>{},onSaved=()=>{}}){
 let state={version:1,business,decisions:{},results:{},deferred:{},...initial,business},revision=0,saved=0,timer=null,pumping=null,error=null;
 async function drain(){if(pumping)return pumping;pumping=(async()=>{while(saved<revision){const current=revision,value=structuredClone(state);try{await persist(value);saved=current;error=null;onSaved(current);}catch(e){error=e;onError(e);throw e;}}})();try{await pumping;}finally{pumping=null;}}
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{timer=null;void drain().catch(()=>{});},delay);}
 const mutate=fn=>{state=fn(state);revision++;schedule();return state;};
 return {get:()=>state,stage:entries=>mutate(s=>{const decisions={...s.decisions},results={...s.results};for(const d of entries){if(Object.values(decisions).some(old=>old.key!==d.key&&old.ids?.some(id=>d.ids.includes(id))))throw Error('A record is already claimed by another queued decision. Undo that decision first.');if(['executing','uncertain','done'].includes(results[d.key]?.status))throw Error('A saved attempt cannot be restaged automatically.');decisions[d.key]=d;delete results[d.key];}return {...s,decisions,results};}),undo:key=>mutate(s=>{if(['executing','uncertain','done'].includes(s.results[key]?.status))throw Error('Saved attempts must be rechecked, not undone.');const decisions={...s.decisions},results={...s.results};delete decisions[key];delete results[key];return {...s,decisions,results};}),defer:(key,value)=>mutate(s=>({...s,deferred:{...s.deferred,[key]:value}})),checkpoint:async(key,value)=>{mutate(s=>({...s,results:{...s.results,[key]:value}}));await drain();},flush:async()=>{clearTimeout(timer);timer=null;await drain();if(error)throw error;},pending:()=>saved<revision,stats:()=>({revision,saved})};
}
