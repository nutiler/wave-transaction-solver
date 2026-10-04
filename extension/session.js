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
