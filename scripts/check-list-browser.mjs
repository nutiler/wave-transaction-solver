import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.WAVE_PLAYWRIGHT_ROOT||'playwright'),port=Number(process.env.WAVE_LIST_TEST_PORT||4325),server=spawn(process.execPath,['server.mjs'],{windowsHide:true,stdio:'pipe',env:{...process.env,PORT:String(port)}});let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('Preview exited '+c)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.WAVE_TEST_CHROME||undefined});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+port+'/extension/list-fixture.html');await page.locator('#run').click();await page.waitForFunction(()=>/passed, \d+ failed/.test(document.getElementById('result').textContent),undefined,{timeout:120000});
 assert.match(await page.locator('#result').innerText(),/, 0 failed/,await page.locator('#checks').innerText());assert.equal(await page.locator('#checks li').filter({hasText:/^FAIL/}).count(),0);assert.equal(await page.locator('#checks li').filter({hasText:'External scan driver:'}).count(),8);assert.deepEqual(errors,[]);
 console.log('Live-list browser checks passed: suspended background timers, loaded-row resume and freshness, row-cache reuse, scope rejection, count/selection safety and existing list regressions.');
}finally{await browser?.close();server.kill();}
