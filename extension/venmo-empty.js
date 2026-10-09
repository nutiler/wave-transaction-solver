import {loadLocalFeature,saveLocalFeature} from './session.js';
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const monthEnd=month=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
export function validEmptyProof(proof,period,handle){
 if(!proof||!period||!/^\d{4}-\d{2}$/.test(period.month||'')||!validDate(period.start)||!validDate(period.end)||period.start!==period.month+'-01'||period.end.slice(0,7)!==period.month||proof.month!==period.month||proof.allProfiles!==true||!/^No transactions yet for this month(?:[,.]|$)/i.test(proof.message||''))return false;
 if(!validDate(proof.asOfDate)||!Array.isArray(proof.profiles)||proof.profiles.length!==2||new Set(proof.profiles.map(p=>String(p).toLowerCase())).size!==2||proof.profiles.some(p=>typeof p!=='string'||!/^@[a-z0-9_.-]+$/i.test(p))||handle&&!proof.profiles.some(p=>p.toLowerCase()===handle.toLowerCase()))return false;
 if(proof.kind==='user-observed-empty-page')return proof.userConfirmed===true&&!!proof.source&&validDate(proof.confirmedAt?.slice(0,10));
 if(proof.kind!=='provider-empty-page'||proof.origin!=='https://account.venmo.com'||proof.visibleMonthMatched!==true||proof.loading!==false)return false;
 try{const url=new URL(proof.pageURL);return url.origin===proof.origin&&url.pathname==='/statement'&&url.searchParams.get('profileId')==='all-profiles-id'&&url.searchParams.get('year')+'-'+String(Number(url.searchParams.get('month'))).padStart(2,'0')===period.month;}catch{return false;}
}
export function confirmVenmoEmpty({period,profile,handle,proof}){
 if(!['personal','business'].includes(profile)||!handle||!validEmptyProof(proof,period,handle))throw Error('The empty-month message, month or profile identity could not be confirmed.');
 const partial=period.end!==monthEnd(period.month)||period.end>=proof.asOfDate;
 return {status:partial?'observed-empty':'confirmed-empty',profile,handle,month:period.month,start:period.start,end:period.end,count:0,empty:true,confirmation:structuredClone(proof),checkedAt:new Date().toISOString()};
}
export function confirmedVenmoEmpty(entry,period=entry,handle=entry?.handle){
 return !!entry&&entry.status==='confirmed-empty'&&entry.empty===true&&entry.count===0&&!entry.hash&&entry.start===period?.start&&entry.end===period?.end&&validDate(entry.end)&&entry.end===monthEnd(entry.month)&&entry.end<entry.confirmation?.asOfDate&&typeof handle==='string'&&entry.handle?.toLowerCase()===handle.toLowerCase()&&validEmptyProof(entry.confirmation,period,handle);
}
export function mergeVenmoEmptyConfirmations(state,manifest){
 if(!state||manifest?.format!=='wave-solver-venmo-downloads'||manifest.version!==1||!state.sources?.personal?.handle||!state.sources?.business?.handle)return state;
 const expected=['personal','business'].map(p=>state.sources[p].handle.toLowerCase()),entries={...state.entries};let changed=false;
 for(const [key,entry] of Object.entries(manifest.entries||{})){
  if(!['personal','business'].includes(entry?.profile)||key!==entry.profile+':'+entry.start+':'+entry.end||entries[key]?.hash||!confirmedVenmoEmpty(entry,entry,state.sources[entry.profile].handle))continue;
  if(!entry.confirmation.profiles.every(p=>expected.includes(p.toLowerCase())))continue;
  if(JSON.stringify(entries[key])!==JSON.stringify(entry)){entries[key]=entry;changed=true;}
 }
 return changed?{...state,entries}:state;
}
export async function restoreVenmoEmptyConfirmations(root,state){
 if(!root||!state?.sources?.personal?.handle||!state?.sources?.business?.handle)return state;
 try{const dir=await root.getDirectoryHandle('venmo'),file=await(await dir.getFileHandle('venmo-manifest.local.json')).getFile();if(file.size>2*1024*1024)return state;const next=mergeVenmoEmptyConfirmations(state,JSON.parse(await file.text()));if(next!==state)await saveLocalFeature('venmo:downloader',next);return next;}catch(e){if(e.name==='NotFoundError'||e.name==='NotAllowedError')return state;throw e;}
}
