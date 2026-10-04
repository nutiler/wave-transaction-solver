// Fictional Chrome bindings for the local integration preview only.
async function storage(key, value) {
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('wave-solver-local',1);r.onupgradeneeded=()=>r.result.createObjectStore('session');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try {return await new Promise((resolve,reject)=>{const tx=db.transaction('session',value?'readwrite':'readonly'),store=tx.objectStore('session');let result;const r=store.get('fictional-chrome-storage');r.onsuccess=()=>{const saved=r.result || {};if(value){Object.assign(saved,value);store.put(saved,'fictional-chrome-storage');}result=key?{[key]:saved[key]}:saved;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}
}
window.chrome={runtime:{id:'fictional-local-test'},storage:{local:{get:key=>storage(key),set:value=>storage(null,value)}},tabs:{query:async()=>[],onRemoved:{addListener(){}},onUpdated:{addListener(){}}},scripting:{executeScript(){throw Error('No Wave access in fictional integration preview.');}}};
document.addEventListener('click',event=>{if(event.target.tagName==='BUTTON' && event.target.textContent==='Accept rule')document.body.dataset.acceptScrollBefore=String(window.scrollY);},true);
await import('./app.js');
