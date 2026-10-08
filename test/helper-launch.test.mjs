import test from 'node:test';
import assert from 'node:assert/strict';
import {installHelperLaunch} from '../extension/helper-launch.js';
test('home launch pauses for missing setup and consumes the deliberate request once',async()=>{
 const old=Object.fromEntries(['location','history','document','window'].map(k=>[k,globalThis[k]]));let clicks=0;const status={textContent:''},listeners={};globalThis.location={hash:'#collect',pathname:'/helper.html',search:''};globalThis.history={replaceState(){location.hash='';}};globalThis.document={getElementById:id=>id==='status'?status:{disabled:true,click:()=>clicks++},querySelectorAll:()=>[]};globalThis.window={addEventListener:(name,fn)=>listeners[name]=fn};
 try{installHelperLaunch();await new Promise(r=>setTimeout(r,0));assert.equal(clicks,0);assert.match(status.textContent,/setup/);listeners.hashchange();assert.equal(clicks,0);assert.equal(location.hash,'');}finally{for(const [key,value] of Object.entries(old))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
