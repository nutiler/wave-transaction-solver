import {importPayPalCSV,paypalDate} from './paypal-csv.js';
import {venmoDigest} from './venmo.js';
export const paypalOrigins=['https://www.paypal.com/reports/*'];
export const paypalReportURL='https://www.paypal.com/reports/dlog';
export function paypalPeriods(fromYear,today) {
 paypalDate(today);const current=Number(today.slice(0,4));if(!Number.isInteger(fromYear)||fromYear<2000||fromYear>current)throw Error('Choose a starting year through the current year.');
 const cutoff=new Date(today+'T00:00:00Z');const day=cutoff.getUTCDate();cutoff.setUTCFullYear(current-7);if(cutoff.getUTCDate()!==day)cutoff.setUTCDate(0);
 const earliest=cutoff.toISOString().slice(0,10),periods=[];
 for(let year=Math.max(fromYear,Number(earliest.slice(0,4)));year<=current;year++){const start=[year+'-01-01',earliest].sort().at(-1),end=year===current?today:year+'-12-31';periods.push({start,end,partial:start!==year+'-01-01'||end!==year+'-12-31',type:'All transactions',format:'CSV'});}
 return {periods,earliest,requestedStart:fromYear+'-01-01',limited:fromYear+'-01-01'<earliest};
}
export const paypalReportKey=r=>[r.type,r.start,r.end,r.format].join(':');
export function eligiblePayPalReports(info) {
 return (info.reports||[]).filter(r=>/^(All transactions|Balance affecting)$/i.test(r.type)&&r.format==='CSV'&&r.start&&r.end&&r.ready).sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end)||a.type.localeCompare(b.type));
}
export async function savePayPalCSV(root,report,text,dateOrder='mdy') {
 paypalDate(report.start);paypalDate(report.end);if(report.end<report.start||!['All transactions','Balance affecting'].includes(report.type))throw Error('Invalid report identity.');
 const parsed=importPayPalCSV(text,{dateOrder,period:report}),hash=await venmoDigest(text),year=report.start.slice(0,4),dir=await root.getDirectoryHandle(year,{create:true});
 const stem='paypal-'+(report.type==='All transactions'?'all':'balance')+'-'+report.start+'-to-'+report.end+'-'+dateOrder;let filename=stem+'.csv';
 const existingHash=async name=>{try{return await venmoDigest(await(await(await dir.getFileHandle(name)).getFile()).text());}catch(e){if(e.name==='NotFoundError')return null;throw e;}};
 const existing=await existingHash(filename);if(existing===hash)return {name:year+'/'+filename,hash,count:parsed.records.length,empty:!parsed.records.length,reused:true,dateOrder};
 if(existing!==null){filename=stem+'-'+hash.slice(0,16)+'.csv';const changed=await existingHash(filename);if(changed===hash)return {name:year+'/'+filename,hash,count:parsed.records.length,empty:!parsed.records.length,reused:true,dateOrder};if(changed!==null)throw Error('Conflicting report filename. No file overwritten.');}
 const file=await dir.getFileHandle(filename,{create:true}),stream=await file.createWritable();try{await stream.write(text);await stream.close();}catch(e){await stream.abort?.();throw e;}
 return {name:year+'/'+filename,hash,count:parsed.records.length,empty:!parsed.records.length,reused:false,dateOrder};
}
export async function verifyPayPalFile(root,entry) {
 try{const parts=entry.name.split('/');if(parts.length!==2||!/^\d{4}$/.test(parts[0])||!/^paypal-(all|balance)-[a-z0-9-]+\.csv$/.test(parts[1]))return false;const dir=await root.getDirectoryHandle(parts[0]),file=await dir.getFileHandle(parts[1]);return await venmoDigest(await(await file.getFile()).text())===entry.hash;}catch{return false;}
}
// Preserve ready CSVs, submit missing years once, then collect the submitted batch.
export async function collectPayPalReports({periods,entries={},read,download,save,persist,request,refresh,verifySaved=async()=>false,current=()=>true,progress=()=>{},pause=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),timeoutMs=600000,refreshMs=5000}) {
 const next={...entries};let info=await read(),saved=0,requested=0;
 const verified=new Map();
 async function valid(entry){if(!entry?.hash)return false;const key=entry.hash+':'+entry.name;if(!verified.has(key))verified.set(key,await verifySaved(entry));return verified.get(key);}
 async function covered(period){for(const entry of Object.values(next)){if(entry.type==='All transactions'&&entry.format==='CSV'&&entry.start<=period.start&&entry.end>=period.end&&await valid(entry))return true;}return false;}
 async function reportProgress(report,message,meta){let completed=0;for(const period of periods)if(await covered(period))completed++;progress(report,message,{requested,saved,total:periods.length,completed,...meta});}
 async function store(report){const key=paypalReportKey(report);if(await valid(next[key])||!current())return;await reportProgress(report,'Downloading CSV',{phase:'downloading'});const text=await download(report);if(!current())return;const result=await save(report,text);next[key]={...report,...result,status:'saved',savedAt:new Date().toISOString()};delete next[key].ready;delete next[key].row;delete next[key].rowToken;await persist(next);verified.set(result.hash+':'+result.name,true);saved++;}
 // Old ready reports may be outside PayPal's request window. Save them before the bounded list changes.
 for(const report of eligiblePayPalReports(info)){await store(report);if(!current())return {entries:next,saved,requested,stopped:true};}
 for(const period of periods){
  if(!current())return {entries:next,saved,requested,stopped:true};if(await covered(period))continue;
  const key=paypalReportKey(period);info=await read();const matches=(info.reports||[]).filter(r=>paypalReportKey(r)===key);
  if(matches.some(r=>r.ready)){await store(matches.find(r=>r.ready));continue;}
  if(matches.length||['requesting','requested'].includes(next[key]?.status))continue;
  await reportProgress(period,'Submitting annual CSV report',{phase:'requesting'});next[key]={...period,status:'requesting',requestedAt:new Date().toISOString()};await persist(next);
  const outcome=await request(period);if(outcome?.notSubmitted){delete next[key];await persist(next);throw Error(outcome.message||'PayPal did not accept the requested dates. Nothing requested.');}
  next[key]={...next[key],status:'requested'};await persist(next);requested++;
 }
 const started=now();let refreshed=started;
 while(current()){
  info=await read();for(const report of eligiblePayPalReports(info)){await store(report);if(!current())return {entries:next,saved,requested,stopped:true};}
  const pending=[];for(const period of periods)if(!await covered(period))pending.push(period);
  if(!pending.length)return {entries:next,saved,requested,stopped:false};
  const uncertain=pending.some(period=>!(info.reports||[]).some(r=>paypalReportKey(r)===paypalReportKey(period)));
  const elapsed=now()-started;await reportProgress(pending[0],'Waiting for '+pending.length+' reports - '+Math.floor(elapsed/1000)+'s / '+Math.floor(timeoutMs/1000)+'s; refreshing automatically',{phase:'waiting',pending:pending.length,elapsed});
  if(!refresh||elapsed>=timeoutMs)return {entries:next,saved,requested,waiting:pending[0],pending,uncertain};
  if(now()-refreshed>=refreshMs){if(!current())break;await refresh();refreshed=now();}
  await pause(Math.min(1000,Math.max(1,timeoutMs-(now()-started))));
 }
 return {entries:next,saved,requested,stopped:true};
}
