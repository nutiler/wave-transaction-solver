import { readTransferMenu } from './transfer-menu.js';
import { transferPairs,prepareTransferEdit,verifyTransferResult } from './transfers.js';
import { installTransferReview } from './transfer-view.js';
import { validateRule } from './rules.js';
import { installProposalReview } from './proposal-view.js';
import { prepareCategoryEdit, editWaveTransaction, verifyCategoryResult, resetAttemptReceipt } from './editor.js';
import { defaultRules, importAccounting, proposals, waveIdentity, compareLive, normalize } from './model.js';
import { readWavePage } from './live-reader.js';
import { historySuggestions } from './history.js';
import { actionable, buildPlan, validatePlan } from './plan.js';
import { readWaveChart } from './chart-reader.js';
import { validateCatalog, categoryNames } from './catalog.js';
import { loadSession, saveSession } from './session.js';
import { workingQueue, businessFromUrl, onlyBusiness, waitForLiveSnapshot, openBackgroundTab, exportUrlFor, reopenSavedTransaction } from './workflow.js';
const $ = id => document.getElementById(id);
const make = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
const extensionMode = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
let rules = defaultRules.map(r => ({ ...r, aliases: [...r.aliases] })), dataset = null, queue = [], business = null, chosen = null, liveTab = null, sampleMode = false;
const shortlist = new Set();
let sourceName = '', loadedPlan = null;
let proposalPack = null, proposalDecisions = {}, proposalFileName = "";
let catalog = null, chartTab = null, chartCollecting = false;
let csvText = '', importedAt = '', restoring = true, saveChain = Promise.resolve();
let exportPages = {};
try { exportPages = (await import('./settings.local.js')).exportPages || {}; } catch { /* Optional, private configuration. */ }
let liveGeneration = 0;
let lastLiveSnapshot = null, applying = false, editReceipts = {};
const receiptKey = () => business + ':' + chosen?.id;
let exportTab = null, liveStepLabel = 'Not checked';
const stepKeys = ['setup','chart','import','merchant','proposals','history','queue','transfers','live','plan'];
const stepComplete = new Map();
function stepStatus(key, text, complete = false, foldOnComplete = false) {
  const badge = $(`step-${key}-status`); badge.textContent = `${complete ? '✓ ' : ''}${text}`; badge.classList.toggle('complete',complete);
  if (foldOnComplete && complete && !stepComplete.get(key)) $(`fold-${key}`).open = false;
  stepComplete.set(key,complete);
}
function updateSteps() {
  stepStatus('setup',business ? 'Business selected' : 'Choose business',!!business,true);
  stepStatus('chart',catalog ? `${catalog.groups.reduce((n,g)=>n+g.accounts.length,0)} names saved` : 'Collect names',!!catalog,true);
  stepStatus('import',dataset ? `${sampleMode ? 'Sample · ' : ''}${dataset.transactions.length.toLocaleString()} transactions loaded` : 'Import CSV',!!dataset,true);
  stepStatus('merchant',`${rules.length} rules saved`,rules.length>0,true);
  stepStatus('proposals',proposalPack ? Object.values(proposalDecisions).filter(d=>d==='accepted').length+' proposals accepted' : 'Import proposal pack');
  stepStatus('history','Optional suggestions');
  stepStatus('queue',dataset ? `${queue.length.toLocaleString()} proposals to inspect` : 'Import CSV first');
  stepStatus('transfers',transferPairs(queue).length+' candidate pairs');
  stepStatus('live',liveStepLabel,liveStepLabel==='Fields match');
  stepStatus('plan',shortlist.size ? `${shortlist.size} records in draft` : 'Choose proposals');
  $('openExport').disabled = !extensionMode || !exportUrlFor(business, exportPages);
  $('readChart').classList.toggle('secondary', !chartTab);
  $('readChart').disabled = chartCollecting || !extensionMode || !business || !chartTab;
}
const filterIds = ['search', 'kind', 'from', 'through', 'historySearch', 'chartSearch', 'proposalSearch', 'proposalFilter', 'workFrom', 'transferSearch'];
const draftIds = ['ruleName', 'aliases', 'category'];
function rememberSession() {
  if (restoring) return Promise.resolve();
  const snapshot = { version: 1, business, csvText, sourceName, importedAt, sample: sampleMode, chosenId: chosen?.id || null, liveTab, chartTab, shortlist: [...shortlist], loadedPlan, proposalPack, proposalDecisions, proposalFileName, folds: Object.fromEntries(stepKeys.map(key=>[key,$(`fold-${key}`).open])), filters: Object.fromEntries(filterIds.map(id => [id, $(id).value])), draft: Object.fromEntries(draftIds.map(id => [id,$(id).value])) };
  saveChain = saveChain.catch(()=>{}).then(()=>saveSession(snapshot));
  return saveChain;
}
function rememberSoon() { void rememberSession().catch(e => { $('sessionStatus').textContent = `Session could not be saved locally: ${e.message}`; }); }
async function loadCatalog() {
  catalog = null;
  if (extensionMode && business) {
    const savedChart = (await chrome.storage.local.get('solverCharts')).solverCharts?.[business];
    if (savedChart) { try { catalog = validateCatalog(savedChart, business); } catch { /* Incomplete collections are not restored. */ } }
  }
  $('chartStatus').textContent = catalog ? `${catalog.groups.reduce((n,g)=>n+g.accounts.length,0)} names loaded for this business. Collected ${catalog.capturedAt}.` : 'No chart collected for this business.';
  renderCatalog(); renderCategories();
  updateSteps();
}
function renderCategories() {
  $('categories').replaceChildren(...categoryNames(sampleMode ? null : catalog, dataset?.categories || []).map(name => { const option = make('option'); option.value = name; return option; }));
}
function renderCatalog() {
  $('chartNames').replaceChildren();
  if (!catalog) return;
  const query = $('chartSearch').value.toLowerCase();
  for (const group of catalog.groups) {
    const accounts = group.accounts.filter(a => `${a.name} ${a.number || ''}`.toLowerCase().includes(query));
    const details = make('details'), summary = make('summary', `${group.name} · ${accounts.length} of ${group.accounts.length} names · Wave tab count ${group.expected}`); details.open = !!query;
    details.append(summary);
    for (const account of accounts) { const line = make('p', account.name); if (account.number) line.append(make('small', ` · Account number ${account.number}`)); details.append(line); }
    $('chartNames').append(details);
  }
}
$('chartSearch').oninput = renderCatalog;
$('openChart').onclick = handleChartOpen;
async function handleChartOpen() {
  try {
    error();
    if (!extensionMode || !business) throw new Error('Choose your Wave business in section 1 first.');
    const url = `https://next.waveapps.com/${business}/accounting/charts`;
    const existing = (await chrome.tabs.query({ url: 'https://next.waveapps.com/*' })).find(tab => tab.url === url);
    const tab = existing || await openBackgroundTab(chrome.tabs,url); chartTab = tab.id;
    updateSteps();
    await rememberSession();
    $('chartStatus').textContent = 'Chart of Accounts opened in a background tab. Click Collect all five tabs when it has loaded.';
  } catch (e) { error(e.message); $('chartStatus').textContent = e.message; }
}
function error(message = '') { $('error').textContent = message; }
if (extensionMode) {
  try { const saved = (await chrome.storage.local.get('solverRules')).solverRules; if (Array.isArray(saved) && saved.every(r => typeof r.name === 'string' && typeof r.category === 'string' && Array.isArray(r.aliases) && r.aliases.length && r.aliases.every(a => typeof a === 'string' && a.trim()))) rules = saved; } catch { error('Saved rules could not be read. Using the starter fuel rules.'); }
} else $('connection').textContent = 'Browser preview: Wave connections require loading the Chrome extension.';
async function refreshTabs() {
  $('waveTabs').replaceChildren();
  if (!extensionMode) { $('waveTabs').append(make('option', 'Install the extension to select a Wave tab')); return; }
  const tabs = await chrome.tabs.query({ url: 'https://next.waveapps.com/*' });
  for (const tab of tabs) {
    const tabBusiness = businessFromUrl(tab.url); if (!tabBusiness) continue;
    const option = make('option', `${tab.title || 'Wave'} · ${tabBusiness}`); option.value = String(tab.id); option.dataset.business = tabBusiness; $('waveTabs').append(option);
  }
  if (!$('waveTabs').options.length) { const option = make('option', 'Open your Wave Transactions page, then refresh'); option.value = ''; $('waveTabs').append(option); }
  const launchTab = new URL(location.href).searchParams.get('waveTab');
  if (launchTab && [...$('waveTabs').options].some(o => o.value === launchTab)) $('waveTabs').value = launchTab;
  if (!business && onlyBusiness(tabs)) {
    business = onlyBusiness(tabs); await loadCatalog();
    chartTab = tabs.find(tab=>tab.url===`https://next.waveapps.com/${business}/accounting/charts`)?.id || null;
    $('connection').textContent = `Automatically selected your only open Wave business: ${business}. Confirm your CSV belongs to this business.`;
    await rememberSession();
  }
  if (business) chartTab = tabs.find(tab => tab.url === `https://next.waveapps.com/${business}/accounting/charts`)?.id || null;
  updateSteps();
  if (business) { const option = [...$('waveTabs').options].find(o => o.dataset.business === business); if (option) $('waveTabs').value = option.value; }
}
const handle = (fn, statusId) => async event => {
  try { error(); await fn(event); }
  catch (e) {
    const message = e.message || String(e);
    error(message);
    if (statusId) $(statusId).textContent = `Could not complete this step: ${message}`;
  }
};
$('openExport').onclick = handle(async () => {
  const url=exportUrlFor(business, exportPages);
  if (!extensionMode || !url) throw new Error('Configure an export-page link for the selected business in settings.local.js.');
  if (exportTab) { try { await chrome.tabs.get(exportTab); } catch { exportTab=null; } }
  const tab=await openBackgroundTab(chrome.tabs,url,exportTab); exportTab=tab.id;
  $('exportStatus').textContent = 'Wave’s export page is open in a background tab. Switch to that tab to request the CSV export; Wave will email the ZIP.';
}, 'exportStatus');
$('readChart').onclick = handle(async () => {
  if (!extensionMode || !business || !chartTab) throw new Error('Use Open Chart of Accounts first.');
  const collectingBusiness = business, tab = await chrome.tabs.get(chartTab);
  if (new URL(tab.url).pathname !== `/${collectingBusiness}/accounting/charts` || new URL(tab.url).origin !== 'https://next.waveapps.com') throw new Error('The chart tab is no longer on the selected business’s Chart of Accounts.');
  $('chartCopyStatus').textContent = '';
  chartCollecting = true; $('readChart').disabled = true; $('chartStatus').textContent = 'Collecting Assets, Liabilities & Credit Cards, Income, Expenses, and Equity…';
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId: chartTab }, func: readWaveChart, args: [collectingBusiness] });
    const snapshot = results[0]?.result;
    if (!snapshot || business !== collectingBusiness) throw new Error('The selected business changed during collection.');
    $('chartDiagnostics').textContent = JSON.stringify(snapshot, null, 2); $('chartDebug').hidden = false;
    validateCatalog(snapshot, collectingBusiness);
    const charts = (await chrome.storage.local.get('solverCharts')).solverCharts || {};
    charts[collectingBusiness] = snapshot; await chrome.storage.local.set({ solverCharts: charts }); catalog = snapshot;
    renderCatalog(); renderCategories();
    $('chartStatus').textContent = `${catalog.groups.reduce((n,g)=>n+g.accounts.length,0)} exact account names collected across all five tabs. Available in the merchant-rule Category field.`;
  } catch (e) {
    const problems = $('chartDiagnostics').textContent;
    throw new Error(`${e.message}${problems ? ' Expand Collection diagnostics to see what the reader found.' : ''}`);
  } finally { chartCollecting = false; updateSteps(); }
}, 'chartStatus');
$('refresh').onclick = handle(refreshTabs);
$('connect').onclick = handle(async () => {
  if (!extensionMode || !$('waveTabs').value) throw new Error('Open Wave in Chrome and refresh the tabs first.');
  const tab = await chrome.tabs.get(Number($('waveTabs').value)), nextBusiness = businessFromUrl(tab.url);
  if (!nextBusiness) throw new Error('The selected tab is no longer on a Wave business page.');
  if (business && business !== nextBusiness) clearImported();
  liveGeneration++;
  business = nextBusiness; liveTab = null; $('connection').textContent = `Selected business: ${business}. Confirm your imported CSV belongs to this business.`; $('liveStatus').textContent = ''; $('comparison').replaceChildren();
  chartTab = null; $('chartDebug').hidden = true;
  await loadCatalog();
  shortlist.clear(); renderQueue(); renderPlan(); validateLoadedPlan();
  await rememberSession();
});
function renderRules() {
  $('rules').replaceChildren();
  rules.forEach((r, i) => {
    const row = make('div', undefined, 'rule'), detail = make('div'); detail.append(make('strong', r.name), make('small', r.aliases.join(', ')));
    const remove = make('button', 'Remove', 'secondary'); remove.setAttribute('aria-label', `Remove ${r.name} rule`);
    remove.onclick = handle(async () => { rules.splice(i, 1); if(r.proposalId && r.business===proposalPack?.business) delete proposalDecisions[r.proposalId]; await persistRules(); renderRules(); analyze(true); void proposalReview.render(); });
    if (r.accountNames?.length || r.accountIds?.length) detail.append(make('small','Only accounts: '+(r.accountNames || r.accountIds).join(', ')));
    if (r.onlyCategories?.length) detail.append(make('small','Only current categories: '+r.onlyCategories.join('; ')));
    if (r.excludeAliases?.length) detail.append(make('small','Excluded aliases: '+r.excludeAliases.join(', ')));
    row.append(detail, make('span', r.category), remove); $('rules').append(row);
  });
  updateSteps();
}
async function persistRules() { if (extensionMode) await chrome.storage.local.set({ solverRules: rules }); }
$('ruleForm').onsubmit = handle(async event => {
  event.preventDefault();
  const name = $('ruleName').value.trim(), category = $('category').value.trim(), aliases = $('aliases').value.split(',').map(a => a.trim()).filter(Boolean);
  if (!name || !category || !aliases.length) throw new Error('Enter a merchant family, aliases, and category.');
  if ((dataset || catalog) && !categoryNames(sampleMode ? null : catalog, dataset?.categories || []).includes(category)) throw new Error('Choose an exact name from your export or collected Chart of Accounts.');
  const i = rules.findIndex(r => r.name.toLowerCase() === name.toLowerCase() && (!r.business || r.business===business));
  const rule = { ...(i>=0 ? rules[i] : {}), name, aliases, category };
  if(rule.onlyCategories) rule.onlyCategories=[category,...(dataset?.categories || []).filter(c=>/^(Uncategorized |Personal Uncategorized)/i.test(c))];
  validateRule(rule);
  if(i>=0 && rule.proposalId && (rules[i].category!==category || rules[i].name!==name || JSON.stringify(rules[i].aliases)!==JSON.stringify(aliases))) { delete proposalDecisions[rule.proposalId]; delete rule.proposalId; delete rule.sourceHash; }
  if (i >= 0) rules[i] = rule; else rules.push(rule);
  await persistRules(); renderRules(); analyze(true); $('ruleName').value = ''; $('aliases').value = '';
  $('fold-merchant').open = false;
});
function imported(text, name, isSample = false) {
  const next = importAccounting(text); dataset = next; sampleMode = isSample; chosen = null; liveTab = null;
  sourceName = name; csvText = text; importedAt = new Date().toISOString(); shortlist.clear(); $('planText').hidden = true;
  $('live').hidden = true; $('comparison').replaceChildren(); $('liveStatus').textContent = '';
  $('importStatus').textContent = `${name} · ${dataset.transactions.length.toLocaleString()} transactions · ${dataset.ledgerRows.toLocaleString()} ledger rows · ${dataset.earliest} to ${dataset.latest}. Reviewed status is not in the export.`;
  renderCategories();
  analyze();
  $('fold-import').open = false;
}
$('file').onchange = handle(async () => { const file = $('file').files[0]; if (!file) return; if (file.size > 30 * 1024 * 1024) throw new Error('Choose a CSV under 30 MB.'); imported(await file.text(), file.name); await rememberSession(); $('sessionStatus').textContent = 'Session saved locally. It will return after a reload.'; });
function clearImported() { proposalPack=null; proposalDecisions={}; proposalFileName=""; dataset = null; csvText = ''; sourceName = ''; importedAt = ''; queue = []; chosen = null; liveTab = null; sampleMode = false; shortlist.clear(); loadedPlan = null; $('file').value = ''; $('planFile').value = ''; $('queue').hidden = true; $('live').hidden = true; $('history').hidden = true; $('plan').hidden = true; $('planText').value = ''; $('planValidation').replaceChildren(); $('importStatus').textContent = 'Imported session cleared. Saved rules, business, and account names remain.'; renderCategories(); error(); transferReview.render(); void proposalReview.render(); }
$('clear').onclick = handle(async () => { clearImported(); updateSteps(); await rememberSession(); $('sessionStatus').textContent = 'Saved CSV and draft plan cleared. They will not return after a reload.'; });
$('sample').onclick = handle(async () => { imported(sampleCSV(), 'Fictional sample — cannot open these IDs in Wave', true); await rememberSession(); });
const workFrom = () => $('workFrom').value || '2025-01-01';
$('workFrom').oninput = handle(()=>analyze(true));
function analyze(preserveDraft = false, renderProposals = true) {
  if (!dataset) return;
  const previous = preserveDraft ? [...shortlist] : [];
  shortlist.clear(); $('planText').hidden = true;
  queue = workingQueue(proposals(dataset.transactions, rules, 5, business), workFrom()).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  for (const id of previous) { const t=queue.find(t=>t.id===id); if(t && actionable(t)) {shortlist.add(id);if(t.partner)shortlist.add(t.partner.id);} }
  $('queue').hidden = false;
  $('counts').textContent = `${queue.filter(t => t.kind === 'Merchant rule').length} merchant suggestions · ${new Set(queue.filter(t => t.kind === 'Transfer candidate').map(t => [t.id, t.partner.id].sort().join(':'))).size} transfer pairs`;
  if (chosen) { chosen = queue.find(t => t.id === chosen.id); if(chosen)select(chosen, false);else {liveGeneration++;lastLiveSnapshot=null;liveStepLabel='Not checked';$('live').hidden=true;updateApply();} }
  renderQueue();transferReview.render();
  renderHistory(); renderPlan(); validateLoadedPlan();
  if(renderProposals)void proposalReview.render();
  rememberSoon();
}
function renderQueue() {
  const text = $('search').value.toLowerCase(), kind = $('kind').value, from = $('from').value, through = $('through').value;
  const list = queue.filter(t => (!kind || t.kind === kind) && (!from || t.date >= from) && (!through || t.date <= through) && `${t.id} ${t.description} ${t.primary?.account || ''} ${t.categories.join(' ')} ${t.proposed}`.toLowerCase().includes(text));
  $('queueInfo').textContent = `Showing ${Math.min(list.length, 150)} of ${list.length.toLocaleString()} matches from ${workFrom()}. Transactions before that date are treated as completed and excluded from the working queue and draft. Both sides of in-period transfer pairs are listed. Current-period reviewed status still needs a live check.`;
  $('rows').replaceChildren();
  for (const t of list.slice(0, 150)) {
    const tr = make('tr'), date = make('td', t.date); date.append(make('small', t.id));
    const desc = make('td', t.description); desc.append(make('small', t.primary?.account || 'Multiple/no bank postings'));
    const current = make('td', t.categories.join(' + ') || 'Multiple bank/card postings');
    const action = make('td'); action.append(make('strong', t.kind), make('p', t.proposed), make('small', t.reason));
    const button = make('button', 'Inspect', 'secondary'); button.setAttribute('aria-label', `Inspect transaction ${t.id}`); button.onclick = () => select(t);
    const cell = make('td');
    if (actionable(t)) {
      const label = make('label', undefined, 'plan-choice'), check = make('input'); check.type = 'checkbox'; check.checked = shortlist.has(t.id); check.setAttribute('aria-label', `Plan transaction ${t.id}`);
      check.onchange = () => {
        const ids = t.partner ? [t.id, t.partner.id] : [t.id];
        for (const id of ids) { if (check.checked) shortlist.add(id); else shortlist.delete(id); }
        $('planText').hidden = true; renderQueue(); renderPlan(); rememberSoon();
      };
      label.append(check, make('span', 'Plan')); cell.append(label);
    }
    cell.append(button);
    tr.append(date, desc, make('td', t.amount === null ? '—' : `${t.direction === 'out' ? 'Out' : 'In'} ${(t.amount / 100).toFixed(2)}`), current, action, cell); $('rows').append(tr);
  }
}
for (const id of ['search', 'kind', 'from', 'through']) $(id).oninput = renderQueue;
function renderHistory() {
  if (!dataset) return;
  $('history').hidden = false;
  const query = $('historySearch').value.toLowerCase();
  const items = historySuggestions(dataset.transactions, rules, 3, business).filter(g => `${g.merchant} ${g.distribution.map(c => c.category).join(' ')}`.toLowerCase().includes(query));
  $('historyInfo').textContent = `Showing ${Math.min(items.length, 30)} of ${items.length} repeated descriptions not already covered by your rules.`;
  $('historyRows').replaceChildren();
  for (const g of items.slice(0, 30)) {
    const row = make('tr'), merchant = make('td', g.merchant); merchant.append(make('small', `Latest: ${g.latest}. ${g.accounts.length} account(s).`));
    const categories = make('td', g.distribution.length ? g.distribution.map(c => `${c.category}: ${c.count}`).join('; ') : 'No established expense category');
    categories.append(make('small', `${g.unresolved} uncategorized or not a single expense category. ${g.mixed ? 'Conflicting history: choose a category yourself.' : g.known < 3 ? 'Fewer than three categorized examples: choose a category yourself.' : 'Suggestion only: confirm the purchase purpose.'}`));
    const action = make('td'), prepare = make('button', g.category ? 'Prepare rule' : 'Choose rule', 'secondary'); prepare.setAttribute('aria-label', `Prepare rule for ${g.merchant}`);
    prepare.onclick = () => { $('ruleName').value = g.merchant.slice(0, 100); $('aliases').value = normalize(g.merchant).slice(0, 400); $('category').value = g.category; $('fold-merchant').open = true; $('ruleForm').scrollIntoView({ behavior: 'smooth' }); $('ruleName').focus(); };
    action.append(prepare); row.append(merchant, make('td', String(g.count)), categories, action); $('historyRows').append(row);
  }
}
$('historySearch').oninput = renderHistory;
function renderPlan() {
  $('plan').hidden = !dataset;
  const pairs = new Set(queue.filter(t => shortlist.has(t.id) && t.partner).map(t => [t.id, t.partner.id].sort().join(':'))).size;
  const singles = queue.filter(t => shortlist.has(t.id) && !t.partner).length;
  $('planStatus').textContent = `${singles} merchant proposal(s) and ${pairs} transfer pair(s) shortlisted. ${shortlist.size} records in this draft. ${Object.entries(editReceipts).filter(([key, receipt]) => key.startsWith(business + ':') && receipt.saveAttempted).length} local Apply attempt(s); inspect their saved results in section 5.`;
  $('downloadPlan').disabled = !shortlist.size;
  updateSteps(); updateApply();
}
$('clearPlan').onclick = () => { shortlist.clear(); $('planText').hidden = true; renderQueue(); renderPlan(); };
$('downloadPlan').onclick = handle(() => {
  const plan = buildPlan(queue, shortlist, { business, sourceName, sample: sampleMode });
  const text = JSON.stringify(plan, null, 2); $('planText').value = text; $('planText').hidden = false;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = make('a'); anchor.href = url; anchor.download = sampleMode ? 'fictional-solver-draft.json' : 'wave-solver-draft.json'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('planFile').onchange = handle(async () => { const file = $('planFile').files[0]; if (!file) return; if (file.size > 20 * 1024 * 1024) throw new Error('Choose a plan under 20 MB.'); loadedPlan = JSON.parse(await file.text()); validateLoadedPlan(); await rememberSession(); });
function validateLoadedPlan() {
  updateApply();
  $('planValidation').replaceChildren();
  if (!loadedPlan) return;
  if (!dataset || !business) { $('planValidation').append(make('p', 'Import a fresh real export and choose the same Wave business to compare this plan.')); return; }
  try {
    const results = validatePlan(loadedPlan, dataset.transactions.filter(t=>t.date>=workFrom()), business), stale = results.filter(r => r.state === 'Stale');
    $('planValidation').append(make('p', `${results.length} planned action(s): ${stale.length} stale, ${results.length - stale.length} unchanged in the export. All still require live Wave validation.`));
    for (const r of stale.slice(0, 30)) $('planValidation').append(make('p', r.problems.join('; ')));
  } catch (e) { $('planValidation').append(make('p', e.message)); }
}
function select(t, scroll = true) {
  liveGeneration++;
  liveStepLabel = 'Not checked'; if(scroll)$('fold-live').open = true; updateSteps();
  lastLiveSnapshot = null;
  chosen = t; $('applyStatus').textContent = ''; updateApply(); $('live').hidden = false; $('selected').textContent = `${t.date} · ${t.description} · ID ${t.id}. ${t.kind}: ${t.proposed || t.reason}`;
  $('counterpart').hidden = !t.partner;
  $('open').disabled = !extensionMode || sampleMode; $('read').disabled = !extensionMode || sampleMode;
  $('counterpart').disabled = !extensionMode || sampleMode;
  $('comparison').replaceChildren(); $('diagnostics').hidden = true; $('diagnosticToggle').hidden = true; $('copyDiagnostics').hidden = true; $('liveCopyStatus').textContent = '';
  $('liveStatus').textContent = !extensionMode ? 'Live checks require the installed Chrome extension.' : sampleMode ? 'Fictional samples cannot be opened in Wave.' : !business ? 'First select your Wave tab and click Use selected business in section 1 above. Then open this transaction.' : 'Not checked. Live state must be compared with this export.';
  if (scroll) $('live').scrollIntoView({ behavior: 'smooth' });
  rememberSoon();
}
async function openRecord(id) {
  if (!extensionMode) throw new Error('Open the solver from Chrome’s Extensions menu, rather than the localhost preview.');
  if (!business) throw new Error('In section 1, select your Wave tab and click Use selected business. Then return here and click Open this transaction in Wave.');
  if (sampleMode || !/^\d+$/.test(id)) throw new Error('Sample records cannot be opened in Wave.');
  const generation = ++liveGeneration, expectedBusiness = business;
  const selectionCurrent = () => liveGeneration === generation && business === expectedBusiness && chosen?.id === id;
  // Dedicated test tab keeps the user’s original Wave working tab untouched.
  const url = `https://next.waveapps.com/${business}/transactions/${id}`;
  if (liveTab) {
    try { const existing = await chrome.tabs.get(liveTab); if (waveIdentity(existing.url)?.business !== business) liveTab = null; } catch { liveTab = null; }
  }
  if (!selectionCurrent()) return;
  const openedTab = await openBackgroundTab(chrome.tabs,url,liveTab);
  if (!selectionCurrent()) return;
  liveTab = openedTab.id;
  const targetTab = liveTab;
  await rememberSession();
  if (!selectionCurrent()) return;
  $('liveStatus').textContent = 'Wave opened in the background. Waiting for transaction details…';
  const current = () => liveGeneration === generation && business === expectedBusiness && chosen?.id === id && liveTab === targetTab;
  try {
    const snapshot = await waitForLiveSnapshot(()=>captureLive(targetTab,expectedBusiness,id),current);
    if (snapshot && current()) renderLive(snapshot);
  } catch(e) { if(current()) { error(e.message); $('liveStatus').textContent = `${e.message} You can retry with Read live details.`; } }
}
$('open').onclick = handle(() => openRecord(chosen.id), 'liveStatus');
$('counterpart').onclick = handle(() => { const target = queue.find(t => t.id === chosen.partner.id); select(target); return openRecord(target.id); }, 'liveStatus');
$('read').onclick = handle(async () => {
  const generation = ++liveGeneration, selectedId = chosen?.id, expectedBusiness = business;
  if (!business || !liveTab) throw new Error('Use Open this transaction in Wave first.');
  const snapshot = await captureLive(liveTab,expectedBusiness,selectedId);
  if (generation === liveGeneration && chosen?.id === selectedId && business === expectedBusiness) renderLive(snapshot);
}, 'liveStatus');
async function captureLive(tabId,expectedBusiness,selectedId) {
  const tab = await chrome.tabs.get(tabId), identity = waveIdentity(tab.url);
  if (!identity || identity.business !== expectedBusiness || identity.transaction !== selectedId) throw new Error('The Wave test tab is not on the selected transaction. Reopen the selected ID.');
  const results = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: readWavePage });
  const snapshot = results[0]?.result;
  if (!snapshot) throw new Error('Wave returned no readable details. Wait for the dialog and try again.');
  if (snapshot.identity?.business !== expectedBusiness || snapshot.identity?.transaction !== selectedId) throw new Error('Wave navigated during the check. No match confirmed.');
  return snapshot;
}
function renderLive(snapshot) {
  lastLiveSnapshot = snapshot; updateApply();
  const receipt = editReceipts[receiptKey()];
  const result = compareLive(receipt?.categoryVerified ? { ...chosen, categories: [receipt.category] } : chosen, snapshot);
  liveStepLabel = result.state === 'Export and visible fields match' ? 'Fields match' : 'Inspect results'; updateSteps();
  $('liveStatus').textContent = `${result.state}. Reviewed status: ${result.reviewed}. Read only; nothing saved.`;
  const table = make('table'), head = make('thead'), heading = make('tr');
  for (const label of ['Field', receipt?.categoryVerified ? 'Expected saved value' : 'Export', 'Live Wave', 'Result']) heading.append(make('th', label)); head.append(heading); table.append(head);
  const body = make('tbody');
  for (const c of result.checks) { const row = make('tr'), state = make('td'); state.append(make('span', c.state, `status ${c.state}`)); row.append(make('td', c.field), make('td', c.exported), make('td', c.live), state); body.append(row); }
  table.append(body); $('comparison').replaceChildren(table);
  $('diagnostics').textContent = JSON.stringify({ problems: snapshot.problems, fieldContexts: snapshot.fieldContexts, readableControls: snapshot.controls, capturedAt: snapshot.capturedAt }, null, 2); $('diagnosticToggle').hidden = false; $('copyDiagnostics').hidden = false; $('liveCopyStatus').textContent = '';
}
$('diagnosticToggle').onclick = () => { $('diagnostics').hidden = !$('diagnostics').hidden; };
function currentEditRequest(snapshot = lastLiveSnapshot) {
  return prepareCategoryEdit(chosen, snapshot, { business, sample: sampleMode, shortlist, queue, loadedPlan, categories: categoryNames(catalog, []), categoryGroups: catalog?.groups });
}
function updateApply() {
  const supported = chosen?.kind === 'Merchant rule' && !sampleMode;
  $('applyPanel').hidden = !supported;
  $('apply').disabled = true;
  $('verifyApply').hidden = !editReceipts[receiptKey()]?.saveAttempted;
  $('resetAttempt').hidden = !supported || !editReceipts[receiptKey()]?.saveAttempted;
  $('resetAttempt').disabled = applying || !extensionMode || !business;
  if (!supported) return;
  $('applyPreview').textContent = chosen.date + ' · ' + chosen.description + ' · USD ' + (chosen.amount / 100).toFixed(2) + ' · ' + chosen.primary.account + '\n' + chosen.categories.join(' + ') + ' → ' + chosen.proposed + '. Request reviewed status.';
  const receipt = editReceipts[receiptKey()];
  if (receipt?.saveAttempted) { $('applyStatus').textContent = receipt.message; return; }
  try {
    if (!extensionMode || !liveTab || applying) throw new Error('Open the transaction in Wave and wait for its live check.');
    currentEditRequest(); $('apply').disabled = false;
    $('applyStatus').textContent = 'Ready. Apply rechecks this record before clicking Wave controls.';
  } catch (e) { $('applyStatus').textContent = e.message; }
}
async function storeEditReceipt(key, receipt) {
  const next = { ...editReceipts, [key]: receipt };
  await chrome.storage.local.set({ solverEditReceipts: next });
  editReceipts = next;
}
async function reloadForVerification(tabId, expectedBusiness, id) {
  const current = () => business === expectedBusiness && chosen?.id === id;
  const reopened = await reopenSavedTransaction(chrome.tabs, tabId, expectedBusiness, id, current);
  if (!current()) throw new Error('Selection changed during saved-result verification.');
  liveTab = reopened.id; await rememberSession();
  const snapshot = await waitForLiveSnapshot(() => captureLive(reopened.id, expectedBusiness, id), current);
  if (!snapshot) throw new Error('The selection changed during verification.');
  return snapshot;
}
async function verifyReceipt(key, tabId, transaction, expectedBusiness) {
  const receipt = editReceipts[key], snapshot = await reloadForVerification(tabId, expectedBusiness, transaction.id);
  const { categoryVerified, reviewedVerified, message } = verifyCategoryResult(transaction, snapshot, expectedBusiness, receipt.category);
  await storeEditReceipt(key, { ...receipt, categoryVerified, reviewedVerified, message, verifiedAt: new Date().toISOString() });
  if (categoryVerified) shortlist.delete(transaction.id);
  renderQueue(); renderPlan(); rememberSoon();
  if (business === expectedBusiness && chosen?.id === transaction.id) {
    renderLive(snapshot);
    $('liveStatus').textContent = message;
    liveStepLabel = categoryVerified ? 'Saved category verified' : 'Inspect saved result'; updateSteps();
    $('diagnostics').textContent = JSON.stringify({ ...snapshot, editResult: editReceipts[key] }, null, 2);
  }
}
$('apply').onclick = handle(async () => {
  if (applying || editReceipts[receiptKey()]?.saveAttempted) throw new Error('This record already has an Apply attempt. Use Recheck saved result.');
  const transaction = chosen, expectedBusiness = business, tabId = liveTab, key = receiptKey();
  currentEditRequest();
  applying = true; liveGeneration++; document.querySelector('main').inert = true; $('apply').disabled = true;
  let attempted = false;
  try {
    $('applyStatus').textContent = 'Rechecking the live transaction…';
    const snapshot = await captureLive(tabId, expectedBusiness, transaction.id);
    const request = currentEditRequest(snapshot);
    if (chosen?.id !== transaction.id || business !== expectedBusiness || liveTab !== tabId) throw new Error('Selection changed. Nothing applied.');
    // Persist before injection: a lost response or extension reload must not retry a save.
    await storeEditReceipt(key, { previousAttempts: editReceipts[key]?.previousAttempts || [], category: request.category, saveAttempted: true, startedAt: new Date().toISOString(), message: 'Apply outcome is not yet verified. Use Recheck saved result.' });
    attempted = true; $('applyStatus').textContent = 'Selecting category and requesting reviewed status in Wave…';
    const results = await chrome.scripting.executeScript({ target: { tabId }, func: editWaveTransaction, args: [request] });
    const outcome = results[0]?.result;
    if (!outcome) throw new Error('Wave returned no Apply result. Inspect it before continuing.');
    await storeEditReceipt(key, { ...editReceipts[key], ...outcome, message: outcome.problem || 'Save was requested. Verifying the saved result…' });
    $('diagnostics').textContent = JSON.stringify({ editResult: outcome, before: snapshot }, null, 2);
    if (outcome.problem) throw new Error(outcome.problem);
    if (!outcome.saveAttempted) throw new Error('Save was not requested.');
    $('applyStatus').textContent = 'Reloading Wave to verify saved values…';
    await verifyReceipt(key, tabId, transaction, expectedBusiness);
  } catch (e) {
    if (attempted && editReceipts[key]?.saveAttempted) e = new Error('Save may have completed. Verification did not finish: ' + e.message);
    if (attempted) await storeEditReceipt(key, { ...editReceipts[key], message: e.message + (editReceipts[key]?.saveAttempted ? ' Use Recheck saved result; this attempt will not run again.' : ' Save was not clicked. Cancel the Wave dialog and read it again before retrying.') });
    throw e;
  } finally {
    applying = false; document.querySelector('main').inert = false; renderPlan(); updateApply();
  }
}, 'applyStatus');
$('resetAttempt').onclick = handle(async () => {
  if (applying || sampleMode || !extensionMode || !business || !chosen || !editReceipts[receiptKey()]?.saveAttempted) throw new Error('Select a real transaction with a previous Apply attempt.');
  const transaction = chosen, expectedBusiness = business, key = receiptKey();
  applying = true; liveGeneration++; document.querySelector('main').inert = true;
  try {
    $('applyStatus').textContent = 'Reopening the original record before resetting the previous attempt…';
    const snapshot = await reloadForVerification(liveTab, expectedBusiness, transaction.id);
    if (chosen?.id !== transaction.id || business !== expectedBusiness) throw new Error('Selection changed. Attempt was not reset.');
    const reset = resetAttemptReceipt(transaction, snapshot, expectedBusiness, editReceipts[key]);
    await storeEditReceipt(key, reset);
    shortlist.add(transaction.id); await rememberSession();
    renderLive(snapshot); renderQueue();
    $('liveStatus').textContent = 'Previous attempt reset after matching the original record. Nothing changed in Wave. Click Apply to retry.';
  } finally { applying = false; document.querySelector('main').inert = false; renderPlan(); updateApply(); }
}, 'applyStatus');
$('verifyApply').onclick = handle(async () => {
  if (applying || !editReceipts[receiptKey()]?.saveAttempted || !business || !chosen) throw new Error('Select the attempted transaction before checking its saved result.');
  applying = true; liveGeneration++; document.querySelector('main').inert = true;
  try { await verifyReceipt(receiptKey(), liveTab, chosen, business); }
  finally { applying = false; document.querySelector('main').inert = false; updateApply(); }
}, 'applyStatus');
async function copyDiagnostics(sourceId, statusId) {
  const text = $(sourceId).textContent;
  if (!text.trim()) { $(statusId).textContent = 'No diagnostics to copy yet.'; return; }
  try {
    await navigator.clipboard.writeText(text);
    $(statusId).textContent = 'Copied to clipboard.';
  } catch {
    $(sourceId).hidden = false;
    const range = document.createRange(); range.selectNodeContents($(sourceId));
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    $(statusId).textContent = 'Clipboard access unavailable. Diagnostics selected; press Ctrl+C to copy.';
  }
}
$('copyDiagnostics').onclick = () => copyDiagnostics('diagnostics', 'liveCopyStatus');
$('copyChartDiagnostics').onclick = () => copyDiagnostics('chartDiagnostics', 'chartCopyStatus');
if (extensionMode) {
  chrome.tabs.onRemoved.addListener(tabId => {
    if (tabId === chartTab) { chartTab = null; updateSteps(); }
  });
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (tabId === chartTab && change.url && change.url !== 'https://next.waveapps.com/' + business + '/accounting/charts') { chartTab = null; updateSteps(); }
  });
}

