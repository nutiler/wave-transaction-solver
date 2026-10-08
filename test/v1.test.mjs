import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateToV1,exportLocalBackup,importLocalBackup,validateLocalBackup,planBackupImport,portableValue,scopeLegacyRules} from '../extension/migration.js';
import {mergeAccountingHistory,detectDataProvider,indexDataFolder} from '../extension/data-index.js';
import {createCommandStore,commandBaselineRecord,prepareCommandModel,stageCommandItem,validateCommandDecision} from '../extension/command-center.js';
import {recordSnapshot} from '../extension/plan.js';
import {acceptProposal,ruleFingerprint} from '../extension/rule-pack.js';
import {financeFreshness,financeReturnState,financeSummary,unverifiedWaveReceipts} from '../extension/finance-home.js';
import {providerProgress} from '../extension/data-workspace.js';
import {scanDateScope,savedSnapshotRecord} from '../extension/live-records.js';
import {readEvidenceFile,holdEvidenceFiles} from '../extension/source-files.js';
const business='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const headers=['Transaction ID','Transaction Date','Account Name','Transaction Description','Debit Amount (Two Column Approach)','Credit Amount (Two Column Approach)','Account Group','Account Type'];
function csv(entries){return [headers,...entries.flatMap(([id,category='Uncategorized Expense',amount='12.34'])=>[[id,'2026-09-01','Fictional Bank','Fictional Shop','',amount,'Asset','Cash and Bank'],[id,'2026-09-01',category,'Fictional Shop',amount,'','Expense','Expense']])].map(r=>r.join(',')).join('\n');}
const id='1000000000000000001',history=csv([[id]]);
function fakeDB(rows){return {open(){const request={result:{close(){},transaction(){const tx={objectStore:()=>({get:key=>{const r={};queueMicrotask(()=>{r.result=rows.get(key);});return r;},getAllKeys:()=>{const r={};queueMicrotask(()=>{r.result=[...rows.keys()];});return r;},getAll:()=>{const r={};queueMicrotask(()=>{r.result=[...rows.values()];});return r;},put:(v,k)=>rows.set(k,v)})};queueMicrotask(()=>queueMicrotask(()=>tx.oncomplete?.()));return tx;}}};queueMicrotask(()=>request.onsuccess?.());return request;}};}
const decision={key:'record:'+id,business,ids:[id],expected:[{id,amountCents:1234}],category:'Fictional Supplies',treatment:'purchase',description:'Fictional Shop',requestReview:true};
const session={version:1,business,csvText:history,sourceName:'fictional.csv',sample:false};
test('1.0 migration checkpoints every beta feature and setting once without rewriting state',async()=>{
 const handle={kind:'directory',name:'data'},queue={version:1,business,decisions:{[decision.key]:decision},results:{[decision.key]:{status:'uncertain',message:'Lost response'}}},rows=new Map([['current',session],['command:'+business,queue],['downloads:folders',{version:1,data:handle}],['paypal:downloader',{version:2,batch:{reports:[{year:2025,requestState:'uncertain'}]}}]]),settings={solverRules:[{name:'Fictional',aliases:['Fictional'],category:'Fictional Supplies',business}],solverEditReceipts:{[business+':'+id]:{saveAttempted:true}}};
 const previous=globalThis.indexedDB;globalThis.indexedDB=fakeDB(rows);try{
  const storage={get:async()=>settings},marker=await migrateToV1(storage,'2026-10-08T00:00:00Z');assert.equal(marker.recordCount,4);assert.equal(rows.get('current'),session);assert.equal(rows.get('command:'+business),queue);assert.equal(rows.get('downloads:folders').data,handle);
  assert.deepEqual(rows.get(marker.backupKey).settings,settings);assert.equal(rows.get(marker.backupKey).records.find(r=>r.key==='command:'+business).value.results[decision.key].status,'uncertain');
  rows.set('operator:'+business,{newer:true});assert.deepEqual(await migrateToV1(storage),marker);assert.equal(rows.get(marker.backupKey).records.length,4);
  const portable=await exportLocalBackup(storage);assert.equal(portable.records.length,6);assert.equal(portable.records.find(r=>r.key==='finance:helper-owner:paypal').value.business,business);assert.deepEqual(portable.foldersToReconnect,['data']);assert.doesNotThrow(()=>JSON.stringify(portable));assert.equal(portable.records.find(r=>r.key==='command:'+business).value.decisions[decision.key].ids[0],id);
 }finally{globalThis.indexedDB=previous;}
});
test('portable restore preserves executing locks, requires folder renewal and refuses current-state conflicts',async()=>{
 const backup={format:'wave-solver-local-backup',version:1,records:[{key:'current',value:session},{key:'command:'+business,value:{business,decisions:{[decision.key]:decision},results:{[decision.key]:{status:'executing'}}}},{key:'downloads:folders',value:{version:1,data:{folderAccessRequired:true,name:'data'}}}],settings:{solverRules:[{name:'Fictional',aliases:['Fictional'],category:'Fictional Supplies',business}]},foldersToReconnect:['data']};
 const rows=new Map(),settings={},old=globalThis.indexedDB;globalThis.indexedDB=fakeDB(rows);try{await importLocalBackup(backup,{get:async()=>settings,set:async next=>Object.assign(settings,next)});assert.equal(rows.get('command:'+business).results[decision.key].status,'executing');assert.equal(rows.get('downloads:folders').data,null);assert.deepEqual(settings.solverRules,backup.settings.solverRules);assert.equal(rows.get('migration:pending-import'),null);}finally{globalThis.indexedDB=old;}
 assert.throws(()=>planBackupImport(backup,[{key:'command:'+business,value:{business,results:{[decision.key]:{status:'uncertain'}}}}],{}),/protect current approvals/);
 assert.throws(()=>planBackupImport(backup,[],{solverRules:[]}),/Current settings/);
 assert.throws(()=>validateLocalBackup({...backup,records:[{key:'command:'+other,value:backup.records[1].value}]}),/different business/);
 assert.throws(()=>validateLocalBackup({...backup,records:[{key:'command:'+business,value:{business,decisions:{x:{...decision,ids:[Number(id)]}}}}]}),/invalid identity/);
 assert.deepEqual(portableValue({folder:{kind:'directory',name:'data'},receipt:{saveAttempted:true}}),{folder:{folderAccessRequired:true,name:'data'},receipt:{saveAttempted:true}});
});
test('root and nested evidence is recognized by headers and invalid files receive actionable outcomes',async()=>{
 const file=(name,text)=>{const bytes=new TextEncoder().encode(text);return {kind:'file',getFile:async()=>({name,size:bytes.length,lastModified:1,text:async()=>text,arrayBuffer:async()=>bytes.buffer})};},dir=entries=>({kind:'directory',async *entries(){yield* entries;}});
 const venmo='ID,Datetime,Type,Status,Amount (total)\nFICTIONAL001,2026-09-01,Payment,Complete,-12.34';
 const folder=dir([['arbitrary.csv',file('arbitrary.csv',venmo)],['wave',dir([['accounting.csv',file('accounting.csv',history)]])],['broken.csv',file('broken.csv','hello,world')],['export.zip',file('export.zip','fake zip')]]),index=await indexDataFolder(folder);
 assert.equal(index.evidence[0].provider,'venmo');assert.equal(index.evidence[0].path,'arbitrary.csv');assert.equal(index.wave[0].dataset.transactions[0].id,id);assert.equal(index.results.length,4);assert.match(index.results.find(r=>r.path==='broken.csv').message,/not recognized/);assert.match(index.results.find(r=>r.path==='export.zip').message,/safely extract/);assert.equal(index.wave[0].sha256.length,64);
 assert.equal(detectDataProvider('Date,Type,Currency,Transaction ID,Amount,Fees,Total\n09/01/2026,Payment,USD,FICTIONAL,-12.34,0.00,-12.34','unknown.csv'),'paypal');
 assert.equal(detectDataProvider('Order ID,ASIN,Payment Reference ID','unknown.csv'),'amazon');
 assert.equal(detectDataProvider('PAYPAL ACCOUNT\nACCOUNT ACTIVITY','unknown.pdf'),'paypal');
});
test('overlapping accounting exports replace whole posting groups and retain omitted history',()=>{
 const old=csv([[id,'Fictional Old'],['1000000000000000002','Fictional History']]),next=csv([[id,'Fictional Updated','13.45'],['1000000000000000003','Fictional New']]),merged=mergeAccountingHistory(old,next);
 assert.equal(merged.dataset.transactions.length,3);assert.equal(merged.dataset.ledgerRows,6);assert.equal(merged.dataset.transactions.find(t=>t.id===id).amount,1345);assert.deepEqual(merged.dataset.transactions.find(t=>t.id===id).categories,['Fictional Updated']);assert.equal(mergeAccountingHistory(merged.text,next).dataset.ledgerRows,6);
 assert.deepEqual(mergeAccountingHistory(merged.text,old,{replace:false}).dataset.transactions.find(t=>t.id===id).categories,['Fictional Updated']);
 assert.equal(mergeAccountingHistory(old,old).text,old,'Unchanged imports retain their exact source hash');
 assert.throws(()=>mergeAccountingHistory(old,next.replace('13.45,','99.99,')),/unbalanced/);
});
test('review drafts, exclusions, deferred work and grouped undo survive a store reload',async()=>{
 let saved;const first=createCommandStore({business,persist:async v=>{saved=v;}});first.draft(decision.key,{category:'Fictional Supplies',description:'Edited description'});first.selection('group',[decision.key]);first.defer('held',true);first.stage([decision]);await first.flush();const restored=createCommandStore({business,initial:saved,persist:async v=>{saved=v;}});assert.equal(restored.get().decisions[decision.key].ids[0],id);assert.deepEqual(restored.get().selections.group,[decision.key]);assert.equal(restored.get().deferred.held,true);assert.deepEqual(restored.get().undoGroups,[[decision.key]]);restored.undo(decision.key);await restored.flush();assert.equal(saved.drafts[decision.key].category,'Fictional Supplies');assert.deepEqual(saved.undoGroups,[]);assert.equal(saved.decisions[decision.key],undefined);
 restored.stage([decision]);await restored.checkpoint(decision.key,{status:'uncertain'});assert.throws(()=>restored.undo(decision.key),/rechecked/);assert.throws(()=>restored.stage([decision]),/restaged/);await restored.flush();
});
test('catch-up uses inactivity and keeps scan freshness independent of exports',()=>{
 const now=Date.parse('2026-10-08T12:00:00Z');assert.equal(financeFreshness({lastVisit:'2026-09-09T12:00:00Z',now}).catchUp,false);const state=financeFreshness({lastVisit:'2026-09-08T12:00:00Z',lastScan:'2026-10-08T12:00:00Z',now});assert.equal(state.catchUp,true);assert.equal(state.scanDays,0);assert.equal(financeFreshness({lastVisit:'invalid',now}).catchUp,false);
 const summary=financeSummary({items:[{key:'new',editable:true},{key:'held',editable:false}]},{decisions:{[decision.key]:decision},results:{[decision.key]:{status:'executing'}}});assert.equal(summary.locked,true);assert.equal(summary.approved,0);assert.equal(summary.exceptions,2);
});
test('helper dashboards distinguish original coverage, imports, unavailable profiles and pauses',()=>{
 const paypal={batch:{reports:[{year:2025,downloadState:'saved',importState:'failed'},{year:2026,downloadState:'saved',importState:'saved'}]}};assert.equal(providerProgress('paypal',paypal).kind,'paused');assert.match(providerProgress('paypal',paypal).text,/2 \/ 2 originals saved · 1 imported/);assert.equal(providerProgress('wave',{job:{requestedAt:'fictional'}}).kind,'paused');assert.equal(providerProgress('venmo',{entries:{a:{hash:'fictional',profile:'personal'},b:{status:'unavailable',profile:'business'}}}).kind,'complete');assert.equal(providerProgress('amazon',{}, {kind:'paused',message:'Login required'}).text,'Login required');
});
test('legacy policies keep aliases and account scopes while acquiring the original business boundary',()=>{
 const original={name:'Fictional',aliases:['Fictional','FS'],category:'Fictional Supplies',accountNames:['Fictional Bank'],excludeAliases:['Fictional Personal'],onlyCategories:['Uncategorized Expense']},scoped={...original,business:other},result=scopeLegacyRules([original,scoped],business);assert.deepEqual(result[0],{...original,business});assert.equal(result[1],scoped);assert.equal(original.business,undefined);assert.equal(providerProgress('wave',null,null).kind,'ready');
});
test('legacy expense, suggestion and transfer attempts remain locked until every saved result is verified',()=>{
 const receipts={[business+':'+id]:{saveAttempted:true,categoryVerified:true,reviewedVerified:false},[business+':suggestion:'+id]:{attempted:true},[business+':transfer:'+id]:{saveAttempted:true,verified:false},[other+':'+id]:{saveAttempted:true},[business+':safe']:{saveAttempted:false},[business+':done']:{saveAttempted:true,categoryVerified:true,reviewedVerified:true},[business+':transfer:done']:{saveAttempted:true,verified:true,reviewed:true}};assert.equal(unverifiedWaveReceipts(receipts,business).length,3);assert.equal(unverifiedWaveReceipts(receipts,other).length,1);
 const incoming={format:'wave-solver-local-backup',version:1,records:[{key:'current',value:session}],settings:{}};assert.equal(planBackupImport(incoming,[{key:'current',value:{...session,csvText:''}}],{}).records.find(r=>r.key==='current').value.csvText,history);
});
test('read-only recovery preserves the frozen string ID, observed fields and original ledger structure',()=>{
 const baseline={origin:'wave-live',business,id,date:'2026-09-01',description:'Fictional original',account:'Fictional Bank',accountId:null,accountType:'Credit Card',amountCents:1234,direction:'out',categories:['Uncategorized Expense'],postings:[],liveBaseline:{identity:{business,transaction:id},currency:'USD',fields:{date:'2026-09-01',description:'Fictional original',account:'Fictional Bank',category:'Uncategorized Expense',amount:'12.34',type:'Withdrawal'},structure:{singleCategory:true,split:false}}},d={...decision,expected:[baseline]},record=commandBaselineRecord(d);
 assert.deepEqual(recordSnapshot(record),baseline);assert.equal(record.postings.length,0);assert.equal(record.approvedDescription,decision.description);assert.throws(()=>commandBaselineRecord({...d,ids:['1000000000000000002']}),/cannot identify/);assert.throws(()=>commandBaselineRecord({...d,business:other}),/cannot identify/);
 const ledger=mergeAccountingHistory('',history).dataset.transactions[0],snapshot=recordSnapshot(ledger);assert.deepEqual(recordSnapshot(commandBaselineRecord({...decision,expected:[snapshot]})),snapshot);
});
test('explicit proposal replacements reconcile migrated business scope while retaining other businesses and newer edits',()=>{
 const old={name:'Fictional',aliases:['Fictional'],category:'Fictional Supplies'},current={...old,business},otherRule={...old,business:other},newer={...current,accountNames:['Fictional Different Bank']},pack={business,source:{sha256:'synthetic-hash'},proposals:[{id:'fictional',tier:'strong_proposal',rule:{...old,aliases:['Fictional','FS']},replaces:[ruleFingerprint(old)]}]},result=acceptProposal(pack,'fictional',[current,otherRule,newer]);assert.equal(result.rules.length,3);assert(result.rules.includes(otherRule));assert(result.rules.includes(newer));assert.deepEqual(result.rules.find(r=>r.proposalId==='fictional').previousVersions,[current]);
});
test('a failed changed-source refresh holds dependent approvals and preserves the original parsed evidence',async()=>{
 const text='ID,Datetime,Type,Status,Note,From,To,Amount (total),Amount (fee),Funding Source,Destination\nFICTIONAL001,2026-09-01,Payment,Complete,Supplies,Fictional Sender,Fictional Shop,-12.34,0.00,Bank x-1111,',bytes=new TextEncoder().encode(text),file={name:'venmo-personal-2026-09.csv',size:bytes.length,arrayBuffer:async()=>bytes.buffer},parsed=await readEvidenceFile(file),source=parsed.records[0],transactions=mergeAccountingHistory('',history).dataset.transactions,catalog={groups:[{name:'Expenses',accounts:[{name:'Fictional Supplies'}]}]},report={business,filter:'NOT_VERIFIED',capturedAt:'2026-10-08T00:00:00Z',completeness:'count-confirmed',records:transactions.map(t=>({id:t.id,date:t.date,description:t.description,account:t.primary.account,category:t.categories[0],amountCents:t.amount,reviewed:'Not reviewed',identity:'Wave transaction ID'}))},options={business,transactions,queue:transactions,catalog,reports:[report],matches:[{key:source.key,state:'Candidate',candidates:[id]}]},model=prepareCommandModel({...options,records:[source]}),approved=stageCommandItem(model.items[0],{treatment:'purchase',category:'Fictional Supplies'},model),held=holdEvidenceFiles([source],{[file.name]:'Changed file has an unclosed quote.'}),changed=prepareCommandModel({...options,records:held});
 assert.equal(validateCommandDecision(approved,model),null);assert.match(validateCommandDecision(approved,changed),/Source evidence changed/);assert.equal(source.blocked,'');assert.equal(source.bankExpected,true);assert.equal(held[0].bankExpected,false);assert.equal(parsed.sha256.length,64);
});
test('unknown scan dates remain visible exceptions instead of being silently assigned to completed years',()=>{
 assert.equal(scanDateScope('2024-12-31'),'completed');assert.equal(scanDateScope('2025-01-01'),'included');assert.equal(scanDateScope('2026-02-31'),'unknown');assert.equal(scanDateScope(null),'unknown');
 const report={business,filter:'NOT_VERIFIED',capturedAt:'2026-10-08T00:00:00Z',completeness:'count-confirmed',records:[{id,date:'',description:'Fictional unknown date',identity:'Wave transaction ID',reviewed:'Not reviewed'}]},model=prepareCommandModel({business,reports:[report]});assert.equal(model.items.length,1);assert.equal(model.items[0].editable,false);
});
test('catch-up progress survives reload until explicitly acknowledged and reopens after another long absence',()=>{
 const now=Date.parse('2026-10-08T00:00:00Z'),first=financeReturnState({lastVisit:'2026-08-08T00:00:00Z'},now);
 assert.equal(first.catchUpRequired,true);assert.equal(first.catchUpAwayDays,61);
 const reload=financeReturnState(first,now+60000);assert.equal(reload.catchUpRequired,true);
 assert.equal(financeReturnState({...reload,catchUpRequired:false},now+120000).catchUpRequired,false);
 assert.equal(financeReturnState({...reload,catchUpRequired:false},now+86400000*45).catchUpRequired,true);
});
test('a preserved edit snapshot recovers observed cents without accounting history or invented postings',()=>{
 const snapshot={identity:{business,transaction:id},currency:'USD',fields:{date:'2026-09-01',description:'Fictional original',account:'Fictional Card',category:'Uncategorized Expense',amount:'12.34',type:'Withdrawal'},structure:{singleCategory:true,split:false},problems:[]},catalog={groups:[{name:'Liabilities',accounts:[{name:'Fictional Card',section:'Credit Cards'}]}]},record=savedSnapshotRecord(snapshot,{business,catalog});
 assert.equal(record.amount,1234);assert.equal(record.id,id);assert.deepEqual(record.postings,[]);assert.deepEqual(record.liveBaseline.fields,snapshot.fields);
 assert.throws(()=>savedSnapshotRecord({...snapshot,fields:{...snapshot.fields,amount:'unknown'}},{business,catalog}),/amount/);
 assert.throws(()=>savedSnapshotRecord(snapshot,{business:other,catalog}),/identity/);
});
