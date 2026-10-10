import test from 'node:test';import assert from 'node:assert/strict';
import {appleAccountScope,parseAppleCard,planAppleImport,appleWaveCSV,beginAppleUpload,verifyAppleUpload} from '../extension/apple-card.js';
import {detectDataProvider,indexDataFolder} from '../extension/data-index.js';
import {validateLocalBackup,planBackupImport} from '../extension/migration.js';
const business='11111111-1111-4111-8111-111111111111',accountId='1000000000000000001',accountName='Fictional Apple Card',url='https://next.waveapps.com/'+business+'/transactions?anchorId='+encodeURIComponent(btoa('Account:'+accountId+';Business:'+business)),scope={...appleAccountScope(url),accountName};
const header='Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD),Purchased By',row=(date='01/01/2026',posted='01/02/2026',description='Fictional Shop',type='Purchase',amount='12.34')=>[date,posted,description,'Fictional Merchant','Other',type,amount,'Fictional Owner'].map(s=>'"'+s.replaceAll('"','""')+'"').join(','),csv=(...rows)=>header+'\n'+rows.join('\n');
const history=(records=[])=>({business,accountId,accountName,currency:'USD',accountType:'Credit Card',records,expectedTotal:records.length,completeness:'count-confirmed',capturedAt:new Date().toISOString()});
const live=(r,id='2000')=>({id,date:r.date,description:r.description,direction:r.direction,amountCents:Math.abs(r.amountCents),account:accountName,currency:'USD'});
test('scope binds exact Wave business/account identity and rejects foreign or ambiguous URLs',()=>{
 assert.equal(appleAccountScope(url).accountId,accountId);for(const value of [url+'&status=NOT_VERIFIED',url.replace(business,'22222222-2222-4222-8222-222222222222'),url.replace('https:','http:'),url.replace('next.waveapps.com','evil.example'),url.replace('https://','https://name:password@'),url+'#other'])assert.throws(()=>appleAccountScope(value));
});
test('Apple parser preserves source fields and uses clearing date with exact signed cents',async()=>{
 const s=await parseAppleCard('\uFEFF'+csv(row('01/01/2026','01/03/2026','Fictional, "Shop"'),row('01/02/2026','01/03/2026','Fictional payment','Payment','-50.00'),row('01/02/2026','01/04/2026','Fictional credit','Credit','-2.01')));assert.equal(s.records.length,3);const purchase=s.records.find(r=>r.type==='Purchase');assert.equal(purchase.date,'2026-01-03');assert.equal(purchase.transactionDate,'2026-01-01');assert.equal(purchase.amountCents,1234);assert.equal(purchase.original.Description,'Fictional, "Shop"');assert.equal(s.records.find(r=>r.type==='Payment').direction,'in');assert.equal(s.records.find(r=>r.type==='Credit').amountCents,-201);assert.equal(detectDataProvider(csv(row())),'apple');
});
test('malformed dates, sign changes, currencies and unsupported types stop the original import',async()=>{
 for(const text of [csv(row('02/30/2026')),csv(row('01/04/2026','01/03/2026')),csv(row('01/01/2026','01/02/2026','Fictional Shop','Purchase','-1.00')),csv(row('01/01/2026','01/02/2026','Fictional Shop','Payment','1.00')),csv(row('01/01/2026','01/02/2026','Fictional Shop','Mystery','1.00')),csv(row('01/01/2026','01/02/2026','Fictional Shop','Other','0.00')),csv(row()).replace('Amount (USD)','Amount (EUR)')])await assert.rejects(parseAppleCard(text));
});
test('overlapping exports produce stable per-row identities without erasing identical real charges',async()=>{
 const a=await parseAppleCard(csv(row(),row(),row('01/02/2026','01/03/2026','Fictional Fee','Interest','1.00'))),b=await parseAppleCard(csv(row('01/02/2026','01/03/2026','Fictional Fee','Interest','1.00'),row(),row()));assert.deepEqual(a.records.map(r=>r.key).sort(),b.records.map(r=>r.key).sort());assert.equal(new Set(a.records.map(r=>r.key)).size,3);
 const p=planAppleImport(a,history([live(a.records[0])]),scope);assert.equal(p.existing.length,1);assert.equal(p.missing.length,2);
});
test('first import is missing only after complete empty history; later backfills are compared without a cutoff',async()=>{
 const s=await parseAppleCard(csv(row(),row('12/01/2025','12/02/2025','Fictional Earlier Shop')));assert.equal(planAppleImport(s,history(),scope).missing.length,2);const p=planAppleImport(s,history([live(s.records.at(-1))]),scope);assert.equal(p.missing.length,1);assert.equal(p.missing[0].date,'2025-12-02');
});
test('matching requires flow, date, amount and description; renamed/untracked near matches are held',async()=>{
 const s=await parseAppleCard(csv(row())),r=s.records[0];for(const extra of [{description:'Renamed purchase'},{direction:'in'}]){const p=planAppleImport(s,history([{...live(r),...extra}]),scope);assert.equal(p.missing.length,0);assert.equal(p.held.length,1);}assert.equal(planAppleImport(s,history([live(r)]),scope).existing.length,1);
});
test('known imported IDs survive description changes; deleted or money-changed records are not recreated',async()=>{
 const s=await parseAppleCard(csv(row())),r=s.records[0],state={business,accountId,verified:{[r.key]:{waveId:'2000'}}};assert.equal(planAppleImport(s,history([{...live(r),description:'Approved enriched note'}]),scope,state).existing.length,1);for(const h of [history(),history([{...live(r),amountCents:1235}])]){const p=planAppleImport(s,h,scope,state);assert.equal(p.missing.length,0);assert.equal(p.held.length,1);}
});
test('partial, stale, foreign, unsigned, non-USD and duplicate-ID history cannot prepare an upload',async()=>{
 const s=await parseAppleCard(csv(row()));for(const extra of [{completeness:'unconfirmed'},{running:true},{business:'other'},{accountId:'9'},{currency:'CAD'},{capturedAt:'2020-01-01'},{expectedTotal:1},{records:[{...live(s.records[0]),direction:null}],expectedTotal:1},{records:[live(s.records[0]),live(s.records[0])],expectedTotal:2}])assert.throws(()=>planAppleImport(s,{...history(),...extra},scope));assert.throws(()=>planAppleImport(s,history(),scope,{business:'other'}));
});
test('Wave CSV uses posting dates and positive card charges / negative payments without category or review columns',async()=>{
 const s=await parseAppleCard(csv(row(),row('01/02/2026','01/03/2026','Fictional payment','Payment','-2.00'))),text=appleWaveCSV(s.records);assert.match(text,/"Date","Description","Amount"/);assert.match(text,/"2026-01-02"/);assert.match(text,/"12.34"/);assert.match(text,/"-2.00"/);assert.doesNotMatch(text,/Category|Reviewed|Merchant/);
});
test('durable pending state blocks another upload; partial results and duplicates retain the lock',async()=>{
 const s=await parseAppleCard(csv(row(),row('01/02/2026','01/03/2026','Fictional second'))),plan=planAppleImport(s,history(),scope),state=beginAppleUpload({business,accountId,verified:{}},plan);assert.equal(state.pending.attempted,true);assert.equal(planAppleImport(s,history(),scope,state).locked,true);assert.throws(()=>beginAppleUpload(state,plan));assert.equal(verifyAppleUpload(state,history([live(s.records[0])]),scope).verified,false);assert.equal(verifyAppleUpload(state,history([live(s.records[0],'2000'),live(s.records[1],'2001'),live(s.records[0],'2002')]),scope).verified,false);
 const done=verifyAppleUpload(state,history([live(s.records[0],'2000'),live(s.records[1],'2001')]),scope);assert.equal(done.verified,true);assert.equal(done.state.pending,null);assert.equal(Object.keys(done.state.verified).length,2);assert.equal(done.state.history.length,1);assert.equal(state.pending.attempted,true);assert.equal(planAppleImport(s,history([live(s.records[0],'2000'),live(s.records[1],'2001')]),scope,done.state).missing.length,0);
});
test('verification cannot count an old Wave ID as a newly imported row',async()=>{
 const s=await parseAppleCard(csv(row())),plan=planAppleImport(s,history([live({...s.records[0],description:'Unrelated old entry'},'3000')]),scope);assert.equal(plan.held.length,1);const empty=planAppleImport(s,history(),scope),pending=beginAppleUpload({business,accountId,verified:{}},{...empty,beforeIds:['2000']});assert.equal(verifyAppleUpload(pending,history([live(s.records[0],'2000')]),scope).verified,false);
});
test('future rows and conflicting portable import checkpoints remain held',async()=>{
 const s=await parseAppleCard(csv(row('01/01/2099','01/02/2099'))),p=planAppleImport(s,history(),scope);assert.equal(p.missing.length,0);assert.equal(p.held.length,1);
 const key='finance:apple-card:'+business+':'+accountId,value={business,accountId,verified:{},pending:{attempted:true}},backup={format:'wave-solver-local-backup',version:1,records:[{key,value}],settings:{}};assert.equal(planBackupImport(backup,[],{}).records.length,1);assert.throws(()=>planBackupImport(backup,[{key,value:{...value,pending:null}}],{}),/differs/);assert.throws(()=>validateLocalBackup({...backup,records:[{key,value:{...value,accountId:'9'}}]}),/different business or account/);
});
test('shared-folder refresh recognizes Apple originals and preserves them outside bookkeeping evidence',async()=>{
 const file={name:'Apple Card Transactions.csv',size:100,text:async()=>csv(row()),arrayBuffer:async()=>new TextEncoder().encode(csv(row())).buffer},folder={async *entries(){yield [file.name,{kind:'file',getFile:async()=>file}];}};const result=await indexDataFolder(folder);assert.equal(result.results[0].provider,'apple');assert.equal(result.results[0].status,'supporting');assert.equal(result.evidence.length,0);assert.equal(result.wave.length,0);
});

test('completed manual imports using Transaction Date are recognized without duplicating or changing dates',async()=>{
 const s=await parseAppleCard(csv(row(),row(),row('12/31/2025','01/02/2026','Fictional annual'))),records=s.records.map((r,i)=>({...live(r,String(8000+i)),date:r.transactionDate})),p=planAppleImport(s,history(records),scope);assert.equal(p.existing.length,3);assert.equal(p.missing.length,0);assert.equal(p.held.length,0);const verified=Object.fromEntries(p.existing.map(x=>[x.record.key,{waveId:x.waveId,date:x.liveDate,amountCents:x.record.amountCents}]));const again=planAppleImport(s,history(records.map(r=>({...r,description:'Locally enriched'}))),scope,{business,accountId,verified});assert.equal(again.existing.length,3);assert.equal(again.missing.length,0);assert.equal(again.held.length,0);
});
test('renamed manual imports at original transaction dates are held instead of uploaded again',async()=>{const s=await parseAppleCard(csv(row())),r=s.records[0],p=planAppleImport(s,history([{...live(r),date:r.transactionDate,description:'Renamed manual entry'}]),scope);assert.equal(p.held.length,1);assert.equal(p.missing.length,0);});
