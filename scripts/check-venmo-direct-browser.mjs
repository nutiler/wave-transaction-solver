import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.WAVE_PLAYWRIGHT_ROOT||'playwright');
const port=Number(process.env.WAVE_TEST_PORT||4328),base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.mjs'],{windowsHide:true,stdio:'pipe',env:{...process.env,PORT:String(port)}});let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('Preview exited '+c)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.WAVE_TEST_CHROME||undefined});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/extension/venmo-funding-fixture.html');await page.waitForFunction(()=>!!globalThis.directEditorFixture);
 const result=await page.evaluate(async()=>{
  const {editWaveTransaction}=await import('/extension/editor.js'),{readWavePage}=await import('/extension/live-reader.js'),{runFundingRepairs}=await import('/extension/venmo-funding-runner.js'),{fundingKey,fundingFingerprint}=await import('/extension/venmo-funding.js');
  const business='11111111-1111-1111-1111-111111111111',wallet='(phantom) Venmo',account='(1111) Wells Fargo Business';
  const snapshots={},rows=[],proposals=[];let receipts={},saves=0,queries=0,reads=0;const counterpartHints={};
  const tx=(id,account,direction,description)=>({id,date:'2026-09-03',description,primary:{account},amount:10000,direction,categories:['Tools'],postings:[{},{}]});
  const snap=t=>({identity:{business,transaction:t.id},fields:{date:t.date,description:t.description,account:t.primary.account,type:t.direction==='out'?'Withdrawal':'Deposit',amount:'100.00',category:'Tools'},currency:'USD',structure:{singleCategory:true,split:false},problems:[],reviewed:'Not reviewed'});
  for(let i=0;i<105;i++){const bank=tx(String(10000+i),account,'out','Fictional Venmo movement '+i),purchase=tx(String(20000+i),wallet,'out','Fictional purchase '+i);snapshots[bank.id]=snap(bank);snapshots[purchase.id]=snap(purchase);proposals.push({business,kind:'funding',bank,purchase,walletAccount:{account:wallet},source:{key:'fictional:'+i,sourceId:String(i)},deltaCents:10000});}
  const finish=p=>{const id=String(30000+rows.length),other=tx(id,wallet,'in','Created Transfer: '+p.bank.description);snapshots[p.bank.id].fields.category='Transfer to '+wallet+' - Sep 3, 2026 - '+other.description;snapshots[id]=snap(other);snapshots[id].fields.category='Transfer from '+account+' - September 3, 2026 - '+p.bank.description;rows.push({id,date:other.date,description:other.description,account:wallet,amountCents:10000});return id;};
  for(const p of proposals.slice(0,11)){const counterpartId=finish(p);receipts[fundingKey(p)]={business,proposal:p,fingerprint:fundingFingerprint(p),originalSnapshots:{[p.bank.id]:snap(p.bank),[p.purchase.id]:snap(p.purchase)},beforeIds:[],saveAttempted:true,verified:true,counterpartId};}
  for(const p of proposals.slice(11,63))counterpartHints[fundingKey(p)]=[finish(p)];
  const args={business,proposals,receipts,counterpartHints,approvals:Object.fromEntries(proposals.map(p=>[fundingKey(p),fundingFingerprint(p)])),collect:async()=>{throw Error('Forbidden complete history scan');},read:async t=>{reads++;return structuredClone(snapshots[t.id]);},lookupDates:async(startDate,endDate)=>{queries++;return {business,scope:'date-range',startDate,endDate,completeness:'count-confirmed',records:structuredClone(rows)};},persist:async next=>receipts=structuredClone(next),directTransfer:async(p,s,{checkOnly})=>{
   const f=globalThis.directEditorFixture({closed:true,outerPopup:true,createOnly:true,hoverBranch:true,linkedCreatedLabel:true,currentGroup:true,menuMountDelay:300,backMountDelay:400});f.context.location.href='https://next.waveapps.com/'+business+'/transactions/'+p.bank.id;
   f.expected.description=p.bank.description;f.context.document.querySelector('input[aria-label="Description"]').value=p.bank.description;
   const before=readWavePage(f.context);if(before.identity.transaction!==p.bank.id||before.fields.category!=='Tools'||before.currency!=='USD')throw Error('Real reader could not confirm fictional editor');
   const result=await editWaveTransaction({business,id:p.bank.id,category:f.category,expected:f.expected,liveOnly:true,preserveReviewed:true,transferCreate:{account:wallet,direction:'out',label:wallet,confirmed:true,openMenu:true,checkOnly}},f.context);
   const state=f.state();if(result.problem)throw Error(result.problem);if(state.saveClicks!==1||state.optionClicks!==1||state.reviewClicks!==0)throw Error('Did not perform exactly account selection and one Save');saves++;finish(p);return result;
  }};
  const completed=await runFundingRepairs({...args,mode:'apply'});
  const verified=Object.values(completed.receipts).filter(r=>r.verified).length;
  await runFundingRepairs({...args,receipts:completed.receipts,mode:'apply'});
  return {verified,saves,queries,reads,held:completed.results.filter(r=>r.ready===false).map(r=>r.message)};
 });
 assert.equal(result.verified,105,JSON.stringify(result));assert.equal(result.saves,42);assert.equal(result.queries,42);assert.equal(result.held.length,0);assert.deepEqual(errors,[]);
 console.log('Direct browser batch passed: 105/105 verified from 63 completed (11 checkpoints + 52 live export addresses), 42 exact account selections and Saves with delayed menus, More options and full generated labels, zero full-history scans, no repeat Saves on resume. Reads: '+result.reads+'.');
}finally{await browser?.close();server.kill();}
