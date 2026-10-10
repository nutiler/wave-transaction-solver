export function validSession(value) {
  return !!value && value.version === 1 && (value.business === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.business)) && typeof value.csvText === 'string' && value.csvText.length <= 30 * 1024 * 1024 && typeof value.sourceName === 'string' && typeof value.sample === 'boolean';
}
async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('wave-solver-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('session');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadSession() {
  const db = await database();
  try {
    return await new Promise((resolve,reject) => {
      const transaction = db.transaction('session','readonly');
      const request = transaction.objectStore('session').get('current');
      transaction.oncomplete = () => resolve(validSession(request.result) ? request.result : null);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export async function saveSession(value) {
  if (!validSession(value)) throw new Error('Invalid session snapshot.');
  const db = await database();
  try {
    await new Promise((resolve,reject) => {
      const transaction = db.transaction('session','readwrite');
      transaction.objectStore('session').put(value,'current');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
// Separate local feature records share the existing IndexedDB store, never the current session key.
export async function loadLocalFeature(key){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('session','readonly'),request=tx.objectStore('session').get(key);tx.oncomplete=()=>resolve(request.result||null);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function saveLocalFeature(key,value){if(!/^(amazon|remaining|venmo|paypal|downloads|solvers|operator|command|prepared|migration|finance):/.test(key))throw Error('Unsupported feature storage key.');const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('session','readwrite');tx.objectStore('session').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
// Read every feature, including directory handles and uncertain-save checkpoints.
export async function localRecords() {
 const db=await database();
 try {return await new Promise((resolve,reject)=>{
  const tx=db.transaction('session','readonly'),store=tx.objectStore('session'),keys=store.getAllKeys(),values=store.getAll();
  tx.oncomplete=()=>resolve(keys.result.map((key,i)=>({key,value:values.result[i]})));
  tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });} finally {db.close();}
}
export async function writeLocalRecords(records) {
 const db=await database();
 try {await new Promise((resolve,reject)=>{
  const tx=db.transaction('session','readwrite'),store=tx.objectStore('session');
  for(const {key,value} of records)store.put(value,key);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });} finally {db.close();}
}
// A single locally stored project root is shared by the command center and helpers.
export async function projectDataFolder(){const saved=await loadLocalFeature('downloads:folders');return saved?.version===1&&saved.data?.name?.toLowerCase()==='data'?saved.data:null;}
export async function rememberDataFolder(folder){if(folder?.name?.toLowerCase()!=='data')throw Error('Choose the data folder in your wave-solver project.');await saveLocalFeature('downloads:folders',{version:1,data:folder,inbox:null});return folder;}

// Compare-and-set prevents two solver windows from writing Venmo concurrently.
export async function claimVenmoLease(business,owner,now=Date.now()){
 if(!/^[0-9a-f-]{36}$/i.test(business||'')||typeof owner!=='string'||!owner)throw Error('Invalid Venmo run lease.');
 const db=await database(),key='venmo:write-lease:'+business;
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('session','readwrite'),store=tx.objectStore('session'),request=store.get(key);let failure=null;
 request.onsuccess=()=>{const old=request.result;if(old&&old.owner!==owner&&old.expiresAt>now){failure=Error('Another solver window is checking or applying Venmo repairs. Finish or stop that run first.');tx.abort();return;}store.put({business,owner,expiresAt:now+300000},key);};
 tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||Error('Venmo lease was not saved.'));});}finally{db.close();}
}
export async function releaseVenmoLease(business,owner){const db=await database(),key='venmo:write-lease:'+business;try{await new Promise((resolve,reject)=>{const tx=db.transaction('session','readwrite'),store=tx.objectStore('session'),request=store.get(key);request.onsuccess=()=>{if(request.result?.owner===owner)store.delete(key);};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function updateLocalFeature(key,update){if(!/^venmo:/.test(key)||typeof update!=='function')throw Error('Unsupported atomic feature update.');const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('session','readwrite'),store=tx.objectStore('session'),request=store.get(key);let value,failure;request.onsuccess=()=>{try{value=update(request.result||null);store.put(value,key);}catch(e){failure=e;tx.abort();}};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error);});}finally{db.close();}}
