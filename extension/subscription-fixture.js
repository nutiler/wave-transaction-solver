import {installSubscriptionView} from './subscription-view.js';
import {loadLocalFeature,saveLocalFeature} from './session.js';
const businesses=['00000000-0000-4000-8000-000000000095','00000000-0000-4000-8000-000000000096'];let business=businesses[Number(location.hash==='#other')],serial=100000;
const row=(date,amount,description,account='Fictional Checking',currency='USD',direction='out')=>({id:String(++serial),business,date,amount,description,direction,currency,reviewed:'Reviewed',primary:{account,type:'Cash and Bank',accountId:account},categories:['Software'],postings:[{account},{account:'Software'}]});
function seeds(){serial=100000;const rows=[];for(const name of ['Fictional Cloud Basic','Fictional Cloud Pro'])for(const [i,month] of ['05','06','07','08','09'].entries())rows.push(row('2026-'+month+'-05',name.endsWith('Basic')?1999:i===4?5999:4999,name));
 for(let stream=0;stream<2;stream++)for(const month of ['05','06','07','08'])rows.push(row('2026-'+month+'-02',999,'Fictional Music'));
 for(const [i,month] of ['05','06','07','08'].entries())rows.push(row('2026-'+month+'-22',[4000,8200,5500,10900][i],'Fictional Utility'));
 for(const month of ['05','06','07','08']){rows.push(row('2026-'+month+'-01',3500,'Amazon Mktpl*AB123456'));rows.push(row('2026-'+month+'-12',1200,'Fictional Euro App','Fictional Euro Card','EUR'));const unknown=row('2026-'+month+'-18',4500,'Fictional History App','Fictional History Bank');delete unknown.currency;rows.push(unknown);rows.push(row('2026-'+month+'-23',3000,'Fictional refund','Fictional Checking','USD','in'));}
 rows.push(row('2024-06-15',14900,'Fictional Annual App'),row('2025-06-15',14900,'Fictional Annual App'));return rows;}
let rows=seeds(),extra=await loadLocalFeature('finance:subscription-fixture:'+business)||[];rows.push(...extra);
let calls=0;const forbidden=()=>{calls++;throw Error('Subscription analysis must not call Wave.');};globalThis.chrome={tabs:{create:forbidden,update:forbidden},scripting:{executeScript:forbidden}};
const view=installSubscriptionView({parent:document.getElementById('subscriptionPanel'),getState:()=>({business,transactions:rows,reports:[],evidence:[],sourceState:{},receipts:{},extensionMode:false,sample:true}),openHistory:()=>{document.getElementById('fixtureDiagnostics').textContent='History shortcut requested; no Wave call.';},openData:()=>{document.getElementById('fixtureDiagnostics').textContent='Data shortcut requested; no Wave call.';}});
function button(text,action){const b=document.createElement('button');b.textContent=text;b.className='secondary';b.onclick=action;document.getElementById('fixtureControls').append(b);}
button('Add next fictional charge',async()=>{if(extra.length)return;extra=[{...row('2026-10-05',1999,'Fictional Cloud Basic'),id:'100999'}];rows=[...seeds(),...extra];await saveLocalFeature('finance:subscription-fixture:'+business,extra);view.refresh();});
button('Switch fictional business',async()=>{business=business===businesses[0]?businesses[1]:businesses[0];location.hash=business===businesses[1]?'other':'';extra=await loadLocalFeature('finance:subscription-fixture:'+business)||[];rows=[...seeds(),...extra];view.refresh();});
button('Load 12000 fictional records',()=>{serial=200000;rows=Array.from({length:12000},(_,i)=>row('2026-'+String(i%8+1).padStart(2,'0')+'-05',2000,'Fictional Service '+Math.floor(i/8)));view.refresh();});
button('Restore fictional history',()=>{rows=[...seeds(),...extra];view.refresh();});
globalThis.subscriptionFixture={snapshot:()=>view.snapshot(),waveCalls:()=>calls};
view.refresh();setInterval(()=>{document.getElementById('fixtureDiagnostics').textContent='Business: '+business+' · available records: '+rows.length+' · Wave calls: '+calls;},200);
