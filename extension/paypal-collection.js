import {paypalPeriods,paypalReportKey,savePayPalResponse,savePayPalCSV} from './paypal.js';
import {venmoDigest} from './venmo.js';

export function freshPayPalBatch(today,availableThrough=today,id=crypto.randomUUID()) {
 const plan=paypalPeriods(2000,today,availableThrough);
 return {version:1,id,startedAt:new Date().toISOString(),earliest:plan.earliest,through:plan.through,
  reports:plan.periods.map(period=>({...period,requestState:'planned',downloadState:'pending',importState:'pending'}))};
}
const safeMessage=error=>String(error?.message||error).replace(/https?:\/\/\S+/g,'[URL]').slice(0,600);
export async function verifyCollectedPayPalReport(root,entry) {
 const expected='raw/paypal-all-'+entry.start+'-to-'+entry.end+'-';
 if(!entry.hash||!entry.responsePath?.startsWith(expected)||!/^([a-f0-9]{16})\.response\.local\.txt$/.test(entry.responsePath.slice(expected.length)))return false;
 try{const raw=await root.getDirectoryHandle('raw'),file=await raw.getFileHandle(entry.responsePath.slice(4));return await venmoDigest(await(await file.getFile()).text())===entry.hash;}catch{return false;}
}
export async function archiveCollectedPayPalReport(root,report,text) {
 const original=await savePayPalResponse(root,report,text);
 return {hash:original.hash,responsePath:original.path,downloadedAt:new Date().toISOString()};
}
export async function importCollectedPayPalReport(root,entry,dateOrder='mdy') {
 if(!await verifyCollectedPayPalReport(root,entry))throw Error('The saved original report is missing or changed; collect this year again.');
 const raw=await root.getDirectoryHandle('raw'),file=await raw.getFileHandle(entry.responsePath.slice(4));
 return savePayPalCSV(root,entry,await(await file.getFile()).text(),dateOrder);
}

// Fresh batches ignore legacy coverage. Submission, download and import have
// independent checkpoints: parsing can never prevent another year downloading.
export async function runFreshPayPalCollection({batch,read,prepare,request,refresh,download,archive,verify,importReport,persist,
 current=()=>true,progress=()=>{},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>Date.now(),
 submissionTimeoutMs=30000,timeoutMs=600000,refreshMs=5000}) {
 const matches=(info,entry)=>(info.reports||[]).filter(r=>paypalReportKey(r)===paypalReportKey(entry));
 const pendingCount=rows=>rows.filter(r=>!r.ready).length;
 const counts=()=>({total:batch.reports.length,downloaded:batch.reports.filter(r=>r.downloadState==='saved').length,imported:batch.reports.filter(r=>r.importState==='saved').length});
 const update=async()=>{await persist(batch);progress(batch,counts());};
 const confirmed=async(entry,info)=>{
  const rows=matches(info,entry);
  if(entry.requestState==='submitted')return rows[0]||null;
  if(['requesting','uncertain'].includes(entry.requestState)&&(rows.length>entry.baselineCount||pendingCount(rows)>entry.baselinePending)){
   entry.requestState='submitted';delete entry.message;await update();return rows[0];
  }
  return null;
 };
 const result=stopped=>{
  const count=counts(),waiting=batch.reports.filter(r=>r.downloadState!=='saved');
  return {...count,complete:count.downloaded===count.total,stopped,waiting,issues:batch.reports.filter(r=>r.message||r.importState==='failed')};
 };
 // Recheck every original file before trusting a resumed download checkpoint.
 for(const entry of batch.reports){
  if(!current())return result(true);
  if(entry.downloadState==='saved'&&!await verify(entry)){entry.downloadState='pending';entry.importState='pending';entry.message='Saved original changed or missing; downloading this year again.';}
 }
 await update();
 // Submit every annual range, including 2025, before waiting for downloads.
 for(const entry of batch.reports){
  if(!current())return result(true);
  if(entry.downloadState==='saved'||entry.requestState==='submitted')continue;
  const info=await read();
  if(['requesting','uncertain'].includes(entry.requestState)){
   await confirmed(entry,info);continue; // Never repeat an uncertain Create click.
  }
  const before=matches(info,entry),requestSpec={...entry,forceNew:true};
  const prepared=await prepare(requestSpec);
  if(!current())return result(true);
  if(prepared?.notSubmitted){entry.requestState='rejected';entry.message=prepared.message||'PayPal did not accept this range.';await update();continue;}
  entry.baselineCount=before.length;entry.baselinePending=pendingCount(before);entry.requestState='requesting';delete entry.message;await update();
  let outcome;
  try{outcome=await request(requestSpec);}catch(error){entry.requestState='uncertain';entry.message=safeMessage(error);await update();continue;}
  if(!current())return result(true);
  if(outcome?.notSubmitted){entry.requestState='rejected';entry.message=outcome.message||'Create Report was not clicked.';await update();continue;}
  // The page adapter confirms a NEW row/count, never a pre-existing ready report.
  if(outcome?.submitted){entry.requestState='submitted';await update();continue;}
  const began=now();let lastRefresh=began;
  while(current()){
   if(await confirmed(entry,await read()))break;
   if(!refresh||now()-began>=submissionTimeoutMs){entry.requestState='uncertain';entry.message='A new report has not appeared yet. Resume checks it without repeating Create.';await update();break;}
   if(now()-lastRefresh>=2000){await refresh();lastRefresh=now();}
   await pause(500);
  }
 }
 if(!current())return result(true);
 const began=now(),attempted=new Set();let lastRefresh=began;
 while(current()){
  const info=await read();
  for(const entry of batch.reports){
   if(!current())return result(true);
   if(entry.downloadState==='saved')continue;
   const candidate=await confirmed(entry,info),key=paypalReportKey(entry);
   // PayPal lists newest reports first. An older ready duplicate must not bypass
   // this batch's newer Submitted report for the same year.
   if(!candidate?.ready||attempted.has(key))continue;
   attempted.add(key);entry.downloadState='downloading';delete entry.message;await update();
   try{
    const text=await download({...entry,rowToken:candidate.rowToken});
    if(!current())return result(true);
    const saved=await archive(entry,text);
    if(!await verify({...entry,...saved}))throw Error('The original file could not be verified after saving.');
    Object.assign(entry,saved,{downloadState:'saved',importState:'pending'});delete entry.message;
   }catch(error){entry.downloadState='failed';entry.message=safeMessage(error);}
   await update();
  }
  const waiting=batch.reports.filter(r=>r.downloadState!=='saved'&&['submitted','requesting','uncertain'].includes(r.requestState)&&!attempted.has(paypalReportKey(r)));
  if(!waiting.length||!refresh||now()-began>=timeoutMs)break;
  progress(batch,{...counts(),waiting:waiting.length,elapsed:now()-began});
  if(now()-lastRefresh>=refreshMs){await refresh();lastRefresh=now();}
  await pause(Math.min(1000,Math.max(1,timeoutMs-(now()-began))));
 }
 // All ready originals are on disk before importing any of them.
 for(const entry of batch.reports){
  if(!current())return result(true);
  if(entry.downloadState!=='saved')continue;
  try{const parsed=await importReport(entry);Object.assign(entry,{importState:'saved',name:parsed.name,count:parsed.count});delete entry.message;}
  catch(error){entry.importState='failed';entry.message=safeMessage(error);}
  await update();
 }
 batch.finishedAt=counts().downloaded===batch.reports.length?new Date().toISOString():null;
 await update();return result(!current());
}
