import test from 'node:test';import assert from 'node:assert/strict';
import {paypalCSVDownload,paypalDownloadRecovery} from '../extension/paypal-download.js';import {helperTabs,waitHelperTab} from '../extension/helper-tabs.js';
test('Native PayPal CSV metadata can come from a first-party route outside reports; other services stay excluded',()=>{
 assert.equal(paypalCSVDownload({filename:'Download.csv',url:'https://www.paypal.com/activity/statement/download'}),true);
 assert.equal(paypalCSVDownload({filename:'Download',mime:'text/csv',url:'blob:https://www.paypal.com/fictional'}),true);
 assert.equal(paypalCSVDownload({filename:'Download.csv',url:'https://unrelated.example/data.csv'}),false);
 assert.equal(paypalCSVDownload({filename:'Download.zip',mime:'text/csv',url:'https://www.paypal.com/reports/archive'}),false);
});
test('Recovery looks up only its saved ID, keeps in-progress files, and retries missing or interrupted downloads',async()=>{
 const calls=[],items=new Map(),downloads={search:async query=>{calls.push(query);return items.has(query.id)?[items.get(query.id)]:[];}};
 assert.deepEqual(await paypalDownloadRecovery(downloads,{downloadId:8}),{retry:true,stale:true});
 items.set(8,{filename:'fake.csv',url:'https://www.paypal.com/activity/download',state:'in_progress',exists:false});assert.deepEqual(await paypalDownloadRecovery(downloads,{downloadId:8}),{resumeId:8});
 items.get(8).state='interrupted';assert.equal((await paypalDownloadRecovery(downloads,{downloadId:8})).retry,true);
 assert.ok(calls.every(q=>Object.keys(q).join(',')==='id'));
});
test('Helper tabs open in the background, survive waits, and close only their own completed provider tabs',async()=>{
 const rows=new Map([[1,{id:1,url:'https://www.paypal.com/reports/dlog'}]]),closed=[];let serial=1;
 const tabs={create:async options=>{assert.equal(options.active,false);const row={id:++serial,...options};rows.set(row.id,row);return row;},get:async id=>rows.get(id),update:async(id,options)=>Object.assign(rows.get(id),options),remove:async id=>{closed.push(id);rows.delete(id);}};
 const session=helperTabs(tabs),id=await session.open('paypal','https://www.paypal.com/reports/dlog');assert.equal(id,2);assert.equal(await session.open('paypal','https://www.paypal.com/reports/dlog'),2);await session.finish();assert.deepEqual(closed,[2]);assert.ok(rows.has(1));
 const next=await session.open('paypal','https://www.paypal.com/reports/dlog');rows.get(next).url='https://www.paypal.com/signin';await session.finish();assert.ok(rows.has(next));
});

test('A new working tab waits for page loading instead of injecting into about:blank',async()=>{let reads=0,time=0;const tabs={get:async()=>++reads<3?{status:'loading',url:'about:blank'}:{status:'complete',url:'https://www.paypal.com/reports/dlog'}};assert.equal(await waitHelperTab(tabs,2,'https://www.paypal.com/reports/dlog',{pause:async ms=>time+=ms,now:()=>time}),2);assert.equal(reads,3);await assert.rejects(waitHelperTab({get:async()=>({status:'complete',url:'https://www.paypal.com/signin'})},2,'https://www.paypal.com/reports/dlog'),/sign-in/);});

test('A helper mailbox tab navigated to a draft is not closed on completion',async()=>{let row,closed=0;const tabs={create:async options=>(row={id:9,...options}),get:async()=>row,remove:async()=>closed++};const session=helperTabs(tabs);await session.open('mail','https://mail.google.com/mail/u/1/#search/fictional-export');row.url='https://mail.google.com/mail/u/1/#drafts';await session.finish();assert.equal(closed,0);});
