import {accountLabel,fundingKey,fundingCreatedDescriptions} from './venmo-funding.js';

// An export supplies record addresses, not permission to write or mark verified.
// Every hint is subsequently checked against both exact live Wave forms.
export function fundingExportHints(plan,transactions){
 const byId=new Map(transactions.map(t=>[t.id,t])),hints={};
 const sameAccount=(a,b)=>a?.accountId&&b?.accountId?a.accountId===b.accountId:accountLabel(a?.account)===accountLabel(b?.account);
 for(const a of plan.actions.filter(a=>a.kind==='transfer')){
  const p=a.transfer,bank=byId.get(p.bank.id);
  if(!bank?.primary||!sameAccount(bank.primary,p.bank.primary)||bank.date!==p.bank.date||bank.description!==p.bank.description||bank.amount!==p.bank.amount||bank.direction!==p.bank.direction||bank.categories.length!==1||bank.categories[0]!=='Transfer Clearing')continue;
  const descriptions=fundingCreatedDescriptions(p);
  const candidates=transactions.filter(t=>t.id!==p.purchase?.id&&t.primary&&sameAccount(t.primary,p.walletAccount)&&t.date===p.bank.date&&t.amount===p.bank.amount&&t.direction!==(p.bank.direction)&&descriptions.includes(t.description)&&t.categories.length===1&&t.categories[0]==='Transfer Clearing');
  if(candidates.length)hints[fundingKey(p)]=candidates.map(t=>t.id);
 }
 return hints;
}

export async function loadLatestRepairExport(root,business){
 let exports;try{exports=await (await root.getDirectoryHandle('wave')).getDirectoryHandle('exports');}catch(e){if(e.name==='NotFoundError')return null;throw e;}
 const candidates=[];
 for await(const [name,dir] of exports.entries()){
  if(dir.kind!=='directory'||!/^export-[0-9a-f]{16}$/.test(name))continue;
  let manifest;try{manifest=JSON.parse(await (await dir.getFileHandle('manifest.local.json')).getFile().then(f=>f.text()));}catch(e){if(e.name==='NotFoundError')continue;throw e;}
  if(manifest.format==='wave-solver-wave-export'&&manifest.version===1&&manifest.business===business&&manifest.historyMatched===true&&manifest.files?.includes('accounting.csv')&&Number.isFinite(Date.parse(manifest.importedAt)))candidates.push({manifest,dir,name});
 }
 const latest=candidates.sort((a,b)=>Date.parse(b.manifest.importedAt)-Date.parse(a.manifest.importedAt))[0];
 if(!latest)return null;
 const file=await (await latest.dir.getFileHandle('accounting.csv')).getFile();
 if(file.size>80*1024*1024)throw Error('Latest repair export exceeds the supported size.');
 return {text:await file.text(),manifest:latest.manifest,source:'wave/exports/'+latest.name+'/accounting.csv'};
}
