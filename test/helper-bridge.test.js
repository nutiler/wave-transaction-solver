import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {helperCall} from '../extension/helper-bridge.js';
import {amazonDownloadPage,waveExportPage,waveMailPage} from '../extension/download-pages.js';
import {paypalPage} from '../extension/paypal-page.js';
test('Injected reads tolerate two empty Chrome responses and select the main frame',async()=>{
 let calls=0,time=0;const result=await helperCall({request:{action:'read'},now:()=>time,pause:async n=>time+=n,execute:async request=>{assert.equal(request.bridge,true);return ++calls<3?[{frameId:0}]:[{frameId:4,result:{wrong:true}},{frameId:0,result:{ready:true}}];}});
 assert.deepEqual(result,{ready:true});assert.equal(calls,3);
});
test('Loading errors retry, identity errors stay actionable, and unsubmitted creates can clear intent',async()=>{
 let calls=0,time=0;assert.deepEqual(await helperCall({request:{action:'read'},now:()=>time,pause:async n=>time+=n,execute:async()=>++calls===1?[{result:{helperError:{message:'Wait for reports',retryable:true}}}]:[{result:{reports:[]}}]}),{reports:[]});
 await assert.rejects(helperCall({request:{action:'read'},execute:async()=>[{result:{helperError:{message:'Wrong mailbox',retryable:false}}}]}),/Wrong mailbox/);
 assert.deepEqual(await helperCall({request:{action:'create'},execute:async()=>[{result:{notSubmitted:true,helperError:{message:'Custom dates are missing'}}}]}),{notSubmitted:true,message:'Custom dates are missing'});
});
test('Missing or uncertain mutation responses never repeat Generate, Create or Export',async()=>{
 for(const action of ['generate','create','request']){let calls=0;await assert.rejects(helperCall({request:{action},execute:async()=>{calls++;return [{frameId:0}];}}),/no report click will be repeated/);assert.equal(calls,1);}
 let calls=0;await assert.rejects(helperCall({request:{action:'create'},execute:async()=>{calls++;return [{result:{notSubmitted:false,helperError:{message:'Navigation after Create',retryable:true}}}];}}),/Navigation/);assert.equal(calls,1);
});
test('Stop and the readiness deadline bound read retries',async()=>{
 let time=0,calls=0;await assert.rejects(helperCall({request:{action:'read'},now:()=>time,timeoutMs:1000,pause:async n=>time+=n,execute:async()=>{calls++;return [];}}),/did not return/);assert.equal(calls,3);
 let live=true;await assert.rejects(helperCall({request:{action:'read'},current:()=>live,pause:async()=>{live=false;},execute:async()=>[]}),/Stopped/);
});
test('Fresh-link lookup waits through the gap between opening the email and its link becoming available',async()=>{
 let calls=0,time=0;assert.deepEqual(await helperCall({request:{action:'getDownload'},now:()=>time,pause:async n=>time+=n,execute:async()=>[{result:++calls<3?{waiting:true}:{url:'synthetic-export'}}]}),{url:'synthetic-export'});assert.equal(calls,3);
});
test('Copied provider functions are self-contained and return errors instead of an empty injection result',async()=>{
 const window={getComputedStyle:()=>({visibility:'visible'})},document={defaultView:window,querySelectorAll:()=>[]},location={origin:'https://fictional.invalid',pathname:'/wrong',href:'https://fictional.invalid/wrong'};
 for(const func of [amazonDownloadPage,waveExportPage,waveMailPage,paypalPage]){
  const copied=vm.runInNewContext('('+func.toString()+')',{document,window,location,URL,setTimeout});
  const result=await copied({action:'read',bridge:true});assert.ok(result.helperError?.message);assert.equal(result.notSubmitted,false);assert.doesNotThrow(()=>JSON.stringify(result));
 }
});
