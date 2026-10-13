import {repairKey} from './venmo-reconciliation.js';
import {fundingKey,fundingFingerprint} from './venmo-funding.js';
import {projectDataFolder,saveLocalFeature} from './session.js';

// Diagnostic copies never authorize writes or replace financial checkpoints.
export function repairDiagnosticReport({plan,receipts={},transferReceipts={},mode='restored',detail='',builds={},results=[],now=new Date().toISOString()}) {
 const byKey=new Map(results.map(r=>[r.key,r]));
 const actions=plan.actions.map(a=>{
  const key=repairKey(a),funding=a.kind==='transfer'?transferReceipts[fundingKey(a.transfer)]:null,repair=receipts[key],r=repair?.verified||funding?.verified&&funding.fingerprint!==fundingFingerprint(a.transfer)?repair:funding?.checkedAt&&Date.parse(funding.checkedAt)>=(Date.parse(repair?.checkedAt||repair?.startedAt||'')||0)?funding:repair||funding,result=byKey.get(key)||byKey.get(a.kind==='transfer'?fundingKey(a.transfer):key);
  const verified=repair?!!repair.verified:!!funding?.verified&&funding.fingerprint===fundingFingerprint(a.transfer);
  return {key,kind:a.kind,recordId:a.record?.id||a.transfer?.bank.id||null,date:a.record?.date||a.transfer?.bank.date||a.date,verified,saveAttempted:!!(repair?.saveAttempted||funding?.saveAttempted),reason:r?.message||funding?.message||result?.message||'Not checked yet.',checkedAt:r?.checkedAt||null,liveDiagnostics:r?.liveDiagnostics||null,stage:r?.outcome?.stage||funding?.outcome?.stage||null,problem:r?.outcome?.problem||funding?.outcome?.problem||null,menuDiagnostics:r?.outcome?.menuDiagnostics||funding?.outcome?.menuDiagnostics||[]};
 });
 return {format:'wave-solver-venmo-repair-diagnostics',version:1,business:plan.business,capturedAt:now,mode,detail,builds,total:actions.length,verified:actions.filter(a=>a.verified).length,unverified:actions.filter(a=>!a.verified).length,actions};
}
export async function persistRepairDiagnostics(report,{store=saveLocalFeature,folder=projectDataFolder}={}) {
 const key='venmo:repair-diagnostics:'+report.business;
 await store(key,report);
 const root=await folder();
 if(!root||typeof root.queryPermission!=='function'||await root.queryPermission({mode:'readwrite'})!=='granted')return {location:'local diagnostic storage',fileSaved:false};
 const dir=await root.getDirectoryHandle('venmo',{create:true}),file=await dir.getFileHandle('venmo-repair-diagnostics.local.json',{create:true}),stream=await file.createWritable();
 try {await stream.write(JSON.stringify(report,null,2)+'\n');await stream.close();}catch(e){try{await stream.abort();}catch{}throw e;}
 return {location:'data/venmo/venmo-repair-diagnostics.local.json',fileSaved:true};
}
