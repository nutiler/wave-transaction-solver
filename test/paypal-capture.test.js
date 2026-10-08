import test from 'node:test';
import assert from 'node:assert/strict';
import {paypalPage} from '../extension/paypal-page.js';
import {importPayPalCSV} from '../extension/paypal-csv.js';
const csv='Date,Time,TimeZone,Name,Type,Status,Currency,Amount,Fees,Total,Exchange Rate,Receipt ID,Balance,Transaction ID,Item Title\n01/02/2025,12:00:00,PST,Fictional Shop,Express Checkout Payment,Completed,USD,-10.00,-1.00,-11.00,1.0,FAKERECEIPT,0.00,FAKECAPTURE1,Fictional item';
function environment(produce){
 const node=text=>({innerText:text,textContent:text,isConnected:true,hidden:false,disabled:false,getAttribute:()=>null,setAttribute(){},getClientRects:()=>[{}],querySelectorAll:()=>[],dispatchEvent:()=>true});
 let nativeClicks=0,serial=0;class Anchor{click(){nativeClicks++;}}
 const win={Blob,HTMLAnchorElement:Anchor,crypto,getComputedStyle:()=>({visibility:'visible'}),MouseEvent:class{constructor(type){this.type=type;}},URL:{createObjectURL:()=> 'blob:https://www.paypal.com/fictional-'+ ++serial}};
 const originalURL=win.URL.createObjectURL,originalClick=Anchor.prototype.click;
 const control=node('Download');control.click=()=>produce({win,Anchor});
 const row=node(''),cells=['All transactions','Synthetic','Jan 1, 2025 - Dec 31, 2025','CSV','Download'].map(node);
 row.querySelectorAll=selector=>selector==='td,[role="cell"]'?cells:selector==='a,button,[role="button"]'?[control]:[];
 const table=node('');table.querySelectorAll=selector=>selector==='tr,[role="row"]'?[row]:['Report type','Request date','Date range','Format','Action'].map(node);
 const doc={defaultView:win,querySelectorAll:selector=>selector==='table,[role="table"]'?[table]:selector==='h1,h2,h3,h4,span,p,div'?[node('Activity report')]:[]};
 return {context:{document:doc,location:{origin:'https://www.paypal.com',pathname:'/reports/dlog',href:'https://www.paypal.com/reports/dlog'},pause:async()=>{}},win,Anchor,originalURL,originalClick,nativeClicks:()=>nativeClicks};
}
const request={action:'download',type:'All transactions',format:'CSV',start:'2025-01-01',end:'2025-12-31'};
test('CSV capture binds to its download anchor and ignores unrelated blobs on the page',async()=>{const env=environment(({win,Anchor})=>{win.URL.createObjectURL(new Blob(['unrelated CSV-like background object'],{type:'text/csv'}));const image=new Anchor();image.href=win.URL.createObjectURL(new Blob(['image'],{type:'image/png'}));image.download='image.png';image.click();const report=new Anchor();report.href=win.URL.createObjectURL(new Blob([csv],{type:'text/plain'}));report.download='Download.CSV';report.click();report.click();});const response=await paypalPage(request,env.context);assert.equal(response.text,csv);assert.equal(importPayPalCSV(response.text).records[0].netCents,-1100);assert.equal(env.nativeClicks(),1);assert.equal(env.win.URL.createObjectURL,env.originalURL);assert.equal(env.Anchor.prototype.click,env.originalClick);});
test('An unrelated object URL alone cannot masquerade as a downloaded CSV',async()=>{const env=environment(({win})=>win.URL.createObjectURL(new Blob([csv],{type:'text/csv'})));await assert.rejects(paypalPage(request,env.context),/No single CSV blob/);assert.equal(env.win.URL.createObjectURL,env.originalURL);assert.equal(env.Anchor.prototype.click,env.originalClick);});
test('Two different downloaded CSVs are rejected as ambiguous and all hooks are restored',async()=>{const env=environment(({win,Anchor})=>{for(let i=0;i<2;i++){const a=new Anchor();a.href=win.URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='Download.csv';a.click();}});await assert.rejects(paypalPage(request,env.context),/No single CSV blob/);assert.equal(env.win.URL.createObjectURL,env.originalURL);assert.equal(env.Anchor.prototype.click,env.originalClick);});
