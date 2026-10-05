import { checkTransferMenu } from './transfer-menu.js';
import { verifyCategoryResult } from './editor.js';
import { compareLive } from './model.js';
export function transferPairs(queue) {
 const byId=new Map(queue.map(t=>[t.id,t])),seen=new Set(),pairs=[];
 for(const t of queue){
  const other=byId.get(t.partner?.id);
  if(t.kind!=='Transfer candidate' || other?.kind!=='Transfer candidate' || other.partner?.id!==t.id || !t.primary || !other.primary || t.amount!==other.amount || t.amount<=0 || t.direction===other.direction || (t.primary.accountId ? t.primary.accountId===other.primary.accountId : t.primary.account===other.primary.account))continue;
  const key=[t.id,other.id].sort().join(':');if(seen.has(key))continue;seen.add(key);
  pairs.push({key,out:t.direction==='out'?t:other,in:t.direction==='in'?t:other});
 }
 return pairs;
}
export async function checkTransferRecords(pair,business,read,isCurrent=()=>true){
 const sides=[];
 for(const t of [pair.out,pair.in]){
  if(!isCurrent())return null;
  const snapshot=await read(t,isCurrent);
  if(!isCurrent())return null;
  const comparison=compareLive(t,snapshot || {fields:{}});
  const matches=snapshot?.identity?.business===business && !snapshot.problems?.length && comparison.checks.every(c=>c.state==='Match');
  sides.push({id:t.id,matches,reviewed:comparison.reviewed,checks:comparison.checks,problems:snapshot?.problems || []});
 }
 return {sides,matches:sides.every(s=>s.matches),message:sides.every(s=>s.matches)?'Both existing records match the export. Transfer pairing remains a candidate; confirm the payment context and link the existing records in Wave.':'Live records differ or are incomplete. Inspect both sides before linking; no transfer was created.'};
}
export function prepareTransferEdit(pair,business,snapshots,menu){
 if(transferPairs([pair.out,pair.in]).length!==1 || [pair.out,pair.in].some(t=>t.postings?.length!==2 || t.categories?.length!==1))throw Error('Only one unique pair of simple existing records can be linked.');
 const sides=[['Money out',pair.out],['Money in',pair.in]].map(([side,t])=>{const snapshot=snapshots[t.id] || {fields:{}};const comparison=compareLive(t,snapshot);const problems=[...(snapshot.problems || [])];if(snapshot.identity?.business!==business)problems.push('Wrong or unreadable Wave business.');return {side,id:t.id,checks:comparison.checks,problems,snapshot};});
 const failed=sides.filter(s=>s.problems.length || s.checks.some(c=>c.state!=='Match'));
 if(failed.length){const detail=failed.map(s=>s.side+': '+[...s.problems,...s.checks.filter(c=>c.state!=='Match').map(c=>c.field+' '+c.state+' (export: '+c.exported+'; live: '+c.live+')')].join('; ')).join(' | ');const error=Error('Both live records must match all original export fields. Nothing applied. '+detail);error.diagnostics={sides};throw error;}
 const checked=checkTransferMenu(menu,pair,business);if(!checked.ready)throw Error(checked.message);
 return {business,id:pair.out.id,category:'Transfer to '+pair.in.primary.account,expected:{...snapshots[pair.out.id].fields},transfer:{id:pair.in.id,label:checked.candidate,account:pair.in.primary.account,date:pair.in.date,description:pair.in.description}};
}
export function verifyTransferResult(pair,snapshots,business){
 const sides=[['out',pair.out,'Transfer to '+pair.in.primary.account],['in',pair.in,'Transfer from '+pair.out.primary.account]].map(([direction,t,category])=>{const snapshot=snapshots[t.id] || {fields:{}};const other=direction==='out'?pair.in:pair.out;const dates=[other.date,...['short','long'].map(month=>new Intl.DateTimeFormat('en-US',{month,day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(other.date+'T00:00:00Z')))];const tidy=s=>String(s || '').replace(/[—–]/g,'-').replace(/\s+/g,' ').trim();const full=dates.map(date=>tidy(category+' - '+date+' - '+other.description));const actual=snapshot.fields?.category;const expected=full.includes(tidy(actual))?actual:category;return {id:t.id,direction,...verifyCategoryResult(t,snapshot,business,expected)};});
 const verified=sides.every(s=>s.categoryVerified),reviewed=verified && sides.every(s=>s.reviewedVerified);
 return {sides,verified,reviewed,message:verified?reviewed?'Both saved transfer categories and reviewed statuses verified.':'Both saved transfer categories verified. Reviewed status is not confirmed on both sides; inspect Wave.':'Saved transfer could not be verified on both records. Inspect Wave; this attempt will not run again.'};
}

export function resetTransferReceipt(pair,snapshots,business,receipt){
 if(!receipt?.saveAttempted || receipt.verified || receipt.ids?.length!==2 || ![pair.out.id,pair.in.id].every(id=>receipt.ids.includes(id)) || transferPairs([pair.out,pair.in]).length!==1)throw Error('Only an unverified attempt for this exact pair can be reset.');
 const baseline=receipt.originalSnapshots || receipt.snapshots;
 for(const t of [pair.out,pair.in]){
  const s=snapshots[t.id],before=baseline?.[t.id];
  for(const value of [before,s])if(!value?.fields || value.identity?.business!==business || value.problems?.length || compareLive(t,value).checks.some(c=>c.state!=='Match'))throw Error('Both freshly reloaded records and the previous original snapshot must match the export before reset.');
  const controls=s.controls || [],reviewed=/^(Reviewed|Mark (as )?(unreviewed|not reviewed)|Unreview)$/i,mark=/^Mark (as )?reviewed$/i;
  if(s.reviewed==='Reviewed' || controls.some(c=>reviewed.test(c)) || !(s.reviewed==='Not reviewed' || controls.filter(c=>mark.test(c)).length===1))throw Error('Both records must explicitly indicate an unreviewed state before reset.');
 }
 const {previousAttempts=[],...previous}=receipt;
 return {ids:receipt.ids,saveAttempted:false,verified:false,reviewed:false,stage:'reset',resetAt:new Date().toISOString(),previousAttempts:[...previousAttempts,previous],originalSnapshots:baseline,message:'Attempt reset after both original records were freshly checked unchanged and unreviewed. Reopen the matching submenu and read it before setting the transfer. Nothing was changed in Wave.'};
}

// Fresh records can legitimately differ from an older export after manual linking.
export function classifyTransferState(pair,snapshots,business){
 const saved=verifyTransferResult(pair,snapshots,business);
 if(saved.verified)return {state:'linked',...saved};
 const sides=[['Money out',pair.out],['Money in',pair.in]].map(([side,t])=>{
  const snapshot=snapshots[t.id] || {fields:{}};
  const comparison=compareLive(t,snapshot),problems=[...(snapshot.problems || [])];
  if(snapshot.identity?.business!==business)problems.push('Wrong or unreadable Wave business.');
  return {side,id:t.id,checks:comparison.checks,problems,snapshot};
 });
 const failed=sides.filter(s=>s.problems.length || s.checks.some(c=>c.state!=='Match'));
 if(!failed.length)return {state:'original',sides};
 const detail=failed.map(s=>s.side+': '+[...s.problems,...s.checks.filter(c=>c.state!=='Match').map(c=>c.field+' '+c.state+' (export: '+c.exported+'; live: '+c.live+')')].join('; ')).join(' | ');
 const error=Error('Live transfer records changed. Nothing applied. '+detail);error.diagnostics={sides};throw error;
}