function sampleCSV() {
  const h = ['Transaction ID', 'Transaction Date', 'Account Name', 'Transaction Description', 'Debit Amount (Two Column Approach)', 'Credit Amount (Two Column Approach)', 'Account Group', 'Account Type', 'Account ID'];
  const r = [
    ['1000000000000000001','2026-10-02','Sample Checking','Chevron #001','','64.20','Asset','Cash and Bank','bank'],
    ['1000000000000000001','2026-10-02','Equipment Fuel — Diesel, Gas, Machinery Fuel','Chevron #001','64.20','','Expense','Expense','fuel'],
    ['1000000000000000002','2026-10-02','Sample Checking','Card payment','','228.82','Asset','Cash and Bank','bank'],
    ['1000000000000000002','2026-10-02','Uncategorized Expense','Card payment','228.82','','Expense','Expense','ue'],
    ['1000000000000000003','2026-10-01','Sample Credit Card','Payment','228.82','','Liability','Credit Card','card'],
    ['1000000000000000003','2026-10-01','Uncategorized Income','Payment','','228.82','Income','Income','ui'],
    ['1000000000000000004','2026-10-01','Sample Credit Card','7-Elev STORE','','22.10','Liability','Credit Card','card'],
    ['1000000000000000004','2026-10-01','Uncategorized Expense','7-Elev STORE','22.10','','Expense','Expense','ue'],
    ...['5','6','7'].flatMap(n => [[`100000000000000000${n}`,'2026-09-20','Sample Checking','Office Depot','','15.00','Asset','Cash and Bank','bank'],[`100000000000000000${n}`,'2026-09-20','Office Expenses','Office Depot','15.00','','Expense','Expense','office']])
  ];
  return [h,...r].map(row => row.map(v => `"${v.replace(/"/g,'""')}"`).join(',')).join('\n');
}
async function restoreSession() {
  const saved = await loadSession();
  if (!saved) return;
  business = saved.business;
  for (const id of filterIds) if (typeof saved.filters?.[id] === 'string') $(id).value = saved.filters[id];
  if (saved.csvText) {
    imported(saved.csvText, saved.sourceName, saved.sample);
    importedAt = saved.importedAt || '';
    $('importStatus').textContent += ` Restored local export, imported ${importedAt || 'previously'}. Import a fresh export when starting new bookkeeping work.`;
    // Only restore draft proposals still supported by the current rules.
    for (const id of saved.shortlist || []) { const t = queue.find(t=>t.id===id); if (t && actionable(t)) { shortlist.add(id); if(t.partner) shortlist.add(t.partner.id); } }
    if (saved.chosenId) { const transaction = queue.find(t=>t.id===saved.chosenId); if (transaction) select(transaction, false); }
  }
  loadedPlan = saved.loadedPlan || null;
  proposalPack = saved.proposalPack || null; proposalDecisions = saved.proposalDecisions || {}; proposalFileName = saved.proposalFileName || (proposalPack ? "proposed-rule-pack.local.json" : "");
  for (const id of draftIds) if (typeof saved.draft?.[id] === 'string') $(id).value = saved.draft[id];
  await loadCatalog();
  if (extensionMode && business) {
    const tabs = await chrome.tabs.query({ url: 'https://next.waveapps.com/*' });
    chartTab = tabs.find(tab => tab.url === `https://next.waveapps.com/${business}/accounting/charts`)?.id || null;
    liveTab = chosen && !sampleMode ? tabs.find(tab=>{ const identity=waveIdentity(tab.url); return identity?.business===business && identity?.transaction===chosen.id; })?.id || null : null;
    $('connection').textContent = `Restored business: ${business}.`;
    if (chosen) $('liveStatus').textContent = liveTab ? 'Wave tab reconnected. Click Read live details for a fresh check.' : 'Selection restored. Click Open this transaction in Wave for a fresh check.';
  }
  renderQueue(); renderPlan(); validateLoadedPlan();
  $('sessionStatus').textContent = 'Previous session restored locally. Live comparisons require a fresh check.';
  updateSteps();
  for (const key of stepKeys) if (typeof saved.folds?.[key] === 'boolean') $(`fold-${key}`).open = saved.folds[key];
}
if (extensionMode) editReceipts = (await chrome.storage.local.get('solverEditReceipts')).solverEditReceipts || {};
async function captureTransferMenu(t){const expectedBusiness=business;const tabs=(await chrome.tabs.query({url:'https://next.waveapps.com/*'})).filter(tab=>{const i=waveIdentity(tab.url);return i?.business===expectedBusiness && i.transaction===t.id;});const reports=[];for(const tab of tabs){const result=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:readTransferMenu}))[0]?.result;if(result?.identity?.business===expectedBusiness && result.identity.transaction===t.id)reports.push({...result,tabId:tab.id});}const open=reports.filter(r=>r.matchingGroups>0);if(open.length>1)throw Error('Multiple matching menus are open for this record. Close the extra menus and read again.');if(open.length===1)return open[0];if(reports.length===1)return reports[0];throw Error('Open the money-out record and its transfer submenu in one Wave tab, then read the menu again.');}
const transferReview=installTransferReview({getState:()=>({queue,dataset,business,workFrom:workFrom(),extensionMode,sample:sampleMode}),inspect:t=>select(t),openMenuRecord:async t=>{select(t,false);await openRecord(t.id);},captureMenu:captureTransferMenu,applyTransfer:runTransfer,receipt:pair=>editReceipts[transferReceiptKey(pair)],read:async (t,current)=>{if(!current())return null;const expectedBusiness=business;const tab=await openBackgroundTab(chrome.tabs,'https://next.waveapps.com/'+expectedBusiness+'/transactions/'+t.id);if(!current())return null;return waitForLiveSnapshot(()=>captureLive(tab.id,expectedBusiness,t.id),current);}});
const proposalReview=installProposalReview({
  getState:()=>({dataset,business,sample:sampleMode,csvText,rules,workFrom:workFrom(),pack:proposalPack,decisions:proposalDecisions,packFileName:proposalFileName}),
  categories:()=>categoryNames(sampleMode?null:catalog,dataset?.categories || []),
  imported:async (pack,fileName)=>{ if(proposalPack?.source?.sha256!==pack.source.sha256 || JSON.stringify(proposalPack?.proposals)!==JSON.stringify(pack.proposals)) proposalDecisions={}; proposalPack=pack; proposalFileName=fileName || "proposed-rule-pack.local.json"; await rememberSession(); updateSteps(); },
  accepted:async result=>{ if(extensionMode)await chrome.storage.local.set({solverRules:result.rules}); rules=result.rules;proposalDecisions=result.decisions;renderRules();analyze(true,false);await rememberSession(); },
  rejected:async decisions=>{proposalDecisions=decisions;await rememberSession();updateSteps();}
});
renderRules();
try { await restoreSession(); } catch(e) { error(`Could not restore the previous session: ${e.message}`); }
restoring = false;
await refreshTabs();
await proposalReview.render();transferReview.render();
updateSteps();
for (const key of stepKeys) $(`fold-${key}`).addEventListener('toggle',rememberSoon);
for (const id of [...filterIds, ...draftIds]) $(id).addEventListener('input',rememberSoon);
for (const id of ['clearPlan', 'ruleForm', 'planFile', 'historyRows']) $(id).addEventListener(id === 'ruleForm' ? 'submit' : id === 'planFile' ? 'change' : 'click', ()=>setTimeout(rememberSoon,0));
document.addEventListener('visibilitychange',()=>{ if(document.hidden) rememberSoon(); });

