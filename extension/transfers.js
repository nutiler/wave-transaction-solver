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
 for(const t of [pair.out,pair.in]){const s=snapshots[t.id];if(!s?.fields || s.identity?.business!==business || s.problems?.length || compareLive(t,s).checks.some(c=>c.state!=='Match'))throw Error('Both live records must match all original export fields. Nothing applied.');}
 const checked=checkTransferMenu(menu,pair,business);if(!checked.ready)throw Error(checked.message);
 return {business,id:pair.out.id,category:'Transfer to '+pair.in.primary.account,expected:{...snapshots[pair.out.id].fields},transfer:{id:pair.in.id,label:checked.candidate,account:pair.in.primary.account,date:pair.in.date,description:pair.in.description}};
}
export function verifyTransferResult(pair,snapshots,business){
 const sides=[['out',pair.out,'Transfer to '+pair.in.primary.account],['in',pair.in,'Transfer from '+pair.out.primary.account]].map(([direction,t,category])=>({id:t.id,direction,...verifyCategoryResult(t,snapshots[t.id] || {fields:{}},business,category)}));
 const verified=sides.every(s=>s.categoryVerified),reviewed=verified && sides.every(s=>s.reviewedVerified);
 return {sides,verified,reviewed,message:verified?reviewed?'Both saved transfer categories and reviewed statuses verified.':'Both saved transfer categories verified. Reviewed status is not confirmed on both sides; inspect Wave.':'Saved transfer could not be verified on both records. Inspect Wave; this attempt will not run again.'};
}
