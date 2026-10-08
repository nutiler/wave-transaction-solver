import {localRecords,writeLocalRecords,loadLocalFeature,validSession} from './session.js';
import {validateRule} from './rules.js';

const format='wave-solver-local-backup';
const featureKey=/^(amazon|remaining|venmo|paypal|downloads|solvers|operator|command|prepared|finance):/;
const businessKey=/^(command|prepared|operator|solvers|amazon|remaining):([0-9a-f-]{36})$/i;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=value=>structuredClone(value);
export function scopeLegacyRules(rules,owner) {return rules.map(r=>r.business||!owner?r:{...r,business:owner});}
export function portableValue(value,folders=[]) {
 if(value?.kind==='directory'||value?.kind==='file') {folders.push(value.name);return {folderAccessRequired:true,name:value.name};}
 if(Array.isArray(value))return value.map(v=>portableValue(v,folders));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,portableValue(v,folders)]));
 return value;
}
function withoutHandles(value) {
 if(value?.folderAccessRequired===true)return null;
 if(Array.isArray(value))return value.map(withoutHandles);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,withoutHandles(v)]));
 return value;
}
// The installation path and origin stay unchanged. Existing records are never rewritten.
export async function migrateToV1(storage,now=new Date().toISOString()) {
 const marker=await loadLocalFeature('migration:v1');if(marker?.version===1)return marker;
 const records=(await localRecords()).filter(r=>!String(r.key).startsWith('migration:'));
 const settings=storage?await storage.get(null):{};
 const backup={format,version:1,createdAt:now,beta:'03018ff',records:clone(records),settings:clone(settings)};
 const result={version:1,createdAt:now,beta:'03018ff',ruleOwner:records.find(r=>r.key==='current')?.value?.business||null,recordCount:records.length,settingCount:Object.keys(settings).length,backupKey:'migration:beta-0.49.0'};
 const owners=[];
 for(const [provider,key] of [['wave','downloads:wave'],['amazon','downloads:amazon'],['paypal','paypal:downloader'],['venmo','venmo:downloader']]) {
  const setup=records.find(r=>r.key===key)?.value,owner=setup?.business||result.ruleOwner;
  if(setup&&owner)owners.push({key:'finance:helper-owner:'+provider,value:{business:owner,migratedFromBeta:true}});
 }
 await writeLocalRecords([{key:result.backupKey,value:backup},{key:'migration:v1',value:result},...owners]);
 return result;
}
export async function exportLocalBackup(storage) {
 const folders=[],records=(await localRecords()).filter(r=>!String(r.key).startsWith('migration:'));
 const settings=storage?await storage.get(null):{};
 const marker=await loadLocalFeature('migration:v1'),ruleOwner=marker?.ruleOwner||records.find(r=>r.key==='finance:rule-origin')?.value?.business||records.find(r=>r.key==='current')?.value?.business||null;
 return {...portableValue({format,version:1,createdAt:new Date().toISOString(),beta:'03018ff',ruleOwner,records,settings},folders),foldersToReconnect:[...new Set(folders)]};
}
export function validateLocalBackup(value) {
 if(value?.format!==format||value.version!==1||!Array.isArray(value.records)||value.records.length>10000||!value.settings||typeof value.settings!=='object'||Array.isArray(value.settings))throw Error('Choose a Wave Solver local backup, version 1.');
 const keys=new Set();
 if(value.ruleOwner!==undefined&&value.ruleOwner!==null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.ruleOwner))throw Error('Invalid rule business identity.');
 for(const r of value.records) {
  if(typeof r.key!=='string'||keys.has(r.key)||(r.key!=='current'&&!featureKey.test(r.key)))throw Error('Unsupported or duplicate backup record.');keys.add(r.key);
  if(r.key==='current'&&!validSession(r.value))throw Error('The backup session is invalid.');
  const scoped=r.key.match(businessKey);
  if(scoped&&r.value?.business&&r.value.business!==scoped[2])throw Error('A backup record belongs to a different business.');
  if(r.key.startsWith('command:')&&scoped)for(const d of Object.values(r.value?.decisions||{})) {
   if(d.business!==scoped[2]||!Array.isArray(d.ids)||!d.ids.every(id=>typeof id==='string')||!Array.isArray(d.expected)||!d.expected.every(e=>typeof e.id==='string'&&Number.isSafeInteger(e.amountCents)))throw Error('A queued decision has invalid identity or amounts.');
  }
 }
 if(value.settings.solverRules!==undefined){if(!Array.isArray(value.settings.solverRules))throw Error('Invalid saved rules.');value.settings.solverRules.forEach(validateRule);}
 return value;
}
export function planBackupImport(value,records,settings) {
 validateLocalBackup(value);
 const existing=new Map(records.filter(r=>!String(r.key).startsWith('migration:')).map(r=>[r.key,r.value]));
 const incoming=value.records.map(r=>({...r,value:withoutHandles(r.value)})),writes=[];
 for(const r of incoming) {
  const current=existing.get(r.key),emptySession=r.key==='current'&&validSession(current)&&!current.csvText&&!current.loadedPlan&&!current.proposalPack&&!current.shortlist?.length;
  if(existing.has(r.key)&&!same(portableValue(current),portableValue(r.value))){
   if(emptySession){writes.push(r);continue;}
   if(r.key.startsWith('finance:'))continue; // Keep new installation freshness and UI metadata.
   throw Error('Existing '+r.key+' differs. Restore into a fresh installation to protect current approvals and save locks.');
  }
  if(!existing.has(r.key))writes.push(r);
 }
 for(const [key,v] of Object.entries(value.settings))if(settings[key]!==undefined&&!same(settings[key],v))throw Error('Existing '+key+' differs. Current settings and receipts were preserved.');
 const owner=value.ruleOwner||value.records.find(r=>r.key==='current')?.value?.business;
 if(owner&&!settings.solverRules?.length) {const i=writes.findIndex(r=>r.key==='finance:rule-origin');if(i>=0)writes.splice(i,1);writes.push({key:'finance:rule-origin',value:{business:owner}});}
 return {records:writes,settings:Object.fromEntries(Object.entries(value.settings).filter(([key])=>settings[key]===undefined)),foldersToReconnect:value.foldersToReconnect||[]};
}
export async function importLocalBackup(value,storage) {
 const records=await localRecords(),settings=storage?await storage.get(null):{},plan=planBackupImport(value,records,settings);
 // Persist recovery evidence before the two local stores are updated. No store is cleared.
 await writeLocalRecords([{key:'migration:before-import',value:{format,version:1,records,settings,createdAt:new Date().toISOString()}},{key:'migration:pending-import',value:plan}]);
 if(Object.keys(plan.settings).length){if(!storage)throw Error('Restore this backup in the installed Chrome extension.');await storage.set(plan.settings);}
 await writeLocalRecords([...plan.records,{key:'migration:pending-import',value:null}]);
 return plan;
}
