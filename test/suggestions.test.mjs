import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestionCandidates} from '../extension/suggestions.js';
const business='11111111-1111-1111-1111-111111111111',rule={name:'Fictional software',aliases:['Example Cloud'],category:'Software',business};
const t={id:'1000000000000000001',date:'2026-10-01',description:'Example Cloud',primary:{account:'Fictional Checking'},amount:1000,postings:[{},{}],categories:['Uncategorized Expense'],kind:'Merchant rule',direction:'out',proposed:'Software'};
const row={id:t.id,identity:'Wave transaction ID',date:t.date,description:t.description,account:t.primary.account,amountCents:t.amount,category:'Software',waveSuggestion:true,reviewed:'Not reviewed'};
const candidates=(change={},tx=t,rules=[rule],reportChange={})=>suggestionCandidates({business,records:[{...row,...change}],...reportChange},[tx],rules,business);
test('only identified outgoing suggestions already matching one approved category are eligible',()=>{
 assert.equal(candidates().length,1);
 for(const change of [{waveSuggestion:false},{suggestionControlDisabled:true},{category:'Office'},{identity:'Unique full-field export match'},{reviewed:'Reviewed'},{description:'Other merchant'},{account:'Other account'},{amountCents:1001},{date:'2026-10-02'}])assert.equal(candidates(change).length,0);
 for(const change of [{direction:'in'},{kind:'Transfer candidate'},{kind:'Possible refund'},{postings:[{},{},{}]},{date:'2024-01-01'}])assert.equal(candidates({}, {...t,...change}).length,0);
 assert.equal(candidates({},t,[]).length,0);
 assert.equal(candidates({},t,[rule,{...rule,category:'Other'}]).length,0);
 assert.equal(candidates({},t,[{...rule,accountNames:['Other account']}]).length,0);
 assert.equal(candidates({},t,[{...rule,business:'22222222-2222-2222-2222-222222222222'}]).length,0);
});
test('suggestion queues reject duplicate identities, other businesses and unfinished scans',()=>{
 assert.equal(candidates({},t,[rule],{records:[row,{...row}]}).length,0);
 assert.equal(candidates({},t,[rule],{business:'22222222-2222-2222-2222-222222222222'}).length,0);
 assert.equal(candidates({},t,[rule],{running:true}).length,0);
});