function transferReceiptKey(pair){return business+':transfer:'+pair.key;}
async function runTransfer(pair,recheck=false){
 if(applying || !extensionMode || sampleMode || !business)throw Error('Select a real Wave business and pair first.');
 const expectedBusiness=business,data=dataset,from=workFrom(),key=transferReceiptKey(pair);
 if(!transferPairs(queue).some(p=>p.key===pair.key))throw Error('This pair is no longer eligible in the working queue.');
 const previous=editReceipts[key];
 if(!recheck && Object.entries(editReceipts).some(([storedKey,r])=>storedKey.startsWith(expectedBusiness+':') && r.saveAttempted && (r.ids?.some(id=>[pair.out.id,pair.in.id].includes(id)) || [expectedBusiness+':'+pair.out.id,expectedBusiness+':'+pair.in.id].includes(storedKey))))throw Error('A transfer save was already attempted for one of these records. Use Recheck saved transfer.');
 if(recheck && !previous?.saveAttempted)throw Error('No transfer save attempt to recheck.');
 applying=true;document.querySelector('main').inert=true;liveGeneration++;
 const current=()=>business===expectedBusiness && dataset===data && workFrom()===from;
 let tabId=previous?.tabId ?? null,attempted=false;
 try{
  if(!recheck){
   const menu=await captureTransferMenu(pair.out);tabId=menu.tabId;
   const snapshots={};
   const incoming=await openBackgroundTab(chrome.tabs,'https://next.waveapps.com/'+expectedBusiness+'/transactions/'+pair.in.id);
   snapshots[pair.in.id]=await waitForLiveSnapshot(()=>captureLive(incoming.id,expectedBusiness,pair.in.id),current);
   snapshots[pair.out.id]=await captureLive(tabId,expectedBusiness,pair.out.id);
   if(!current())throw Error('Transfer context changed. Nothing applied.');
   const freshMenu=(await chrome.scripting.executeScript({target:{tabId},func:readTransferMenu}))[0]?.result;
   const request=prepareTransferEdit(pair,expectedBusiness,snapshots,freshMenu);
   await storeEditReceipt(key,{ids:[pair.out.id,pair.in.id],tabId,saveAttempted:true,startedAt:new Date().toISOString(),message:'Transfer attempt not yet verified. Use Recheck saved transfer.'});attempted=true;
   const outcome=(await chrome.scripting.executeScript({target:{tabId},func:editWaveTransaction,args:[request]}))[0]?.result;
   if(!outcome)throw Error('No transfer result returned. Inspect Wave before continuing.');
   await storeEditReceipt(key,{...editReceipts[key],...outcome,message:outcome.problem || 'Save requested. Checking both records…'});
   if(outcome.problem)throw Error(outcome.problem);
   if(!outcome.saveAttempted)throw Error('Save was not requested. Cancel the Wave dialog before retrying.');
  }
  const snapshots={};
  for(const t of [pair.out,pair.in]){
   const tab=await reopenSavedTransaction(chrome.tabs,t.id===pair.out.id?tabId:null,expectedBusiness,t.id,current);
   snapshots[t.id]=await waitForLiveSnapshot(()=>captureLive(tab.id,expectedBusiness,t.id),current);
  }
  const result=verifyTransferResult(pair,snapshots,expectedBusiness);
  await storeEditReceipt(key,{...editReceipts[key],...result,verifiedAt:new Date().toISOString(),snapshots});
  if(result.verified){shortlist.delete(pair.out.id);shortlist.delete(pair.in.id);renderPlan();rememberSoon();}
  return editReceipts[key];
 }catch(e){
  if(attempted || recheck){const locked=editReceipts[key]?.saveAttempted;await storeEditReceipt(key,{...editReceipts[key],message:e.message+(locked?' Save may have completed. Inspect Wave or use Recheck saved transfer; this attempt will not run again.':' Save was not clicked. Cancel the Wave dialog before retrying.')});return editReceipts[key];}
  throw e;
 }finally{applying=false;document.querySelector('main').inert=false;updateApply();}
}
