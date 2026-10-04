import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog, categoryNames, chartGroups } from '../extension/catalog.js';
const catalog = () => ({ business: 'business-a', problems: [], groups: chartGroups.map((name,i) => ({ name, expected: 1, accounts: [{ key: JSON.stringify([name,`${name} account`]), number: String(i+1), name: `${name} account` }] })) });
test('complete catalogs provide names absent from the export', () => {
  const chart = validateCatalog(catalog(), 'business-a');
  assert.equal(categoryNames(chart, ['Old category','Expenses account']).length,6);
  assert.ok(categoryNames(chart).includes('Assets account'));
});
test('incomplete, stale-business and duplicate-name catalogs are rejected', () => {
  assert.throws(()=>validateCatalog(catalog(),'business-b'));
  const incomplete = catalog(); incomplete.groups.pop(); assert.throws(()=>validateCatalog(incomplete,'business-a'));
  const mismatch = catalog(); mismatch.groups[0].expected=2; assert.throws(()=>validateCatalog(mismatch,'business-a'));
  const duplicate = catalog(); duplicate.groups[0].accounts.push(duplicate.groups[0].accounts[0]); duplicate.groups[0].expected=2; assert.throws(()=>validateCatalog(duplicate,'business-a'));
  const numeric = catalog(); numeric.groups[0].accounts[0].number=1; assert.throws(()=>validateCatalog(numeric,'business-a'));
  const failed = catalog(); failed.problems.push('Unreadable tab'); assert.throws(()=>validateCatalog(failed,'business-a'));
});
test('blank and repeated account numbers do not discard distinct names', () => {
  const chart = catalog();
  chart.groups[0].accounts[0].number=null;
  chart.groups[1].accounts[0].number='3';
  assert.equal(validateCatalog(chart,'business-a'),chart);
});
test('built-in account names supplement the editable tab count',()=> {
  const chart=catalog();
  chart.groups[0].accounts.push({key:JSON.stringify(['Assets','Accounts Receivable']),name:'Accounts Receivable',number:null,counted:false});
  assert.equal(validateCatalog(chart,'business-a'),chart);
  assert.ok(categoryNames(chart).includes('Accounts Receivable'));
});
