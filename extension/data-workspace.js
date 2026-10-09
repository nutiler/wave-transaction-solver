import {loadLocalFeature,projectDataFolder} from './session.js';
import {exportLocalBackup,importLocalBackup,validateLocalBackup} from './migration.js';
import {venmoCoverage,venmoCoverageText} from './venmo.js';
import {restoreVenmoEmptyConfirmations} from './venmo-empty.js';

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function providerProgress(provider,state,status={}) {
 status||={};
 const staleCoverage=provider==='venmo'&&status.kind==='paused'&&/coverage gaps|past statements unconfirmed|profile-months pending/i.test([status.label,status.message].join(' '));
 if(!staleCoverage&&status.kind&&['running','waiting','paused','error','stopped'].includes(status.kind))return {kind:status.kind,label:status.label,text:status.message||status.label};
 if(provider==='paypal') {
  const reports=state?.batch?.reports||[],saved=reports.filter(r=>r.downloadState==='saved').length,imported=reports.filter(r=>r.importState==='saved').length;
  if(reports.length)return {kind:saved===reports.length?(imported===reports.length?'complete':'paused'):'paused',text:saved+' / '+reports.length+' originals saved · '+imported+' imported. '+(saved<reports.length?'Resume the saved batch.':imported<reports.length?'Review import failures in the helper.':'Exact ranges are recorded in the batch.')};
 }
 if(provider==='venmo') {
  const coverage=venmoCoverage(state||{});if(coverage)return {kind:coverage.unconfirmed.length||coverage.currentPending.length?'paused':'complete',label:coverage.unconfirmed.length?'Saved · coverage gaps':coverage.currentPending.length?'Saved · current month pending':'Complete',text:venmoCoverageText(coverage)};
  const entries=Object.values(state?.entries||{}),saved=entries.filter(e=>e.hash),unavailable=entries.filter(e=>e.status==='unavailable');
  if(entries.length)return {kind:entries.every(e=>e.hash||e.status==='unavailable')?'complete':'paused',text:saved.length+' profile-months saved · '+unavailable.length+' unavailable. Personal and business remain separate.'};
 }
 if(state?.job)return {kind:'paused',text:'A saved request is pending. Resume continues its checkpoint.'};
 if(status.kind==='complete')return {kind:'complete',text:status.message};
 return {kind:'ready',text:'Open the helper to connect once and collect exports.'};
}
function downloadJSON(value){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='wave-solver-backup-'+new Date().toISOString().slice(0,10)+'.local.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function installDataWorkspace({parent,getState,command}) {
 const shared=el('section'),title=el('h3','One shared data folder'),folder=el('p'),access=el('p'),files=el('details'),fileList=el('div');files.append(el('summary','Last folder refresh — file results'),fileList);
 shared.append(title,el('p','Drop supported exports into your project’s data folder. Refresh reads originals in place and indexes root and nested files. Scan freshness and file coverage are tracked separately.'),folder,access);
 const inputs=document.getElementById('financeDataPanel');if(inputs){inputs.open=true;shared.append(inputs);}shared.append(files);parent.append(shared);
 const providers=el('div',undefined,'finance-providers'),cards=[];
 for(const [provider,name,description,key] of [['wave','Wave','Accounting CSV through your verified export mailbox.','downloads:wave'],['amazon','Amazon Business','Order and item reports. Consumer Amazon uses manual export guidance.','downloads:amazon'],['paypal','PayPal','Annual All transactions CSVs, with separate download and import states.','paypal:downloader'],['venmo','Venmo','Monthly transaction statements, scoped to personal and business profiles.','venmo:downloader']]) {
  const card=el('section'),status=el('span',undefined,'finance-pill'),detail=el('p'),button=document.querySelector('[data-helper="'+provider+'"]');card.append(el('h3',name),el('p',description),status,detail);if(button)card.append(button);providers.append(card);cards.push({provider,key,status,detail});
 }parent.append(providers);
 const safety=el('section'),backup=el('button','Export local backup','secondary'),upload=el('input'),label=el('label','Restore a backup in a fresh installation'),restore=el('button','Restore this backup'),message=el('p'),migration=el('p');upload.type='file';upload.accept='.json,application/json';label.append(upload);restore.hidden=true;message.setAttribute('role','status');
 safety.append(el('h3','Saved state & recovery'),migration,el('p','Keep loading the same extension folder to retain the browser storage origin. Backups include rules, decisions, receipts and provider checkpoints. Folder permissions must be reconnected after a portable restore.'),backup,label,restore,message);parent.append(safety);
 let proposed=null,poll=null,loading=false;
 backup.onclick=async()=>{try{await command()?.flush();downloadJSON(await exportLocalBackup(getState().extensionMode?chrome.storage.local:null));message.textContent='Backup downloaded. Keep this private file with your financial records.';}catch(e){message.textContent=e.message;}};
 upload.onchange=async()=>{proposed=null;restore.hidden=true;try{const f=upload.files?.[0];if(!f)return;if(f.size>100*1024*1024)throw Error('Choose a backup under 100 MB.');proposed=validateLocalBackup(JSON.parse(await f.text()));message.textContent=proposed.records.length+' feature records · '+(proposed.settings.solverRules?.length||0)+' rules. Existing differing state will be protected.';restore.hidden=false;}catch(e){message.textContent=e.message;}};
 restore.onclick=async()=>{if(!proposed||command()?.busy()||getState().busy)return;restore.disabled=true;try{await command()?.flush();await importLocalBackup(proposed,getState().extensionMode?chrome.storage.local:null);message.textContent='Backup restored. Reloading; reconnect your data folder when requested.';location.reload();}catch(e){message.textContent=e.message;restore.disabled=false;}};
 async function refresh(){if(loading)return;loading=true;try{
  const owner=getState().business,[handle,marker,index]=await Promise.all([projectDataFolder(),loadLocalFeature('migration:v1'),owner?loadLocalFeature('finance:index:'+owner):null]);
  folder.textContent=handle?'Shared folder: '+handle.name+' · originals are preserved.':'Choose the project data folder once. All collectors share it.';
  const granted=handle?.queryPermission?await handle.queryPermission({mode:'read'}):null;access.textContent=handle&&granted!=='granted'?'Folder permission needs renewal. Click Refresh data folder to allow access.':index?'Last evidence refresh · '+new Date(index.refreshedAt).toLocaleString()+'. Coverage comes from report ranges, profiles and import outcomes.':'No evidence refresh recorded. Daily live scanning is available without an accounting export.';
  migration.textContent=marker?'Beta checkpoint saved · '+marker.recordCount+' feature records and '+marker.settingCount+' settings retained.':'Local state checkpoint will be created at startup.';
  fileList.className='finance-file-results';fileList.replaceChildren();for(const result of index?.results||[]) {const row=el('div'),text=el('p',result.path+' · '+result.status+(result.message?' — '+result.message:''));text.dataset.state=result.status==='invalid'?'error':result.status==='held'?'paused':'ready';row.append(text);if(result.status==='held'&&!result.missing){const bind=el('button',result.provider==='wave'?'Confirm this export belongs to this business':'I checked this provider file — use this business','secondary');bind.disabled=getState().busy||command()?.busy();bind.onclick=()=>void command()?.bindFile(result);row.append(bind);}fileList.append(row);}if(!index?.results?.length)fileList.append(el('p','Refresh the folder to see recognition and import results.'));
  for(const card of cards){let state=await loadLocalFeature(card.key);if(card.provider==='venmo'&&handle&&granted==='granted')state=await restoreVenmoEmptyConfirmations(handle,state);const status=await loadLocalFeature('finance:helper:'+card.provider),binding=await loadLocalFeature('finance:helper-owner:'+card.provider),view=binding?.business&&binding.business!==owner?{kind:'paused',text:'This helper’s saved setup belongs to another Wave business. Review its provider account before collecting.'}:providerProgress(card.provider,state,status?.business&&status.business!==owner?{}:status);card.status.dataset.state=view.kind;card.status.textContent=view.label||({ready:'Ready',complete:'Complete',paused:'Resume / input needed',running:'Running',waiting:'Waiting',error:'Needs attention',stopped:'Stopped'})[view.kind];card.detail.textContent=view.text;}
 }catch(e){access.textContent='Data status could not be read: '+e.message;}finally{loading=false;}}
 document.addEventListener('finance-workspace',e=>{clearInterval(poll);if(e.detail==='setup'){void refresh();poll=setInterval(()=>void refresh(),5000);}});
 document.addEventListener('finance-data',()=>void refresh());void refresh();
 return {refresh};
}
