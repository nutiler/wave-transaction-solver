// Visual status only; this module never starts, pauses or repeats provider work.
export function helperVisualState(message='',busy=false){
 const text=String(message);
 if(/sign[- ]?in|log[- ]?in|login|signed[- ]?in|signed.out/i.test(text)&&!/if needed/i.test(text))return {kind:'paused',label:'Paused — sign in required'};
 if(/allow access|finish .*setup|choose .*folder|confirm .*before saving/i.test(text))return {kind:'paused',label:'Paused — your input is needed'};
 if(/^Stopping/i.test(text))return {kind:'stopped',label:'Stopping'};
 if(/^Stopped[.:]?/i.test(text))return {kind:'stopped',label:'Stopped'};
 if(/yearly CSVs downloaded and verified|(?:report|export|statements?) saved|collection finished/i.test(text))return {kind:'complete',label:'Complete'};
 if(/needs repair|failed|could not|error|unrecognized|invalid/i.test(text))return {kind:'error',label:'Needs attention'};
 if(/waiting|pending|refreshing|still generating|still preparing/i.test(text))return busy?{kind:'waiting',label:'Waiting — running automatically'}:{kind:'paused',label:'Paused — waiting for the report'};
 if(!busy&&/Resume.*remaining|Resume.*batch|Resume later|needs attention/i.test(text))return {kind:'paused',label:'Paused — ready to resume'};
 return busy?{kind:'running',label:'Running'}:{kind:'ready',label:'Ready'};
}
export function watchHelperStatus(doc=globalThis.document,{busy=()=>false}={}){
 const status=doc?.getElementById('status');if(!status)return;
 const card=doc.createElement('div'),label=doc.createElement('strong');card.className='helper-status-card';label.className='helper-status-label';status.before(card);card.append(label,status);
 const refresh=()=>{
  const state=helperVisualState(status.textContent,busy());card.dataset.state=state.kind;label.textContent=state.label;
  for(const id of ['run','resume','stop']){const button=doc.getElementById(id);if(button?.tagName==='BUTTON'){button.classList.add('helper-action');button.dataset.action=id==='stop'?'stop':id==='resume'?'resume':'start';}}
  doc.dispatchEvent(new CustomEvent('solver-helper-state',{detail:{...state,message:status.textContent}}));
 };
 const observer=new MutationObserver(refresh);observer.observe(status,{childList:true,characterData:true,subtree:true});refresh();return {refresh,disconnect:()=>observer.disconnect()};
}
