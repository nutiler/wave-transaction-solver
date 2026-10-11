import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fictionalRepairPlan} from '../extension/venmo-repair-fixture-data.js';
import {repairKey} from '../extension/venmo-reconciliation.js';
import {repairDiagnosticReport,persistRepairDiagnostics} from '../extension/venmo-repair-diagnostics.js';

test('repair diagnostic copies show every held reason and preserve uncertain save status without raw snapshots',()=>{
 const plan=fictionalRepairPlan(),first=plan.actions[0],second=plan.actions[1],receipts={[repairKey(first)]:{verified:true,saveAttempted:true,message:'Removed copy verified.'},[repairKey(second)]:{verified:false,saveAttempted:true,message:'Saved result needs verification.',outcome:{stage:'deletion requested',problem:'Response lost'},originalSnapshot:{secret:'Do not include full fields'}}};
 const before=structuredClone(receipts),report=repairDiagnosticReport({plan,receipts,builds:{installed:'0.99.22',repair:'0.99.22'},results:[{key:repairKey(plan.actions[3]),ready:false,message:'Cannot identify one transfer submenu.'}]});
 assert.equal(report.total,7);assert.equal(report.verified,1);assert.equal(report.unverified,6);assert.equal(report.actions[1].saveAttempted,true);assert.equal(report.actions[1].problem,'Response lost');assert.match(report.actions[3].reason,/transfer submenu/);assert(!JSON.stringify(report).includes('Do not include full fields'));assert.deepEqual(receipts,before);
});

test('report saves locally without prompting when connected folder write access is unavailable',async()=>{
 const report=repairDiagnosticReport({plan:fictionalRepairPlan()});let stored,queried;
 const result=await persistRepairDiagnostics(report,{store:async(key,value)=>{stored={key,value};},folder:async()=>({queryPermission:async request=>{queried=request;return 'prompt';},requestPermission:()=>assert.fail('Must not ask permission'),getDirectoryHandle:()=>assert.fail('Must not touch files without permission')})});
 assert.equal(result.fileSaved,false);assert.deepEqual(queried,{mode:'readwrite'});assert.equal(stored.key,'venmo:repair-diagnostics:'+report.business);assert.equal(stored.value,report);
});

test('granted folder writes only the dedicated diagnostic file and closes the stream',async()=>{
 const report=repairDiagnosticReport({plan:fictionalRepairPlan()}),calls=[];let contents;
 const result=await persistRepairDiagnostics(report,{store:async()=>{},folder:async()=>({queryPermission:async()=> 'granted',getDirectoryHandle:async(name,options)=>{calls.push([name,options]);return {getFileHandle:async(name,options)=>{calls.push([name,options]);return {createWritable:async()=>({write:async text=>{contents=text;},close:async()=>calls.push('closed')})};}};}})});
 assert.equal(result.fileSaved,true);assert.deepEqual(calls,[['venmo',{create:true}],['venmo-repair-diagnostics.local.json',{create:true}],'closed']);assert.deepEqual(JSON.parse(contents),report);
});
