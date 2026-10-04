export function businessFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://next.waveapps.com') return null;
    return url.pathname.match(/^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)?.[1] || null;
  } catch { return null; }
}
export function onlyBusiness(tabs) {
  const businesses = [...new Set(tabs.map(tab=>businessFromUrl(tab.url)).filter(Boolean))];
  return businesses.length === 1 ? businesses[0] : null;
}
export function exportUrlFor(business, exportPages = {}) {
  const value = exportPages[business];
  try {
    const url = new URL(value);
    return url.origin === 'https://accounting.waveapps.com' && /^\/settings\/export\/\d+\/$/.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export async function openBackgroundTab(tabs, url, tabId = null) {
  if (tabId !== null) return tabs.update(tabId, { url, active: false });
  const solver = await tabs.getCurrent();
  if (!Number.isInteger(solver?.windowId)) throw new Error('Could not identify the solver’s Chrome window.');
  return tabs.create({ url, active: false, windowId: solver.windowId });
}
export async function waitForLiveSnapshot(read, isCurrent, wait = ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  let last = null, error = null;
  for (let attempt=0; attempt<20; attempt++) {
    await wait(attempt === 0 ? 1500 : 500);
    if (!isCurrent()) return null;
    try {
      last = await read(); error = null;
      if (!isCurrent()) return null;
      if (last?.identity?.transaction && ['date','description','account','amount','type','category'].every(name=>typeof last.fields?.[name] === 'string' && last.fields[name].trim())) return last;
    } catch(e) { error=e; }
  }
  if (!isCurrent()) return null;
  if (error) throw error;
  if (!last) throw new Error('Wave did not return transaction details. Try Read live details again.');
  return last;
}
