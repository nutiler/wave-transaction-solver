import test from 'node:test';
import assert from 'node:assert/strict';
import {freshPayPalBatch,runFreshPayPalCollection,archiveCollectedPayPalReport,verifyCollectedPayPalReport,importCollectedPayPalReport} from '../extension/paypal-collection.js';
const batch=()=>freshPayPalBatch('2026-10-08','2026-10-08','fictional-batch');
function setup({ready=false,failImport=false,failDownload=false,oldReports=true}={}){
 const b=batch(),rows=oldReports?b.reports.map((r,i)=>({...r,ready:true,rowToken:'old-'+i})):[],calls=[],archived=new Set();let clock=0,refreshes=0;
 const config={batch:b,read:async()=>({reports:rows}),prepare:async r=>{assert.equal(r.forceNew,true);calls.push('prepare '+r.start);return {prepared:true};},request:async r=>{assert.equal(r.forceNew,true);calls.push('create '+r.start);rows.unshift({...r,ready,rowToken:'new-'+r.start});return {clicked:true,submitted:true};},refresh:async()=>{refreshes++;if(refreshes>=2)rows.forEach(r=>r.ready=true);},download:async r=>{assert.equal(calls.filter(c=>c.startsWith('create ')).length,8);assert.ok(r.rowToken.startsWith('new-'));calls.push('download '+r.start);if(failDownload&&r.start.startsWith('2025'))throw Error('Synthetic download failure');return r.start;},archive:async r=>{calls.push('archive '+r.start);archived.add(r.start);return {hash:r.start,responsePath:'raw/'+r.start};},verify:async r=>archived.has(r.start),importReport:async r=>{assert.equal(archived.size,failDownload?7:8);calls.push('import '+r.start);if(failImport&&r.start.startsWith('2025'))throw Error('Synthetic parse failure');return {name:r.start+'.csv',count:1};},persist:async()=>{},pause:async ms=>clock+=ms,now:()=>clock};
 return {b,rows,calls,archived,config,clock:()=>clock};
}
test('Fresh batch covers the entire available window with exact calendar years, including 2025',()=>{
 const b=batch();assert.equal(b.reports.length,8);assert.equal(b.reports[0].start,'2019-10-08');assert.equal(b.reports[0].end,'2019-12-31');assert.equal(b.reports.at(-1).end,'2026-10-08');
 assert.deepEqual(b.reports.find(r=>r.start.startsWith('2025')),{start:'2025-01-01',end:'2025-12-31',partial:false,type:'All transactions',format:'CSV',requestState:'planned',downloadState:'pending',importState:'pending'});
 for(const r of b.reports)assert.equal(r.start.slice(0,4),r.end.slice(0,4));
});
test('Fresh run creates all eight new reports even when eight old ready reports exist, downloads only new ones, and imports last',async()=>{
 const s=setup(),result=await runFreshPayPalCollection(s.config);
 assert.equal(result.complete,true);assert.equal(result.downloaded,8);assert.equal(result.imported,8);assert.equal(result.waiting.length,0);
 assert.equal(s.calls.filter(c=>c.startsWith('create ')).length,8);assert.equal(s.calls.filter(c=>c.startsWith('download ')).length,8);assert.equal(s.calls.indexOf('create 2025-01-01')>=0,true);
 const firstDownload=s.calls.findIndex(c=>c.startsWith('download ')),lastCreate=s.calls.map((c,i)=>c.startsWith('create ')?i:-1).filter(i=>i>=0).at(-1),firstImport=s.calls.findIndex(c=>c.startsWith('import ')),lastArchive=s.calls.map((c,i)=>c.startsWith('archive ')?i:-1).filter(i=>i>=0).at(-1);
 assert.ok(lastCreate<firstDownload);assert.ok(lastArchive<firstImport);assert.equal(s.b.reports.find(r=>r.start.startsWith('2025')).downloadState,'saved');
});
test('A 2025 import failure leaves 8/8 verified downloads and cannot interrupt any yearly download',async()=>{
 const s=setup({failImport:true}),result=await runFreshPayPalCollection(s.config);
 assert.equal(result.complete,true);assert.equal(result.downloaded,8);assert.equal(result.imported,7);assert.equal(result.issues.length,1);const year=s.b.reports.find(r=>r.start.startsWith('2025'));assert.equal(year.downloadState,'saved');assert.equal(year.importState,'failed');assert.equal(s.calls.filter(c=>c.startsWith('download ')).length,8);
});
test('Failed downloads do not block other years and Resume retries only their downloads without new Create clicks',async()=>{
 const s=setup({ready:true,failDownload:true}),first=await runFreshPayPalCollection(s.config);assert.equal(first.downloaded,7);assert.equal(first.complete,false);
 const before=s.calls.length,second=await runFreshPayPalCollection({...s.config,download:async r=>{assert.equal(r.start,'2025-01-01');s.calls.push('retry download');return r.start;},importReport:async r=>({name:r.start+'.csv',count:1})});
 assert.equal(second.downloaded,8);assert.equal(second.complete,true);assert.deepEqual(s.calls.slice(before),['retry download','archive 2025-01-01']);
});
test('After ten minutes Resume waits on the same fresh submissions and never creates again',async()=>{
 const s=setup(),first=await runFreshPayPalCollection({...s.config,refresh:async()=>{},timeoutMs:600000});assert.equal(first.downloaded,0);assert.equal(s.clock(),600000);assert.equal(first.waiting.length,8);
 s.rows.forEach(r=>r.ready=true);const second=await runFreshPayPalCollection(s.config);assert.equal(second.downloaded,8);assert.equal(s.calls.filter(c=>c.startsWith('create ')).length,8);
});
test('Existing ready rows do not confirm a lost fresh Create response or get downloaded instead',async()=>{
 const b=batch();b.reports=b.reports.filter(r=>r.start.startsWith('2025'));const row={...b.reports[0],ready:true,rowToken:'old-2025'};let clock=0,creates=0;
 const config={batch:b,read:async()=>({reports:[row]}),prepare:async()=>({prepared:true}),request:async()=>{creates++;return {clicked:true,submitted:false};},refresh:async()=>{},download:async()=>assert.fail('Cannot download old row'),archive:async()=>assert.fail(),verify:async()=>false,importReport:async()=>assert.fail(),persist:async()=>{},pause:async ms=>clock+=ms,now:()=>clock,submissionTimeoutMs:1000,timeoutMs:1000};
 const first=await runFreshPayPalCollection(config);assert.equal(first.downloaded,0);assert.equal(b.reports[0].requestState,'uncertain');await runFreshPayPalCollection(config);assert.equal(creates,1);
});
test('A delayed new Submitted row proves fresh creation and older ready duplicates remain excluded',async()=>{
 const s=setup();let submitted=0;const result=await runFreshPayPalCollection({...s.config,request:async r=>{s.calls.push('create '+r.start);submitted++;s.rows.unshift({...r,ready:false,rowToken:'new-'+r.start});return {clicked:true,submitted:false};}});
 assert.equal(submitted,8);assert.equal(result.downloaded,8);assert.ok(s.clock()>=5000);
});
test('Stop after the first fresh submission prevents further requests and keeps its checkpoint',async()=>{
 const s=setup();let active=true;const original=s.config.request;const result=await runFreshPayPalCollection({...s.config,current:()=>active,request:async r=>{const outcome=await original(r);active=false;return outcome;}});
 assert.equal(result.stopped,true);assert.equal(s.calls.filter(c=>c.startsWith('create ')).length,1);assert.equal(s.b.reports[0].requestState,'requesting');assert.equal(s.b.reports[1].requestState,'planned');
});
function folder(){const dirs=new Map(),files=new Map();return {dirs,files,getDirectoryHandle:async(name,{create=false}={})=>{if(!dirs.has(name)){if(!create)throw Object.assign(Error('missing'),{name:'NotFoundError'});dirs.set(name,folder());}return dirs.get(name);},getFileHandle:async(name,{create=false}={})=>{if(!files.has(name)){if(!create)throw Object.assign(Error('missing'),{name:'NotFoundError'});files.set(name,'');}return {getFile:async()=>({text:async()=>files.get(name)}),createWritable:async()=>({write:async text=>files.set(name,text),close:async()=>{},abort:async()=>{}})};}};}
test('Original download is saved and hash verified independently from parser failure',async()=>{
 const root=folder(),report=batch().reports.find(r=>r.start.startsWith('2025')),text='Date,Amount\n01/02/2025,-10.00',entry={...report,...await archiveCollectedPayPalReport(root,report,text)};
 assert.equal(await verifyCollectedPayPalReport(root,entry),true);assert.equal(root.dirs.get('raw').files.size,1);await assert.rejects(importCollectedPayPalReport(root,entry),/header/);
 root.dirs.get('raw').files.set(entry.responsePath.slice(4),'changed');assert.equal(await verifyCollectedPayPalReport(root,entry),false);
});
