import {activity,withActivity,paintActivity} from './activity.js';
const delay=()=>new Promise(resolve=>setTimeout(resolve,120));
activity.begin('Preparing fictional preview').finish();
document.getElementById('run').onclick=async()=>{
 const output=document.getElementById('checks');output.replaceChildren();let passed=0;
 const check=(name,ok)=>{const li=document.createElement('li');li.textContent=(ok?'PASS ':'FAIL ')+name;output.append(li);if(ok)passed++;};
 const unknown=activity.begin('Reading fictional list');await paintActivity();check('Unknown totals show a moving bar without a percentage',!document.querySelector('#solverActivity progress').hasAttribute('value'));
 const batch=activity.begin('Processing fictional expenses',{total:3,priority:10});batch.update({completed:1});const nested=activity.begin('Saving fictional record');check('Actual batch count survives nested saves',document.querySelector('#solverActivity span').textContent.startsWith('1 of 3'));
 nested.finish();unknown.finish();check('Another task finishing does not announce Ready',document.querySelector('#solverActivity').dataset.state==='working');
 batch.finish();check('Ready appears only when all tasks finish',document.querySelector('#solverActivity strong').textContent==='✓ Ready');
 try{await withActivity('Fictional interrupted save',()=>{throw Error('Synthetic stop');});}catch{}check('Failed work releases busy status and retains a stopped message',document.querySelector('#solverActivity').dataset.state==='ready' && document.querySelector('#solverActivity span').textContent.includes('stopped'));
 check('Bar remains outside inert main',!document.querySelector('main').contains(document.querySelector('#solverActivity')) && getComputedStyle(document.querySelector('#solverActivity')).position==='fixed');
 document.getElementById('result').textContent=passed+' of 6 activity checks passed.';
};
document.getElementById('preview').onclick=async()=>{const task=activity.begin('Running selected expenses',{total:3,priority:10});try{for(let i=0;i<3;i++){task.update({completed:i,detail:'Fictional purchase '+(i+1)+' · checking and saving'});await new Promise(resolve=>setTimeout(resolve,4000));task.update({completed:i+1});}}finally{task.finish('3 fictional expenses completed.');}};
