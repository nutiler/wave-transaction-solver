// Activity tracks work, not bookkeeping completion. No elapsed-time percentages.
export function createActivity(onChange=()=>{}) {
 const tasks=new Map();let next=0,last='';
 const state=()=>{const list=[...tasks.values()].sort((a,b)=>b.priority-a.priority || b.id-a.id),task=list[0];return {busy:!!task,label:task?.label || 'Ready',detail:task?.detail || last,completed:task?.completed ?? 0,total:task?.total ?? null};};
 const emit=()=>onChange(state());
 return {state,begin(label,{total=null,priority=0}={}){const id=++next,task={id,label,priority,completed:0,total:Number.isInteger(total)&&total>0?total:null,detail:''};tasks.set(id,task);emit();let ended=false;
  return {update(values={}){if(ended)return;if(typeof values.detail==='string')task.detail=values.detail;if(Number.isInteger(values.total)&&values.total>0)task.total=values.total;if(Number.isFinite(values.completed))task.completed=Math.max(0,task.total===null?values.completed:Math.min(task.total,values.completed));emit();},finish(message=''){if(ended)return;ended=true;tasks.delete(id);last=message;emit();}};
 }};
}
let ui,helperState;
function render(s){
 if(typeof document==='undefined')return;
 if(!ui){const bar=document.createElement('aside');bar.id='solverActivity';bar.className='solver-activity';bar.setAttribute('aria-label','Solver activity');const text=document.createElement('div'),label=document.createElement('strong'),detail=document.createElement('span'),progress=document.createElement('progress');text.setAttribute('role','status');text.setAttribute('aria-live','polite');text.setAttribute('aria-atomic','true');text.append(label,detail);progress.setAttribute('aria-label','Current operation progress');bar.append(text,progress);document.body.prepend(bar);document.body.classList.add('has-solver-activity');ui={bar,label,detail,progress};}
 ui.bar.dataset.state=s.busy?'working':'ready';ui.bar.setAttribute('aria-busy',String(s.busy));ui.label.textContent=s.busy?s.label+'…':'✓ Ready';
 ui.detail.textContent=s.busy?(s.total!==null?s.completed+' of '+s.total+' processed · ':'')+(s.detail || 'Please wait before starting another operation.'):(s.detail || 'You can use the solver.');
 if(helperState&&(!s.busy||helperState.message===s.detail)){ui.bar.dataset.state=helperState.kind;ui.label.textContent=helperState.label;ui.detail.textContent=helperState.message;}
 ui.progress.hidden=!s.busy;if(s.total!==null){ui.progress.max=s.total;ui.progress.value=s.completed;}else ui.progress.removeAttribute('value');
}
export const activity=createActivity(render);
export function paintActivity(){return new Promise(resolve=>{const timer=setTimeout(resolve,80);if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>setTimeout(()=>{clearTimeout(timer);resolve();},0));});}
export async function withActivity(label,fn,options){const task=activity.begin(label,options);try{await paintActivity();return await fn(task);}catch(e){task.finish('Last operation stopped. Check its result below.');throw e;}finally{task.finish();}}

if(typeof document!=='undefined')document.addEventListener('solver-helper-state',event=>{helperState=event.detail;render(activity.state());});
