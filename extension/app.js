import {installRemainingGroups} from './remaining-view.js';
import {installAmazonReview} from './amazon-view.js';
import {installAllCollection} from './all-collection.js';
import {installBulkInspector} from './inspection-view.js';
import {remainingWork,liveRunQueue} from './inspection.js';
import {activity,paintActivity,withActivity} from './activity.js';
import {suggestionCandidates,waveSuggestionAction,installSuggestionReview} from './suggestions.js';
import {installWorkspace,showUsageSection} from './workspace-ui.js';
import {installLiveList,liveMerchantAudit} from './list-view.js';
import {expenseCandidates,prepareExpenseBatch,installExpenseBatch,recoverStoppedExpenseReceipt} from './expense-batch.js';
import { readTransferMenu } from './transfer-menu.js';
import { transferPairs,prepareTransferEdit,verifyTransferResult,resetTransferReceipt,classifyTransferState } from './transfers.js';
import { installTransferReview } from './transfer-view.js';
import { validateRule } from './rules.js';
import { installProposalReview } from './proposal-view.js';
import { prepareCategoryEdit, editWaveTransaction, verifyCategoryResult, resetAttemptReceipt } from './editor.js';
import { defaultRules, importAccounting, proposals, waveIdentity, compareLive, normalize } from './model.js';
import { readWavePage } from './live-reader.js';
import { installHistoryReview } from './history-view.js';
import { actionable, buildPlan, validatePlan } from './plan.js';
import { readWaveChart } from './chart-reader.js';
import { validateCatalog, categoryNames } from './catalog.js';
import { loadSession, saveSession } from './session.js';
import { captureTransferMenuFromTabs, workingQueue, businessFromUrl, onlyBusiness, waitForLiveSnapshot, openBackgroundTab, exportUrlFor, reopenSavedTransaction } from './workflow.js';
const startupActivity=activity.begin('Loading your saved solver session',{priority:20});
document.querySelector('main').inert=true;
let startupPending=true;
window.addEventListener('unhandledrejection',()=>{if(startupPending){startupPending=false;startupActivity.finish('Loading stopped. Check the error below or reload.');document.querySelector('main').inert=false;}},{once:true});
await paintActivity();
const $ = id => document.getElementById(id);
const make = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
const extensionMode = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
let inspectionTab=null;
let workspace=null,suggestionReview=null,bulkInspector=null,allCollection=null,amazonReview=null,remainingReview=null,liveListReport=()=>null;
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
let listCollecting=false,allowedExpenseIds=null;
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
  stepStatus('queue',dataset ? (liveListReport()?remainingWork(queue,liveListReport(),{business,from:workFrom(),receipts:editReceipts}).length+' live records remaining':'Collect live backlog first') : 'Import CSV first');
  stepStatus('transfers',transferPairs(queue).length+' candidate pairs');
  stepStatus('live',liveStepLabel,liveStepLabel==='Fields match');
  stepStatus('plan',shortlist.size ? `${shortlist.size} records in draft` : 'Choose proposals');
  $('openExport').disabled = !extensionMode || !exportUrlFor(business, exportPages);
  $('readChart').classList.toggle('secondary', !chartTab);
  $('readChart').disabled = chartCollecting || !extensionMode || !business || !chartTab;
  workspace?.refresh();
}
const filterIds = ['search', 'kind', 'from', 'through', 'historySearch', 'chartSearch', 'proposalSearch', 'proposalFilter', 'workFrom', 'transferSearch'];
const draftIds = ['ruleName', 'aliases', 'category'];
function rememberSession() {
  if (restoring) return Promise.resolve();
  const snapshot = { version: 1, workflowStage:workspace?.current(), usagePanels:Object.fromEntries([...document.querySelectorAll('#usageWorkspace .workflow-group section>.step')].map(panel=>[panel.id,panel.open])), business, csvText, sourceName, importedAt, sample: sampleMode, chosenId: chosen?.id || null, liveTab, chartTab, shortlist: [...shortlist], loadedPlan, proposalPack, proposalDecisions, proposalFileName, folds: Object.fromEntries(stepKeys.map(key=>[key,$(`fold-${key}`).open])), filters: Object.fromEntries(filterIds.map(id => [id, $(id).value])), draft: Object.fromEntries(draftIds.map(id => [id,$(id).value])) };
  saveChain = saveChain.catch(()=>{}).then(()=>saveSession(snapshot));
  return saveChain;
}
function rememberSoon() { void rememberSession().catch(e => { $('sessionStatus').textContent = `Session could not be saved locally: ${e.message}`; }); }
async function loadCatalog() {
  $('chartDiagnostics').textContent = ''; $('chartCopyStatus').textContent = ''; $('chartDebug').hidden = true;
  catalog = null;
  if (extensionMode && business) {
    const savedChart = (await chrome.storage.local.get('solverCharts')).solverCharts?.[business];
    if (savedChart) { try { catalog = validateCatalog(savedChart, business); } catch { /* Incomplete collections are not restored. */ } }
  }
  $('chartStatus').textContent = catalog ? `${catalog.groups.reduce((n,g)=>n+g.accounts.length,0)} names loaded for this business. Collected ${catalog.capturedAt}.` : 'No chart collected for this business.';
  renderCatalog(); renderCategories();
  if(dataset)renderHistory();
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
  if(event?.type==='submit')event.preventDefault();
  const label=event?.currentTarget?.id==='file'?'Importing and analyzing accounting history':event?.currentTarget?.textContent?.trim().slice(0,90) || 'Updating solver';
  try { error(); await withActivity(label,()=>fn(event)); }
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
    const row = make('div', undefined, 'rule'), detail = make('div'); detail.append(make('strong', r.name), make('small', r.aliases.join(', ')+(r.storeAliases?.length?' · Store-number variants: '+r.storeAliases.join(', '):'')));
    const remove = make('button', 'Remove', 'secondary'); remove.setAttribute('aria-label', `Remove ${r.name} rule`);
    remove.onclick = handle(async () => { rules.splice(i, 1); if(r.proposalId && r.business===proposalPack?.business) delete proposalDecisions[r.proposalId]; await persistRules(); renderRules(); analyze(true); void proposalReview.render(); });
    if (r.accountNames?.length || r.accountIds?.length) detail.append(make('small','Only accounts: '+(r.accountNames || r.accountIds).join(', ')));
    if (r.onlyCategories?.length) detail.append(make('small','Only current categories: '+r.onlyCategories.join('; ')));
    if (r.excludeAliases?.length) detail.append(make('small','Excluded aliases: '+r.excludeAliases.join(', ')));
    if(r.previousVersions?.length){const previous=make('details');previous.append(make('summary','Previous approved versions'));for(const old of r.previousVersions)previous.append(make('p',old.name+' → '+old.category+' · Aliases: '+old.aliases.join(', ')));detail.append(previous);}
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
function clearImported() { $('diagnostics').textContent='';$('diagnostics').hidden=true;$('diagnosticToggle').hidden=true;$('copyDiagnostics').hidden=true; proposalPack=null; proposalDecisions={}; proposalFileName=""; dataset = null; csvText = ''; sourceName = ''; importedAt = ''; queue = []; chosen = null; liveTab = null; sampleMode = false; shortlist.clear(); loadedPlan = null; $('file').value = ''; $('planFile').value = ''; $('queue').hidden = true; $('live').hidden = true; $('history').hidden = true; $('plan').hidden = true; $('planText').value = ''; $('planValidation').replaceChildren(); $('importStatus').textContent = 'Imported session cleared. Saved rules, business, and account names remain.'; renderCategories(); error(); transferReview.render(); listReview.render(); expenseReview.render();suggestionReview?.render(); void proposalReview.render(); }
$('clear').onclick = handle(async () => { clearImported(); updateSteps(); await rememberSession(); $('sessionStatus').textContent = 'Saved CSV and draft plan cleared. They will not return after a reload.'; });
$('sample').onclick = handle(async () => { imported(sampleCSV(), 'Fictional sample — cannot open these IDs in Wave', true); await rememberSession(); });
const workFrom = () => $('workFrom').value || '2025-01-01';
$('workFrom').oninput = handle(()=>analyze(true));
function analyze(preserveDraft = false, renderProposals = true) {
  if (!dataset) return;
  const previous = preserveDraft ? [...shortlist] : [];
  shortlist.clear(); $('planText').hidden = true;
  queue = workingQueue(proposals(dataset.transactions, rules, 5, business), workFrom()).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const amazonActions=new Map((amazonReview?.approvedActions() || []).map(a=>[a.id,a]));queue=queue.map(t=>amazonActions.has(t.id)&&!['Transfer candidate','Ambiguous transfer','Possible refund','Existing multi-account','Manual review'].includes(t.kind)?amazonReview.proposalFor(t,amazonActions.get(t.id)):t);
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
  listReview.render();suggestionReview?.render();
  expenseReview.render();
  const text = $('search').value.toLowerCase(), kind = $('kind').value, from = $('from').value, through = $('through').value;
  const report=liveListReport(),historical=$('queueScope')?.value==='history';
  const source=historical?queue:remainingWork(queue,report,{business,from:workFrom(),receipts:editReceipts});
  stepStatus('queue',historical?source.length+' CSV candidates':report?source.length+' live records remaining':'Collect live backlog first');
  const list = source.filter(t => (!kind || t.kind === kind) && (!from || t.date >= from) && (!through || t.date <= through) && `${t.id} ${t.description} ${t.primary?.account || ''} ${t.categories.join(' ')} ${t.proposed}`.toLowerCase().includes(text));
  $('queueInfo').textContent = !historical && !report?'Collect the live Not Reviewed list in step 2. CSV history is not an unfinished-work list.':`${list.length} filtered ${historical?'CSV candidates (reviewed status unknown)':'remaining live records'} from ${workFrom()}. ${!historical && report.completeness!=='count-confirmed'?'Partial collection; the remaining count is incomplete.':!historical?'Based on your last collection; rescan after completing work.':'Advanced history view only; not a live backlog.'}`;
  $('counts').textContent=historical?source.length+' historical CSV candidates':source.length+' records in your last live backlog after verified session results';
  bulkInspector?.render();allCollection?.render();amazonReview?.render();
  remainingReview?.render(list,{historical});
  $('rows').replaceChildren();
  for (const t of list.slice(0, 150)) {
    const tr = make('tr'), date = make('td', t.date); date.append(make('small', t.id));
    const desc = make('td', t.description); desc.append(make('small', t.primary?.account || 'Multiple/no bank postings'));
    const current = make('td', t.categories.join(' + ') || 'Multiple bank/card postings');
    const action = make('td'); action.append(make('strong', t.kind), make('p', t.proposed), make('small', t.reason));
    const button = make('button', 'Inspect', 'secondary'); button.setAttribute('aria-label', `Inspect transaction ${t.id}`); button.onclick = () => select(t);
    const cell = make('td');
    if (historical && actionable(t)) {
      const label = make('label', undefined, 'plan-choice'), check = make('input'); check.type = 'checkbox'; check.checked = shortlist.has(t.id); check.setAttribute('aria-label', `Plan transaction ${t.id}`);
      check.onchange = () => {
        const ids = t.partner ? [t.id, t.partner.id] : [t.id];
        for (const id of ids) { if (check.checked) shortlist.add(id); else shortlist.delete(id); }
        $('planText').hidden = true; renderQueue(); renderPlan(); rememberSoon();
      };
      label.append(check, make('span', 'Plan')); cell.append(label);
    }
    cell.append(button);
    if(!historical && t.kind==='Merchant rule'){const runKnown=make('button','Run with approved rules','secondary');runKnown.onclick=()=>expenseReview.open(new Set([t.id]));cell.append(runKnown);}
    tr.append(date, desc, make('td', t.amount === null ? '—' : `${t.direction === 'out' ? 'Out' : 'In'} ${(t.amount / 100).toFixed(2)}`), current, action, cell); $('rows').append(tr);
  }
}
for (const id of ['search', 'kind', 'from', 'through']) $(id).oninput = renderQueue;
const historyReview=installHistoryReview({getState:()=>({dataset,rules,business,pack:proposalPack?.business===business?proposalPack:null,report:liveListReport(),from:workFrom(),categories:categoryNames(sampleMode?null:catalog,dataset?.categories || [])}),accept:async next=>{if(applying || listCollecting)throw Error('Finish the active transaction run first.');if(extensionMode)await chrome.storage.local.set({solverRules:next});rules=next;renderRules();analyze(true);},prepare:(g,category)=>{$('ruleName').value=g.merchant.slice(0,100);$('aliases').value=g.aliases.join(', ').slice(0,400);$('category').value=category;showUsageSection('fold-merchant');$('customRule').open=true;$('ruleForm').scrollIntoView({behavior:'smooth'});$('ruleName').focus();rememberSoon();}});
function renderHistory(){historyReview.render();}
function renderPlan() {
  $('plan').hidden = !dataset;
  const pairs = new Set(queue.filter(t => shortlist.has(t.id) && t.partner).map(t => [t.id, t.partner.id].sort().join(':'))).size;
  const singles = queue.filter(t => shortlist.has(t.id) && !t.partner).length;
  $('planStatus').textContent = `${singles} merchant proposal(s) and ${pairs} transfer pair(s) shortlisted. ${shortlist.size} records in this draft. ${Object.entries(editReceipts).filter(([key, receipt]) => key.startsWith(business + ':') && receipt.saveAttempted).length} local Apply attempt(s); inspect their saved results in the live transaction check.`;
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
  if(scroll)showUsageSection('fold-live');
  liveGeneration++;
  liveStepLabel = 'Not checked'; if(scroll)$('fold-live').open = true; updateSteps();
  lastLiveSnapshot = null;
  chosen = t; $('applyStatus').textContent = ''; updateApply(); $('live').hidden = false; $('selected').textContent = `${t.date} · ${t.description} · ID ${t.id}. ${t.kind}: ${t.proposed || t.reason}`;
  $('counterpart').hidden = !t.partner;
  $('open').disabled = !extensionMode || sampleMode; $('read').disabled = !extensionMode || sampleMode;
  $('counterpart').disabled = !extensionMode || sampleMode;
  $('comparison').replaceChildren(); $('diagnostics').hidden = true; $('diagnosticToggle').hidden = true; $('copyDiagnostics').hidden = true; $('liveCopyStatus').textContent = '';
  $('liveStatus').textContent = !extensionMode ? 'Live checks require the installed Chrome extension.' : sampleMode ? 'Fictional samples cannot be opened in Wave.' : !business ? 'First select your Wave tab and click Use selected business in section 1 above. Then open this transaction.' : t.kind!=='Merchant rule'?'Read the live details to understand this exception. Approve a suitable purchase rule in step 3, or resolve it manually in Wave. Batch execution is in step 4.':'Read live details, prepare the category change, then Apply. You can also run it with approved expenses in step 4.';
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
  if($('groupNavigation')){$('groupNavigation').hidden=!remainingReview?.hasContext();$('nextGrouped').disabled=applying || !!remainingReview?.hasNext()===false;}
  if($('prepareChange')){$('prepareChange').hidden=!supported || shortlist.has(chosen?.id) || !!editReceipts[receiptKey()]?.saveAttempted;$('prepareChange').disabled=applying || !!bulkInspector?.busy() || !!amazonReview?.busy() || !lastLiveSnapshot;}
  $('verifyApply').hidden = !editReceipts[receiptKey()]?.saveAttempted;
  $('resetAttempt').hidden = !supported || !editReceipts[receiptKey()]?.saveAttempted;
  $('resetAttempt').disabled = applying || !extensionMode || !business;
  if (!supported) return;
  $('applyPreview').textContent = chosen.date + ' · ' + chosen.description + ' · USD ' + (chosen.amount / 100).toFixed(2) + ' · ' + chosen.primary.account + '\n' + chosen.categories.join(' + ') + ' → ' + chosen.proposed + '. Request reviewed status.';
  const receipt = editReceipts[receiptKey()];
  if (receipt?.saveAttempted) { $('applyStatus').textContent = receipt.message; return; }
  try {
    if (!extensionMode || !liveTab || applying || bulkInspector?.busy() || amazonReview?.busy()) throw new Error('Open the transaction in Wave and wait for its live check.');
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
  if (listCollecting || bulkInspector?.busy() || amazonReview?.busy()) throw Error('Finish collection or bulk inspection before editing transactions.');
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
  await listReview.ready;
 await allCollection.ready;
 await bulkInspector.restore();for(const panel of document.querySelectorAll('#usageWorkspace .workflow-group section>.step'))if(typeof saved.usagePanels?.[panel.id]==='boolean')panel.open=saved.usagePanels[panel.id];workspace?.restore(saved.workflowStage);
}
if (extensionMode) editReceipts = (await chrome.storage.local.get('solverEditReceipts')).solverEditReceipts || {};
if(extensionMode){
 const restored=Object.fromEntries(Object.entries(editReceipts).map(([key,r])=>[key,recoverStoppedExpenseReceipt(r)]));
 if(Object.entries(restored).some(([key,r])=>r!==editReceipts[key])){await chrome.storage.local.set({solverEditReceipts:restored});editReceipts=restored;}
}

async function captureTransferMenu(t){
 const expectedBusiness=business;
 const tabs=await chrome.tabs.query({url:'https://next.waveapps.com/*'});
 return captureTransferMenuFromTabs(tabs,expectedBusiness,t.id,liveTab,async tabId=>(await chrome.scripting.executeScript({target:{tabId},func:readTransferMenu}))[0]?.result);
}
const expenseReview=installExpenseBatch({getState:()=>({queue:liveRunQueue(queue,liveListReport(),business,workFrom()),dataset,business,workFrom:workFrom(),extensionMode,sample:sampleMode,allowedIds:allowedExpenseIds,busy:applying || listCollecting || !!bulkInspector?.busy() || !!amazonReview?.busy()}),receipt:t=>editReceipts[business+':'+t.id],apply:(...args)=>withActivity('Checking and saving expense',()=>runExpenseBatch(...args)),inspect:t=>select(t),availability:()=>{const report=liveListReport();return {report,audit:liveMerchantAudit(report,rules,dataset?.transactions,queue,business,workFrom())};}});
const listReview=installLiveList({openInspector:mode=>void bulkInspector?.selectSource(mode),getState:()=>({business,dataset,queue,rules,workFrom:workFrom(),extensionMode,sample:sampleMode,busy:applying || !!bulkInspector?.busy() || !!amazonReview?.busy()}),onRunning:value=>{listCollecting=value;expenseReview.render();suggestionReview?.render();workspace?.refresh();},onScope:ids=>{allowedExpenseIds=ids;},refreshExpenses:()=>{expenseReview.render();suggestionReview?.render();renderHistory();bulkInspector?.render();workspace?.refresh();if(workspace)renderQueue();},showExpenses:ids=>expenseReview.open(ids),refreshRules:async()=>{if(extensionMode){const saved=(await chrome.storage.local.get('solverRules')).solverRules;if(saved!==undefined){if(!Array.isArray(saved))throw Error('Saved merchant rules are unreadable.');saved.forEach(validateRule);rules=saved;}}renderRules();analyze(true);}});
liveListReport=()=>{const report=listReview.report(),reviewed=bulkInspector?.reviewedIds();return report && reviewed?.size?{...report,records:report.records.map(r=>reviewed.has(r.id)?{...r,reviewed:'Reviewed'}:r)}:report;};
suggestionReview=installSuggestionReview({getState:()=>({queue,rules,dataset,business,workFrom:workFrom(),extensionMode,sample:sampleMode,busy:applying || listCollecting || !!bulkInspector?.busy() || !!amazonReview?.busy()}),report:()=>liveListReport(),receipt:t=>editReceipts[business+':suggestion:'+t.id],run:(...args)=>withActivity('Confirming Wave suggestion',()=>runWaveSuggestion(...args)),recheck:t=>withActivity('Rechecking saved suggestion',()=>runWaveSuggestion(t,'recheck')),inspect:t=>select(t),refresh:async()=>{const previousCapture=listReview.report()?.capturedAt;await listReview.collect();const collected=listReview.report();if(!collected || collected.capturedAt===previousCapture || collected.suggestionDetectionVersion!==2)throw Error('A fresh suggestion scan was not completed. Inspect live-list diagnostics and try again.');if(extensionMode){const saved=(await chrome.storage.local.get('solverRules')).solverRules;if(saved!==undefined){if(!Array.isArray(saved))throw Error('Saved merchant rules are unreadable.');saved.forEach(validateRule);rules=saved;}}renderRules();analyze(true);}});
const transferReview=installTransferReview({getState:()=>({queue:liveRunQueue(queue,liveListReport(),business,workFrom()),dataset,business,workFrom:workFrom(),extensionMode,sample:sampleMode,busy:applying || listCollecting || !!bulkInspector?.busy() || !!amazonReview?.busy()}),inspect:t=>select(t),openMenuRecord:async t=>{select(t,false);await openRecord(t.id);},captureMenu:(...args)=>withActivity('Reading transfer menu',()=>captureTransferMenu(...args)),applyTransfer:(...args)=>withActivity('Checking and saving transfer',()=>runTransfer(...args)),receipt:pair=>editReceipts[transferReceiptKey(pair)],read:async (t,current)=>{if(!current())return null;const expectedBusiness=business;const tab=await openBackgroundTab(chrome.tabs,'https://next.waveapps.com/'+expectedBusiness+'/transactions/'+t.id);if(!current())return null;return waitForLiveSnapshot(()=>captureLive(tab.id,expectedBusiness,t.id),current);}});
const proposalReview=installProposalReview({
  getState:()=>({dataset,business,sample:sampleMode,csvText,rules,queue,workFrom:workFrom(),pack:proposalPack,decisions:proposalDecisions,packFileName:proposalFileName}),
  categories:()=>categoryNames(sampleMode?null:catalog,dataset?.categories || []),
  imported:async (pack,fileName)=>{ if(proposalPack?.source?.sha256!==pack.source.sha256 || JSON.stringify(proposalPack?.proposals)!==JSON.stringify(pack.proposals)) proposalDecisions={}; proposalPack=pack; proposalFileName=fileName || "proposed-rule-pack.local.json"; await rememberSession(); updateSteps();renderHistory(); },
  accepted:async result=>{ if(extensionMode)await chrome.storage.local.set({solverRules:result.rules}); rules=result.rules;proposalDecisions=result.decisions;renderRules();analyze(true,false); },
  rejected:async decisions=>{proposalDecisions=decisions;await rememberSession();updateSteps();}
});
allCollection=installAllCollection({getState:()=>({business,dataset,extensionMode,sample:sampleMode,busy:applying || listCollecting || !!bulkInspector?.busy() || !!amazonReview?.busy()}),onRunning:value=>{listCollecting=value;expenseReview.render();suggestionReview?.render();workspace?.refresh();},onChange:()=>{bulkInspector?.render();updateSteps();},openInspector:mode=>void bulkInspector?.selectSource(mode)});
bulkInspector=installBulkInspector({getState:()=>({business,dataset,queue,csvText,workFrom:workFrom(),report:listReview.report(),allReport:allCollection.report(),extensionMode,sample:sampleMode,busy:applying || listCollecting || !!amazonReview?.busy()}),read:async(t,current)=>{const tab=await openBackgroundTab(chrome.tabs,'https://next.waveapps.com/'+business+'/transactions/'+t.id,inspectionTab);inspectionTab=tab.id;return waitForLiveSnapshot(()=>captureLive(tab.id,business,t.id),current);},inspect:t=>select(t),onChange:()=>{renderQueue();updateSteps();}});
amazonReview=installAmazonReview({getState:()=>({business,dataset,categories:categoryNames(sampleMode?null:catalog,dataset?.categories||[]),from:workFrom(),report:allCollection.report() || listReview.report(),sample:sampleMode,busy:applying || listCollecting || !!bulkInspector?.busy()}),onChange:()=>{if(dataset)analyze(true,false);},onRunning:()=>{renderQueue();transferReview.render();workspace?.refresh();},inspect:(t,a)=>{select(a?amazonReview.proposalFor(queue.find(x=>x.id===t.id) || t,a):(queue.find(x=>x.id===t.id)||{...t,kind:'Manual review',reason:'Amazon payment candidate needs review.'}));}});
remainingReview=installRemainingGroups({getState:()=>({business,rules,chosenId:chosen?.id,busy:applying || listCollecting || !!bulkInspector?.busy() || !!amazonReview?.busy()}),inspect:t=>select(t),openAmazon:()=>showUsageSection('amazonReview'),prepareRule:g=>{ $('ruleName').value=g.name.slice(0,100);$('aliases').value=g.name.slice(0,250);$('category').value='';showUsageSection('fold-merchant');$('customRule').open=true;$('ruleName').focus();rememberSoon();}});
workspace=installWorkspace({getState:()=>({business,dataset,report:liveListReport(),rules,busy:applying || listCollecting || !!bulkInspector?.busy() || !!amazonReview?.busy(),workFrom:workFrom(),expenseMatches:expenseCandidates(liveRunQueue(queue,liveListReport(),business,workFrom()),allowedExpenseIds).filter(t=>!editReceipts[business+':'+t.id]?.reviewedVerified).length,transferMatches:transferPairs(liveRunQueue(queue,liveListReport(),business,workFrom())).filter(p=>!editReceipts[transferReceiptKey(p)]?.verified).length}),onStageChange:stage=>{rememberSoon();if(stage==='planning')renderQueue();}});
renderRules();
try { await restoreSession();await amazonReview.restore();await remainingReview.restore();if(dataset)analyze(true,false); } catch(e) { error(`Could not restore the previous session: ${e.message}`); }
restoring = false;
try {
 await refreshTabs();
 startupActivity.update({detail:'Preparing rules and transaction lists'});
 await paintActivity();
 await listReview.ready;
 await proposalReview.render();transferReview.render();
 updateSteps();
} finally {startupPending=false;startupActivity.finish();document.querySelector('main').inert=false;}
const prepareChange=make('button','Prepare this category change','secondary');prepareChange.id='prepareChange';prepareChange.onclick=handle(async()=>{if(chosen?.kind!=='Merchant rule' || !actionable(chosen))throw Error('Choose an approved-rule purchase first.');if(!lastLiveSnapshot)throw Error('Read live details before preparing this change.');shortlist.add(chosen.id);renderPlan();updateApply();await rememberSession();});$('apply').before(prepareChange);
const groupNavigation=make('div');groupNavigation.id='groupNavigation';groupNavigation.className='bar';const backGrouped=make('button','Back to this group','secondary'),nextGrouped=make('button','Inspect next in group');nextGrouped.id='nextGrouped';backGrouped.onclick=()=>{showUsageSection('fold-queue');remainingReview.reveal();};nextGrouped.onclick=()=>remainingReview.next();groupNavigation.append(backGrouped,nextGrouped);$('selected').after(groupNavigation);updateApply();
const venmoDownloader=make('button','Open Venmo statement downloader','secondary');venmoDownloader.disabled=!extensionMode;venmoDownloader.onclick=handle(async()=>{const url=chrome.runtime.getURL('venmo.html'),tabs=await chrome.tabs.query({url});if(tabs[0])await chrome.tabs.update(tabs[0].id,{active:true});else await chrome.tabs.create({url,active:true});});$('openExport').parentElement.append(venmoDownloader);
const queueScope=make('select');queueScope.id='queueScope';queueScope.setAttribute('aria-label','Remaining work scope');for(const [value,label] of [['live','Latest live backlog'],['history','Advanced: all CSV candidates']]){const option=make('option',label);option.value=value;queueScope.append(option);}queueScope.onchange=()=>renderQueue();$('search').parentElement.prepend(queueScope);renderQueue();
for (const key of stepKeys) $(`fold-${key}`).addEventListener('toggle',rememberSoon);
for(const id of ['liveList','waveSuggestions','expenseBatch'])$(id).addEventListener('toggle',rememberSoon);
for (const id of [...filterIds, ...draftIds]) $(id).addEventListener('input',rememberSoon);
for (const id of ['clearPlan', 'ruleForm', 'planFile']) $(id).addEventListener(id === 'ruleForm' ? 'submit' : id === 'planFile' ? 'change' : 'click', ()=>setTimeout(rememberSoon,0));
document.addEventListener('visibilitychange',()=>{ if(document.hidden) rememberSoon(); });

const transferWorkerTabs={out:null,in:null};
function transferReceiptKey(pair){return business+':transfer:'+pair.key;}
async function runTransfer(pair,mode=false){
 const reset=mode==='reset',automatic=mode==='auto',recheck=mode===true || reset || (automatic && !!editReceipts[transferReceiptKey(pair)]?.saveAttempted);
 if(automatic && recheck && !editReceipts[transferReceiptKey(pair)]?.verified)throw Error('An uncertain transfer attempt is locked. Recheck it before running automation.');
 if(listCollecting || bulkInspector?.busy() || amazonReview?.busy())throw Error('Finish collection or bulk inspection before editing transactions.');
 if(applying || !extensionMode || sampleMode || !business)throw Error('Select a real Wave business and pair first.');
 const expectedBusiness=business,data=dataset,from=workFrom(),key=transferReceiptKey(pair);
 if(!transferPairs(queue).some(p=>p.key===pair.key))throw Error('This pair is no longer eligible in the working queue.');
 const previous=editReceipts[key];
 if(!recheck && Object.entries(editReceipts).some(([storedKey,r])=>storedKey.startsWith(expectedBusiness+':') && r.saveAttempted && (r.ids?.some(id=>[pair.out.id,pair.in.id].includes(id)) || [expectedBusiness+':'+pair.out.id,expectedBusiness+':'+pair.in.id].includes(storedKey))))throw Error('A transfer save was already attempted for one of these records. Use Recheck saved transfer.');
 if(recheck && !previous?.saveAttempted)throw Error('No transfer save attempt to recheck.');
 applying=true;document.querySelector('main').inert=true;liveGeneration++;
 const current=()=>business===expectedBusiness && dataset===data && workFrom()===from;
 let tabId=previous?.tabId ?? null,attempted=false,alreadyLinked=false;
 try{
  if(!recheck){
   if(automatic){
    const tab=await reopenSavedTransaction(chrome.tabs,transferWorkerTabs.out,expectedBusiness,pair.out.id,current);tabId=tab.id;transferWorkerTabs.out=tab.id;
    const before=await waitForLiveSnapshot(()=>captureLive(tabId,expectedBusiness,pair.out.id),current);
    if(!current())throw Error('Transfer context changed.');
    const incoming=await reopenSavedTransaction(chrome.tabs,transferWorkerTabs.in,expectedBusiness,pair.in.id,current);transferWorkerTabs.in=incoming.id;
    const incomingSnapshot=await waitForLiveSnapshot(()=>captureLive(incoming.id,expectedBusiness,pair.in.id),current);
    if(!current())throw Error('Transfer context changed.');
    const snapshots={[pair.out.id]:before,[pair.in.id]:incomingSnapshot};
    const state=classifyTransferState(pair,snapshots,expectedBusiness);
    alreadyLinked=state.state==='linked';
    if(alreadyLinked){
     await storeEditReceipt(key,{...previous,ids:[pair.out.id,pair.in.id],tabId,saveAttempted:true,externallyLinked:true,...state,snapshots,message:state.reviewed?'Already linked and reviewed in Wave. Skipped without editing.':state.message});
     if(state.reviewed)return {...editReceipts[key],skipped:true};
    }else{
     const opened=(await chrome.scripting.executeScript({target:{tabId},func:editWaveTransaction,args:[{business:expectedBusiness,id:pair.out.id,category:before.fields.category,expected:before.fields,openTransferMenu:true}]}))[0]?.result;
     if(!opened?.menuOpened)throw Error(opened?.problem || 'Could not open the transfer menu. Nothing applied.');
    }
   }else{const menu=await captureTransferMenu(pair.out);tabId=menu.tabId;}

   if(!alreadyLinked){
   const snapshots={};
   const incoming=await reopenSavedTransaction(chrome.tabs,transferWorkerTabs.in,expectedBusiness,pair.in.id,current);transferWorkerTabs.in=incoming.id;
   snapshots[pair.in.id]=await waitForLiveSnapshot(()=>captureLive(incoming.id,expectedBusiness,pair.in.id),current);
   snapshots[pair.out.id]=await captureLive(tabId,expectedBusiness,pair.out.id);
   if(!current())throw Error('Transfer context changed. Nothing applied.');
   const freshMenu=(await chrome.scripting.executeScript({target:{tabId},func:readTransferMenu}))[0]?.result;
   const request=prepareTransferEdit(pair,expectedBusiness,snapshots,freshMenu);
   await storeEditReceipt(key,{ids:[pair.out.id,pair.in.id],tabId,originalSnapshots:snapshots,previousAttempts:previous?.previousAttempts || [],saveAttempted:true,startedAt:new Date().toISOString(),message:'Transfer attempt not yet verified. Use Recheck saved transfer.'});attempted=true;
   const outcome=(await chrome.scripting.executeScript({target:{tabId},func:editWaveTransaction,args:[request]}))[0]?.result;
   if(!outcome)throw Error('No transfer result returned. Inspect Wave before continuing.');
   await storeEditReceipt(key,{...editReceipts[key],...outcome,message:outcome.problem || 'Save requested. Checking both records…'});
   if(outcome.problem)throw Error(outcome.problem);
   if(!outcome.saveAttempted)throw Error('Save was not requested. Cancel the Wave dialog before retrying.');
   }
  }
  const snapshots={};
  for(const t of [pair.out,pair.in]){
   const direction=t.id===pair.out.id?'out':'in';
   const tab=await reopenSavedTransaction(chrome.tabs,direction==='out'?tabId:transferWorkerTabs.in,expectedBusiness,t.id,current);transferWorkerTabs[direction]=tab.id;
   snapshots[t.id]=await waitForLiveSnapshot(()=>captureLive(tab.id,expectedBusiness,t.id),current);
  }
  if(reset){await storeEditReceipt(key,resetTransferReceipt(pair,snapshots,expectedBusiness,previous));return editReceipts[key];}
  let result=verifyTransferResult(pair,snapshots,expectedBusiness);
  if(automatic && result.verified && !result.reviewed){
   for(const t of [pair.out,pair.in]){
    if(!current())throw Error('Transfer context changed.');
    const side=result.sides.find(side=>side.id===t.id);
    if(side.reviewedVerified)continue;
    if(editReceipts[key]?.reviewAttempts?.[t.id]?.attempted)throw Error('A review attempt for this record is locked. Recheck its saved state.');
    const direction=t.id===pair.out.id?'out':'in';
    const tab=await reopenSavedTransaction(chrome.tabs,transferWorkerTabs[direction],expectedBusiness,t.id,current);transferWorkerTabs[direction]=tab.id;
    const fresh=await waitForLiveSnapshot(()=>captureLive(tab.id,expectedBusiness,t.id),current);
    const candidate=verifyTransferResult(pair,{...snapshots,[t.id]:fresh},expectedBusiness);
    if(!candidate.verified)throw Error('Saved transfer changed before review. No review requested.');
    snapshots[t.id]=fresh;
    if(candidate.sides.find(side=>side.id===t.id).reviewedVerified)continue;
    await storeEditReceipt(key,{...editReceipts[key],reviewAttempts:{...editReceipts[key]?.reviewAttempts,[t.id]:{attempted:true,startedAt:new Date().toISOString()}},message:'Review requested; saved state not yet verified.'});
    const outcome=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:editWaveTransaction,args:[{business:expectedBusiness,id:t.id,category:fresh.fields.category,expected:fresh.fields,reviewOnly:true}]}))[0]?.result;
    if(!outcome)throw Error('No review result returned. Recheck before proceeding.');
    await storeEditReceipt(key,{...editReceipts[key],reviewAttempts:{...editReceipts[key].reviewAttempts,[t.id]:{...editReceipts[key].reviewAttempts[t.id],outcome}}});
    if(outcome.problem)throw Error(outcome.problem);
    const reopened=await reopenSavedTransaction(chrome.tabs,tab.id,expectedBusiness,t.id,current);
    snapshots[t.id]=await waitForLiveSnapshot(()=>captureLive(reopened.id,expectedBusiness,t.id),current);
    result=verifyTransferResult(pair,snapshots,expectedBusiness);
    if(!result.verified || !result.sides.find(side=>side.id===t.id).reviewedVerified)throw Error('Reviewed state could not be verified. Recheck before proceeding.');
   }
   result=verifyTransferResult(pair,snapshots,expectedBusiness);
  }

  await storeEditReceipt(key,{...editReceipts[key],...result,verifiedAt:new Date().toISOString(),snapshots});
  if(result.verified){shortlist.delete(pair.out.id);shortlist.delete(pair.in.id);renderPlan();rememberSoon();}
  return editReceipts[key];
 }catch(e){
  if(!attempted && !recheck && e.diagnostics){await storeEditReceipt(key,{ids:[pair.out.id,pair.in.id],saveAttempted:false,stage:'preflight',message:e.message,preflight:e.diagnostics,checkedAt:new Date().toISOString()});return {...editReceipts[key],needsAttention:true};}
  if(attempted || recheck || alreadyLinked){const locked=editReceipts[key]?.saveAttempted;await storeEditReceipt(key,{...editReceipts[key],reviewed:false,message:e.message+(locked?' Save may have completed. Inspect Wave or use Recheck saved transfer; this attempt will not run again.':' Save was not clicked. Cancel the Wave dialog before retrying.')});return editReceipts[key];}
  throw e;
 }finally{applying=false;document.querySelector('main').inert=false;updateApply();}
}

