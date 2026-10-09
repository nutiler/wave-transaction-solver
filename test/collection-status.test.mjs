import test from 'node:test';import assert from 'node:assert/strict';
import {liveCollectionProblem} from '../extension/collection-status.js';
import {commandNextStep} from '../extension/command-guidance.js';
const business='11111111-1111-4111-8111-111111111111',report={business,filter:'NOT_VERIFIED',capturedAt:'2026-10-09T20:00:00Z',running:false,completeness:'count-confirmed',expectedTotal:2,records:[{id:'1000000000000000001'},{id:'1000000000000000002'}],problems:[],status:'Complete: count confirmed'};
test('only this fresh count-confirmed business backlog is accepted, including a confirmed empty backlog',()=>{
 assert.equal(liveCollectionProblem(report,{business}), '');assert.equal(liveCollectionProblem({...report,records:[],expectedTotal:0,totalEvidence:'Explicit stable empty Not Reviewed list'},{business}),'');
 assert.match(liveCollectionProblem(report,{business,previousCapture:report.capturedAt}),/fresh collection/);assert.match(liveCollectionProblem({...report,business:'other'},{business}),/this business/);assert.match(liveCollectionProblem({...report,filter:'ALL'},{business}),/Not Reviewed/);
});
test('a partial scan exposes its actual count and selection reason with a concrete retry action',()=>{
 const problem=liveCollectionProblem({...report,completeness:'bottom-reached',expectedTotal:null,status:'Reached bottom; total not independently confirmed',problems:['Existing selection preserved; Select All count check skipped.']},{business});assert.match(problem,/2 identified/);assert.match(problem,/Existing selection/);assert.match(problem,/Clear the selected transaction checkboxes/);assert.match(problem,/queued decisions are preserved/);
 const mismatch=liveCollectionProblem({...report,expectedTotal:3,completeness:'bottom-reached'},{business});assert.match(mismatch,/2 identified of 3 expected/);
});
test('claimed completion never hides missing IDs, duplicate records, a running scan or an unknown count',()=>{
 for(const change of [{records:[{id:123},{id:null}]},{records:[{id:'1'},{id:'1'}]},{records:[]},{records:{}},{running:true},{expectedTotal:null},{capturedAt:null}])assert(liveCollectionProblem({...report,...change},{business}),JSON.stringify(change));
});
test('a skipped or failed scan cannot reuse an old complete report and search errors stay actionable',()=>{
 assert.match(liveCollectionProblem(report,{business,error:'The Wave tab did not finish loading.'}),/did not finish loading/);assert.match(liveCollectionProblem(null,{business}),/no fresh collection/);assert.match(liveCollectionProblem({...report,completeness:'unconfirmed',status:'Extra filters or a transaction search remain active'},{business}),/Clear extra searches and filters/);
});
test('failed preparation pauses old approved work and offers a retry even when its cached model was complete',()=>{
 const ready={business,complete:true,queued:42},blocked=commandNextStep({...ready,scanError:'Wave list failed to load.'});assert.equal(blocked.kind,'scan-failed');assert.equal(blocked.action,'scan');assert.match(blocked.message,/42 locally approved records stay queued/);assert.match(blocked.message,/Apply is paused/);assert.doesNotMatch(blocked.message,/then Apply/);assert.equal(commandNextStep(ready).kind,'apply');assert.equal(commandNextStep({...ready,busy:true,scanError:'Old error'}).action,null);
});
