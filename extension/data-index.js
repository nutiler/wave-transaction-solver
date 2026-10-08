import {parseCSV} from './csv.js';
import {importAccounting} from './model.js';
import {extractLocalPDF} from './source-pdf.js';

export function detectDataProvider(text,name='') {
 if(/\.pdf$/i.test(name))return /PAYPAL (?:BALANCE )?ACCOUNT/i.test(text)&&/ACCOUNT ACTIVITY/i.test(text)?'paypal':/paypal|statement-/i.test(name)?'paypal':'';
 const rows=parseCSV(text,{excelText:true}).slice(0,30),has=(row,names)=>names.every(n=>row.includes(n));
 if(rows.some(r=>has(r,['Transaction ID','Account Name','Account Group','Debit Amount (Two Column Approach)'])))return 'wave';
 if(rows.some(r=>has(r,['Order ID','ASIN','Payment Reference ID'])))return 'amazon';
 if(rows.some(r=>r.some(c=>/^Transaction ID$/i.test(c))&&r.some(c=>/^Currency$/i.test(c))&&r.some(c=>/^(Gross|Amount)$/i.test(c))&&r.some(c=>/^(Net|Total)$/i.test(c))))return 'paypal';
 if(rows.some(r=>r.some(c=>/^(ID|Transaction ID)$/i.test(c))&&r.some(c=>/^Amount\s*\(total\)$/i.test(c))&&r.some(c=>/^Type$/i.test(c))))return 'venmo';
 return '';
}
export async function discoverDataFiles(folder,{prefix='',depth=0}={}) {
 if(depth>8)return [];
 const entries=[];
 for await(const [name,handle] of folder.entries()) {
  if(name.startsWith('.'))continue;
  const path=prefix?prefix+'/'+name:name;
  if(handle.kind==='directory') {if(!/^(local-analysis|node_modules)$/i.test(name))entries.push(...await discoverDataFiles(handle,{prefix:path,depth:depth+1}));}
  else if(/\.(csv|pdf|zip|xlsx?|txt)$/i.test(name))entries.push({path,handle});
 }
 return entries.sort((a,b)=>a.path.localeCompare(b.path));
}
const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
// Replace an entire posting group by ID. Overlapping exports cannot multiply purchases.
export function mergeAccountingHistory(previous,next,{replace=true}={}) {
 const incoming=importAccounting(next);if(!previous)return {text:next,dataset:incoming};
 importAccounting(previous);
 const a=parseCSV(previous),b=parseCSV(next),header=[...a[0],...b[0].filter(h=>!a[0].includes(h))],groups=new Map();let original;
 for(const [sourceIndex,rows] of [a,b].entries()) {
  const source=rows[0],index=source.indexOf('Transaction ID'),local=new Map();
  for(const row of rows.slice(1)){const id=row[index];if(!local.has(id))local.set(id,[]);local.get(id).push(header.map(h=>source.includes(h)?row[source.indexOf(h)]:''));}
  for(const [id,postings] of local)if(sourceIndex===0||replace||!groups.has(id))groups.set(id,postings);
  if(sourceIndex===0)original=new Map(groups);
 }
 if(JSON.stringify(header)===JSON.stringify(a[0])&&groups.size===original.size&&[...groups].every(([id,rows])=>JSON.stringify(rows)===JSON.stringify(original.get(id))))return {text:previous,dataset:importAccounting(previous)};
 const text=[header,...[...groups.values()].flat()].map(row=>row.map(quote).join(',')).join('\n');
 return {text,dataset:importAccounting(text)};
}
export async function indexDataFolder(folder) {
 const entries=await discoverDataFiles(folder),results=[],wave=[],evidence=[];
 for(const entry of entries) {
  try {
   const file=await entry.handle.getFile();
   if(file.size>30*1024*1024)throw Error('File exceeds 30 MB. Split the export into smaller reports.');
   if(!/\.(csv|pdf)$/i.test(file.name))throw Error(/\.zip$/i.test(file.name)?'Use the Wave export helper to safely extract this ZIP, or extract accounting.csv here.':'Use a supported CSV or text-based PayPal PDF export.');
   const pages=/\.pdf$/i.test(file.name)?await extractLocalPDF(file):null,text=pages?pages.join('\n'):await file.text();
   const provider=detectDataProvider(text,entry.path);
   if(!provider)throw Error('Report type was not recognized. Use Wave Accounting CSV, Amazon order/item CSV, PayPal activity CSV or statement PDF, or Venmo transaction CSV.');
   const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
   if(provider==='wave'){const dataset=importAccounting(text);wave.push({...entry,text,file,sha256,dataset});}
   else evidence.push({...entry,provider,file,sha256,pages});
   results.push({path:entry.path,provider,status:'recognized',sha256,size:file.size});
  } catch(e) {results.push({path:entry.path,status:'invalid',message:e.message});}
 }
 const priority=f=>/^wave\/accounting\.csv$/i.test(f.path)?3:/(?:^|\/)(history|exports)\//i.test(f.path)?0:2;
 wave.sort((a,b)=>priority(a)-priority(b)||(a.file.lastModified||0)-(b.file.lastModified||0)||a.path.localeCompare(b.path));
 return {wave,evidence,results};
}