let expenseWorkerTab=null;
async function runExpenseBatch(t,mode='run'){
 if(mode==='run' && !editReceipts[business+':suggestion:'+t.id]?.attempted && !editReceipts[business+':suggestion:'+t.id]?.reviewedVerified && suggestionCandidates(listReview.report(),queue,rules,business,workFrom()).some(record=>record.id===t.id && record.proposed===t.proposed))return runWaveSuggestion(t);
 if(listCollecting || bulkInspector?.busy())throw Error('Finish collection or bulk inspection before editing transactions.');
 if(applying || !extensionMode || sampleMode || !business)throw Error('Select your Wave business and real export.');
 const expectedBusiness=business,data=dataset,from=workFrom(),target=t.proposed,key=business+':'+t.id,previous=editReceipts[key];
 if(!expenseCandidates(queue,allowedExpenseIds).some(record=>record.id===t.id && record.proposed===target))throw Error('The approved expense rule is no longer eligible.');
 if(previous?.saveAttempted && previous.category!==target)throw Error('The approved target changed since a saved attempt. Inspect the prior result first.');
 if(mode!=='recheck' && previous?.saveAttempted && (!previous.categoryVerified || previous.reviewAttempted))throw Error('This expense has a locked attempt. Use Recheck saved expense.');
 if(Object.entries(editReceipts).some(([k,r])=>k.startsWith(expectedBusiness+':transfer:') && r.saveAttempted && r.ids?.includes(t.id)))throw Error('This record has a transfer attempt. Inspect the transfer result.');
 const current=()=>business===expectedBusiness && dataset===data && workFrom()===from && (!allowedExpenseIds || allowedExpenseIds.has(t.id)) && queue.some(record=>record.id===t.id && record.proposed===target);
 applying=true;document.querySelector('main').inert=true;let attempted=false;
 const readFresh=async()=>{const tab=await reopenSavedTransaction(chrome.tabs,expenseWorkerTab,expectedBusiness,t.id,current);expenseWorkerTab=tab.id;const snapshot=await waitForLiveSnapshot(()=>captureLive(tab.id,expectedBusiness,t.id),current);if(!current() || !snapshot)throw Error('Expense context changed.');return snapshot;};
 const saveReceipt=async extra=>storeEditReceipt(key,{...editReceipts[key],category:target,...extra});
 try{
  let snapshot=await readFresh();
  if(mode==='recheck'){
   const result=verifyCategoryResult(t,snapshot,expectedBusiness,target);await saveReceipt({...result,snapshot,verifiedAt:new Date().toISOString()});return editReceipts[key];
  }
  const prepared=prepareExpenseBatch(t,snapshot,{business:expectedBusiness,sample:false,categories:categoryNames(catalog,dataset.categories),categoryGroups:catalog?.groups});
  if(prepared.state==='completed'){
   await saveReceipt({categoryVerified:true,reviewedVerified:true,stage:'completed',snapshot,message:'Approved category and reviewed status already confirmed in Wave. Skipped without editing.'});shortlist.delete(t.id);renderPlan();rememberSoon();return {...editReceipts[key],skipped:true};
  }
  if(previous?.saveAttempted && prepared.state==='change')throw Error('Saved category is no longer confirmed. Do not repeat the edit.');
  await saveReceipt({saveAttempted:true,categoryVerified:prepared.state==='review',reviewedVerified:false,stage:'expense-edit',originalSnapshot:snapshot,reviewAttempted:prepared.state==='review',startedAt:new Date().toISOString(),message:'Expense attempt is not yet verified. Use Recheck saved expense.'});attempted=true;
  const outcome=(await chrome.scripting.executeScript({target:{tabId:expenseWorkerTab},func:editWaveTransaction,args:[prepared.request]}))[0]?.result;
  if(!outcome)throw Error('No expense edit result returned. Use Recheck saved expense.');
  // Retain the persisted lock even when a returned result is incomplete.
  await saveReceipt({editOutcome:outcome,reviewAttempted:editReceipts[key].reviewAttempted || !!outcome.reviewRequested,message:outcome.problem || 'Save requested. Verifying expense…'});
  if(outcome.problem){
   const recovered=recoverStoppedExpenseReceipt(editReceipts[key]);
   if(recovered!==editReceipts[key]){await storeEditReceipt(key,recovered);return {...recovered,needsAttention:true};}
   throw Error(outcome.problem);
  }
  snapshot=await readFresh();let result=verifyCategoryResult(t,snapshot,expectedBusiness,target);
  await saveReceipt({...result,snapshot,verifiedAt:new Date().toISOString()});
  if(!result.categoryVerified)throw Error(result.message);
  if(!result.reviewedVerified){
   if(editReceipts[key].reviewAttempted)throw Error('Review was attempted but could not be verified. Recheck the saved expense.');
   await saveReceipt({reviewAttempted:true,message:'Approved category verified. Completing reviewed status…'});
   const reviewed=(await chrome.scripting.executeScript({target:{tabId:expenseWorkerTab},func:editWaveTransaction,args:[{business:expectedBusiness,id:t.id,category:snapshot.fields.category,expected:snapshot.fields,reviewOnly:true}]}))[0]?.result;
   if(!reviewed)throw Error('No review result returned. Recheck the saved expense.');
   await saveReceipt({reviewOutcome:reviewed});if(reviewed.problem)throw Error(reviewed.problem);
   snapshot=await readFresh();result=verifyCategoryResult(t,snapshot,expectedBusiness,target);await saveReceipt({...result,snapshot,verifiedAt:new Date().toISOString()});
   if(!result.reviewedVerified)throw Error(result.message);
  }
  await saveReceipt({stage:'completed'});shortlist.delete(t.id);renderPlan();rememberSoon();return editReceipts[key];
 }catch(e){
  if(!attempted && !previous?.saveAttempted && e.diagnostics){await saveReceipt({saveAttempted:false,stage:'expense-preflight',message:e.message,diagnostics:e.diagnostics,checkedAt:new Date().toISOString()});return {...editReceipts[key],needsAttention:true};}
  if(attempted || previous?.saveAttempted){await saveReceipt({message:e.message+' Use Recheck saved expense; no automatic retry will occur.'});return editReceipts[key];}
  throw e;
 }finally{applying=false;document.querySelector('main').inert=false;updateApply();}
}

