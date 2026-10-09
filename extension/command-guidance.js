export function commandNextStep({busy=false,business=null,extensionMode=true,sample=false,saveError='',lockCount=0,complete=false,changed=false,queued=0,review=0}={}){
 if(busy)return {kind:'working',title:'Working',message:'Wait for the current operation, or use its Stop control.',action:null};
 if(!business)return {kind:'setup',title:'Choose your Wave business',message:'Open Data & setup and select the intended business.',action:'setup'};
 if(!extensionMode||sample)return {kind:'preview',title:'Preview only',message:'Use the installed extension for live scans and verified saves.',action:null};
 if(saveError)return {kind:'error',title:'Local saving needs attention',message:saveError,action:null};
 if(lockCount)return {kind:'recheck',title:'Next: recheck previous saves',message:'Apply is paused for '+lockCount+' saved outcome'+(lockCount===1?' that still needs':'s that still need')+' verification. Recheck reads Wave only; it never repeats Save. Your '+queued+' locally approved records stay queued.',action:'recheck'};
 if(!complete||changed)return {kind:'scan',title:'Next: scan Wave',message:changed?'Inputs changed. Scan again before applying; saved approvals remain queued.':'Click Update my finances to collect unfinished work and prepare suggestions.',action:'scan'};
 if(queued)return {kind:'apply',title:'Ready: '+queued+' locally approved records',message:'Open Approved queue to check your choices, then Apply & verify. You can apply approved records while other groups still need review.',action:'queue'};
 return {kind:'review',title:review?'Next: review and approve':'No approved work waiting',message:review?'Compare the purchase evidence, choose the category and description, then Confirm locally. Set aside anything you cannot decide yet.':'Check Set aside or scan again when new work arrives.',action:review?'review':null};
}
export const savedOutcomeVerified=(type,out)=>type==='transfer'?!!(out?.verified&&out.reviewed):!!(out?.categoryVerified&&out.reviewedVerified&&out.descriptionVerified!==false);
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
