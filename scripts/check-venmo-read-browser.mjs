import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.WAVE_PLAYWRIGHT_ROOT||'playwright');
const port=Number(process.env.WAVE_TEST_PORT||4330),base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.mjs'],{windowsHide:true,stdio:'pipe',env:{...process.env,PORT:String(port)}});let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Preview exited '+code)));});
 // Only this fictional transport test evaluates the serialized injection.
 // The extension's CSP is unchanged; Chrome executes its injected function.
 browser=await chromium.launch({headless:true,executablePath:process.env.WAVE_TEST_CHROME||undefined});const page=await browser.newPage({bypassCSP:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/extension/venmo-funding-fixture.html');await page.waitForFunction(()=>!!globalThis.directEditorFixture);
 const result=await page.evaluate(async()=>{
  const {readWavePage}=await import('/extension/live-reader.js'),{fundingWaveAdapter}=await import('/extension/venmo-funding-wave.js');
  const business='11111111-1111-1111-1111-111111111111',id='123',url='https://next.waveapps.com/'+business+'/transactions/'+id;
  let f=directEditorFixture(),context=f.context;context.location.href=url;document.getElementById('editor').replaceChildren();
  // Delay the DOM mount, not the caller timer. The observer must resolve on it.
  const waiting=readWavePage({...context,waitForReady:{business,id}});
  setTimeout(()=>{f=directEditorFixture();},20);const mounted=await waiting;
  if(mounted.identity.transaction!==id||mounted.fields.amount!=='100.00')throw Error('Delayed mount was not read');
  context=f.context;context.location.href=url;context.location.href=url.replace('/123','/456');
  const wrong=readWavePage({...context,waitForReady:{business,id,timeoutMs:1000}});const timeout=await wrong;
  if(!timeout.problems.some(p=>/Timed out/.test(p)))throw Error('Another full transaction was accepted');
  // Exercise the actual adapter through an isolated fake Chrome transport.
  context.location.href=url;let injections=0,callerWaits=0;
  const api={tabs:{getCurrent:async()=>({windowId:1}),create:async()=>({id:99}),get:async()=>({id:99,url,status:'complete'})},scripting:{executeScript:async({func,args})=>{injections++;const injected=(0,eval)('('+func.toString()+')');return [{result:await injected({...context,...args[0]})}];}}};
  const adapter=fundingWaveAdapter({business,api,wait:async()=>{callerWaits++;},isCurrent:()=>true});
  const snapshot=await adapter.read({id});
  return {identity:snapshot.identity,injections,callerWaits,writes:f.state().saveClicks+f.state().optionClicks+f.state().reviewClicks,timeoutProblems:timeout.problems};
 });
 assert.equal(result.identity.transaction,'123');assert.equal(result.injections,1);assert.equal(result.callerWaits,1);assert.equal(result.writes,0);assert.deepEqual(errors,[]);
 console.log('Venmo read browser checks passed: delayed DOM mount, wrong-record timeout, one actual adapter injection, no repeated snapshot polling and zero financial clicks.');
}finally{await browser?.close();server.kill();}
