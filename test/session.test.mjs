import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validSession } from '../extension/session.js';
test('saved sessions require a valid business and supported CSV snapshot', () => {
  const session = { version: 1, business: '11111111-1111-1111-1111-111111111111', csvText: 'sample export', sourceName: 'accounting.csv', sample: false };
  assert.equal(validSession(session),true);
  assert.equal(validSession({...session,business:null,sample:true}),true);
  assert.equal(validSession({...session,business:'other-site'}),false);
  assert.equal(validSession({...session,version:2}),false);
  assert.equal(validSession({...session,csvText:{}}),false);
  assert.equal(validSession(null),false);
});
