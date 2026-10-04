export const defaultRules = [
  { merchant: '7-11', category: 'Fuel Expenses' },
  { merchant: '7-Eleven', category: 'Fuel Expenses' },
  { merchant: 'Chevron', category: 'Fuel Expenses' }
];
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false;
      if (c !== ',') { rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else if (c === '"') {
      if (field || closed) throw new Error('Invalid quote in CSV. Please export a comma-separated CSV.');
      quoted = true;
    } else { if (closed) throw new Error('Unexpected text after a quoted CSV value.'); field += c; }
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  if (field || row.length || closed) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}
export function normalize(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
export function matchRule(description, rules) {
  const words = ` ${normalize(description)} `;
  return rules.find(rule => {
    const merchant = normalize(rule.merchant);
    return merchant && words.includes(` ${merchant} `);
  });
}
export function suggest(description, current, rules, replaceExisting = false) {
  if (current.trim() && !replaceExisting) return { category: current, status: 'Existing', rule: '' };
  const rule = matchRule(description, rules);
  return rule ? { category: rule.category, status: 'Suggested', rule: rule.merchant } : { category: current, status: 'Needs review', rule: '' };
}
export function toCSV(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
}
