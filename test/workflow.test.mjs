import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onlyBusiness, businessFromUrl, openBackgroundTab, waitForLiveSnapshot, exportUrlFor, reopenSavedTransaction } from '../extension/workflow.js';
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


test('Verification opens a saved record from the list without cancelling navigation with reload', async()=>{
  const calls=[]; let reads=0, navigating=false;
  const list={id:9,status:'complete',url:'https://next.waveapps.com/'+business+'/transactions'};
  const tabs={ get:async()=> { if(!navigating) return list; reads++; return reads<3 ? {...list,pendingUrl:url,status:reads===1?'complete':'loading'} : {id:9,status:'complete',url}; }, update:async(id,options)=>{calls.push(['update',id,options]); navigating=true; return list;}, reload:async()=>{calls.push(['reload']);} };
  const result = await reopenSavedTransaction(tabs,9,business,'1',()=>true,async()=>{});
  assert.equal(result.url,url); assert.equal(reads,3); assert.equal(calls.length,1); assert.equal(calls[0][0],'update'); assert.equal(calls[0][2].active,false);
});
test('Verification reloads an already-open transaction once to discard unsaved dialog values',async()=>{
  const calls=[]; const tabs={get:async()=>({id:9,status:'complete',url}),reload:async id=>calls.push(['reload',id]),update:async()=>calls.push(['update'])};
  await reopenSavedTransaction(tabs,9,business,'1',()=>true,async()=>{});
  assert.deepEqual(calls,[['reload',9]]);
});
test('Verification replaces a closed test tab without invoking Save or changing focus',async()=>{
  const calls=[];let made=false;
  const tabs={get:async()=>{if(!made)throw new Error('No tab with id');return{id:10,status:'complete',url};},getCurrent:async()=>({windowId:42}),create:async options=>{made=true;calls.push(options);return{id:10,status:'loading',pendingUrl:url};}};
  assert.equal((await reopenSavedTransaction(tabs,9,business,'1',()=>true,async()=>{})).id,10);
  assert.deepEqual(calls,[{url,active:false,windowId:42}]);
});
test('Verification waits for the save redirect to settle before reopening its record',async()=>{
  let reads=0;const calls=[]; const list='https://next.waveapps.com/'+business+'/transactions';
  const tabs={get:async()=>{reads++;return reads===1?{id:9,url,status:'loading',pendingUrl:list}:reads===2?{id:9,url:list,status:'complete'}:{id:9,url,status:'complete'};},update:async()=>calls.push('update'),reload:async()=>calls.push('reload')};
  await reopenSavedTransaction(tabs,9,business,'1',()=>true,async()=>{});assert.deepEqual(calls,['update']);
});
test('Verification blocks other businesses, cancelled selections and unfinished record navigation',async()=>{
  const other=url.replace(business,'22222222-2222-2222-2222-222222222222');let updates=0;
  await assert.rejects(()=>reopenSavedTransaction({get:async()=>({url:other})},9,business,'1',()=>true,async()=>{}),/changed businesses/);
  await assert.rejects(()=>reopenSavedTransaction({},9,business,'1',()=>false,async()=>{}),/Selection changed/);
  const tabs={get:async()=>({id:9,url:'https://next.waveapps.com/'+business+'/transactions',status:'complete'}),update:async()=>updates++};
  await assert.rejects(()=>reopenSavedTransaction(tabs,9,business,'1',()=>true,async()=>{}),/did not finish opening/); assert.equal(updates,1);
});
