import { parseCSV } from './csv.js';
export const defaultRules = [{ name: '7-Eleven', aliases: ['7-Eleven', '7-11', '711', '7-Elev'], category: 'Equipment Fuel — Diesel, Gas, Machinery Fuel' }, { name: 'Chevron', aliases: ['Chevron'], category: 'Equipment Fuel — Diesel, Gas, Machinery Fuel' }];
export const normalize = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function ruleFor(description, rules) {
  const text = ` ${normalize(description)} `;
  return rules.find(r => r.aliases.some(a => normalize(a) && text.includes(` ${normalize(a)} `)));
}
export function cents(value) {
  const str = String(value ?? '').trim().replace(/[$,]/g, '');
  if (!str) return 0;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(str)) throw new Error(`Invalid monetary value: ${value}`);
  const [whole, fraction = ''] = str.replace(/^-/, '').split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error('Amount exceeds supported precision.');
  return str.startsWith('-') ? -result : result;
}
function day(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid transaction date: ${date}`);
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) throw new Error(`Invalid transaction date: ${date}`);
  return timestamp / 86400000;
}
export function importAccounting(text) {
  const rows = parseCSV(text), headers = rows.shift() || [];
  const required = ['Transaction ID', 'Transaction Date', 'Account Name', 'Transaction Description', 'Debit Amount (Two Column Approach)', 'Credit Amount (Two Column Approach)', 'Account Group', 'Account Type'];
  for (const header of required) if (!headers.includes(header)) throw new Error(`Missing ${header}. Choose accounting.csv from Wave Data Export, rather than the general-ledger report.`);
  if (rows.length > 150000) throw new Error('Import up to 150,000 ledger rows at a time.');
  const groups = new Map();
  rows.forEach((row, index) => {
    if (row.length !== headers.length) throw new Error(`Row ${index + 2} has an unexpected number of columns.`);
    const r = Object.fromEntries(headers.map((h, i) => [h, row[i]]));
    const id = r['Transaction ID'];
    if (!/^\d+$/.test(id)) throw new Error(`Missing or invalid transaction ID on row ${index + 2}.`);
    const posting = { id, date: r['Transaction Date'], day: day(r['Transaction Date']), description: r['Transaction Description'], account: r['Account Name'], accountId: r['Account ID'] || '', group: r['Account Group'], type: r['Account Type'], debit: cents(r['Debit Amount (Two Column Approach)']), credit: cents(r['Credit Amount (Two Column Approach)']), modified: r['Transaction Date Last Modified'] || '' };
    if (posting.debit < 0 || posting.credit < 0) throw new Error(`Negative debit or credit on row ${index + 2}; this format needs further inspection.`);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(posting);
  });
  const transactions = [...groups].map(([id, postings]) => {
    if (new Set(postings.map(p => p.date)).size !== 1) throw new Error(`Transaction ${id} has conflicting dates.`);
    if (postings.reduce((sum, p) => sum + p.debit - p.credit, 0) !== 0) throw new Error(`Transaction ${id} has unbalanced ledger entries.`);
    const endpoints = postings.filter(p => /^(Cash and Bank|Credit Card)$/.test(p.type) || (/loan/i.test(p.type) && p.group === 'Liability'));
    const primary = endpoints.length === 1 ? endpoints[0] : null;
    const categories = [...new Set(postings.filter(p => !endpoints.includes(p)).map(p => p.account))];
    return { id, postings, primary, categories, date: postings[0].date, day: postings[0].day, description: primary?.description || postings[0].description, existingTransfer: endpoints.length > 1, amount: primary ? Math.abs(primary.debit - primary.credit) : null, direction: primary ? (primary.debit > primary.credit ? 'in' : 'out') : null };
  });
  return { transactions, ledgerRows: rows.length, categories: [...new Set(transactions.flatMap(t => t.categories))].sort(), earliest: transactions.map(t => t.date).sort()[0] || '', latest: transactions.map(t => t.date).sort().at(-1) || '' };
}
const accountKey = p => p.accountId || normalize(p.account);
const paymentSignal = t => /\b(payment|pymt|pmt|epay|transfer|xfer|autopay|thank you)\b/i.test(t.description);
export function proposals(transactions, rules, windowDays = 5) {
  const buckets = new Map();
  for (const t of transactions) if (t.primary && t.amount > 0) { if (!buckets.has(t.amount)) buckets.set(t.amount, []); buckets.get(t.amount).push(t); }
  const transferOptions = new Map();
  for (const t of transactions) {
    const candidates = t.primary ? (buckets.get(t.amount) || []).filter(other => other.id !== t.id && accountKey(other.primary) !== accountKey(t.primary) && other.direction !== t.direction && Math.abs(other.day - t.day) <= windowDays && (paymentSignal(t) || paymentSignal(other))) : [];
    transferOptions.set(t.id, candidates);
  }
  return transactions.map(t => {
    const base = { ...t, kind: 'Unclassified', proposed: '', reason: '', partner: null };
    if (t.existingTransfer) return { ...base, kind: 'Existing multi-account', reason: 'Already has multiple bank/card/loan postings. Could be a transfer or split; check live state.' };
    if (!t.primary || !t.amount) return { ...base, kind: 'Manual review', reason: 'No single bank/card/loan posting to match safely.' };
    const candidates = transferOptions.get(t.id);
    if (candidates.length) {
      const partner = candidates[0];
      if (candidates.length === 1 && transferOptions.get(partner.id)?.length === 1) return { ...base, kind: 'Transfer candidate', proposed: `Match ${partner.primary.account}`, partner: { id: partner.id, account: partner.primary.account, date: partner.date }, reason: `Equal amount, opposite account movements, payment wording, ${Math.abs(partner.day - t.day)} day(s) apart. Confirm both existing records in Wave.` };
      return { ...base, kind: 'Ambiguous transfer', reason: `${candidates.length} possible counterpart(s); cannot choose a unique pair.` };
    }
    const rule = ruleFor(t.description, rules);
    const merchantKey = rule?.name || normalize(t.description);
    const refunds = (buckets.get(t.amount) || []).filter(other => other.id !== t.id && accountKey(other.primary) === accountKey(t.primary) && other.direction !== t.direction && Math.abs(other.day - t.day) <= 60 && (ruleFor(other.description, rules)?.name || normalize(other.description)) === merchantKey);
    if (refunds.length) return { ...base, kind: 'Possible refund', reason: `${refunds.length} equal-amount opposite movement(s) on the same account and merchant within 60 days. Needs review; not a transfer.` };
    if (t.direction === 'in') return { ...base, kind: 'Credit / incoming', reason: 'Incoming movement. Review payment/refund/income context before categorizing.' };
    if (rule) return { ...base, kind: 'Merchant rule', proposed: rule.category, reason: `Approved alias group: ${rule.name}. Export category ${t.categories.includes(rule.category) ? 'already matches' : 'differs'}; reviewed status is unknown.` };
    return { ...base, reason: 'No approved merchant rule. Use the current category and your knowledge to review.' };
  });
}
export function waveIdentity(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://next.waveapps.com') return null;
    const match = parsed.pathname.match(/^\/([0-9a-f-]{36})\/transactions(?:\/(\d+))?\/?$/i);
    return match ? { business: match[1], transaction: match[2] || null } : null;
  } catch { return null; }
}
export function compareLive(expected, snapshot) {
  const checks = [];
  const add = (field, exported, live, equal) => checks.push({ field, exported, live: live || 'Not readable', state: live ? (equal ? 'Match' : 'Different') : 'Unknown' });
  add('Transaction ID', expected.id, snapshot.identity?.transaction, snapshot.identity?.transaction === expected.id);
  add('Date', expected.date, snapshot.fields.date, snapshot.fields.date === expected.date);
  add('Account', expected.primary?.account || '', snapshot.fields.account, normalize(snapshot.fields.account) === normalize(expected.primary?.account || ''));
  add('Description', expected.description, snapshot.fields.description, snapshot.fields.description?.trim() === expected.description.trim());
  let amountMatches = false; try { amountMatches = Math.abs(cents(snapshot.fields.amount)) === expected.amount; } catch {}
  add('Amount', expected.amount === null ? 'Multiple postings' : (expected.amount / 100).toFixed(2), snapshot.fields.amount, amountMatches);
  const type = expected.direction === 'out' ? 'Withdrawal' : 'Deposit';
  add('Type', type, snapshot.fields.type, snapshot.fields.type === type);
  add('Category', expected.categories.join(' + '), snapshot.fields.category, expected.categories.length === 1 && normalize(snapshot.fields.category) === normalize(expected.categories[0]));
  return { checks, state: checks.some(c => c.state === 'Different') ? 'Live data differs — inspect before any future edit' : checks.some(c => c.state === 'Unknown') ? 'Incomplete — some Wave fields could not be read' : 'Export and visible fields match', reviewed: snapshot.reviewed || 'Unknown' };
}
