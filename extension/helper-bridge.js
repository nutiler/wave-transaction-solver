// Retry reads while pages load; never automatically repeat a report-creation click.
export async function helperCall({execute,request,current=()=>true,onWait=()=>{},pause=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),timeoutMs=30000}){
 const readOnly=['read','refresh','getDownload','openLatest'].includes(request.action),started=now();let last;
 do{
  if(!current())throw Error('Stopped before reading provider controls.');
  try{
   const frames=await execute({...request,bridge:true}),frame=frames?.find(r=>r.frameId===0)||frames?.[0],value=frame?.result;
   if(value?.helperError){
    const detail=value.helperError;
    if(!readOnly&&value.notSubmitted)return {notSubmitted:true,message:detail.message};
    const error=Error(detail.message);error.retryable=!!detail.retryable;error.downloadStarted=!!value.downloadStarted;throw error;
   }
   if(value?.waiting&&request.action==='getDownload'){const error=Error('Waiting for the fresh Wave export link to finish loading.');error.retryable=true;throw error;}if(value&&typeof value==='object')return value;
   const error=Error('The provider page did not return a response. It may still be loading or have navigated. Read controls again; no report click will be repeated automatically.');error.retryable=true;throw error;
  }catch(error){
   last=error;if(!readOnly||!(error.retryable||/frame.*removed|context.*destroyed|document.*unloaded/i.test(error.message)))throw error;
   if(now()-started>=timeoutMs)break;onWait('Waiting for provider controls to load...');await pause(500);
  }
 }while(now()-started<=timeoutMs);
 throw last;
}
