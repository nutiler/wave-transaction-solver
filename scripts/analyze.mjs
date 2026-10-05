import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { liveMerchantAudit } from '../extension/list-view.js';
import { matchingRules } from '../extension/rules.js';
import { acceptProposal } from '../extension/rule-pack.js';
import { parseCSV } from '../extension/csv.js';
import { cents } from '../extension/model.js';
import { importAccounting } from '../extension/model.js';
import { analyzeHistory } from '../extension/analysis.js';
import { validateCatalog, categoryNames } from '../extension/catalog.js';
import { validateRulePack } from '../extension/rule-pack.js';
import { buildPlan, actionable } from '../extension/plan.js';
import { proposals } from '../extension/model.js';

const [csvPath,configPath,catalogPath,outPath='local-analysis']=process.argv.slice(2);
if(!csvPath || !configPath || !catalogPath) throw Error('Usage: node scripts/analyze.mjs accounting.csv private-context.json private-catalog.json local-analysis');
const output=path.resolve(outPath);
// Derived outputs must remain in the explicitly ignored directory.
if(path.basename(output)!=='local-analysis') throw Error('Output directory must be named local-analysis (excluded from Git).');
const raw=await fs.readFile(csvPath,'utf8'),config=JSON.parse((await fs.readFile(configPath,'utf8')).replace(/^\uFEFF/,'')),catalog=JSON.parse((await fs.readFile(catalogPath,'utf8')).replace(/^\uFEFF/,''));
validateCatalog(catalog,config.business);
const dataset=importAccounting(raw);
const source={name:path.basename(csvPath),sha256:createHash('sha256').update(raw,'utf8').digest('hex'),createdAt:new Date().toISOString(),transactions:dataset.transactions.length,ledgerRows:dataset.ledgerRows,earliest:dataset.earliest,latest:dataset.latest};
const rawRows=parseCSV(raw),headers=rawRows.shift();
const controls={debitCents:rawRows.reduce((sum,row)=>sum+cents(row[headers.indexOf('Debit Amount (Two Column Approach)')]),0),creditCents:rawRows.reduce((sum,row)=>sum+cents(row[headers.indexOf('Credit Amount (Two Column Approach)')]),0),accountNames:[...new Set(rawRows.map(row=>row[headers.indexOf('Account Name')]))].sort(),columns:headers.map((column,index)=>({column,nonempty:rawRows.filter(row=>row[index]?.trim()).length})),transactionsWithMemo:dataset.transactions.filter(t=>t.memos.length).length};
if(controls.debitCents!==controls.creditCents)throw Error('Full ledger failed independent debit/credit reconciliation.');
const data=analyzeHistory(dataset,config,source);
if(data.merchants.reduce((n,m)=>n+m.transactions,0)!==dataset.transactions.length)throw Error('Merchant-group reconciliation failed.');
validateRulePack(data.pack,{business:config.business,hash:source.sha256,categories:categoryNames(catalog,dataset.categories)});
await fs.mkdir(output,{recursive:true});
const save=(name,value)=>fs.writeFile(path.join(output,name),JSON.stringify(value,null,2)+'\n');
await save('proposed-rule-pack.local.json',data.pack);
await save('merchant-analysis.local.json',{source,merchants:data.merchants});
await save('review-queue.local.json',{source,merchants:data.judgmentQueue,refundCandidates:data.refundCandidates});
await save('proposed-session-plan.local.json',data.session);
const changes=data.session.candidates.filter(c=>c.action==='change_category_then_review'),recentConfirmations=data.session.candidates.filter(c=>c.action==='confirm_category_then_review').slice(0,20);
const safety=proposals(dataset.transactions,[],5,config.business);
const transferSeen=new Set(),transfers=[];
for(const t of safety.filter(t=>t.kind==='Transfer candidate' && t.date>=(config.workFrom || '2025-01-01') && t.partner.date>=(config.workFrom || '2025-01-01')).sort((a,b)=>b.date.localeCompare(a.date))) {const pair=[t.id,t.partner.id].sort().join(':');if(!transferSeen.has(pair) && transfers.length<10){transferSeen.add(pair);transfers.push({id:t.id,partner:t.partner,description:t.description,amountCents:t.amount,date:t.date,reason:t.reason,liveValidationRequired:true});}}
await save('next-session-shortlist.local.json',{format:'wave-solver-next-session-review',version:1,source,business:config.business,executed:false,changes,recentConfirmations,transferReview:transfers,reason:'Changes first, then recent confirmations after rule approvals. Transfer examples require both live records. Historical reviewed state is unknown.'});
await save('coverage.local.json',data.coverage);
if(config.backlog){
 let improved=config.approvedRules || [];for(const p of data.pack.proposals.filter(p=>p.tier==='strong_proposal'))improved=acceptProposal(data.pack,p.id,improved).rules;
 const before=liveMerchantAudit(config.backlog,config.approvedRules || [],dataset.transactions,proposals(dataset.transactions,config.approvedRules || [],5,config.business),config.business,config.workFrom),after=liveMerchantAudit(config.backlog,improved,dataset.transactions,proposals(dataset.transactions,improved,5,config.business),config.business,config.workFrom);
 const beforeById=new Map(before.rows.map(r=>[r.id,r])),byId=new Map(dataset.transactions.map(t=>[t.id,t]));const rows=after.rows.map(r=>{const t=byId.get(r.id),options=data.pack.proposals.filter(p=>p.tier==='needs_judgment' && p.transactionIds.includes(r.id));return {...r,date:t?.date,description:t?.description,account:t?.primary?.account,amountCents:t?.amount,category:t?.categories[0],resolution:beforeById.get(r.id)?.state==='known'?'Existing approved expense':r.state==='known'?'Strong proposal approval needed':options.length?'Category decision needed':r.bucket==='purchase_needing_rule'?'Unidentified purchase':r.bucket,proposals:options.map(p=>({id:p.id,merchant:p.rule.name,category:p.rule.category}))};});
 await save('backlog-review.local.json',{source,scanCapturedAt:config.backlog.capturedAt,baselineRulesSource:config.approvedRulesSource,before:before.buckets,after:after.buckets,rows,executed:false});
 const candidates=rows.filter(r=>r.resolution==='Category decision needed');const decisions=data.pack.proposals.filter(p=>p.tier==='needs_judgment' && p.evidence.backlog).sort((a,b)=>b.evidence.backlog-a.evidence.backlog).map(p=>({merchant:p.rule.name,proposedCategory:p.rule.category,count:p.evidence.backlog,amountCents:p.evidence.backlogCents,reason:p.reason,requiresDecision:true,transactions:p.evidence.backlogTransactions}));await save('backlog-decisions.local.json',{source,decisions,unidentified:rows.filter(r=>r.resolution==='Unidentified purchase'),nonPurchases:rows.filter(r=>!['Existing approved expense','Strong proposal approval needed','Category decision needed','Unidentified purchase'].includes(r.resolution))});
}

