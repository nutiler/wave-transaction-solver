import test from 'node:test';
import assert from 'node:assert/strict';
import {paypalPage} from '../extension/paypal-page.js';
function environment(addNew=true){
 const node=(text='',label='')=>({tagName:'DIV',innerText:text,textContent:text,isConnected:true,hidden:false,disabled:false,value:'',getAttribute:key=>key==='aria-label'?label:null,setAttribute(){},getClientRects:()=>[{}],querySelectorAll:()=>[],dispatchEvent:()=>true});
 const win={crypto,getComputedStyle:()=>({visibility:'visible'}),MouseEvent:class{constructor(type){this.type=type;}}};
 const makeRow=()=>{const row=node(),cells=['All transactions','Oct 8, 2026','Jan 1, 2025 - Dec 31, 2025','CSV','Download'].map(v=>node(v)),button=node('Download');row.querySelectorAll=sel=>sel==='td,[role="cell"]'?cells:sel==='a,button,[role="button"]'?[button]:[];return row;};
 const rows=[makeRow()],table=node();table.querySelectorAll=sel=>sel==='tr,[role="row"]'?rows:['Report type','Request date','Date range','Format','Action'].map(v=>node(v));
 const type=node('All transactions','Transaction type'),format=node('CSV','Format'),range=node('','Date range');type.tagName=format.tagName='BUTTON';range.tagName='INPUT';range.value='1/1/2025-12/31/2025';
 const heading=node('Activity report'),create=node('Create Report'),nested=node('Create Report');let clicks=0;
 create.tagName='BUTTON';create.querySelectorAll=sel=>sel==='div,span'?[nested]:[];create.contains=e=>e===nested;nested.contains=()=>false;
 nested.click=()=>{clicks++;if(addNew)rows.unshift(makeRow());};heading.click=()=>{};
 const doc={defaultView:win,getElementById:()=>null,querySelectorAll:sel=>sel==='table,[role="table"]'?[table]:sel==='select,input:not([type="hidden"]):not([type="password"]),[role="combobox"],button'?[type,range,format,create]:sel==='button,a,[role="button"]'?[type,format,create]:sel==='h1,h2,h3,h4'||sel==='h1,h2,h3,h4,span,p,div'?[heading]:[]};
 return {context:{document:doc,location:{origin:'https://www.paypal.com',pathname:'/reports/dlog',href:'https://www.paypal.com/reports/dlog'},pause:async()=>{}},clicks:()=>clicks};
}
const request={type:'All transactions',format:'CSV',start:'2025-01-01',end:'2025-12-31'};
test('Fresh adapter ignores existing 2025, prepares without clicking, then clicks nested Create and confirms a new row',async()=>{
 const e=environment();assert.equal((await paypalPage({action:'prepare',forceNew:true,...request},e.context)).prepared,true);assert.equal(e.clicks(),0);
 const result=await paypalPage({action:'create',forceNew:true,...request},e.context);assert.equal(result.clicked,true);assert.equal(result.submitted,true);assert.equal(e.clicks(),1);
});
test('Fresh adapter cannot call a pre-existing ready 2025 row proof of a new submission',async()=>{
 const e=environment(false),result=await paypalPage({action:'create',forceNew:true,...request},e.context);assert.equal(e.clicks(),1);assert.equal(result.clicked,true);assert.equal(result.submitted,false);
});
test('Ordinary existing-report lookup still skips Create outside explicitly fresh batches',async()=>{
 const e=environment();assert.equal((await paypalPage({action:'create',...request},e.context)).existing,true);assert.equal(e.clicks(),0);
});
