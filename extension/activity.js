import {logEvent,logError,openActivityConsole} from './diagnostic-console.js';
// Activity tracks work, not bookkeeping completion. No elapsed-time percentages.
export function createActivity(onChange=()=>{},onEvent=()=>{}) {
 const tasks=new Map();let next=0,last='',lastLabel='Ready';
 const state=()=>{const list=[...tasks.values()].sort((a,b)=>b.priority-a.priority || b.id-a.id),task=list[0];return {busy:!!task,label:task?.label || lastLabel,detail:task?.detail || last,completed:task?.completed ?? 0,total:task?.total ?? null};};
 const emit=()=>onChange(state());
 return {state,begin(label,{total=null,priority=0}={}){if(!tasks.size&&lastLabel==='Stopped'){last='';lastLabel='Ready';}const id=++next,task={id,label,priority,completed:0,total:Number.isInteger(total)&&total>0?total:null,detail:''};tasks.set(id,task);onEvent('Started '+label);emit();let ended=false;
  return {update(values={}){if(ended)return;if(typeof values.detail==='string')task.detail=values.detail;if(Number.isInteger(values.total)&&values.total>0)task.total=values.total;if(Number.isFinite(values.completed))task.completed=Math.max(0,task.total===null?values.completed:Math.min(task.total,values.completed));onEvent(task.label+(task.total!==null?' · '+task.completed+'/'+task.total:'')+(task.detail?' · '+task.detail:''));emit();},finish(message='',{stopped=false}={}){if(ended)return;ended=true;tasks.delete(id);last=message;lastLabel=stopped?'Stopped':'Ready';onEvent('Finished '+task.label+(message?' · '+message:''));emit();}};
 }};
}
let ui,helperState,lastLog='';
function render(s){
 const line=JSON.stringify([s.busy,s.label,s.detail,s.completed,s.total]);if(line!==lastLog){lastLog=line;logEvent(s.label+(s.total!==null?' · '+s.completed+'/'+s.total:'')+(s.detail?' · '+s.detail:''));}
 if(typeof document==='undefined')return;
 if(!ui){const bar=document.createElement('aside');bar.id='solverActivity';bar.className='solver-activity';bar.setAttribute('aria-label','Solver activity');const text=document.createElement('div'),label=document.createElement('strong'),detail=document.createElement('span'),progress=document.createElement('progress');text.setAttribute('role','status');text.setAttribute('aria-live','polite');text.setAttribute('aria-atomic','true');text.append(label,detail);progress.setAttribute('aria-label','Current operation progress');const consoleButton=document.createElement('button');consoleButton.type='button';consoleButton.textContent='Console';consoleButton.className='secondary';consoleButton.onclick=openActivityConsole;bar.append(text,progress,consoleButton);document.body.prepend(bar);document.body.classList.add('has-solver-activity');ui={bar,label,detail,progress};}
 ui.bar.dataset.state=s.busy?'working':s.label==='Stopped'?'stopped':'ready';ui.bar.setAttribute('aria-busy',String(s.busy));ui.label.textContent=s.busy?s.label+'…':s.label==='Stopped'?'Stopped':'✓ Ready';
 ui.detail.textContent=s.busy?(s.total!==null?s.completed+' of '+s.total+' processed · ':'')+(s.detail || 'Please wait before starting another operation.'):(s.detail || 'You can use the solver.');
 if(helperState&&(!s.busy||helperState.message===s.detail)){ui.bar.dataset.state=helperState.kind;ui.label.textContent=helperState.label;ui.detail.textContent=helperState.message;}
 ui.progress.hidden=!s.busy;if(s.total!==null){ui.progress.max=s.total;ui.progress.value=s.completed;}else ui.progress.removeAttribute('value');
}
export const activity=createActivity(render,message=>logEvent(message));
export function paintActivity(){return new Promise(resolve=>{const timer=setTimeout(resolve,80);if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>setTimeout(()=>{clearTimeout(timer);resolve();},0));});}
export async function withActivity(label,fn,options){const task=activity.begin(label,options);try{await paintActivity();return await fn(task);}catch(e){logError(e);task.finish('Last operation stopped. Check its result below.');throw e;}finally{task.finish();}}

if(typeof document!=='undefined')document.addEventListener('solver-helper-state',event=>{helperState=event.detail;render(activity.state());});
