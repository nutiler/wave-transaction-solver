import {readTransferMenu,checkTransferMenu} from './transfer-menu.js';
const business='11111111-1111-1111-1111-111111111111';
const pair={out:{id:'1000000000000000001'},in:{id:'1000000000000000002',date:'2025-01-02',description:'Payment thank you',primary:{account:'Fictional Card'}}};
const context={document,location:{href:'https://next.waveapps.com/'+business+'/transactions/'+pair.out.id},getComputedStyle};
const fixture=document.getElementById('fixture');
function setup(){fixture.innerHTML='<div><input placeholder="Search categories..." value="private search"><h3>Select Account with Matching Transaction</h3><ul><li role="option" data-transaction-id="1000000000000000002">Fictional Card - Jan 2, 2025 - Payment thank you<svg><title>open menu icon</title></svg></li></ul><h3>Select Account to Create Transfer</h3><ul><li role="option">Fictional new account</li></ul></div>';}
document.getElementById('run').onclick=()=>{const checks=document.getElementById('checks');checks.replaceChildren();let passed=0;
 function check(name,test){const li=document.createElement('li');try{test();passed++;li.textContent='PASS: '+name;}catch(e){li.textContent='FAIL: '+name+' — '+e.message;}checks.append(li);}
 const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
 check('Existing matches and create-transfer entries stay separate',()=>{setup();const r=readTransferMenu(context);assert(r.matchingOptions.length===1 && r.createOptions.length===1,'Wrong group counts');assert(checkTransferMenu(r,pair,business).ready,'Expected counterpart missing');assert(!r.menuHtml[0].includes('private search'),'Search input value exposed');});
 check('Reading does not click or edit menu controls',()=>{setup();let clicks=0;fixture.onclick=()=>clicks++;const before=fixture.innerHTML;readTransferMenu(context);assert(clicks===0 && fixture.innerHTML===before,'Reader changed the page');});
 check('Hidden duplicate menu entries are ignored',()=>{setup();const option=fixture.querySelector('[role="option"]');const hidden=option.cloneNode(true);hidden.hidden=true;option.after(hidden);assert(readTransferMenu(context).matchingOptions.length===1,'Hidden match included');});
 check('A closed submenu returns instructions instead of a match',()=>{fixture.replaceChildren();const r=readTransferMenu(context);assert(r.problems.length>0 && !r.matchingOptions.length,'Closed menu accepted');});
 check('Wrong page produces no menu capture',()=>{setup();const r=readTransferMenu({...context,location:{href:'https://example.com/'+business+'/transactions/'+pair.out.id}});assert(r.identity===null && r.menuHtml.length===0,'Wrong page read');});
 document.getElementById('result').textContent=passed+' of 5 passed';};
