import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.WAVE_PLAYWRIGHT_ROOT||'playwright');
const port=Number(process.env.WAVE_TEST_PORT||4320),base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.mjs'],{stdio:'pipe',windowsHide:true,env:{...process.env,PORT:String(port)}});
let browser;
try {
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Fixture server exited '+code)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.WAVE_TEST_CHROME||undefined});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/extension/editor-fixture.html');await page.getByRole('button',{name:'Run editor checks',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('result').textContent!=='Ready');
 const checks=await page.locator('#checks li').allTextContents();assert.equal(checks.length,57);assert(checks.every(c=>c.startsWith('PASS ')),checks.filter(c=>!c.startsWith('PASS ')).join('\n'));
 console.log('All 57 injected editor checks passed, including AI confirm/change/review, portal spans, disabled/ambiguous actions, and no duplicate Save.');
 await page.goto(base+'/extension/reader-fixture.html');const reader=await page.locator('body').innerText();assert(!/FAIL/.test(reader),reader);assert(reader.includes('Review updates remains distinct'),reader);assert.deepEqual(errors,[]);
 console.log('Read-only reader checks passed; AI menu metadata never asserts Reviewed. Zero real Wave calls.');
} finally {await browser?.close();server.kill();}
