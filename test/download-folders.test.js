import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberDataFolder,projectDataFolder,saveLocalFeature,loadLocalFeature} from '../extension/session.js';
test('Shared data folder round-trips without replacing sessions, rules or helper checkpoints',async()=>{
 const rows=new Map([['current',{csvText:'synthetic history',merchantRules:['fictional-rule']}]]),old=globalThis.indexedDB;
 globalThis.indexedDB={open:()=>{const request={result:{transaction:()=>{const tx={objectStore:()=>({get:key=>{const r={};queueMicrotask(()=>{r.result=rows.get(key);tx.oncomplete?.();});return r;},put:(value,key)=>{rows.set(key,value);queueMicrotask(()=>tx.oncomplete?.());}})};return tx;},close(){}}};queueMicrotask(()=>request.onsuccess?.());return request;}};
 try{
  const paypal={version:1,entries:{fictional:{status:'requested'}}},venmo={version:1,sources:{personal:{mode:'page'}}};
  await saveLocalFeature('paypal:downloader',paypal);await saveLocalFeature('venmo:downloader',venmo);
  assert.equal(await projectDataFolder(),null);await assert.rejects(rememberDataFolder({name:'Downloads'}),/data folder/);
  const data={name:'data',kind:'directory'};await rememberDataFolder(data);
  assert.equal(await projectDataFolder(),data);assert.equal(await loadLocalFeature('paypal:downloader'),paypal);assert.equal(await loadLocalFeature('venmo:downloader'),venmo);
  assert.deepEqual(rows.get('current'),{csvText:'synthetic history',merchantRules:['fictional-rule']});
  assert.deepEqual(rows.get('downloads:folders'),{version:1,data,inbox:null});
 }finally{if(old===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=old;}
});
