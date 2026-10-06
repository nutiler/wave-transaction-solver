import {test} from 'node:test';import assert from 'node:assert/strict';
import {usageStages,usageReadiness,initialUsageStage} from '../extension/usage-flow.js';
const business='11111111-1111-1111-1111-111111111111',dataset={transactions:[]};
test('guided start resumes a valid saved stage and otherwise finds the missing prerequisite',()=>{
 assert.equal(initialUsageStage({}),'setup');assert.equal(initialUsageStage({business}),'setup');assert.equal(initialUsageStage({business,dataset}),'transactions');
 assert.equal(initialUsageStage({business,dataset,report:{completeness:'count-confirmed',records:[]}}),'transactions');
 assert.equal(initialUsageStage({business,dataset},'transactions'),'transactions');assert.equal(initialUsageStage({business,dataset},'foreign-stage'),'transactions');
});
test('a partial or running scan does not claim completed collection or reviewed bookkeeping',()=>{
 for(const report of [null,{completeness:'unconfirmed',records:[{}]},{completeness:'count-confirmed',running:true,records:[{}]}])assert.equal(usageReadiness({business,dataset,report}).collection.ready,false);
 const ready=usageReadiness({business,dataset,report:{completeness:'count-confirmed',records:[{},{}]}});assert.equal(ready.collection.text,'2 scanned');assert.equal(ready.planning.text,'Fresh scan verifies progress');assert.equal(ready.transactions.text,'Select work to run');
});
test('the approval stage counts only this business and separates scans, approvals and execution',()=>{
 const rules=[{name:'Global'},{name:'Current',business},{name:'Other',business:'22222222-2222-2222-2222-222222222222'}];assert.equal(usageReadiness({business,dataset,rules}).rules.text,'2 saved rules');
 assert.deepEqual(usageStages.map(s=>s.id),['setup','transactions','rules']);assert(usageStages[1].panels.includes('commandCenter'));assert(!usageStages.some(s=>s.panels.includes('expenseBatch')));assert.equal(initialUsageStage({business,dataset},'planning'),'transactions');
});
