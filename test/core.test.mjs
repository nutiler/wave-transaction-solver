import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, toCSV, matchRule, suggest, defaultRules } from '../public/core.js';
test('CSV round trips descriptions with commas, quotes, newlines and leading zeros', () => {
  const rows = [['Date', 'Description', 'Amount', 'ID'], ['2026-09-01', 'Chevron, "store"\nPortland', '-64.20', '000123']];
  assert.deepEqual(parseCSV(toCSV(rows)), rows);
  assert.deepEqual(parseCSV('A,B\r\n"",2\r\n'), [['A', 'B'], ['', '2']]);
});
test('malformed CSV is rejected without dropping data', () => {
  assert.throws(() => parseCSV('A,B\n"unfinished,2'));
  assert.throws(() => parseCSV('A,B\n"value"bad,2'));
});
test('fuel rules handle merchant punctuation and do not match substrings', () => {
  for (const name of ['CHEVRON #123', 'POS 7-11 STORE', '7 ELEVEN #4', '7-Eleven']) assert.equal(matchRule(name, defaultRules)?.category, 'Fuel Expenses');
  for (const name of ['Chevronish', '17-11', '7-110', '']) assert.equal(matchRule(name, defaultRules), undefined);
});
test('existing categories are preserved unless replacement was requested', () => {
  assert.deepEqual(suggest('Chevron', 'Travel', defaultRules), { category: 'Travel', status: 'Existing', rule: '' });
  assert.equal(suggest('Chevron', 'Travel', defaultRules, true).category, 'Fuel Expenses');
  assert.equal(suggest('Unknown', '', defaultRules).status, 'Needs review');
  assert.equal(suggest('Chevron', '', []).status, 'Needs review');
});
