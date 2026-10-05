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

// Read-only navigation after a possible save. Never issues an editing action.
export async function reopenSavedTransaction(tabs, tabId, business, id, isCurrent, wait = ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  const url = 'https://next.waveapps.com/' + business + '/transactions/' + id;
  if (businessFromUrl(url) !== business || !/^\d+$/.test(id || '')) throw new Error('Invalid saved-record identity.');
  const guard = () => { if (!isCurrent()) throw new Error('Selection changed during saved-result verification.'); };
  const checkBusiness = tab => {
    for (const value of [tab.url, tab.pendingUrl].filter(Boolean)) {
      if (businessFromUrl(value) !== business) throw new Error('The Wave tab changed businesses. Reopen the intended record before verifying.');
    }
  };
  guard();
  let tab = null;
  if (tabId !== null) { try { tab = await tabs.get(tabId); } catch { /* A closed test tab is replaced in the solver window. */ } }
  let fresh = !tab;
  if (fresh) { guard(); tab = await openBackgroundTab(tabs, url); }
  else {
    checkBusiness(tab);
    // Save can still be navigating back to the list. Let it settle first.
    for (let i=0; (tab.status === 'loading' || tab.pendingUrl) && i<50; i++) {
      guard(); await wait(100);
      try { tab = await tabs.get(tab.id); } catch { guard(); tab = await openBackgroundTab(tabs,url); fresh = true; break; }
      checkBusiness(tab);
    }
    if (!fresh) {
      guard();
      if (tab.status === 'loading' || tab.pendingUrl) throw new Error('Wave is still finishing its navigation. Try Recheck saved result again shortly.');
      if (tab.url === url) await tabs.reload(tab.id);
      else await tabs.update(tab.id, { url, active: false });
      // Do not reload after update: it can cancel the transaction navigation.
    }
  }
  const targetId = tab.id;
  for (let i=0; i<100; i++) {
    guard(); await wait(100);
    tab = await tabs.get(targetId); checkBusiness(tab);
    if (tab.url === url && tab.status === 'complete' && !tab.pendingUrl) return tab;
  }
  throw new Error('Wave did not finish opening the saved transaction. Use Recheck saved result; Save will not be repeated.');
}

// Keep full-history pairing evidence, but never plan a closed-period counterpart.
export function workingQueue(queue, from = '2025-01-01') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(Date.parse(from)) || new Date(from).toISOString().slice(0,10)!==from) throw Error('Choose a valid bookkeeping start date.');
  return queue.filter(t=>t.date>=from).map(t=>t.partner && t.partner.date<from ? {...t,kind:'Manual review',proposed:'',partner:null,reason:'The matching counterpart is before the bookkeeping start date. Earlier periods are complete; review this boundary movement separately.'} : t);
}

// Choose one visible matching submenu, while keeping useful diagnostics for closed copies.
export async function captureTransferMenuFromTabs(tabs,business,id,preferredTab,read){
 const candidates=tabs.filter(tab=>{try{const url=new URL(tab.url);return url.origin==='https://next.waveapps.com' && url.pathname==='/'+business+'/transactions/'+id;}catch{return false;}});
 if(!candidates.length)throw Error('No Wave tab shows this pair’s money-out transaction. Click Open money-out in Wave, then open Category → Transfer to Bank, Credit Card, or Loan in that tab.');
 const reports=[],tabChecks=[];
 for(const tab of candidates){
  try{const r=await read(tab.id);if(r?.identity?.business!==business || r.identity.transaction!==id){tabChecks.push({tabId:tab.id,problem:'The tab navigated away from the expected money-out record.'});continue;}reports.push({...r,tabId:tab.id});tabChecks.push({tabId:tab.id,matchingGroups:r.matchingGroups,problems:r.problems || []});}
  catch(e){tabChecks.push({tabId:tab.id,problem:e.message});}
 }
 const open=reports.filter(r=>r.matchingGroups>0);
 if(open.length>1)throw Error('Matching submenus are open in multiple copies of the money-out transaction. Close the extra submenus, then read again.');
 const selected=open[0] || reports.find(r=>r.tabId===preferredTab) || reports.find(r=>r.menuHtml?.length) || reports[0];
 if(!selected)throw Error('The money-out tabs could not be read. Click Open money-out in Wave and let the transaction finish loading, then open its transfer submenu.');
 return {...selected,tabChecks};
}
