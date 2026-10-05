import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestionCandidates,suggestionAudit} from '../extension/suggestions.js';
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

test('suggestion audit distinguishes old scans, no approved rule, category differences and ready rows',()=>{
 const old=suggestionAudit({business,records:[{...row,waveSuggestion:false}]},[t],[rule],business);assert.equal(old.needsRefresh,true);assert.equal(old.detected,0);
 const ready=suggestionAudit({business,suggestionDetectionVersion:2,records:[row]},[t],[rule],business);assert.equal(ready.needsRefresh,false);assert.equal(ready.detected,1);assert.equal(ready.counts['Ready to confirm'],1);
 const wrong=suggestionAudit({business,suggestionDetectionVersion:2,records:[{...row,category:'Office'}]},[t],[rule],business);assert.equal(wrong.rows[0].reason,'Wave category differs from approved category');assert.equal(wrong.rows[0].approvedCategory,'Software');assert.equal(wrong.eligible.length,0);
 const unknown=suggestionAudit({business,suggestionDetectionVersion:2,records:[row]},[{...t,kind:'Unclassified',proposed:''}],[],business);assert.equal(unknown.rows[0].reason,'No approved expense rule');assert.equal(unknown.eligible.length,0);
});
