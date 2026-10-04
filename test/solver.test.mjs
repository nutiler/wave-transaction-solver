import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importAccounting, proposals, defaultRules, ruleFor, compareLive, cents, waveIdentity } from '../extension/model.js';
import { readWavePage } from '../extension/live-reader.js';
import { readFile } from 'node:fs/promises';
const headers = ['Transaction ID','Transaction Date','Account Name','Transaction Description','Debit Amount (Two Column Approach)','Credit Amount (Two Column Approach)','Account Group','Account Type','Account ID'];
function csv(rows) { return [headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n'); }
function transaction(id, date, account, description, amount, direction, type = 'Cash and Bank') {
  const debit = direction === 'in' ? amount : '', credit = direction === 'out' ? amount : '';
  return [[id,date,account,description,debit,credit,type === 'Credit Card' ? 'Liability' : 'Asset',type,account], [id,date,'Uncategorized Expense',description,credit,debit,'Expense','Expense','expense']];
}
test('export IDs retain all 19 digits and posting rows become one transaction', () => {
  const id = '1000000000000000001';
  const imported = importAccounting(csv(transaction(id,'2026-10-02','Checking','Chevron','2.01','out')));
  assert.equal(imported.transactions[0].id,id); assert.equal(imported.transactions.length,1); assert.equal(imported.transactions[0].amount,201);
  assert.throws(()=>importAccounting(csv([[id,'2026-10-02','Checking','Bad','','2.01','Asset','Cash and Bank','bank']])));
  assert.throws(()=>importAccounting('Date,Description\n2026-10-02,Chevron'));
});
test('credit card payments pair on debit/credit direction across posting dates', () => {
  const data=importAccounting(csv([...transaction('1','2026-10-02','Checking','Robinhood','1699.41','out'),...transaction('2','2026-10-01','Card','Payment','1699.41','in','Credit Card')]));
  const queue=proposals(data.transactions,defaultRules); assert.equal(queue[0].kind,'Transfer candidate'); assert.equal(queue[0].partner.id,'2'); assert.equal(queue[1].partner.id,'1');
});
test('ambiguous equal-amount payments are not assigned a counterpart', () => {
  const data=importAccounting(csv([...transaction('1','2026-10-02','Checking','Card payment','45.95','out'),...transaction('2','2026-10-01','Card','Payment','45.95','in','Credit Card'),...transaction('3','2026-10-02','Other checking','Card payment','45.95','out')]));
  for(const p of proposals(data.transactions,defaultRules)){assert.equal(p.kind,'Ambiguous transfer'); assert.equal(p.partner,null);}
});
test('same-account purchase and return stay in refund review', () => {
  const data=importAccounting(csv([...transaction('1','2026-09-01','Card','Chevron','50.00','out','Credit Card'),...transaction('2','2026-09-03','Card','Chevron','50.00','in','Credit Card')]));
  for(const p of proposals(data.transactions,defaultRules)) assert.equal(p.kind,'Possible refund');
});
test('approved aliases do not match 711 embedded in reference numbers', () => {
  assert.equal(ruleFor('PAYPAL INST XFER 200711 APPLE.COM',defaultRules),undefined);
  assert.equal(ruleFor('7-Elev #123',defaultRules)?.name,'7-Eleven');
  assert.equal(ruleFor('711 STORE',defaultRules)?.name,'7-Eleven');
  assert.equal(ruleFor('CHEVRONISH',defaultRules),undefined);
});
test('already-linked multi-account postings are not proposed as new transfers', () => {
  const data=importAccounting(csv([['1','2026-10-02','Checking','Transfer','','25','Asset','Cash and Bank','bank'],['1','2026-10-02','Card','Transfer','25','','Liability','Credit Card','card']]));
  assert.equal(proposals(data.transactions,defaultRules)[0].kind,'Existing multi-account');
});
test('unknown fields and changed live records fail comparison conservatively', () => {
  const expected=importAccounting(csv(transaction('1000000000000000001','2026-10-02','Checking','Chevron','2.01','out'))).transactions[0];
  const snapshot={identity:{transaction:expected.id},fields:{date:expected.date,account:'Checking',description:'Chevron',amount:'2.01',type:'Withdrawal',category:'Uncategorized Expense'},reviewed:'Unknown'};
  assert.equal(compareLive(expected,snapshot).state,'Export and visible fields match');
  assert.match(compareLive(expected,{...snapshot,fields:{...snapshot.fields,category:'Transfer to card'}}).state,/differs/);
  assert.match(compareLive(expected,{...snapshot,fields:{...snapshot.fields,description:''}}).state,/Incomplete/);
});
test('URLs are restricted to Wave and amounts use exact cents', () => {
  assert.equal(cents('1,699.41'),169941); assert.equal(cents('-2.01'),-201); assert.throws(()=>cents('2.001'));
  assert.equal(waveIdentity('https://evil.example/11111111-1111-1111-1111-111111111111/transactions/1'),null);
  assert.equal(waveIdentity('https://next.waveapps.com/11111111-1111-1111-1111-111111111111/transactions/1000000000000000001?status=NOT_VERIFIED').transaction,'1000000000000000001');
});
test('test extension restricts host access and reader has no mutation calls', async () => {
  const manifest=JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url),'utf8'));
  assert.deepEqual(manifest.host_permissions,['https://next.waveapps.com/*']); assert.equal(manifest.manifest_version,3);
  assert.doesNotMatch(readWavePage.toString(),/\.click\(|dispatchEvent\(|fetch\(|\.value\s*=|\.checked\s*=/);
});
