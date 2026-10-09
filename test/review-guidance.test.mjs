import test from 'node:test';import assert from 'node:assert/strict';
import {commandNextStep,recheckSavedOutcomes} from '../extension/command-guidance.js';
import {confirmVenmoEmpty,confirmedVenmoEmpty,mergeVenmoEmptyConfirmations} from '../extension/venmo-empty.js';
import {venmoCoverage,collectVenmoMonths} from '../extension/venmo.js';
import {providerProgress} from '../extension/data-workspace.js';
const business='11111111-1111-4111-8111-111111111111',period={month:'2023-07',start:'2023-07-01',end:'2023-07-31',partial:false},handles=['@fictionalperson','@fictionalshop'],proof={kind:'user-observed-empty-page',userConfirmed:true,month:'2023-07',allProfiles:true,profiles:handles,message:'No transactions yet for this month, but as soon as they start rolling in, we’ll list them here.',source:'Fictional user confirmation',confirmedAt:'2026-10-09T18:00:00Z',asOfDate:'2026-10-09'};
test('ready approvals can run before ordinary review work, but uncertain prior saves explain a read-only recheck',()=>{
 const ready={business,complete:true,queued:42,review:135};assert.equal(commandNextStep(ready).kind,'apply');assert.match(commandNextStep(ready).message,/while other groups still need review/);
 const locked=commandNextStep({...ready,lockCount:27});assert.equal(locked.action,'apply');assert.match(locked.message,/27 saved outcomes/);assert.match(locked.message,/original approved values/);assert.doesNotMatch(locked.message,/Run your queue/);
 const blocked=commandNextStep({...ready,lockCount:1,blockedSave:{message:'Category differs from the approved value.'}});assert.equal(blocked.action,'inspect');assert.match(blocked.message,/Category differs/);assert.match(blocked.message,/Other changes need inspection/);
 assert.equal(commandNextStep({...ready,changed:true}).kind,'scan');assert.equal(commandNextStep({...ready,busy:true,lockCount:27}).action,null);assert.equal(commandNextStep({...ready,queued:0}).action,'review');
});
test('batch recheck verifies read-only outcomes sequentially and preserves incomplete and failed locks',async()=>{
 const decisions=[{key:'first',treatment:'purchase'},{key:'second',treatment:'transfer'}],results={first:{status:'uncertain',startedAt:'old'},second:{status:'executing'}},legacy=[{key:business+':third'}],calls=[],saved={};
 const result=await recheckSavedOutcomes({decisions,results,legacy,recheck:async d=>{calls.push(d.key);return d.key==='first'?{categoryVerified:true,reviewedVerified:true,descriptionVerified:true}:{verified:true,reviewed:false};},recheckLegacy:async key=>{calls.push(key);throw Error('Original baseline missing');},checkpoint:async(key,value)=>{saved[key]=value;}});
 assert.deepEqual(calls,['first','second',business+':third']);assert.equal(result.verified,1);assert.equal(result.attention.length,2);assert.equal(saved.first.status,'done');assert.equal(saved.second.status,'uncertain');assert.equal(results.second.status,'executing');assert.match(result.attention[1].message,/baseline missing/);
});
test('batch rechecks stop on a changed business before writing a queue checkpoint',async()=>{
 let current=true,checkpoints=0;const result=await recheckSavedOutcomes({decisions:[{key:'first',treatment:'purchase'}],results:{first:{status:'uncertain'}},recheck:async()=>{current=false;return {categoryVerified:true,reviewedVerified:true};},checkpoint:async()=>checkpoints++,current:()=>current});assert.equal(result.stopped,true);assert.equal(checkpoints,0);
});
test('a user-confirmed empty completed month is coverage evidence, without manufacturing a CSV',()=>{
 const entry=confirmVenmoEmpty({period,profile:'personal',handle:handles[0],proof});assert.equal(entry.status,'confirmed-empty');assert.equal(entry.hash,undefined);assert.equal(entry.name,undefined);assert.equal(confirmedVenmoEmpty(entry,period,handles[0]),true);assert.equal(confirmedVenmoEmpty(entry,period,'@anotherperson'),false);
 const entries=Object.fromEntries(['personal','business'].map((profile,i)=>[profile+':'+period.start+':'+period.end,confirmVenmoEmpty({period,profile,handle:handles[i],proof})])),state={startMonth:'2023-07',latestCollection:{startMonth:'2023-07',asOf:'2023-07-31'},entries},coverage=venmoCoverage(state);assert.equal(coverage.noActivity,2);assert.equal(coverage.unconfirmed.length,0);assert.equal(coverage.saved,0);assert.equal(providerProgress('venmo',state,{kind:'paused',label:'Saved — coverage gaps',message:'2 past statements unconfirmed'}).kind,'complete');
 assert.throws(()=>confirmVenmoEmpty({period,profile:'personal',handle:handles[0],proof:{...proof,allProfiles:false}}),/could not be confirmed/);assert.throws(()=>confirmVenmoEmpty({period,profile:'personal',handle:handles[0],proof:{...proof,month:'2023-08'}}),/could not be confirmed/);
});
test('current and last-day empty observations remain provisional, and profile-mismatched confirmations are ignored',()=>{
 const current={month:'2026-10',start:'2026-10-01',end:'2026-10-09'},entry=confirmVenmoEmpty({period:current,profile:'personal',handle:handles[0],proof:{...proof,month:current.month}});assert.equal(entry.status,'observed-empty');assert.equal(confirmedVenmoEmpty(entry),false);
 const lastDay=confirmVenmoEmpty({period,profile:'personal',handle:handles[0],proof:{...proof,asOfDate:period.end}});assert.equal(lastDay.status,'observed-empty');
 const confirmed=confirmVenmoEmpty({period,profile:'personal',handle:handles[0],proof}),manifest={format:'wave-solver-venmo-downloads',version:1,entries:{['personal:'+period.start+':'+period.end]:confirmed}},state={sources:{personal:{handle:'@anotherperson'},business:{handle:handles[1]}},entries:{}};assert.equal(mergeVenmoEmptyConfirmations(state,manifest),state);
 state.sources.personal.handle=handles[0];const merged=mergeVenmoEmptyConfirmations(state,manifest);assert.equal(Object.values(merged.entries)[0].status,'confirmed-empty');assert.equal(Object.keys(state.entries).length,0);assert.equal(mergeVenmoEmptyConfirmations(merged,manifest),merged);
});
test('paired collector checkpoints explicit empty months without reading or saving fictitious statement rows',async()=>{
 let reads=0,saves=0,stored;const result=await collectVenmoMonths({periods:[period],prepare:async()=>({emptyStatement:proof,profileHandles:{personal:handles[0],business:handles[1]}}),read:async()=>reads++,save:async()=>saves++,persist:async entries=>stored=entries});assert.equal(reads,0);assert.equal(saves,0);assert.equal(Object.keys(result.entries).length,2);assert.equal(Object.values(stored).every(e=>e.status==='confirmed-empty'),true);
 let prepared=0;await collectVenmoMonths({periods:[period],entries:stored,verifyEmpty:async(e,p,profile)=>confirmedVenmoEmpty(e,p,profile==='personal'?handles[0]:handles[1]),prepare:async()=>prepared++,read:async()=>reads++,save:async()=>saves++,persist:async()=>{}});assert.equal(prepared,0);
});
