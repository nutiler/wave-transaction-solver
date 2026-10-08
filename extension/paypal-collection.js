import {paypalPeriods,paypalReportKey,savePayPalResponse,savePayPalCSV} from './paypal.js';
import {venmoDigest} from './venmo.js';

export function freshPayPalBatch(today,availableThrough=today,id=crypto.randomUUID()) {
 const plan=paypalPeriods(2000,today,availableThrough),cutoff=plan.earliest,first=new Date(cutoff+'T00:00:00Z');
 // PayPal disables the seven-year anniversary day itself. Its first selectable
 // calendar day is the following day; older ready exports remain history.
 first.setUTCDate(first.getUTCDate()+1);const earliest=first.toISOString().slice(0,10);
 const periods=plan.periods.filter(p=>p.end>=earliest).map(p=>p.start<earliest?{...p,start:earliest,partial:true}:p);
 return {version:1,id,asOf:today,calendarBoundaryVersion:2,startedAt:new Date().toISOString(),cutoff,earliest,through:plan.through,
  reports:periods.map(period=>({...period,requestState:'planned',downloadState:'pending',importState:'pending'}))};
}
const needsSignIn=message=>/sign[- ]?in|log[- ]?in|login|signed[- ]?in|signed.out/i.test(String(message));
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
 submissionTimeoutMs=30000,timeoutMs=600000,refreshMs=5000,resume=false,asOf=batch.asOf||batch.through}) {
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
 const reuseReady=async(entry,info)=>{
  const ready=matches(info,entry)[0];if(!ready?.ready)return false;
  entry.requestState='submitted';entry.reportOrigin='existing-ready';entry.reportRecoveredAt=new Date().toISOString();delete entry.message;await update();return true;
 };
 const result=stopped=>{
  const count=counts(),waiting=batch.reports.filter(r=>r.downloadState!=='saved');
  return {...count,complete:count.downloaded===count.total,stopped,waiting,issues:batch.reports.filter(r=>r.message||r.importState==='failed')};
 };
 // Repair only the unsent oldest range in an existing batch. Submitted and
 // uncertain requests retain their exact identities and must never be replayed.
 if(resume){
  const oldest=batch.reports[0],window=freshPayPalBatch(asOf,batch.through,batch.id);
  if(oldest&&oldest.downloadState!=='saved'&&['planned','rejected'].includes(oldest.requestState)&&oldest.start<window.earliest&&window.earliest<=oldest.end){
   oldest.originalStart=oldest.originalStart||oldest.start;oldest.start=window.earliest;oldest.requestState='planned';oldest.boundaryNote='PayPal disables '+window.cutoff+'; earliest selectable date is '+window.earliest+'.';
   delete oldest.message;delete oldest.baselineCount;delete oldest.baselinePending;delete oldest.reportOrigin;batch.earliest=window.earliest;batch.cutoff=window.cutoff;batch.calendarBoundaryVersion=2;await update();
  }
 }
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
  // A rejected Create was never submitted. On Resume, an exact ready CSV is
  // already collectible; date-entry controls are irrelevant to downloading it.
  if(resume&&entry.requestState==='rejected'&&await reuseReady(entry,info))continue;
  if(['requesting','uncertain'].includes(entry.requestState)){
   await confirmed(entry,info);continue; // Never repeat an uncertain Create click.
  }
  let before=matches(info,entry);const oldestBoundary=entry===batch.reports[0]&&entry.start.slice(5)!=='01-01';let requestSpec={...entry,forceNew:true,oldestBoundary},prepared=await prepare(requestSpec);
  if(oldestBoundary&&prepared?.notSubmitted&&!needsSignIn(prepared.message)&&await reuseReady(entry,info))continue;
  // Near the rolling limit, verify the first accepted day with preparation only.
  // No Create click is made until PayPal displays and commits the exact range.
  if(oldestBoundary&&prepared?.notSubmitted&&prepared.calendarBoundary){
   const initial=entry.start;
   for(let offset=1;offset<=7&&current();offset++){
    const candidate=new Date(initial+'T00:00:00Z');candidate.setUTCDate(candidate.getUTCDate()+offset);const start=candidate.toISOString().slice(0,10);if(start>entry.end||start.slice(0,4)!==initial.slice(0,4))break;
    requestSpec={...entry,start,forceNew:true,oldestBoundary:true};prepared=await prepare(requestSpec);
    if(!prepared?.notSubmitted){prepared={...prepared,start:prepared.start||start,originalStart:initial};break;}
    if(!prepared.calendarBoundary)break;
   }
  }
  if(!prepared?.notSubmitted&&prepared?.start&&prepared.start!==entry.start){
   const start=prepared.start;if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||start<entry.start||start>entry.end||start.slice(0,4)!==entry.start.slice(0,4))throw Error('Invalid oldest calendar boundary.');
   entry.originalStart=entry.originalStart||entry.start;entry.start=start;entry.boundaryNote='PayPal’s calendar accepted '+start+' as the earliest verified date.';batch.earliest=start;requestSpec={...entry,forceNew:true};before=matches(await read(),entry);await update();
  }
  if(!current())return result(true);
  if(prepared?.notSubmitted){entry.requestState='rejected';entry.message=prepared.message||'PayPal did not accept this range.';await update();if(needsSignIn(entry.message))return {...result(false),paused:true,message:entry.message};continue;}
  entry.baselineCount=before.length;entry.baselinePending=pendingCount(before);entry.requestState='requesting';delete entry.message;await update();
  let outcome;
  try{outcome=await request(requestSpec);}catch(error){entry.requestState='uncertain';entry.message=safeMessage(error);await update();continue;}
  if(!current())return result(true);
  if(outcome?.notSubmitted){entry.requestState='rejected';entry.message=outcome.message||'Create Report was not clicked.';await update();if(needsSignIn(entry.message))return {...result(false),paused:true,message:entry.message};continue;}
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
   }catch(error){entry.downloadState='failed';entry.message=safeMessage(error);if(needsSignIn(entry.message)){entry.downloadState='pending';await update();return {...result(false),paused:true,message:entry.message};}}
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
