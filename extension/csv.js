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
      if (field || closed) throw new Error('Invalid quote in CSV.'); quoted = true;
    } else { if (closed) throw new Error('Unexpected text after a quoted CSV value.'); field += c; }
  }
  if (quoted) throw new Error('Unclosed quoted CSV value.');
  if (field || row.length || closed) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}
