import {importPayPalCSV,paypalDate} from './paypal-csv.js';
import {venmoDigest} from './venmo.js';
export const paypalOrigins=['https://www.paypal.com/reports/*'];
export const paypalReportURL='https://www.paypal.com/reports/dlog';
export function paypalPeriods(fromYear,today,availableThrough=today) {
 paypalDate(today);paypalDate(availableThrough);const through=availableThrough<today?availableThrough:today;const current=Number(today.slice(0,4));if(!Number.isInteger(fromYear)||fromYear<2000||fromYear>current)throw Error('Choose a starting year through the current year.');
 const cutoff=new Date(today+'T00:00:00Z');const day=cutoff.getUTCDate();cutoff.setUTCFullYear(current-7);if(cutoff.getUTCDate()!==day)cutoff.setUTCDate(0);
 const earliest=cutoff.toISOString().slice(0,10),periods=[];
 for(let year=Math.max(fromYear,Number(earliest.slice(0,4)));year<=current;year++){const start=year===Number(earliest.slice(0,4))&&earliest>year+'-01-01'?earliest:year+'-01-01',end=year+'-12-31'<through?year+'-12-31':through;if(end<start)continue;periods.push({start,end,partial:start!==year+'-01-01'||end!==year+'-12-31',type:'All transactions',format:'CSV'});}
 if(!periods.length)throw Error('PayPal has no available dates in the selected history.');
 return {periods,earliest,through,requestedStart:fromYear+'-01-01',limited:fromYear+'-01-01'<earliest};
}
export const paypalReportKey=r=>[r.type,r.start,r.end,r.format].join(':');
export function eligiblePayPalReports(info) {
 return (info.reports||[]).filter(r=>/^(All transactions|Balance affecting)$/i.test(r.type)&&r.format==='CSV'&&r.start&&r.end&&r.ready).sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end)||a.type.localeCompare(b.type));
}
export async function savePayPalResponse(root,report,text){
 paypalDate(report.start);paypalDate(report.end);if(report.end<report.start||!['All transactions','Balance affecting'].includes(report.type))throw Error('Invalid report identity.');
 if(typeof text!=='string'||text.length>30*1024*1024||/^\s*[<{]/.test(text)||text.startsWith('PK'))throw Error('Expected a PayPal activity CSV. Login pages and ZIP reports are not CSVs.');
 const hash=await venmoDigest(text),raw=await root.getDirectoryHandle('raw',{create:true}),name='paypal-'+(report.type==='All transactions'?'all':'balance')+'-'+report.start+'-to-'+report.end+'-'+hash.slice(0,16)+'.response.local.txt';
 try{const existing=await(await(await raw.getFileHandle(name)).getFile()).text();if(await venmoDigest(existing)!==hash)throw Error('Conflicting raw PayPal response; nothing overwritten.');return {hash,path:'raw/'+name};}catch(error){if(error.name!=='NotFoundError')throw error;}
 const file=await raw.getFileHandle(name,{create:true}),stream=await file.createWritable();try{await stream.write(text);await stream.close();}catch(error){await stream.abort?.();throw error;}
 return {hash,path:'raw/'+name};
}
export async function savePayPalCSV(root,report,text,dateOrder='mdy') {
 paypalDate(report.start);paypalDate(report.end);if(report.end<report.start||!['All transactions','Balance affecting'].includes(report.type))throw Error('Invalid report identity.');
 const original=await savePayPalResponse(root,report,text);let parsed;try{parsed=importPayPalCSV(text,{dateOrder,period:report});}catch(error){error.responsePath=original.path;error.message+=' Original response preserved in paypal/'+original.path;throw error;}
 const hash=original.hash,year=report.start.slice(0,4),dir=await root.getDirectoryHandle(year,{create:true});
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
// A click is an intent. Only an exact row in the refreshed report list confirms submission.
export async function collectPayPalReports({periods,entries={},read,download,save,persist,request,prepare,refresh,verifySaved=async()=>false,current=()=>true,progress=()=>{},pause=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),timeoutMs=600000,refreshMs=5000,submissionTimeoutMs=30000,recoveryMs=10000}) {
 const next={...entries};let info=await read(),saved=0,requested=0;
 const planned=new Set(periods.map(paypalReportKey)),originalReady=eligiblePayPalReports(info).filter(r=>!planned.has(paypalReportKey(r)));
 const archiveIssues=[];
 // A provider can clamp an attempted current-year end date to its data cutoff.
 // Keep the old intent as an audit note, but reuse the visible actual range.
 if(!current())return {entries:next,saved,requested,stopped:true};
 for(const period of periods){if(!matchesInitial(period))continue;for(const [key,entry] of Object.entries(next))if(entry.type===period.type&&entry.format===period.format&&entry.start===period.start&&entry.end>period.end&&entry.end.slice(0,4)===period.end.slice(0,4)&&entry.reportConfirmed!==true&&['requesting','requested'].includes(entry.status)&&!entry.hash){next[key]={...entry,status:'superseded',availableEnd:period.end};await persist(next);}}
 function matchesInitial(period){return (info.reports||[]).some(r=>paypalReportKey(r)===paypalReportKey(period));}
 const verified=new Map(),matches=(list,period)=>(list.reports||[]).filter(r=>paypalReportKey(r)===paypalReportKey(period));
 async function valid(entry){if(!entry?.hash)return false;const key=entry.hash+':'+entry.name;if(!verified.has(key))verified.set(key,await verifySaved(entry));return verified.get(key);}
 async function covered(period){for(const entry of Object.values(next)){if(entry.type==='All transactions'&&entry.format==='CSV'&&entry.start===period.start&&entry.end===period.end&&await valid(entry))return true;}return false;}
 async function reportProgress(report,message,meta){let completed=0;for(const period of periods)if(await covered(period))completed++;progress(report,message,{requested,saved,total:periods.length,completed,...meta});}
 async function store(report,archive=false){const key=paypalReportKey(report);if(await valid(next[key])||!current())return;await reportProgress(report,archive?'Collecting older available export after yearly reports':'Downloading requested yearly CSV',{phase:archive?'archive':'downloading'});const text=await download(report);if(!current())return;const result=await save(report,text);next[key]={...report,...result,status:'saved',savedAt:new Date().toISOString()};delete next[key].ready;delete next[key].row;delete next[key].rowToken;await persist(next);verified.set(result.hash+':'+result.name,true);saved++;}
 async function observed(period){const key=paypalReportKey(period);if(next[key]?.hash)return;next[key]={...period,...next[key],status:'requested',reportConfirmed:true};await persist(next);}
 const unconfirmed=period=>({entries:next,saved,requested,unconfirmed:period,stopped:false});
 // Migrate old click-only checkpoints after two fresh, complete report-list reads.
 // A full list with pending rows cannot prove absence. A full ready list can
 // recover legacy unconfirmed clicks, but not a previously observed submission.
 const stale=periods.filter(period=>['requesting','requested'].includes(next[paypalReportKey(period)]?.status)&&!matches(info,period).length);
 if(stale.length&&refresh){
  await reportProgress(stale[0],'Checking old request checkpoints against PayPal',{phase:'checking'});
  const started=now();let snapshots=0,absent=new Set(stale.map(paypalReportKey));
  do{
   if(!current())return {entries:next,saved,requested,stopped:true};
   await refresh();info=await read();snapshots++;
   for(const period of stale)if(matches(info,period).length){absent.delete(paypalReportKey(period));await observed(period);}
   if(info.reportListComplete!==true)absent.clear();
   if((info.reports||[]).length>=12){for(const key of absent)if(next[key]?.reportConfirmed===true||(info.reports||[]).some(r=>!r.ready))absent.delete(key);}
   if(!absent.size)break;
   if(now()-started>=recoveryMs&&snapshots>=2)break;
   await pause(Math.min(2000,Math.max(1,recoveryMs-(now()-started))));
  }while(current());
  if(snapshots>=2&&now()-started>=recoveryMs){for(const key of absent)delete next[key];await persist(next);}
 }
 // Create every missing annual report immediately after preparing its controls.
 // Historical downloads must never be a prerequisite for pressing Create Report.
 for(const period of periods){
  if(!current())return {entries:next,saved,requested,stopped:true};if(await covered(period))continue;
  const key=paypalReportKey(period);info=await read();const found=matches(info,period);
  if(found.length){await observed(period);continue;}
  if(['requesting','requested'].includes(next[key]?.status))return unconfirmed(period);
  if(prepare){await reportProgress(period,'Setting annual report dates',{phase:'preparing'});const prepared=await prepare(period);if(prepared?.notSubmitted)throw Error(prepared.message||'PayPal report controls did not accept the annual range.');if(!current())return {entries:next,saved,requested,stopped:true};if(prepared?.existing)continue;}
  await reportProgress(period,'Creating annual CSV report',{phase:'requesting'});next[key]={...period,status:'requesting',reportConfirmed:false,requestedAt:new Date().toISOString()};await persist(next);
  const outcome=await request(period);if(outcome?.notSubmitted){delete next[key];await persist(next);throw Error(outcome.message||'PayPal did not accept the requested dates. Nothing requested.');}
  if(!current())return {entries:next,saved,requested,stopped:true};
  const started=now();let refreshed=started;
  do{
   info=await read();if(matches(info,period).length){await observed(period);requested++;break;}
   await reportProgress(period,'Verifying this report appeared in PayPal',{phase:'confirming'});
   if(!refresh||now()-started>=submissionTimeoutMs)return unconfirmed(period);
   if(now()-refreshed>=2000){await refresh();refreshed=now();}
   await pause(Math.min(500,Math.max(1,submissionTimeoutMs-(now()-started))));
  }while(current());
 }
 const started=now();let refreshed=started;
 while(current()){
  info=await read();for(const report of eligiblePayPalReports(info).filter(r=>planned.has(paypalReportKey(r)))){await store(report);if(!current())return {entries:next,saved,requested,stopped:true};}
  const pending=[];for(const period of periods)if(!await covered(period))pending.push(period);
  if(!pending.length){
   // Collect optional historical exports only after the requested years are saved.
   // PayPal can rotate old rows out of its twelve-report view. Record gaps rather
   // than claim preservation, or let a failed legacy download block annual work.
   const older=new Map(originalReady.map(r=>[paypalReportKey(r),r]));for(const r of Object.values(next))if(['archive-unavailable','archive-failed'].includes(r.status)&&!planned.has(paypalReportKey(r)))older.set(paypalReportKey(r),r);for(const r of eligiblePayPalReports(info))if(!planned.has(paypalReportKey(r)))older.set(paypalReportKey(r),r);
   for(const [key,report] of older){
    if(!current())return {entries:next,saved,requested,stopped:true};if(await valid(next[key]))continue;
    const fresh=await read(),available=eligiblePayPalReports(fresh).find(r=>paypalReportKey(r)===key);
    let issue;
    if(!available)issue={type:report.type,format:report.format,start:report.start,end:report.end,status:'archive-unavailable',message:'Older CSV is no longer available in the PayPal report list.'};
    else try{await store(available,true);}catch(error){if(!current())return {entries:next,saved,requested,stopped:true};issue={type:report.type,format:report.format,start:report.start,end:report.end,status:'archive-failed',message:String(error.message||'Older export download failed.').replace(/https?:\/\/\S+/g,'[URL]').slice(0,400)};}
    if(issue){archiveIssues.push(issue);next[key]={...next[key],...issue};await persist(next);}
   }
   return {entries:next,saved,requested,stopped:!current(),archiveIssues};
  }
  const missing=pending.find(period=>!matches(info,period).length);if(missing)return unconfirmed(missing);
  const elapsed=now()-started;await reportProgress(pending[0],'Waiting for '+pending.length+' confirmed reports - '+Math.floor(elapsed/1000)+'s / '+Math.floor(timeoutMs/1000)+'s; refreshing automatically',{phase:'waiting',pending:pending.length,elapsed});
  if(!refresh||elapsed>=timeoutMs)return {entries:next,saved,requested,waiting:pending[0],pending};
  if(now()-refreshed>=refreshMs){if(!current())break;await refresh();refreshed=now();}
  await pause(Math.min(1000,Math.max(1,timeoutMs-(now()-started))));
 }
 return {entries:next,saved,requested,stopped:true};
}
