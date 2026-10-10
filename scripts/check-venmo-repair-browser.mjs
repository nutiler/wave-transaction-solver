import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.WAVE_PLAYWRIGHT_ROOT||'playwright');
const port=Number(process.env.WAVE_TEST_PORT||4324),base='http://127.0.0.1:'+port,server=spawn(process.execPath,['server.mjs'],{windowsHide:true,stdio:'pipe',env:{...process.env,PORT:String(port)}});let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('Preview exited '+c)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.WAVE_TEST_CHROME||undefined});const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Fixture page error:',e.message);});
 await page.goto(base+'/extension/venmo-repair-fixture.html');await page.waitForFunction(()=>!!globalThis.repairFixture);
 await page.getByRole('button',{name:'Run financial form checks',exact:true}).click();await page.waitForFunction(()=>/^\d+ of 7 passed$/.test(document.getElementById('formStatus').textContent));assert.equal(await page.locator('#formStatus').textContent(),'7 of 7 passed',await page.locator('#formResults').textContent());
 await page.getByRole('button',{name:'Check fixes in Wave',exact:true}).click();await page.waitForFunction(()=>document.getElementById('venmoRepairStatus').textContent.includes('7 checks passed'));assert.equal(await page.evaluate(()=>repairFixture.writes()),0);
 const lease=await page.evaluate(async()=>{const {claimVenmoLease,releaseVenmoLease}=await import('/extension/session.js');const business='11111111-1111-1111-1111-111111111111';await claimVenmoLease(business,'fictional-owner');let blocked=false;try{await claimVenmoLease(business,'other-owner');}catch{blocked=true;}await releaseVenmoLease(business,'other-owner');let stillBlocked=false;try{await claimVenmoLease(business,'other-owner');}catch{stillBlocked=true;}await releaseVenmoLease(business,'fictional-owner');return {blocked,stillBlocked};});assert.deepEqual(lease,{blocked:true,stillBlocked:true});
 await page.getByRole('button',{name:'Do fixes',exact:true}).click();await page.waitForFunction(()=>/fixes verified|Prepared fixes stopped:/.test(document.getElementById('venmoRepairStatus').textContent));assert.match(await page.locator('#venmoRepairStatus').textContent(),/7 \/ 7 fixes verified/);assert.equal(await page.evaluate(()=>repairFixture.writes()),7);assert(await page.getByRole('button',{name:'Do fixes',exact:true}).isDisabled());
 assert.match(await page.locator('#venmoRepairBatch').textContent(),/Projected balance after verified fixes: \$7\.00/);
 fs.mkdirSync('data/qa',{recursive:true});await page.screenshot({path:'data/qa/venmo-repair-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'data/qa/venmo-repair-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.reload();await page.waitForFunction(()=>!!globalThis.repairFixture);assert(await page.getByRole('button',{name:'Do fixes',exact:true}).isDisabled());assert.equal(await page.evaluate(()=>repairFixture.writes()),0);
 await page.evaluate(()=>repairFixture.other());assert(await page.getByRole('button',{name:'Do fixes',exact:true}).isDisabled());await page.evaluate(()=>repairFixture.original());assert(await page.getByRole('button',{name:'Do fixes',exact:true}).isDisabled());assert.deepEqual(errors,[]);
 console.log('Prepared Venmo browser checks passed: 7 financial form cases, one-click batch, read-only preflight, persisted receipts, cross-window lease, reload, business isolation and mobile layout.');
}finally{await browser?.close();server.kill();}
