import {importPayPalCSV} from './paypal-csv.js';
import {importAmazon} from './amazon.js';
import {importVenmoEvidence,parsePayPalPages,amazonChargeEvidence,mergeServiceEvidence} from './service-solvers.js';
import {extractLocalPDF} from './source-pdf.js';
import {detectDataProvider} from './data-index.js';

export async function dataFiles(folder,prefix=/^(amazon|paypal|venmo)$/i.test(folder.name||'')?folder.name:''){const result=[];for await(const [name,handle] of folder.entries()){const path=prefix?prefix+'/'+name:name;if(handle.kind==='directory'){if(prefix.split('/').length<5&&!/^\./.test(name))result.push(...await dataFiles(handle,path));}else if(/\.(csv|pdf)$/i.test(name)&&/(?:^|\/)(amazon|paypal|venmo)\//i.test(path))result.push({handle,path});}return result.sort((a,b)=>a.path.localeCompare(b.path));}
export function sourceProvider(name){if(/(?:^|[/\\])amazon[/\\]|^orders_from_/i.test(name))return 'amazon';if((/\.pdf$/i.test(name)&&/paypal|statement-/i.test(name))||(/\.csv$/i.test(name)&&(/(?:^|[/\\])paypal[/\\]|^paypal[-_]/i.test(name)||/^Download\.csv$/i.test(name))))return 'paypal';if(/venmo/i.test(name)&&/\.csv$/i.test(name))return 'venmo';return '';}
export function holdEvidenceFiles(records,issues={}) {
 return records.map(r=>{const failed=(r.sources||[]).some(source=>String(source.file||'').split('; ').some(name=>issues[name]));if(!failed)return r;const message='A source file failed refresh or needs account confirmation. The last valid copy is retained; review the file before applying source-linked work.';return {...r,bankExpected:false,blocked:[r.blocked,message].filter(Boolean).join(' '),issues:[...new Set([...(r.issues||[]),message])]};});
}
export async function readEvidenceFile(file,name=file.webkitRelativePath||file.name,previous=null,{pages=null}={}) {
 if(file.size>30*1024*1024)throw Error('Source files must be under 30 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer()),csv=/\.csv$/i.test(name),text=csv?new TextDecoder().decode(bytes):'';
 let provider=csv?detectDataProvider(text,name):detectDataProvider(pages?.join('\n')||'',name);
 if(!provider&&/\.pdf$/i.test(name)){pages=await extractLocalPDF(file);provider=detectDataProvider(pages.join('\n'),name);}
 if(!['amazon','paypal','venmo'].includes(provider))throw Error('Use Amazon order CSVs, PayPal activity CSVs or text-based monthly statement PDFs, or Venmo transaction CSVs.');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join(''),base={parseVersion:provider==='paypal'&&csv?3:provider==='venmo'?2:1,key:provider+':'+name,name,provider,sha256,size:file.size,importedAt:new Date().toISOString()};
 if(previous?.sha256===sha256&&previous.parseVersion===base.parseVersion)return previous;
 if(provider==='paypal'&&csv)return {...base,...importPayPalCSV(text,{name,dateOrder:/-dmy(?:-[a-f0-9]+)?\.csv$/i.test(name)?'dmy':'mdy'}),key:base.key};
 if(provider==='paypal'){const parsed=parsePayPalPages(pages||await extractLocalPDF(file),{name});if(parsed.issues.length)throw Error(parsed.issues[0]);return {...base,...parsed,key:base.key};}
 if(provider==='amazon')return {...base,amazonRecords:importAmazon(text)};
 const profile=name.match(/(?:^|[/\\])(personal|business)(?:[/\\]|$)|venmo-(personal|business)-/i),month=name.match(/venmo-(?:personal|business)-(\d{4}-\d{2})/i)?.[1]||'';
 return {...base,...importVenmoEvidence(text,{name,profile:profile?(profile[1]||profile[2]).toLowerCase():'',period:month}),key:base.key};
}
export function modelEvidenceFiles(files){const direct=files.filter(f=>f.provider!=='amazon'),amazon=files.filter(f=>f.provider==='amazon');if(amazon.length)direct.push(amazonChargeEvidence(amazon.flatMap(f=>f.amazonRecords||[]),{name:amazon.map(f=>f.name).join('; ')}));return mergeServiceEvidence(direct).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.key.localeCompare(b.key));}
export function validateSourcePackage(value){if(value?.format!=='wave-solver-source-evidence'||value.version!==1||!Array.isArray(value.files)||value.files.length>5000)throw Error('Unsupported source-evidence package.');for(const file of value.files){if(!['amazon','paypal','venmo'].includes(file.provider)||typeof file.name!=='string'||!Array.isArray(file.provider==='amazon'?file.amazonRecords:file.records))throw Error('Malformed evidence source file.');if((file.records||file.amazonRecords).length>100000)throw Error('Source file is too large.');for(const r of file.records||[])if(typeof r.key!=='string'||!r.key.startsWith(file.provider+':')||typeof r.sourceId!=='string'||typeof r.merchant!=='string'||!Number.isSafeInteger(r.amountCents)||!Number.isSafeInteger(r.signedCents)||!Array.isArray(r.issues)||!Array.isArray(r.items)||!Array.isArray(r.sources))throw Error('Malformed evidence transaction.');}return value.files;}
