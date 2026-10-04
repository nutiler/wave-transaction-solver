import { defaultRules, parseCSV, suggest, toCSV } from './core.js';
const $ = id => document.getElementById(id);
let rules = defaultRules.map(r => ({ ...r })), source = [], headers = [], records = [], columns;
try { const saved = JSON.parse(localStorage.getItem('ledger-rules-v1')); if (Array.isArray(saved) && saved.every(r => typeof r.merchant === 'string' && r.merchant.trim() && typeof r.category === 'string' && r.category.trim())) rules = saved; } catch {}
const element = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
function error(message = '') { $('error').textContent = message; }
function saveRules() { try { localStorage.setItem('ledger-rules-v1', JSON.stringify(rules)); } catch { error('Rules could not be saved in this browser. You can still use them in this session.'); } }
function refreshSuggestions() {
  if (!records.length) return;
  for (const r of records) if (r.status !== 'Approved') Object.assign(r, suggest(r.description, r.originalCategory, rules, columns.replace));
  render();
}
function renderRules() {
  $('rules').replaceChildren();
  rules.forEach((rule, index) => {
    const row = element('div', undefined, 'rule');
    const remove = element('button', 'Remove', 'remove'); remove.setAttribute('aria-label', `Remove rule for ${rule.merchant}`);
    remove.onclick = () => { rules.splice(index, 1); saveRules(); renderRules(); refreshSuggestions(); };
    row.append(element('strong', rule.merchant), element('span', `→ ${rule.category}`, 'pill'), remove); $('rules').append(row);
  });
}
$('ruleform').onsubmit = event => {
  event.preventDefault(); const merchant = $('merchant').value.trim(), category = $('rulecategory').value.trim();
  if (!merchant || !category) return;
  rules.push({ merchant, category }); saveRules(); renderRules(); refreshSuggestions(); $('merchant').value = '';
};
function load(text, name) {
  error();
  const data = parseCSV(text);
  if (data.length < 2 || data[0].length < 2) throw new Error('Include a header row and at least one transaction, separated by commas.');
  const width = data[0].length;
  const invalid = data.slice(1).findIndex(row => row.length !== width);
  if (invalid !== -1) throw new Error(`Transaction ${invalid + 1} has a different number of columns than the header. Check the CSV before importing.`);
  if (data.length > 50001) throw new Error('Please import up to 50,000 transactions at a time.');
  headers = data[0]; source = data.slice(1); records = [];
  $('review').hidden = true;
  $('filename').textContent = `${name} · ${source.length.toLocaleString()} transactions`;
  const guesses = { description: /description|merchant|payee|memo|details|name/i, date: /date/i, amount: /^(amount|total|net amount)$/i, category: /category|account name/i };
  for (const id of ['description', 'date', 'amount', 'category']) {
    const select = $(id); select.replaceChildren();
    if (id !== 'description') { const opt = element('option', 'Not included'); opt.value = '-1'; select.append(opt); }
    headers.forEach((header, index) => { const opt = element('option', `${header || 'Unnamed column'} (${index + 1})`); opt.value = String(index); select.append(opt); });
    const guessed = headers.findIndex(h => guesses[id].test(h)); select.value = String(guessed >= 0 ? guessed : id === 'description' ? 0 : -1);
  }
  $('mapping').hidden = false;
}
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file) return;
  try { if (file.size > 25 * 1024 * 1024) throw new Error('Please choose a CSV under 25 MB.'); load(await file.text(), file.name); } catch (e) { error(e.message); }
};
$('demo').onclick = () => { try { load('Date,Description,Amount,Category\n2026-09-01,CHEVRON #123,-64.20,\n2026-09-02,7-11 STORE 882,-32.10,\n2026-09-03,7-ELEVEN #44,-18.50,\n2026-09-04,Office supplies,-45.00,Office Expenses\n2026-09-05,Unknown merchant,-21.99,', 'Sample data (fictional)'); } catch (e) { error(e.message); } };
$('organize').onclick = () => {
  columns = Object.fromEntries(['description', 'date', 'amount', 'category'].map(id => [id, Number($(id).value)])); columns.replace = $('replace').checked;
  records = source.map((row, id) => {
    const description = row[columns.description] || '', originalCategory = row[columns.category] || '';
    return { id, description, originalCategory, date: row[columns.date] || '', amount: row[columns.amount] || '', ...suggest(description, originalCategory, rules, columns.replace) };
  });
  $('review').hidden = false; render(); $('review').scrollIntoView({ behavior: 'smooth' });
};
function visible() {
  const query = $('search').value.trim().toLowerCase(), filter = $('filter').value;
  return records.filter(r => (!filter || r.status === filter) && `${r.description} ${r.category}`.toLowerCase().includes(query));
}
function render() {
  const counts = status => records.filter(r => r.status === status).length;
  $('summary').textContent = `${records.length.toLocaleString()} transactions · ${counts('Suggested')} suggested · ${counts('Needs review')} need review · ${counts('Approved')} approved · ${counts('Existing')} existing`;
  $('transactions').replaceChildren();
  const shown = visible();
  for (const r of shown.slice(0, 500)) {
    const tr = element('tr'); tr.append(element('td', r.date || '—'), element('td', r.description || '(No description)'), element('td', r.amount || '—'));
    const category = element('td'), input = element('input'); input.value = r.category; input.setAttribute('aria-label', `Category for ${r.description}`);
    input.onchange = () => { r.category = input.value.trim(); r.status = r.category ? 'Approved' : 'Needs review'; r.rule = ''; render(); };
    category.append(input); if (r.rule) category.append(element('small', `Rule: ${r.rule}`)); tr.append(category);
    const status = element('td'); status.append(element('span', r.status, `status${r.status === 'Needs review' ? ' needs' : ''}`)); tr.append(status);
    const action = element('td');
    if (r.status === 'Suggested') { const button = element('button', 'Approve', 'secondary'); button.onclick = () => { r.status = 'Approved'; render(); }; action.append(button); }
    tr.append(action); $('transactions').append(tr);
  }
  if (!shown.length || shown.length > 500) {
    const tr = element('tr'), td = element('td', shown.length ? `Showing the first 500 of ${shown.length.toLocaleString()} matches. Filter to narrow the view. Export includes all transactions.` : 'No transactions match this filter.'); td.colSpan = 6; tr.append(td); $('transactions').append(tr);
  }
  $('approve').disabled = !shown.some(r => r.status === 'Suggested');
  $('approve').textContent = `Approve ${shown.filter(r => r.status === 'Suggested').length} matching suggestions`;
}
$('search').oninput = render; $('filter').onchange = render;
$('approve').onclick = () => { visible().forEach(r => { if (r.status === 'Suggested') r.status = 'Approved'; }); render(); };
$('export').onclick = () => {
  const existing = new Set(headers);
  const unique = name => { let candidate = name, i = 2; while (existing.has(candidate)) candidate = `${name} ${i++}`; existing.add(candidate); return candidate; };
  const extra = ['Organizer Category', 'Organizer Review Status', 'Organizer Matched Rule'].map(unique);
  const text = toCSV([[...headers, ...extra], ...records.map(r => [...source[r.id], r.category, r.status, r.rule])]);
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const anchor = element('a'); anchor.href = url; anchor.download = 'organized-transactions.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
renderRules();
