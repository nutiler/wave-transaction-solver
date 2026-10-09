import {readFile,readdir,realpath,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,dirname,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {importAccounting} from '../extension/model.js';
import {importAmazon} from '../extension/amazon.js';
import {importPayPalCSV} from '../extension/paypal-csv.js';
import {validateVenmoCSV,venmoCollectionPeriods} from '../extension/venmo.js';
import {confirmedVenmoEmpty} from '../extension/venmo-empty.js';
import {unpackWaveZIP} from '../extension/download-files.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function within(root,name){
 if(typeof name!=='string'||!name||name.split(/[\\/]/).includes('..')||/[:\0]/.test(name))throw Error('Invalid manifest path');
 const path=await realpath(resolve(root,name)),rel=relative(root,path);
 if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep)||resolve(root,rel)!==path)throw Error('Manifest file leaves its provider folder');
 return path;
}
const dates=records=>{const values=records.map(r=>r.date).filter(Boolean).sort();return {firstDate:values[0]||null,lastDate:values.at(-1)||null};};
// Read-only audit: originals, hashes, parser outcomes and expected ranges remain separate.
export async function auditDownloads(directory,{asOf=today(),fromMonth='2019-09'}={}){
 const root=await realpath(directory),report={format:'wave-solver-download-audit',version:1,asOf,providers:{},issues:[]};
 const check=async(provider,run)=>{try{report.providers[provider]=await run();}catch(e){report.providers[provider]={status:'needs-attention',error:e.message};report.issues.push(provider+': '+e.message);}};
 await check('wave',async()=>{
  const wave=await realpath(resolve(root,'wave')),canonical=importAccounting(text(await readFile(await within(wave,'accounting.csv')))),exports=await readdir(resolve(wave,'exports')),items=[];
  for(const name of exports){const dir=await within(wave,'exports/'+name),manifest=JSON.parse(await readFile(resolve(dir,'manifest.local.json'),'utf8'));if(manifest.format!=='wave-solver-wave-export'||manifest.version!==1)throw Error('Unrecognized Wave manifest');
   const bytes=await readFile(await within(dir,'wave-export.zip'));if(hash(bytes)!==manifest.hash)throw Error('Wave archive hash mismatch');const parsed=await unpackWaveZIP(bytes);
   for(const file of parsed.files)if(hash(await readFile(await within(dir,file.name)))!==hash(file.bytes))throw Error('Extracted Wave file differs from archive: '+file.name);
   if(parsed.dataset.transactions.length!==manifest.transactionCount)throw Error('Wave transaction count differs from manifest');
   items.push({snapshot:name,business:manifest.business,transactionCount:manifest.transactionCount,archiveVerified:true,extractedFilesVerified:parsed.files.length,canonicalMatches:text(await readFile(await within(wave,'accounting.csv')))===parsed.text});
  }
  return {status:'verified',transactionCount:canonical.transactions.length,...dates(canonical.transactions),exports:items};
 });
 await check('amazon',async()=>{
  const folder=await realpath(resolve(root,'amazon/business')),names=(await readdir(folder)).filter(n=>/^amazon-business-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}.*\.csv$/i.test(n)),items=[];
  for(const name of names){const bytes=await readFile(await within(folder,name)),records=importAmazon(text(bytes)),range=name.match(/(\d{4}-\d{2}-\d{2})-to-(\d{4}-\d{2}-\d{2})/),originals=(await readdir(root)).filter(n=>n.startsWith('orders_from_'+range[1].replaceAll('-','')+'_to_'+range[2].replaceAll('-','')+'_')&&n.endsWith('.csv'));
   const matches=await Promise.all(originals.map(async n=>{const original=await readFile(await within(root,n));return {name:n,bytesMatch:hash(original)===hash(bytes),textMatches:text(original)===text(bytes),parsedMatches:JSON.stringify(importAmazon(text(original)))===JSON.stringify(records),utf8BOMRemoved:original.length===bytes.length+3&&original.subarray(0,3).toString('hex')==='efbbbf'&&text(original)===text(bytes)};}));
   if(matches.some(m=>!m.parsedMatches))throw Error('Amazon preserved original and helper copy disagree');
   if(records.some(r=>r.date&& (r.date<range[1]||r.date>range[2])))throw Error('Amazon order dates leave the requested range');
   items.push({name,start:range[1],end:range[2],rows:records.length,orders:new Set(records.map(r=>r.orderId)).size,...dates(records),originalCopies:matches});
  }
  if(!items.length)throw Error('No Amazon Business CSV saved');return {status:'verified',reports:items,coverageEvidence:'Requested range from helper filename; files parse, but row count alone cannot prove all orders exist.'};
 });
 await check('paypal',async()=>{
  const paypal=await realpath(resolve(root,'paypal')),batches=[];
  for(const name of await readdir(resolve(paypal,'batches'))){const manifest=JSON.parse(await readFile(await within(paypal,'batches/'+name+'/collection.local.json'),'utf8'));if(manifest.format!=='wave-solver-paypal-collection'||manifest.version!==1)throw Error('Unrecognized PayPal collection manifest');
   const expected=[];for(let year=Number(manifest.earliest.slice(0,4));year<=Number(manifest.through.slice(0,4));year++)expected.push({start:year===Number(manifest.earliest.slice(0,4))?manifest.earliest:year+'-01-01',end:year===Number(manifest.through.slice(0,4))?manifest.through:year+'-12-31'});
   const rows=[];for(const period of expected){const entries=manifest.reports.filter(r=>r.start===period.start&&r.end===period.end&&r.type==='All transactions'&&r.format==='CSV');if(entries.length!==1)throw Error('Missing or duplicate expected PayPal annual report: '+period.start);const entry=entries[0];
    if(entry.requestState!=='submitted'||entry.downloadState!=='saved'||entry.importState!=='saved')throw Error('PayPal report not fully downloaded/imported: '+period.start);
    const original=text(await readFile(await within(paypal,entry.responsePath)));if(hash(original)!==entry.hash)throw Error('PayPal original hash mismatch: '+period.start);
    const usable=text(await readFile(await within(paypal,entry.name))),parsed=importPayPalCSV(usable,{name:entry.name,period,dateOrder:'mdy'}),raw=importPayPalCSV(original,{period,dateOrder:'mdy'});
    if(parsed.records.length!==entry.count||parsed.records.length!==raw.records.length||parsed.nonPostingActivity.length!==raw.nonPostingActivity.length)throw Error('PayPal parsed counts differ from original/manifest: '+period.start);
    const financialRows=rows=>rows.map(r=>({...r,sources:[]}));if(JSON.stringify(financialRows(parsed.records))!==JSON.stringify(financialRows(raw.records))||JSON.stringify(financialRows(parsed.nonPostingActivity))!==JSON.stringify(financialRows(raw.nonPostingActivity)))throw Error('PayPal imported activity differs from the original: '+period.start);
    rows.push({...period,originalVerified:true,importVerified:true,activityRows:parsed.records.length,nonPostingRows:parsed.nonPostingActivity.length});
   }
   batches.push({id:manifest.id,asOf:manifest.asOf,finishedAt:manifest.finishedAt||null,expectedReports:expected.length,reports:rows});
  }
  if(!batches.length)throw Error('No PayPal collection manifest saved');return {status:'verified',batches};
 });
 await check('venmo',async()=>{
  const venmo=await realpath(resolve(root,'venmo')),manifest=JSON.parse(await readFile(await within(venmo,'venmo-manifest.local.json'),'utf8'));if(manifest.format!=='wave-solver-venmo-downloads'||manifest.version!==1)throw Error('Unrecognized Venmo manifest');
  const entries=Object.values(manifest.entries),verified=[];
  for(const entry of entries.filter(e=>e.hash)){const content=text(await readFile(await within(venmo,entry.name)));if(hash(content)!==entry.hash)throw Error('Venmo saved-file hash mismatch: '+entry.name);const parsed=validateVenmoCSV(content,entry);if(parsed.count!==entry.count||parsed.empty!==entry.empty)throw Error('Venmo count/empty result differs from manifest: '+entry.name);verified.push(entry);}
  const periods=venmoCollectionPeriods(Number(fromMonth.slice(0,4)),asOf,Number(fromMonth.slice(5,7))),expected=periods.flatMap(p=>['personal','business'].map(profile=>({profile,...p,key:profile+':'+p.start+':'+p.end}))),noActivity=expected.filter(e=>!e.partial&&confirmedVenmoEmpty(manifest.entries[e.key],e)),gaps=expected.filter(e=>!manifest.entries[e.key]?.hash&&!noActivity.includes(e)).map(e=>({profile:e.profile,month:e.month,start:e.start,end:e.end,partial:e.partial,status:manifest.entries[e.key]?.status||'missing',httpStatus:manifest.entries[e.key]?.httpStatus||null}));
  return {status:gaps.length?'needs-attention':'verified',expectedProfileMonths:expected.length,savedFilesVerified:verified.length,emptyStatements:verified.filter(e=>e.empty).length,confirmedNoActivity:noActivity.map(e=>({profile:e.profile,month:e.month,confirmationKind:manifest.entries[e.key].confirmation.kind})),transactionRows:verified.reduce((n,e)=>n+e.count,0),profiles:['personal','business'].map(profile=>({profile,savedFiles:verified.filter(e=>e.profile===profile).length})),gaps,olderCheckpointsRetained:entries.length-expected.filter(e=>manifest.entries[e.key]).length};
 });
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const asOf=process.argv[2]||today(),output=process.argv[3]||'local-analysis/download-audit-'+asOf+'.local.json',report=await auditDownloads('data',{asOf});
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));
 console.log(JSON.stringify({report:resolve(output),providers:report.providers,issues:report.issues},null,2));
}
