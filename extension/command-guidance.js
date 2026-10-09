export function commandNextStep({busy=false,business=null,extensionMode=true,sample=false,saveError='',scanError='',lockCount=0,blockedSave=null,complete=false,changed=false,queued=0,review=0}={}){
 if(busy)return {kind:'working',title:'Working',message:'Wait for the current operation, or use its Stop control.',action:null};
 if(!business)return {kind:'setup',title:'Choose your Wave business',message:'Open Data & setup and select the intended business.',action:'setup'};
 if(!extensionMode||sample)return {kind:'preview',title:'Preview only',message:'Use the installed extension for live scans and verified saves.',action:null};
 if(saveError)return {kind:'error',title:'Local saving needs attention',message:saveError,action:null};
 if(scanError)return {kind:'scan-failed',title:'Scan needs a refresh',message:scanError+' Your '+queued+' approvals are preserved. Apply & verify will retry the scan before saving any queued work.',action:queued||lockCount?'apply':'scan'};
 if(lockCount&&blockedSave)return {kind:'blocked-save',title:'Next: resolve the blocked save',message:blockedSave.message+' Apply & verify will check this record and correct readable category or description differences to the original approval. Other changes need inspection. Your '+queued+' queued approvals are preserved.',action:'inspect'};
 if(lockCount)return {kind:'recheck',title:'Apply includes previous save checks',message:lockCount+' saved outcome'+(lockCount===1?' needs':'s need')+' verification. Apply & verify checks them first, corrects confirmed differences to their original approved values, then continues your '+queued+' queued records.',action:'apply'};
 if(!complete||changed)return {kind:'scan',title:'Next: scan Wave',message:changed?'Inputs changed. Scan again before applying; saved approvals remain queued.':'Click Update my finances to collect unfinished work and prepare suggestions.',action:'scan'};
 if(queued)return {kind:'apply',title:'Ready: '+queued+' locally approved records',message:'Open Approved queue to check your choices, then Apply & verify. You can apply approved records while other groups still need review.',action:'queue'};
 return {kind:'review',title:review?'Next: review and approve':'No approved work waiting',message:review?'Compare the purchase evidence, choose the category and description, then Confirm locally. Set aside anything you cannot decide yet.':'Check Set aside or scan again when new work arrives.',action:review?'review':null};
}
export const savedOutcomeVerified=(type,out)=>type==='transfer'?!!(out?.verified&&out.reviewed):!!(out?.categoryVerified&&out.reviewedVerified&&out.descriptionVerified!==false);
// Apply may converge a previously attempted save to its frozen approval once.
// A new uncertain Save is left for the next user action, never retried in a loop.
export async function recoverSavedOutcomes(options) {
 const {repair,repairLegacy,current=()=>true,stopped=()=>false}=options;
 let uncertainCorrection=false;
 const recover=async(task,read,correct,type)=>{
  if(type!=='transfer'&&correct&&current()&&!stopped()){
   const out=await correct(task);
   if(out?.correctionAttempted&&!savedOutcomeVerified(type,out))uncertainCorrection=true;
   return out;
  }
  const out=await read(task);
  if(savedOutcomeVerified(type,out)||type==='transfer'||!correct||!current()||stopped())return out;
  return correct(task);
 };
 return recheckSavedOutcomes({...options,stopped:()=>uncertainCorrection||stopped(),recheck:d=>recover(d,options.recheck,repair,d.treatment),recheckLegacy:key=>recover(key,options.recheckLegacy,repairLegacy,key.includes(':transfer:')?'transfer':'purchase')});
}
// This API exposes only read-only rechecks. A failed or incomplete check never clears a lock.
export async function recheckSavedOutcomes({decisions=[],results={},legacy=[],recheck,recheckLegacy,checkpoint,current=()=>true,stopped=()=>false,progress=()=>{}}){
 const tasks=[...decisions.filter(d=>['uncertain','executing'].includes(results[d.key]?.status)).map(d=>({key:d.key,decision:structuredClone(d)})),...legacy.map(e=>({key:e.key,legacy:true}))],summary={checked:0,verified:0,attention:[],stopped:false};
 for(const [index,task] of tasks.entries()){
  if(!current()||stopped()){summary.stopped=true;break;}
  progress({index,total:tasks.length,key:task.key});let out,problem='';
  try{out=await(task.legacy?recheckLegacy(task.key):recheck(task.decision));}catch(e){problem=e.message;}
  if(!current()){summary.stopped=true;break;}
  const okay=!problem&&savedOutcomeVerified(task.legacy&&task.key.includes(':transfer:')?'transfer':task.decision?.treatment,out);
  if(!task.legacy)await checkpoint(task.key,{...results[task.key],status:okay?'done':'uncertain',result:out||results[task.key]?.result,message:problem||out?.message||'Saved outcome still needs verification.',...(okay?{verifiedAt:new Date().toISOString()}:{})});
  summary.checked++;if(okay)summary.verified++;else summary.attention.push({key:task.key,message:problem||out?.message||'Saved outcome still needs verification.'});
 }
 return summary;
}
