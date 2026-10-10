import {recordSnapshot} from './plan.js';
import {evidenceSnapshot} from './service-solvers.js';
import {nonPurchaseReason} from './rules.js';

export const subscriptionVersion=2;
const clean=v=>String(v??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const day=date=>Date.parse(date+'T00:00:00Z')/86400000;
const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(day(date))&&new Date(day(date)*86400000).toISOString().slice(0,10)===date;
const median=values=>{const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
const code=value=>/^[A-Z]{3}$/.test(value||'')?value:'Unspecified';
const cadences=[{id:'weekly',label:'Weekly',days:7,tolerance:2,annual:365.2425/7,minLikely:4},{id:'fortnightly',label:'Every two weeks',days:14,tolerance:3,annual:365.2425/14,minLikely:3},{id:'monthly',label:'Monthly',months:1,tolerance:5,annual:12,minLikely:3},{id:'quarterly',label:'Quarterly',months:3,tolerance:7,annual:4,minLikely:3},{id:'annual',label:'Annual',months:12,tolerance:10,annual:1,minLikely:3}];

export function subscriptionMerchant(description){
 const processorDescription=clean(description).toUpperCase();
 let value=processorDescription
  .replace(/^(?:PURCHASE(?: AUTHORIZED)?|RECURRING(?: CARD)?(?: PURCHASE| PAYMENT)?|DEBIT CARD(?: PURCHASE)?|POS(?: PURCHASE)?)\s+(?:ON\s+)?\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s*/,'')
  .replace(/\s+(?:CARD|ENDING(?: IN)?)\s*\d{4}\s*$/,'')
  .replace(/\b(?:REF(?:ERENCE)?|AUTH(?:ORIZATION)?|ORDER|TRANSACTION)\s*[#:-]?\s*[A-Z0-9-]{6,}\b/g,'')
  .replace(/\s+S\d{9,}\b/g,'')
  .replace(/\*[A-Z0-9]{6,}\b/g,match=>/\b(?:AMAZON|AMZN|MKTPL|PAYPAL|VENMO)\b/.test(processorDescription)&&(match.match(/\d/g)||[]).length>=4&&(match.match(/[A-Z]/g)||[]).length<=4?'':match)
  .replace(/\s+\d{2}[/-]\d{2}(?:[/-]\d{2,4})?\b/g,'');
 value=clean(value.replace(/[^A-Z0-9*#&. -]/g,' '));
 const processor=/\b(?:AMAZON|AMZN|PAYPAL|VENMO|STRIPE|SQUARE)\b/.test(value);
 const namedProcessor=/^(?:PAYPAL|STRIPE|SQUARE)\s*\*\s*[A-Z][A-Z .&-]{3,}$/.test(value)&&! /\b(?:PAYMENT|TRANSFER|FUNDING|BALANCE)\b/.test(value);
 const identifiedAmazon=/\b(?:AMAZON|AMZN)\b.*\bPRIME\b/.test(value);
 return {key:value.toLowerCase(),name:value||'Unknown merchant',generic:processor&&!namedProcessor&&!identifiedAmazon};
}

// Canonical exports, validated live baselines and saved observations enrich list
// rows without opening a transaction. Unknown flow is held rather than guessed.
export function prepareSubscriptionTransactions({business,transactions=[],liveTransactions=[],reports=[],receipts={},evidence=[],sourceState={},sourceBusiness=sourceState.business}={}){
 const grouped=new Map(),originals=new Map(),accountingIDs=new Set(),historySet=new Set(transactions),excluded={},problems=[];
 const exclude=reason=>excluded[reason]=(excluded[reason]||0)+1;
 const add=row=>{if(!/^\d+$/.test(row.id||'')||!validDate(row.date)||!clean(row.account)||!clean(row.description)||!Number.isSafeInteger(row.amountCents)||row.amountCents<=0){exclude('Unreadable identity, account, date or amount');return;}if(/…|\.{3}/.test(row.account+' '+row.description)){exclude('Truncated account or description');return;}if(!grouped.has(row.id))grouped.set(row.id,[]);grouped.get(row.id).push(row);};
 for(const t of [...transactions,...liveTransactions]){
  if(!business||t.business&&t.business!==business||t.liveBusiness&&t.liveBusiness!==business)continue;
  if(!originals.has(t.id))originals.set(t.id,t);
  if(historySet.has(t))accountingIDs.add(t.id);
  add({id:t.id,date:t.date,description:t.description,account:t.primary?.account,accountKey:t.primary?.accountId||clean(t.primary?.account),amountCents:t.amount,direction:t.direction,currency:code(t.currency||t.liveBaseline?.currency||t.primary?.currency),categories:t.categories||[],transfer:!!t.existingTransfer||/transfer/i.test(t.kind||'')||!!t.partner||/loan/i.test(t.primary?.type||'')||/^(?:Card payment|Installment or financing)/.test(nonPurchaseReason(t)),source:t.origin==='wave-live'?'Confirmed live details':'Accounting history'});
 }
 const fullReports=reports.filter(r=>r?.business===business&&r.filter==='ALL');
 for(const report of reports.filter(r=>r?.business===business))for(const r of report.records||[]){
  const direction=r.direction||(r.type==='Withdrawal'?'out':r.type==='Deposit'?'in':/^\s*[-−]/.test(r.amountText||'')?'out':/^\s*\+/.test(r.amountText||'')?'in':null);
  add({id:r.id,date:r.date,description:r.description,account:r.account,accountKey:r.accountId||clean(r.account),amountCents:r.amountCents,direction,currency:code(r.currency),categories:[r.category||''],transfer:/^(?:Transfer(?: to| from| Clearing)?|Payment (?:Sent|Received) for)\b/i.test(r.category||''),source:report.filter==='ALL'?'Full live collection':'Not Reviewed collection',capture:report.capturedAt});
 }
 const transferIDs=new Set();
 for(const [key,r] of Object.entries(receipts)){
  if(!key.startsWith(business+':'))continue;
  if(key.includes(':transfer:')&&(r.saveAttempted||r.verified))for(const id of r.ids||[])transferIDs.add(id);
  for(const snapshot of [r.originalSnapshot,r.snapshot]){const f=snapshot?.fields;if(snapshot?.identity?.business!==business||!f||snapshot.problems?.length)continue;
   const amount=clean(f.amount).replace(/^(?:USD\s*)?\$/,'').replace(/,/g,'');if(!/^\d+(?:\.\d{1,2})?$/.test(amount))continue;
   add({id:snapshot.identity.transaction,date:f.date,description:f.description,account:f.account,accountKey:clean(f.account),amountCents:Math.round(Number(amount)*100),direction:f.type==='Withdrawal'?'out':f.type==='Deposit'?'in':null,currency:code(snapshot.currency),categories:[f.category||''],transfer:/^(?:Transfer|Payment (?:Sent|Received) for)\b/i.test(f.category||''),source:'Saved live observation',capture:snapshot.capturedAt});
  }
 }
 const linked=new Map();
 for(const r of evidence){const link=sourceState.links?.[r.key],choice=sourceState.decisions?.[r.key],original=originals.get(link?.id);
  if(sourceBusiness!==business||!original||!Number.isFinite(Date.parse(link.confirmedAt))||!equal(link.expected,recordSnapshot(original))||!equal(choice?.expected,evidenceSnapshot(r))||sourceState.exclusions?.[r.key]||r.kind!=='Purchase'||r.blocked||r.conflict||r.issues?.length||!clean(r.merchant))continue;
  if(!linked.has(original.id))linked.set(original.id,[]);linked.get(original.id).push(r);
 }
 const rows=[];
 for(const [id,variants] of grouped){
  const flows=[...new Set(variants.map(r=>r.direction).filter(Boolean))],currencies=[...new Set(variants.map(r=>r.currency).filter(c=>c!=='Unspecified'))];
  const baseline=variants[0];
  if(variants.some(r=>r.date!==baseline.date||clean(r.account)!==clean(baseline.account)||r.amountCents!==baseline.amountCents)||flows.length>1||currencies.length>1){exclude('Conflicting copies');problems.push('Transaction '+id+' has conflicting copies; excluded from patterns.');continue;}
  if(flows.length!==1){exclude('Money direction not recorded');continue;}
  if(flows[0]!=='out'){exclude('Income, deposits or refunds');continue;}
  if(transferIDs.has(id)||variants.some(r=>r.transfer)||variants.some(r=>r.categories.some(c=>/^(?:Transfer|Credit Card Payment|Refund for|Opening balance|Retained Earnings)\b/i.test(c)))||/\b(?:CREDIT CARD|LOAN|MORTGAGE)\s+(?:PAYMENT|PMT|PYMT)|^(?:CARD\s+(?:PAYMENT|PMT|PYMT)|PAYMENT THANK YOU)\b|\b(?:BALANCE TRANSFER|TRANSFER TO|TRANSFER FROM)\b/i.test(baseline.description)){exclude('Transfers, payments or non-purchase movements');continue;}
  const latest=[...variants].sort((a,b)=>String(b.capture||'').localeCompare(String(a.capture||'')))[0],source=linked.get(id),merchant=subscriptionMerchant(latest.description);
  const confirmed=source?.length===1&&variants.every(r=>clean(r.description)===clean(originals.get(id)?.description));
  const linkedMerchant=confirmed?subscriptionMerchant(source[0].merchant):null;
  const items=confirmed?(source[0].items||[]).map(i=>clean(i.title)).filter(Boolean).sort():[];
  rows.push({...baseline,description:latest.description,direction:'out',currency:currencies[0]||'Unspecified',merchant:linkedMerchant?.name||merchant.name,merchantKey:linkedMerchant?JSON.stringify([source[0].provider,linkedMerchant.key,items]):merchant.key,generic:linkedMerchant?linkedMerchant.generic:merchant.generic,evidence:confirmed?{provider:source[0].provider,merchant:source[0].merchant,items,note:source[0].note||'',confirmed:true}:null,sources:[...new Set(variants.map(v=>v.source))]});
 }
 const allObserved=[...grouped.values()].map(v=>v[0]).sort((a,b)=>a.date.localeCompare(b.date));
 const countConfirmed=fullReports.filter(r=>!r.running&&r.completeness==='count-confirmed'&&Number.isFinite(Date.parse(r.capturedAt))&&Number.isSafeInteger(r.expectedTotal)&&r.expectedTotal===(r.records||[]).length&&new Set((r.records||[]).map(v=>v.id)).size===r.expectedTotal&&(r.records||[]).every(v=>/^\d+$/.test(v.id||''))).sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)))[0];
 return {business,transactions:rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)),coverage:{observed:grouped.size,eligible:rows.length,earliest:allObserved[0]?.date||null,latest:allObserved.at(-1)?.date||null,accountingCount:accountingIDs.size,fullCountConfirmed:!!countConfirmed,fullCapture:countConfirmed?.capturedAt||null,fullYears:countConfirmed?.years||[],partialFullHistory:fullReports.some(r=>r.running||r.completeness!=='count-confirmed'),unspecifiedCurrency:rows.filter(r=>r.currency==='Unspecified').length,excluded,problems}};
}

function addMonths(date,months,anchor=null){const d=new Date(date+'T00:00:00Z'),wanted=anchor??d.getUTCDate(),target=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+months,1)),end=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(wanted,end));return target.toISOString().slice(0,10);}
export function subscriptionRecentSince(asOf){if(!validDate(asOf))throw Error('A valid analysis date is required.');return addMonths(asOf,-18);}
function relation(a,b,c){const delta=day(b.date)-day(a.date);if(delta<=0)return null;
 const months=(Number(b.date.slice(0,4))-Number(a.date.slice(0,4)))*12+Number(b.date.slice(5,7))-Number(a.date.slice(5,7));
 const cycles=Math.round(c.months?months/c.months:delta/c.days);if(cycles<1||cycles>3)return null;
 const expected=c.months?day(addMonths(a.date,c.months*cycles)):day(a.date)+c.days*cycles,residual=Math.abs(day(b.date)-expected);
 return residual<=c.tolerance?{cycles,residual}:null;
}
function bestChain(rows,c){const scores=[],previous=[],lengths=[];
 for(let i=0;i<rows.length;i++){scores[i]=100;previous[i]=-1;lengths[i]=1;
  for(let j=i-1;j>=0;j--){if(day(rows[i].date)-day(rows[j].date)>(c.months?c.months*94:c.days*3+c.tolerance))break;
   const r=relation(rows[j],rows[i],c);if(!r)continue;
   const amountPenalty=Math.min(30,Math.abs(rows[i].amountCents-rows[j].amountCents)/rows[j].amountCents*30),score=scores[j]+100+5-r.residual-amountPenalty-(r.cycles-1)*12;
   if(score>scores[i]){scores[i]=score;previous[i]=j;lengths[i]=lengths[j]+1;}
  }
 }
 const winner=scores.reduce((best,score,i)=>score>scores[best]?i:best,0),indices=[];let at=winner;while(at>=0){indices.unshift(at);at=previous[at];}
 const selected=indices.map(i=>rows[i]);if(selected.length<2||!selected.slice(1).some((r,i)=>relation(selected[i],r,c)?.cycles===1))return null;
 return {rows:selected,cadence:c,score:scores[winner]};
}
function candidate(chain,business,asOf){
 const {rows,cadence:c}=chain,amounts=rows.map(r=>r.amountCents),historicalTypical=Math.round(median(amounts)),last=rows.at(-1),deviations=amounts.map(v=>Math.abs(v-historicalTypical)/historicalTypical),bands=[];
 for(const r of rows){const band=bands.at(-1);if(band&&Math.abs(r.amountCents-median(band.map(t=>t.amountCents)))/median(band.map(t=>t.amountCents))<=.1)band.push(r);else bands.push([r]);}
 const priceStep=bands.length>=2&&bands.length<=3&&bands.every(b=>b.length>=2)&&bands.slice(1).every((b,i)=>median(b.map(t=>t.amountCents))>median(bands[i].map(t=>t.amountCents)));
 const variable=!priceStep&&median(deviations)>.15,typical=priceStep?Math.round(median(bands.at(-1).map(t=>t.amountCents))):historicalTypical;
 const transitions=rows.slice(1).map((r,i)=>relation(rows[i],r,c)),missing=transitions.reduce((s,r)=>s+r.cycles-1,0),timing=1-transitions.reduce((s,r)=>s+r.residual,0)/(transitions.length*(c.tolerance+1));
 const score=Math.min(99,Math.round(50+timing*20+(variable?5:20)+Math.min(9,rows.length*2)-missing*4));
 const confidence=!last.generic&&rows.length>=c.minLikely&&score>=85?'likely':'possible';
 const lateCharges=amounts.slice(-3),estimateAmount=variable?typical:Math.round(median(lateCharges)),annualCents=Math.round(estimateAmount*c.annual);
 const days=rows.map(r=>Number(r.date.slice(8))),monthEnd=c.months&&rows.filter(r=>Number(r.date.slice(8))>=new Date(Date.UTC(Number(r.date.slice(0,4)),Number(r.date.slice(5,7)),0)).getUTCDate()-2).length>=Math.ceil(rows.length*.7),anchor=monthEnd?31:Math.round(median(days));
 const next=c.months?addMonths(last.date,c.months,anchor):new Date((day(last.date)+c.days)*86400000).toISOString().slice(0,10);
 const old=amounts.slice(0,-1),prior=priceStep?Math.round(median(bands.at(-2).map(t=>t.amountCents))):old.length>=2?Math.round(median(old)):null,change=!variable&&prior&&last.amountCents>=prior*1.1?{previousCents:prior,latestCents:last.amountCents,percent:Math.round((last.amountCents/prior-1)*100),date:priceStep?bands.at(-1)[0].date:last.date,tentative:true}:null;
 const currency=last.currency,key=JSON.stringify([business,last.accountKey,currency,last.merchantKey,c.id,rows[0].id]);
 return {key,business,merchant:last.merchant,merchantKey:last.merchantKey,account:last.account,accountKey:last.accountKey,currency,cadence:c.id,frequency:c.label,kind:variable?'variable':'fixed',confidence,score:Math.min(last.generic||rows.length<c.minLikely?79:99,score),typicalCents:typical,latestCents:last.amountCents,lastDate:last.date,firstDate:rows[0].date,monthlyCents:Math.round(annualCents/12),annualCents,nextDate:next,overdue:validDate(asOf)&&day(asOf)>day(next)+c.tolerance,priceChange:change,generic:last.generic,missingCycles:missing,transactions:rows,explanation:rows.length+' outgoing charges follow a '+c.label.toLowerCase()+' pattern'+(missing?' with '+missing+' expected interval'+(missing===1?'':'s')+' not observed':'')+'. '+(variable?'Amounts vary; this may be a recurring bill.':'Amounts are broadly consistent.')+(last.generic?' The processor or retail descriptor does not identify a subscription.':'')+(rows.length<c.minLikely?' More cycles are needed for stronger confidence.':''),flags:[]};
}

