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
// Save every available CSV before creating more reports in PayPal's bounded report list.
export async function collectPayPalReports({periods,entries={},read,download,save,persist,request,verifySaved=async()=>false,current=()=>true,progress=()=>{}}) {
 const next={...entries};let info=await read(),saved=0;
 async function store(report){const key=paypalReportKey(report);if(next[key]?.hash&&await verifySaved(next[key]))return;if(!current())return;progress(report,'Downloading CSV');const text=await download(report);if(!current())return;const result=await save(report,text);next[key]={...report,...result,status:'saved',savedAt:new Date().toISOString()};delete next[key].ready;delete next[key].row;await persist(next);saved++;}
 for(const report of eligiblePayPalReports(info)){await store(report);if(!current())return {entries:next,saved,stopped:true};}
 for(const period of periods) {
  if(!current())return {entries:next,saved,stopped:true};const key=paypalReportKey(period),entry=next[key];
  if(entry?.hash&&await verifySaved(entry))continue;
  let covered=false;for(const savedReport of Object.values(next)){if(savedReport.type==='All transactions'&&savedReport.format==='CSV'&&savedReport.start<=period.start&&savedReport.end>=period.end&&savedReport.hash&&await verifySaved(savedReport)){covered=true;break;}}if(covered)continue;
  info=await read();const matches=(info.reports||[]).filter(r=>paypalReportKey(r)===key);
  if(matches.length>1)throw Error('More than one report has the requested identity. Choose the exact report in PayPal.');
  if(matches[0]?.ready){await store(matches[0]);continue;}
  if(matches.length||['requesting','requested'].includes(entry?.status))return {entries:next,saved,waiting:period,uncertain:!matches.length};
  progress(period,'Creating annual CSV report');next[key]={...period,status:'requesting',requestedAt:new Date().toISOString()};await persist(next);
  // A persisted intent prevents duplicate Create Report clicks if the page or extension closes.
  const outcome=await request(period);if(outcome?.notSubmitted){delete next[key];await persist(next);throw Error(outcome.message||'Set the requested report controls in PayPal, then Resume.');}
  next[key]={...next[key],status:'requested'};await persist(next);info=await read();
  const ready=(info.reports||[]).filter(r=>paypalReportKey(r)===key&&r.ready);if(ready.length===1)await store(ready[0]);else return {entries:next,saved,waiting:period};
 }
 return {entries:next,saved,stopped:!current()};
}
