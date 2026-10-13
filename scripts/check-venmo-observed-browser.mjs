import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.WAVE_PLAYWRIGHT_ROOT||'playwright');
const port=Number(process.env.WAVE_TEST_PORT||4331),base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.mjs'],{windowsHide:true,stdio:'pipe',env:{...process.env,PORT:String(port)}});let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('Preview exited '+c)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.WAVE_TEST_CHROME||undefined});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/extension/venmo-funding-fixture.html');await page.waitForFunction(()=>!!globalThis.directEditorFixture);
 const menus=await page.evaluate(async()=>{
  const {editWaveTransaction}=await import('/extension/editor.js');const results=[];
  for(const options of [{direction:'out'},{direction:'in'},{menuMountDelay:300},{menuMountDelay:300,backMountDelay:400},{direction:'in',menuMountDelay:300,backMountDelay:400},{backStalled:true},{backAmbiguous:true},{backDisabled:true}]){
   const f=directEditorFixture({...options,closed:true,currentGroup:true,outerPopup:true,hoverBranch:true,createOnly:true});
   const r=await editWaveTransaction({business:'11111111-1111-1111-1111-111111111111',id:'100',category:f.category,expected:f.expected,liveOnly:true,preserveReviewed:true,transferCreate:{account:'(phantom) Venmo',direction:options.direction||'out',label:'(phantom) Venmo',confirmed:true,openMenu:true}},f.context);
   results.push({r,state:f.state(),options});
  }return results;
 });
 for(const test of menus){if(test.options.backStalled||test.options.backAmbiguous||test.options.backDisabled){assert(test.r.problem);assert.equal(test.state.optionClicks,0);assert.equal(test.state.saveClicks,0);if(test.options.backStalled){assert.equal(test.state.backClicks,1);assert.match(test.r.problem,/did not leave the current category group/);}}else{assert(!test.r.problem,JSON.stringify(test));assert.equal(test.state.optionClicks,1);assert.equal(test.state.saveClicks,1);assert.equal(test.state.reviewClicks,0);assert.equal(test.state.backClicks,1);}}
 await page.goto(base+'/extension/venmo-repair-fixture.html');await page.waitForFunction(()=>!!globalThis.repairFormFixture);
 const forms=await page.evaluate(async()=>{
  const {venmoRepairPage}=await import('/extension/venmo-repair-page.js'),{readWavePage}=await import('/extension/live-reader.js');
  const business='11111111-1111-1111-1111-111111111111',deposits=[];
  for(const options of [{customAccount:true,unrelatedPopup:true},{requiredLabels:true},{prefixedRefundLabel:true},{delayedMount:true},{requiredLabels:true,prefixedRefundLabel:true,delayedMount:true}]){
   const f=repairFormFixture({...options,creating:true});const r=await venmoRepairPage({business,kind:'receipt',target:{date:'2026-01-19',description:'Casey Rent',account:'(fictional) Venmo',type:'Deposit',amount:'5.00',category:'Rent'},categoryPath:['Refund for Expense']},f.context);deposits.push({r,state:f.state()});
  }
  const f=repairFormFixture(),root=document.querySelector('#forms [role=dialog]');
  for(const name of ['Amount','Category']){const control=root.querySelector(name==='Amount'?'input[aria-label=Amount]':'.wv-select');control.parentElement.remove();}
  for(const amount of ['0.52','17.50','1.75']){const row=document.createElement('div'),category=document.createElement('label'),selected=document.createElement('span'),amountLabel=document.createElement('label'),input=document.createElement('input');category.textContent='Category';selected.className='wv-select__label';selected.textContent='Bank Charges';amountLabel.textContent='Amount';input.setAttribute('aria-label','Amount');input.value=amount;const currency=document.createElement("span");currency.className="wv-select__label";currency.append(document.createElementNS("http://www.w3.org/2000/svg","svg"),document.createTextNode("USD"));row.append(category,selected,amountLabel,currency,input);root.append(row);}

  const snapshot=await readWavePage({...f.context,waitForReady:{business,id:'50',timeoutMs:1000}}),details=await venmoRepairPage({business,id:'50',action:'inspect'},f.context);
  const deleted=await venmoRepairPage({business,id:'50',kind:'fee',split:true,expected:{...f.expected,amount:'19.77'},allocations:[['Bank Charges',52],['Bank Charges',1750],['Bank Charges',175]].sort()},f.context);
  const columns=[];
  for(const variant of ['same','differentCategories','missingAmount','changedAmount','foreignCurrency','protected']){
   const fixture=repairFormFixture({protectedCopy:variant==='protected'}),form=document.querySelector('#forms [role=dialog]');
   for(const name of ['Amount','Category'])form.querySelector(name==='Amount'?'input[aria-label=Amount]':'.wv-select').parentElement.remove();
   const categories=document.createElement('div'),amounts=document.createElement('div');
   ['0.52','17.50',variant==='changedAmount'?'1.76':'1.75'].forEach((amount,i)=>{
    const category=document.createElement('span');category.className='wv-select__label';category.textContent=variant==='differentCategories'&&i===2?'Other Category':'Bank Charges';categories.append(category);
    if(variant==='missingAmount'&&i===2)return;const input=document.createElement('input');input.setAttribute('aria-label','Amount');input.value=amount;amounts.append(input);
   });
   const currency=document.createElement('span');currency.textContent=variant==='foreignCurrency'?'CAD':'USD';form.append(categories,amounts,currency);
   const inspected=await venmoRepairPage({business,id:'50',action:'inspect'},fixture.context);
   const result=await venmoRepairPage({business,id:'50',kind:'fee',split:true,expected:{...fixture.expected,amount:'19.77'},allocations:[['Bank Charges',52],['Bank Charges',1750],['Bank Charges',175]].sort()},fixture.context);
   columns.push({variant,inspected,result,state:fixture.state()});
  }
  return {deposits,snapshot,details,deleted,state:f.state(),columns};
 });
 for(const test of forms.deposits){assert(!test.r.problem,JSON.stringify(test));assert.equal(test.state.saves,1);assert.equal(test.state.reviewClicks,0);assert.equal(test.state.account,'(fictional) Venmo');assert.equal(test.state.category,'Refund for Rent');}
 assert(forms.snapshot.structure.split);assert(!forms.snapshot.problems.some(p=>/Timed out/.test(p)));assert.equal(forms.details.allocations.reduce((n,p)=>n+p.amountCents,0),1977);assert.equal(forms.details.currency,'USD');assert(!forms.deleted.problem,JSON.stringify(forms.deleted));assert.equal(forms.state.deletes,1);assert.deepEqual(errors,[]);
 for(const test of forms.columns){if(test.variant==='same'){assert.equal(test.inspected.allocations.length,3);assert.equal(test.inspected.currency,'USD');assert.match(test.inspected.allocationEvidence,/no positional pairing/);assert(!test.result.problem,JSON.stringify(test));assert.equal(test.state.deletes,1);}else{assert(test.result.problem,JSON.stringify(test));assert.equal(test.state.deletes,0);assert(!test.result.mutationAttempted);}}
 console.log('Observed Venmo UI checks passed: delayed menu mounting and More options for funding and cash-outs; stalled navigation clicks Back once and never saves; disabled/ambiguous back controls blocked; owned deposit dropdown alongside an unrelated menu; required labels and delayed deposit fields; prefixed refund options; SVG currency selectors separated from three named split amounts totaling $19.77; identical-category separate columns verified; mixed categories, missing amounts, changed amounts, CAD and protected records blocked.');
}finally{await browser?.close();server.kill();}
