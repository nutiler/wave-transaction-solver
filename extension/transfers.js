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