await save('source-controls.local.json',{source,controls});
await save('transaction-audit.local.json',{source,transactions:dataset.transactions});
await save('tag-suggestions.local.json',{source,existingTags:{status:'Not available',reason:'The accounting export has no tag field; the chart is not a tag list.'},proposedTags:[{name:'Subscription',purpose:'Recurring service charges; confirm actual recurrence before tagging.'},{name:'Fee or interest',purpose:'Explicit financing/service costs; keep principal payments separate.'},{name:'Receipt needed',purpose:'Mixed-purpose store purchases requiring item-level evidence.'},{name:'Refund review',purpose:'Incoming merchant credits or purchase/return pairs; not automatically transfers.'}],created:false,projectTags:'No jobs, clients, or projects inferred.'});
const approved=data.pack.proposals.filter(p=>p.tier==='existing_approved').map(p=>p.rule);
const q=proposals(dataset.transactions,config.approvedRules || approved,5,config.business).filter(t=>t.date>=(config.workFrom || '2025-01-01'));const executable=new Set(q.filter(actionable).map(t=>t.id));
const eligible=new Set(data.session.candidates.filter(c=>!c.requiresApproval.length && executable.has(c.id)).map(c=>c.id));
await save('approved-policy-draft.local.json',buildPlan(q,eligible,{business:config.business,sourceName:source.name,createdAt:source.createdAt}));
const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
const csv=(headers,rows)=>[headers,...rows].map(r=>r.map(quote).join(',')).join('\r\n');
await fs.writeFile(path.join(output,'merchant-analysis.csv'),csv(['Merchant','Confidence','Transactions','Outgoing transactions','Gross outgoing USD','Incoming transactions','Gross incoming USD','From','Through','Uncategorized','Refund candidates','Categories','Accounts','Reason'],data.merchants.map(m=>[m.merchant,m.confidence,m.transactions,m.outgoing,(m.outgoingCents/100).toFixed(2),m.incoming,(m.incomingCents/100).toFixed(2),m.earliest,m.latest,m.uncategorized,m.refundCandidates,JSON.stringify(m.categories),JSON.stringify(m.accounts),m.reason])));
await fs.writeFile(path.join(output,'review-queue.csv'),csv(['Priority','Merchant','Transactions','Gross outgoing USD','Uncategorized','Categories','Reason'],data.judgmentQueue.map(m=>[m.priority,m.merchant,m.transactions,(m.outgoingCents/100).toFixed(2),m.uncategorized,JSON.stringify(m.categories),m.reason])));
const dollars=c=>'$'+(c/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const strong=data.pack.proposals.filter(p=>p.tier==='strong_proposal');
const c=data.coverage;
const report=[
'# Local accounting review',
'',
'Entire accounting.csv processed. IDs are text, each balanced posting group is counted once, and amounts use integer cents. Source SHA-256: '+source.sha256,
'',
source.transactions+' transactions / '+source.ledgerRows+' postings, '+source.earliest+' through '+source.latest+'. '+data.merchants.length+' conservative merchant/description groups.',
'',
'Independent full-ledger control: debit and credit each '+dollars(controls.debitCents)+'. '+controls.accountNames.length+' ledger account names. '+controls.transactionsWithMemo+' transactions have memos, preserved in the audit and merchant summaries. Customer, vendor, invoice, bill, and line-description fields are empty in this export. No tag field exists.',
'',
'Reviewed status is unknown for every exported transaction. This package measures historical potential, not the current unreviewed backlog. No Wave transactions were changed. Baseline rules come from the last supplied browser rule audit where available. They may differ from current browser storage. The extension preserves current rules and replaces only explicitly accepted unchanged rule versions.',
'',
'## Coverage',
'',
'| Scope | Transactions | Gross outgoing USD | Category changes | Already matches | Overlaps | Conflicts |',
'|---|---:|---:|---:|---:|---:|---:|',
...[['Existing user policies',c.approved],['Strong new proposals only',c.strongOnly],['Combined union',c.combined]].map(([label,r])=>'| '+label+' | '+r.covered+' | '+dollars(r.coveredCents)+' | '+r.changes+' | '+r.confirmations+' | '+r.overlaps+' | '+r.conflicts+' |'),
'',
c.combined.eligible+' eligible outgoing records totaling '+dollars(c.combined.eligibleCents)+'. '+c.safetyExcluded+' records excluded by structural/payment/refund checks. Conflicts are withheld; same-category overlaps are counted once in coverage and separately as overlaps. Alias-family collisions: '+c.aliasCollisions.length+'.',
'',
'Amounts are gross: incoming credits are shown separately, not netted against purchases without confirmed links. Credit-card payment principal and loan principal are outside purchase coverage; explicit fee/interest costs retain separate proposals.',
'',
'## Backlog coverage',
'',
'Last supplied scan: '+c.backlog.total+' rows, '+c.backlog.found+' found in this export. Baseline '+c.backlog.baseline.covered+' / '+dollars(c.backlog.baseline.coveredCents)+'. After strong approvals '+c.backlog.improved.covered+' / '+dollars(c.backlog.improved.coveredCents)+'. '+c.backlog.improved.conflicts+' conflicting matches. Collect a fresh live list before execution; this snapshot can already be stale.',
'',
'Working period from '+(config.workFrom || '2025-01-01')+': baseline '+c.workingBaseline.covered+' / '+dollars(c.workingBaseline.coveredCents)+'; improved '+c.workingImproved.covered+' / '+dollars(c.workingImproved.coveredCents)+'. These are export records, not confirmed unreviewed records.',
'',
'## Strong new proposals ('+strong.length+')',
'',
...strong.sort((a,b)=>b.evidence.backlog-a.evidence.backlog).map(p=>'- **'+p.rule.name+'** → '+p.rule.category+'. '+p.evidence.backlog+' backlog matches; '+p.evidence.eligible+' eligible historical records / '+dollars(p.evidence.eligibleCents)+'. '+p.reason),
'',
'## Next session',
'',
'1. Reload the unpacked extension and import this exact accounting.csv under Usage → Set up your session. The new pack is bound to its SHA-256.',
'2. Under Usage → Manage merchant rules → Rule proposal review, import proposed-rule-pack.local.json with the matching accounting.csv session. The pack is bound to this exact export and business. A fresh export needs a regenerated pack.',
'3. Review the backlog counts, 2023–2024 evidence, aliases, and matching-scope changes. Accept individual strong proposals. Reject or leave uncertain rules pending. Accepting a rule changes local suggestions only.',
'4. Start with category changes in the proposed session plan; already-matching records are historical confirmations, not proven unreviewed items.',
'5. Open next-session-shortlist.local.json for the category changes, 20 most recent confirmations, and 10 recent transfer pairs to inspect individually.',
'6. Add a transaction using Plan, open its Wave record and inspect the live comparison before any later manual Apply. Changed or reviewed live records may make the export stale.',
'',
'Provider references, where used, are recorded in each proposal. These sources establish what a service offers; they do not prove the purpose of your individual purchase.',
'',
'approved-policy-draft.local.json contains only existing explicit user-policy candidates. proposed-session-plan.local.json also contains strong proposals and lists required approval IDs; it is deliberately a non-executable review format.',
'',
'## Priority review',
'',
...data.judgmentQueue.slice(0,35).map(m=>'- **'+m.merchant+'**: '+m.transactions+' records, '+dollars(m.outgoingCents)+' outgoing, '+m.uncategorized+' uncategorized. '+m.reason),
'',
'## Methods and limits',
'',
'Merchant aliases are explicitly supplied in local context. Unknown descriptions are cleaned only of standard bank wrappers and reference/card tails and otherwise remain separate. Store suffixes do not authorize merging other merchants. Bare numeric aliases match merchant position only. Broad processor names and mixed-purpose stores never gain strong confidence just from unanimous history.',
'',
'Strong proposals use clear service/product purpose plus consistent categorized purchases, or at least three mostly consistent 2023–2024 purchases. 2023–2024 receives weight 5, 2025 onward weight 2, earlier history weight 1; reliable years take priority over learning-year alternatives. Explicit small-sample exceptions require a configured minimum and are disclosed. Uncategorized records are missing evidence, not contradictions. Account-scoped proposals require at least five consistent records on that account, and explicitly exclude all other accounts. A consistent account does not prove business usage.',
'',
'All proposals permit only the target category or exact uncategorized category names. Other established categories are excluded, incoming transactions never receive expense rules, and reference codes cannot identify merchants.',
'',
'Refund candidates include same-account same-merchant incoming credits within 90 days where an earlier purchase can cover the amount. They may be partial refunds or unrelated credits. Candidates are not confirmed links and are never converted into transfers.',
'',
'Existing tags are unavailable because the export contains no tag field. Suggested tags are separate and no job/project is inferred.',
'',
'Full counts, spending, date ranges, account/category distributions, descriptor variants and text IDs are in merchant-analysis.local.json and merchant-analysis.csv. The entire remaining ambiguous population is in review-queue.local.json and review-queue.csv, not just the summary above.',
'',
'All report files are local and ignored by Git. Merchants and category-purpose interpretations come from this private export and explicit local context; no tax deductibility conclusions are made.'
].join('\n');
let backlogIntro='';
if(config.backlog){const review=JSON.parse(await fs.readFile(path.join(output,'backlog-review.local.json'),'utf8')),resolutions=review.rows.reduce((counts,r)=>(counts[r.resolution]=(counts[r.resolution]||0)+1,counts),{});backlogIntro=[
'# Start with the remaining backlog','',
'Reload the extension, import this exact accounting.csv under Usage → Set up your session, then import local-analysis/proposed-rule-pack.local.json under Usage → Manage merchant rules → Rule proposal review. Choose Backlog proposals. Proposals remain inactive until accepted.','',
strong.length+' strong new/upgrade proposals; '+data.pack.proposals.filter(p=>p.tier==='needs_judgment').length+' needing category judgment. Other proposal patterns are already approved.','',
'| Supplied backlog snapshot | Count |','|---|---:|',...Object.entries(resolutions).map(([name,count])=>'| '+name+' | '+count+' |'),'','After strong approvals: '+c.backlog.improved.covered+' known expenses / '+dollars(c.backlog.improved.coveredCents)+', versus '+c.backlog.baseline.covered+' / '+dollars(c.backlog.baseline.coveredCents)+'. '+c.backlog.improved.changes+' category changes / '+dollars(c.backlog.improved.changeCents)+'; '+c.backlog.improved.confirmations+' already match. '+c.backlog.improved.conflicts+' category conflicts. These are potential actions from the supplied snapshot, not proof the records remain unreviewed.','',
'backlog-decisions.local.json prioritizes category decisions and unidentified purchases. proposed-session-plan.local.json includes only eligible supplied-backlog records from '+(config.workFrom || '2025-01-01')+', with approval IDs and live-validation requirements. It is a non-executable review document. approved-policy-draft.local.json uses the solver draft format for current approved matches.','',
'Updates display the changed matching scope and retain previous versions after acceptance. Saved rules modified since the supplied audit remain intact. Other rules, saved receipts, and sessions are preserved.','',
'Earlier years remain evidence only. No pre-2025 transaction appears in the session plan. Collect a fresh live list before running any expense batch.','', '---',''].join('\n');}
await fs.writeFile(path.join(output,'START-HERE.md'),backlogIntro+report+'\n');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cards=data.merchants.sort((a,b)=>(b.ids.filter(id=>config.backlog?.records.some(r=>r.id===id)).length-a.ids.filter(id=>config.backlog?.records.some(r=>r.id===id)).length)||b.transactions-a.transactions).map(m=>'<details><summary>'+esc(m.merchant)+' — '+m.transactions+' records — '+esc(dollars(m.outgoingCents))+' — '+esc(m.confidence)+'</summary><p>'+esc(m.reason)+'</p><p>'+m.earliest+' to '+m.latest+'. Incoming '+esc(dollars(m.incomingCents))+' ('+m.incoming+' records). Uncategorized '+m.uncategorized+'. Refund candidates '+m.refundCandidates+'.</p><p>Active rules: '+esc((m.activeRuleNames || []).join('; ') || 'None')+'. Reliable 2023–2024 evidence: '+m.history.recentCount+' categorized purchases.</p><h3>Category history</h3><ul>'+m.categories.map(c=>'<li>'+esc(c.category)+': '+c.count+' records; outgoing '+esc(dollars(c.outgoingCents))+'</li>').join('')+'</ul><h3>Accounts</h3><ul>'+m.accounts.map(a=>'<li>'+esc(a.name)+': '+a.count+'</li>').join('')+'</ul><h3>All descriptor variants</h3><ul>'+m.descriptions.map(d=>'<li>'+esc(d.description)+' ('+d.count+')</li>').join('')+'</ul></details>').join('');
await fs.writeFile(path.join(output,'merchant-review.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>Local merchant review</title><style>body{background:#2e3440;color:#e5e9f0;font:16px system-ui;margin:32px auto;max-width:1100px;padding:0 20px}details{background:#353c49;padding:14px;margin:10px 0;border:1px solid #4c566a;border-radius:8px}summary{cursor:pointer}li{overflow-wrap:anywhere}a{color:#8bbcff}p{line-height:1.5}</style><h1>Local merchant review</h1><p>'+source.transactions+' transactions, '+source.ledgerRows+' postings. '+source.earliest+' to '+source.latest+'. New rules require approval. Reviewed status is unknown.</p><p>Combined historical potential: '+c.combined.covered+' records / '+esc(dollars(c.combined.coveredCents))+'. '+strong.length+' strong new proposals. Open START-HERE.md for definitions and the next-session plan.</p>'+cards+'</html>');
console.log(JSON.stringify({source,merchantGroups:data.merchants.length,proposalTiers:data.pack.proposals.reduce((o,p)=>(o[p.tier]=(o[p.tier]||0)+1,o),{}),coverage:c,backlog:data.pack.proposals.filter(p=>p.evidence.backlog).map(p=>({name:p.rule.name,tier:p.tier,backlog:p.evidence.backlog})),strong:strong.map(p=>({name:p.rule.name,eligible:p.evidence.eligible,changes:p.evidence.eligibleChange,amount:p.evidence.eligibleCents}))}));
