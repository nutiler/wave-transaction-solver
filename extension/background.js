chrome.action.onClicked.addListener(async tab => {
  const existing = (await chrome.tabs.query({ url: `${chrome.runtime.getURL('app.html')}*` }))[0];
  if (existing) { await chrome.tabs.reload(existing.id); await chrome.tabs.update(existing.id, { active: true }); return; }
  const url = new URL(chrome.runtime.getURL('app.html'));
  if (tab.url?.startsWith('https://next.waveapps.com/')) url.searchParams.set('waveTab', String(tab.id));
  await chrome.tabs.create({ url: url.href });
});
// Keep saved merchant rules accessible only to extension pages, not webpage scripts.
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  // Refresh an already-open solver after an unpacked-extension update/reload.
  const tabs = await chrome.tabs.query({ url: `${chrome.runtime.getURL('app.html')}*` });
  await Promise.allSettled(tabs.map(tab => chrome.tabs.reload(tab.id)));
});
