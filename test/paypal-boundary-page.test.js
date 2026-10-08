import test from 'node:test';
import assert from 'node:assert/strict';
import {paypalPage} from '../extension/paypal-page.js';
function environment(){
 const node=(text='',label='')=>({tagName:'DIV',innerText:text,textContent:text,isConnected:true,hidden:false,disabled:false,id:'',getAttribute:k=>k==='aria-label'?label:null,setAttribute(){},getClientRects:()=>[{}],querySelectorAll:()=>[],dispatchEvent(){return true;},closest:()=>null,contains:()=>true});
 class Input{constructor(label,value){Object.assign(this,node('',label));this.tagName='INPUT';this.type='text';this._value=value;this.focus=()=>{};this.blur=()=>{if(this.index!==undefined)this.value=selected[this.index];};}get value(){return this._value;}set value(value){this._value=value;}}
 const selected=['10/8/2026','10/8/2026'],summary=new Input('Date range',selected.join('-')),start=new Input('From',selected[0]),end=new Input('To',selected[1]);let active=0,cells=[],month=0,clicks=0;
 const type=node('All transactions','Transaction type'),format=node('CSV','Format'),heading=node('Activity report'),panel=node(),table=node(),caption=node();type.tagName=format.tagName='BUTTON';heading.click=()=>{};
 const render=input=>{const parts=input.value.split('/'),y=Number(parts[2]),m=Number(parts[0]);month=y*12+m-1;caption.innerText=caption.textContent=(m===10?'October':m===12?'December':'October')+' '+y;cells=[];
 for(let d=1;d<=new Date(y,m,0).getDate();d++){const cell=node(),a=node(String(d)),iso=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');cell.tagName='TD';cell.id=m+'/'+d+'/'+y;const disabled=iso<'2019-10-09';cell.closest=selector=>selector.includes('disabled')&&disabled?cell:selector==='.calendarWrapper'?panel:null;cell.querySelectorAll=selector=>selector==='a,button'?[a]:[];a.closest=()=>disabled?cell:null;a.click=()=>{if(disabled)return;clicks++;selected[active]=cell.id;(active===0?start:end).value=cell.id;summary.value=selected.join('-');};cells.push(cell);}
 };
 const box=node();box.querySelectorAll=()=>[panel];panel.querySelectorAll=()=>[caption];table.querySelectorAll=()=>cells;table.closest=()=>panel;
 for(const [i,input] of [start,end].entries()){input.index=i;input.closest=()=>box;input.click=()=>{active=i;render(input);};input.dispatchEvent=event=>{if(event.type==='input'){active=i;render(input);}return true;};}
 const win={crypto,HTMLInputElement:Input,getComputedStyle:()=>({visibility:'visible'}),Event:class{constructor(type){this.type=type;}},InputEvent:class{constructor(type){this.type=type;}},KeyboardEvent:class{constructor(type){this.type=type;}},MouseEvent:class{constructor(type){this.type=type;}}};
 const doc={defaultView:win,activeElement:null,getElementById:()=>null,querySelectorAll:selector=>{
 if(selector==='h1,h2,h3,h4,span,p,div'||selector==='h1,h2,h3,h4')return [heading];
 if(selector==='select,input:not([type="hidden"]):not([type="password"]),[role="combobox"],button')return [type,summary,format,start,end];
 if(selector==='.Calendar table,.calendarWrapper table')return [table];
 if(selector==='.Calendar td[id],.calendarWrapper td[id]')return cells;
 return [];
 }};
 return {context:{document:doc,location:{origin:'https://www.paypal.com',pathname:'/reports/dlog'},pause:async()=>{}},selected,clicks:()=>clicks};
}
const request={action:'prepare',forceNew:true,type:'All transactions',format:'CSV',start:'2019-10-08',end:'2019-12-31'};
test('The page commits the earliest visibly enabled boundary day, verifies TO unchanged, and returns its exact range',async()=>{
 const e=environment(),result=await paypalPage({...request,oldestBoundary:true},e.context);assert.equal(result.prepared,true);assert.equal(result.start,'2019-10-09');assert.equal(result.end,'2019-12-31');assert.equal(result.originalStart,'2019-10-08');assert.deepEqual(e.selected,['10/9/2019','12/31/2019']);assert.equal(e.clicks(),2);
});
test('The page never advances an ordinary requested date just because its calendar day is disabled',async()=>{
 const e=environment(),result=await paypalPage(request,e.context);assert.equal(result.notSubmitted,true);assert.equal(result.calendarBoundary,false);assert.equal(e.clicks(),0);
});
