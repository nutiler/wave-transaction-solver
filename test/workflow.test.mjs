import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onlyBusiness, businessFromUrl, openBackgroundTab, waitForLiveSnapshot, exportUrlFor } from '../extension/workflow.js';
const business='11111111-1111-1111-1111-111111111111';
const url=`https://next.waveapps.com/${business}/transactions/1`;
test('one distinct business is selected across transaction and chart tabs',()=> {
  assert.equal(onlyBusiness([{url},{url:`https://next.waveapps.com/${business}/accounting/charts`}]),business);
  assert.equal(onlyBusiness([{url},{url:url.replace(business,'00000000-0000-0000-0000-000000000001')}]),null);
  assert.equal(onlyBusiness([]),null);
  assert.equal(businessFromUrl(url.replace('next.waveapps.com','example.com')),null);
});
test('export shortcut stays bound to the supplied Wave business',()=> {
  assert.equal(exportUrlFor(business,{[business]:'https://accounting.waveapps.com/settings/export/123456/'}),'https://accounting.waveapps.com/settings/export/123456/');
  assert.equal(exportUrlFor(business,{[business]:'https://example.com/settings/export/123456/'}),null);
  assert.equal(exportUrlFor(null),null); assert.equal(exportUrlFor('00000000-0000-0000-0000-000000000001'),null);
});
test('new and reused Wave tabs preserve focus, new tabs stay in solver window',async()=> {
  const actions=[];
  const tabs={getCurrent:async()=>({windowId:42}),create:async options=>{actions.push(options);return{id:9};},update:async(id,options)=>{actions.push({id,...options});return{id};}};
  assert.equal((await openBackgroundTab(tabs,url)).id,9);
  assert.deepEqual(actions[0],{url,active:false,windowId:42});
  await openBackgroundTab(tabs,url,9); assert.equal(actions[1].active,false);
});
const ready={identity:{transaction:'1'},fields:Object.fromEntries(['date','description','account','amount','type','category'].map(name=>[name,'value']))};
test('automatic live check waits for loaded fields and retries navigation errors',async()=> {
  const delays=[];let reads=0;
  const result=await waitForLiveSnapshot(async()=>{reads++; if(reads===1) throw new Error('Page navigating'); return reads===2 ? {...ready,fields:{}} : ready;},()=>true,async ms=>delays.push(ms));
  assert.equal(result,ready);assert.equal(reads,3);assert.deepEqual(delays,[1500,500,500]);
});
test('changing selection cancels automatic check without reading another record',async()=> {
  let reads=0;
  assert.equal(await waitForLiveSnapshot(async()=>{reads++;return ready;},()=>false,async()=>{}),null);assert.equal(reads,0);
  let current=true;
  assert.equal(await waitForLiveSnapshot(async()=>{current=false;return ready;},()=>current,async()=>{}),null);
});
test('automatic check stops retrying and retains unknown-field diagnostics',async()=> {
  let reads=0;const partial={...ready,fields:{},problems:['Dialog absent']};
  assert.equal(await waitForLiveSnapshot(async()=>{reads++;return partial;},()=>true,async()=>{}),partial);assert.equal(reads,20);
});
