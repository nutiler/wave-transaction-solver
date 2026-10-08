import {loadSession,loadLocalFeature,saveLocalFeature} from './session.js';
// One deliberate home-screen action opens the existing helper. No creation action is retried.
export function installHelperLaunch({start='run',resume,shouldResume=()=>false,provider='',pending=()=>false}={}) {
 const requestedBusiness=new URLSearchParams(location.search).get('business');
 if(provider&&requestedBusiness){
  const scope=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p'),confirm=document.createElement('button');
  summary.textContent='Provider account & Wave business';text.textContent='Selected Wave business: '+requestedBusiness+'. Check that this helper is signed in to the intended person and provider profile before confirming this connection.';confirm.textContent='I checked this provider account — use this business';confirm.className='secondary';scope.append(summary,text,confirm);document.querySelector('main').append(scope);
  confirm.onclick=async()=>{try{if(pending())throw Error('Finish the pending collection with its original account before changing the business binding.');if((await loadSession())?.business!==requestedBusiness)throw Error('The selected business changed. Return to Update finances.');if(provider==='wave'&&document.getElementById('business')?.value!==requestedBusiness)throw Error('Select this Wave business in the helper’s connection settings first.');await saveLocalFeature('finance:helper-owner:'+provider,{business:requestedBusiness,confirmedAt:new Date().toISOString()});document.getElementById('status').textContent='Provider account confirmed for this business. Start collection when ready.';}catch(e){document.getElementById('status').textContent='Paused: '+e.message;}};
 }
 async function launch(){if(location.hash!=='#collect')return;history.replaceState(null,'',location.pathname+location.search);const status=document.getElementById('status'),id=shouldResume()&&resume?resume:start,button=document.getElementById(id);
  if(!button||button.disabled){if(status)status.textContent='Finish the saved connection and folder setup, then start collection.';return;}
  try {
   const requested=new URLSearchParams(location.search).get('business'),session=await loadSession();
   if(requested&&session?.business!==requested)throw Error('The selected Wave business changed. Return to Update finances and open this helper again.');
   const owner=provider?await loadLocalFeature('finance:helper-owner:'+provider):null;
   if(requested&&owner?.business&&owner.business!==requested)throw Error('This helper is bound to another Wave business. Review the provider account in setup before collecting for this business.');
   if(pending()&&requested&&(!owner||owner.business!==requested))throw Error(owner?'A pending collection belongs to another business. Review its provider account and Resume it in this helper.':'This older checkpoint has no business binding. Review the saved provider account, then Resume in this helper.');
   if(provider&&requested)await saveLocalFeature('finance:helper-owner:'+provider,{business:requested});
   button.click();
  } catch(e){if(status)status.textContent='Paused: '+e.message;}
 }
 const steps=document.querySelectorAll('section>.step');if(!document.getElementById(start)?.disabled&&steps.length===3){steps[0].open=steps[1].open=false;steps[2].open=true;}
 window.addEventListener('hashchange',launch);queueMicrotask(launch);
}