async function runWaveSuggestion(t,mode='run'){
 if(applying || listCollecting || bulkInspector?.busy() || !extensionMode || sampleMode || !business)throw Error('Finish other runs and collect the real Wave list first.');
 const expectedBusiness=business,data=dataset,from=workFrom(),key=business+':suggestion:'+t.id,previous=editReceipts[key];
 if(mode==='run' && previous?.attempted)throw Error('Suggestion has a saved attempt. Recheck it before any further action.');
 const current=()=>business===expectedBusiness && dataset===data && workFrom()===from;
 const expenseAttempt=editReceipts[expectedBusiness+':'+t.id];
 if(mode==='run' && expenseAttempt?.saveAttempted && (!expenseAttempt.categoryVerified || expenseAttempt.reviewAttempted) && !expenseAttempt.reviewedVerified)throw Error('This expense has an uncertain saved attempt. Recheck the saved expense before confirming a suggestion.');
 if(mode==='run' && Object.entries(editReceipts).some(([k,r])=>k.startsWith(expectedBusiness+':transfer:') && r.saveAttempted && r.ids?.includes(t.id)))throw Error('This record has a saved transfer attempt. Inspect the transfer result first.');
 if(mode==='recheck'){
  let verified=await runExpenseBatch(t,'recheck');if(verified.categoryVerified && !verified.reviewedVerified && previous?.outcome?.confirmed && !editReceipts[expectedBusiness+':'+t.id]?.reviewAttempted)verified=await runExpenseBatch(t);await storeEditReceipt(key,{...previous,...verified,attempted:true});expenseReview.render();suggestionReview?.render();return editReceipts[key];
 }
 const eligible=suggestionCandidates(listReview.report(),queue,rules,business,from).find(c=>c.id===t.id && c.proposed===t.proposed);
 if(!eligible)throw Error('Suggestion no longer matches an approved expense rule. Collect the list again.');
 const tabId=listReview.tab();if(tabId===null)throw Error('Collect Not Reviewed transactions again to reconnect its live tab.');
 applying=true;document.querySelector('main').inert=true;
 try{
  const tab=await reopenSavedTransaction(chrome.tabs,expenseWorkerTab,expectedBusiness,t.id,current);expenseWorkerTab=tab.id;
  const snapshot=await waitForLiveSnapshot(()=>captureLive(tab.id,expectedBusiness,t.id),current);
  const verified=verifyCategoryResult(t,snapshot,expectedBusiness,t.proposed);if(!current() || !verified.categoryVerified)throw Error('Live suggestion fields or category changed. Nothing confirmed.');
  if(verified.reviewedVerified){await storeEditReceipt(expectedBusiness+':'+t.id,{...verified,category:t.proposed,stage:'completed',message:'Approved category and reviewed status already verified.'});await storeEditReceipt(key,{...verified,attempted:false,message:'Approved category is already reviewed. Skipped without confirming a suggestion.'});expenseReview.render();suggestionReview?.render();return editReceipts[key];}
  const row=eligible.suggestionRow,expected={date:row.date,description:row.description,account:row.account,category:row.category,amountCents:row.amountCents};
  const request={action:'inspect',business:expectedBusiness,id:t.id,category:t.proposed,expected};
  const inspected=(await chrome.scripting.executeScript({target:{tabId},func:waveSuggestionAction,args:[request]}))[0]?.result;
  if(!inspected || inspected.problems?.length || !inspected.suggestionVisible){await storeEditReceipt(key,{attempted:false,inspection:inspected,message:inspected?.problems?.join('; ') || 'Cannot identify the thumbs-up control. Copy suggestion diagnostics.'});throw Error(editReceipts[key].message);}
  if(!current())throw Error('Session changed.');
  await storeEditReceipt(key,{attempted:true,category:t.proposed,reviewedVerified:false,inspection:inspected,message:'Suggestion confirmation requested; verification pending.'});
  const outcome=(await chrome.scripting.executeScript({target:{tabId},func:waveSuggestionAction,args:[{...request,action:'confirm'}]}))[0]?.result;
  await storeEditReceipt(key,{...editReceipts[key],outcome,message:!outcome?'No suggestion confirmation response returned. Use Recheck saved suggestion; the thumbs-up will not repeat automatically.':outcome.problems?.join('; ') || (outcome.confirmed?'Thumbs-up clicked. Checking saved category and reviewed status…':'Suggestion confirmation was not completed. Recheck its saved result.')});
  if(!outcome?.confirmed || outcome.problems?.length)throw Error(editReceipts[key].message || 'Suggestion response uncertain. Recheck saved suggestion.');
 }finally{applying=false;document.querySelector('main').inert=false;updateApply();}
 const verified=await runExpenseBatch(t);
 await storeEditReceipt(key,{...editReceipts[key],...verified,attempted:true,message:verified.reviewedVerified?'Wave suggestion confirmed; saved category and reviewed status verified.':verified.message});expenseReview.render();suggestionReview?.render();return editReceipts[key];
}