export function findSubscriptions(prepared,{asOf=new Date().toISOString().slice(0,10),progress=()=>{}}={}){
 const recentSince=subscriptionRecentSince(asOf);
 const history=prepared.transactions.filter(t=>!validDate(asOf)||t.date<=asOf),future=prepared.transactions.length-history.length;
 const groups=new Map();for(const t of history){const key=JSON.stringify([t.accountKey,t.currency,t.merchantKey]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
 const findings=[],analysisIssues=[];
 for(const [index,rows] of [...groups.values()].entries()){
  progress({completed:index,total:groups.size,detail:rows[0].merchant});
  if(rows.length>600){analysisIssues.push(rows[0].merchant+' has '+rows.length+' charges. Use confirmed service/item evidence to separate this high-volume group.');continue;}
  let remaining=[...rows].sort((a,b)=>a.date.localeCompare(b.date)||a.amountCents-b.amountCents||a.id.localeCompare(b.id));
  while(remaining.length>=2){const chains=cadences.map(c=>bestChain(remaining,c)).filter(Boolean).sort((a,b)=>b.score-a.score);if(!chains.length)break;const best=chains[0],found=candidate(best,prepared.business,asOf);findings.push(found);const used=new Set(best.rows.map(r=>r.id));remaining=remaining.filter(r=>!used.has(r.id));}
 }
 // Join consecutive price bands, never overlapping independent billing streams.
 for(let i=0;i<findings.length;i++)for(let j=i+1;j<findings.length;j++){const a=findings[i],b=findings[j];if(!a||!b||a.merchantKey!==b.merchantKey||a.accountKey!==b.accountKey||a.currency!==b.currency||a.cadence!==b.cadence)continue;
  const [earlier,later]=a.lastDate<b.firstDate?[a,b]:b.lastDate<a.firstDate?[b,a]:[];
  const cadence=cadences.find(c=>c.id===a.cadence);
  if(earlier&&relation(earlier.transactions.at(-1),later.transactions[0],cadence)?.cycles===1){findings[i]=candidate({rows:[...earlier.transactions,...later.transactions],cadence},prepared.business,asOf);findings[j]=null;}
 }
 const result=findings.filter(Boolean);
 // Keep every supporting transaction. Age affects presentation and current
 // estimates only; separate plans at one merchant retain their own last charge.
 for(const finding of result)finding.recency=finding.lastDate>=recentSince?'recent':'historical';
 for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++){const a=result[i],b=result[j];if(a.merchantKey!==b.merchantKey||a.currency!==b.currency||a.lastDate<b.firstDate||b.lastDate<a.firstDate)continue;
  for(const item of [a,b])if(!item.flags.includes('Multiple recurring schedules at this merchant'))item.flags.push('Multiple recurring schedules at this merchant');
  if(a.cadence===b.cadence&&Math.abs(a.typicalCents-b.typicalCents)<=Math.max(1,a.typicalCents*.02)&&Math.abs(day(a.lastDate)-day(b.lastDate))<=cadences.find(c=>c.id===a.cadence).tolerance)for(const item of [a,b])item.flags.push('Possible duplicate subscription — compare both timelines');
 }
 return {version:subscriptionVersion,business:prepared.business,asOf,recentSince,recentMonths:18,coverage:{...prepared.coverage,eligible:history.length,unspecifiedCurrency:history.filter(t=>t.currency==='Unspecified').length,excluded:{...prepared.coverage.excluded,...(future?{'Future-dated records are not observed charges':future}:{})}},findings:result.sort((a,b)=>b.score-a.score||b.monthlyCents-a.monthlyCents||a.key.localeCompare(b.key)),analysisIssues};
}

export function subscriptionChoice(state,finding){
 if(state?.business!==finding.business)return null;
 const ids=new Set(finding.transactions.map(t=>t.id));
 const matching=Object.entries(state.choices||{}).filter(([,d])=>{const shared=d.ids.filter(id=>ids.has(id)).length;return d.accountKey===finding.accountKey&&d.currency===finding.currency&&d.cadence===finding.cadence&&shared>0&&(d.merchantKey===finding.merchantKey||shared>=2&&shared/Math.min(d.ids.length,ids.size)>=.5);});
 return matching.length===1?{key:matching[0][0],...matching[0][1]}:null;
}
export function saveSubscriptionChoice(state,finding,{kind,name='',note=''},now=new Date().toISOString()){
 if(state.business!==finding.business||!['subscription','bill','dismissed','unconfirmed'].includes(kind)||clean(name).length>100||note.length>1000)throw Error('Invalid local subscription choice.');
 const previous=subscriptionChoice(state,finding),key=previous?.key||finding.key,before=state.choices?.[key]||null;
 const after={kind,name:clean(name),note:String(note),merchant:finding.merchant,account:finding.account,lastSeen:finding.lastDate,accountKey:finding.accountKey,currency:finding.currency,merchantKey:finding.merchantKey,cadence:finding.cadence,ids:[...new Set([...(before?.ids||[]),...finding.transactions.map(t=>t.id)])],updatedAt:now};
 return {...state,version:1,choices:{...state.choices,[key]:after},history:[...(state.history||[]).slice(-99),{key,before:structuredClone(before),after:structuredClone(after),at:now}]};
}
export function undoSubscriptionChoice(state){const last=state.history?.at(-1);if(!last)return state;const choices={...state.choices};if(last.before)choices[last.key]=structuredClone(last.before);else delete choices[last.key];return {...state,choices,history:state.history.slice(0,-1)};}
export function removeSubscriptionChoice(state,key,now=new Date().toISOString()){const before=state.choices?.[key];if(!before)return state;const choices={...state.choices};delete choices[key];return {...state,choices,history:[...(state.history||[]).slice(-99),{key,before:structuredClone(before),after:null,at:now}]};}
export function observeSubscriptionChoices(state,findings){let changed=false;const choices={...state.choices};for(const f of findings){const d=subscriptionChoice(state,f);if(!d)continue;const ids=[...new Set([...d.ids,...f.transactions.map(t=>t.id)])];if(ids.length!==d.ids.length||d.merchantKey!==f.merchantKey){choices[d.key]={...choices[d.key],ids,merchantKey:f.merchantKey,merchant:f.merchant,lastSeen:f.lastDate};changed=true;}}return changed?{...state,choices}:state;}
export function subscriptionTotals(findings,state){const totals=new Map();for(const f of findings){const d=subscriptionChoice(state,f);if(f.recency==='historical'||!['subscription','bill'].includes(d?.kind))continue;const key=f.currency==='Unspecified'?f.accountKey+' (currency unspecified)':f.currency;if(!totals.has(key))totals.set(key,{label:f.currency==='Unspecified'?f.account+' (currency unspecified)':f.currency,monthlyCents:0,annualCents:0,count:0});const total=totals.get(key);total.monthlyCents+=f.monthlyCents;total.annualCents+=f.annualCents;total.count++;}return [...totals.values()];}
