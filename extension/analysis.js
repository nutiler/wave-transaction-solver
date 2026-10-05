import { normalize, merchantText, matchesDescription, nonPurchaseReason, matchingRules } from './rules.js';
import { proposals } from './model.js';
import { ruleCoverage, ruleFingerprint, acceptProposal } from './rule-pack.js';
import { recordSnapshot } from './plan.js';
import { historySuggestions } from './history.js';

const unresolved = c => /^(?:Uncategorized |Personal Uncategorized)/i.test(c);
const money = ts => ts.reduce((n,t)=>n+(t.amount || 0),0);
export function summarize(transactions) {
  const distribution = new Map(), accounts = new Map(), descriptions = new Map(), memos = new Map();
  for (const t of transactions) {
    const key=t.categories.length===1?t.categories[0]:t.categories.join(' + ') || '(No non-bank category)';
    if(!distribution.has(key))distribution.set(key,{category:key,count:0,outgoing:0,incoming:0,outgoingCents:0});
    const row=distribution.get(key);row.count++;if(t.direction==='out'){row.outgoing++;row.outgoingCents+=t.amount || 0;}if(t.direction==='in')row.incoming++;
    if(t.primary){const key=t.primary.accountId+'|'+t.primary.account;if(!accounts.has(key))accounts.set(key,{id:t.primary.accountId,name:t.primary.account,count:0,categories:{}});const a=accounts.get(key);a.count++;a.categories[t.categories.join(' + ')]=(a.categories[t.categories.join(' + ')]||0)+1;}
    for(const memo of t.memos || []) memos.set(memo,(memos.get(memo)||0)+1);
    descriptions.set(t.description,(descriptions.get(t.description)||0)+1);
  }
  const outgoing=transactions.filter(t=>t.direction==='out'),incoming=transactions.filter(t=>t.direction==='in');
  const known=[...distribution.values()].filter(d=>!unresolved(d.category));
  return { transactions:transactions.length,outgoing:outgoing.length,outgoingCents:money(outgoing),incoming:incoming.length,incomingCents:money(incoming),unassignedAmountTransactions:transactions.filter(t=>t.amount===null).length,ledgerAccountsUsed:[...new Set(transactions.flatMap(t=>t.postings.map(p=>p.account)))].sort(),earliest:transactions.map(t=>t.date).sort()[0] || '',latest:transactions.map(t=>t.date).sort().at(-1)||'',uncategorized:transactions.filter(t=>t.categories.some(unresolved)).length,conflictingHistory:known.length>1,categories:[...distribution.values()].sort((a,b)=>b.count-a.count),accounts:[...accounts.values()],memos:[...memos].map(([memo,count])=>({memo,count})),descriptions:[...descriptions].map(([description,count])=>({description,count})).sort((a,b)=>b.count-a.count) };
}
export function historicalEvidence(transactions) {
  const rows=transactions.filter(t=>t.direction==='out' && !nonPurchaseReason(t) && t.categories.length===1 && !unresolved(t.categories[0]));
  const years=new Map(),scores=new Map();
  for(const t of rows){const year=Number(t.date.slice(0,4)),category=t.categories[0],weight=year===2023 || year===2024 ? 5 : year>=2025 ? 2 : 1;if(!years.has(year))years.set(year,{});years.get(year)[category]=(years.get(year)[category]||0)+1;scores.set(category,(scores.get(category)||0)+weight);}
  const recent=rows.filter(t=>t.date>='2023-01-01' && t.date<'2025-01-01'),recentCategories=summarize(recent).categories;
  const weightedCategories=[...scores].map(([category,score])=>({category,score})).sort((a,b)=>b.score-a.score),totalScore=[...scores.values()].reduce((a,b)=>a+b,0);
  return {weights:{'2023–2024':5,'2025 onward':2,'2022 and earlier':1},knownPurchaseCount:rows.length,byYear:[...years].sort((a,b)=>a[0]-b[0]).map(([year,categories])=>({year,categories})),recentYears:'2023–2024',recentCount:recent.length,recentCategories,weightedCategories,weightedShare:totalScore ? (weightedCategories[0]?.score || 0)/totalScore : 0};
}
export function cleanDescriptor(description) {
  // Leave unknown merchants conservatively separate. No global number stripping.
  return normalize(merchantText(description));
}
export function analyzeHistory(dataset, config, source) {
  const business=config.business,workingFrom=config.workFrom || '2025-01-01',backlogIds=new Set((config.backlog?.records || []).map(r=>r.id));
  const familyRules=config.groups.map(g=>({...g,category:g.category || '(Review category)'}));
  const groups=new Map(), aliasCollisions=[];
  const txFamily=new Map();
  for(const t of dataset.transactions) {
    const matched=familyRules.filter(r=>matchesDescription(t.description,r));
    let definition=null,key;
    if(matched.length===1){definition=matched[0];key=definition.name;}
    else {key=cleanDescriptor(t.description)||'(Empty description)';if(matched.length>1)aliasCollisions.push({id:t.id,description:t.description,families:matched.map(g=>g.name)});}
    txFamily.set(t.id,key);
    if(!groups.has(key))groups.set(key,{merchant:definition?.name || merchantText(t.description) || '(Empty description)',definition,transactions:[]});
    groups.get(key).transactions.push(t);
  }
  // Refund candidates are not limited to full refunds. Incoming return wording
  // and merchant credits retain an explicit review classification.
  const baseline=proposals(dataset.transactions,[],5,business);
  const dangerIds=new Set(baseline.filter(t=>['Transfer candidate','Ambiguous transfer','Possible refund','Existing multi-account','Manual review'].includes(t.kind)).map(t=>t.id));
  for(const t of dataset.transactions)if(nonPurchaseReason(t))dangerIds.add(t.id);
  const possibleRefunds=[];
  for(const t of dataset.transactions)if(t.direction==='in' && t.primary){
    const family=txFamily.get(t.id), candidates=dataset.transactions.filter(o=>o.primary && o.direction==='out' && o.primary.accountId===t.primary.accountId && txFamily.get(o.id)===family && o.day<=t.day && t.day-o.day<=90 && o.amount>=t.amount);
    if(/return|refund|reversal/i.test(t.description)||candidates.length){possibleRefunds.push({id:t.id,family,amountCents:t.amount,candidates:candidates.map(c=>c.id),confidence:'candidate_only',reason:'Same account and merchant within 90 days, or explicit return wording. Partial refunds possible; amount/date alone do not establish a refund.'});}
  }
  const resultProposals=[], merchants=[], judgmentQueue=[];
  const makeProposal=(g,ts,rule,tier,reason)=>{
    const evidence=summarize(ts),history=historicalEvidence(ts),known=evidence.categories.filter(c=>c.outgoing && !unresolved(c.category));
    const safe=ts.filter(t=>!dangerIds.has(t.id)&&matchingRules(t.description,[rule],t,business).length);
    if (tier==='strong_proposal' && !safe.length) { tier='needs_judgment'; reason+=' No eligible purchase record survives payment safeguards; review individually.'; }
    const p={id:'proposal-'+resultProposals.length,tier,rule:{...rule,direction:'out'},reason,evidence:{...evidence,history,knownOutgoing:known.reduce((n,c)=>n+c.outgoing,0),eligible:safe.length,eligibleCents:money(safe),eligibleChange:safe.filter(t=>t.categories[0]!==rule.category).length,excluded:ts.length-safe.length,backlog:safe.filter(t=>backlogIds.has(t.id) && t.date>=workingFrom).length,backlogCents:money(safe.filter(t=>backlogIds.has(t.id) && t.date>=workingFrom)),backlogTransactions:safe.filter(t=>backlogIds.has(t.id) && t.date>=workingFrom).map(t=>({id:t.id,date:t.date,description:t.description,category:t.categories[0],account:t.primary.account,amountCents:t.amount}))},exclusions:['Incoming credits, transfers, financing, owner movements, cash withdrawals, split postings, and identified refund pairs','Already categorized in another category'],transactionIds:safe.map(t=>t.id),sources:g.definition?.sources || [],purposeEvidence:g.definition?.purpose || 'Purchase purpose not established from the bank description',approved:false};
    const replacements=(config.approvedRules || []).filter(r=>(!r.business || r.business===business) && r.category===rule.category && (r.name===g.merchant || (r.aliases.some(a=>rule.aliases.some(b=>normalize(a)===normalize(b))) && JSON.stringify([r.accountIds||[],r.accountNames||[]])===JSON.stringify([rule.accountIds||[],rule.accountNames||[]]))));
    const unchanged=replacements.length===1 && ruleFingerprint({...replacements[0],business:null})===ruleFingerprint({...p.rule,business:null});
    if(unchanged){p.tier='existing_approved';p.changeType='Current approved rule';p.reason+=' This matching scope is already approved; no replacement needed.';}
    else if(replacements.length){p.replaces=replacements.map(ruleFingerprint);p.replacementNames=replacements.map(r=>r.name);p.changeType='Improve existing rule';if(tier==='existing_approved'){p.tier='strong_proposal';p.reason+=' Alias/scope upgrade requires approval; the existing rule remains active until accepted.';}}
    else p.changeType='New merchant rule';
    if(p.replaces?.length){p.scopeChanges=[];for(const old of replacements)for(const key of ['accountIds','accountNames','excludedAccountIds','excludedAccountNames','onlyCategories','excludeCategories'])if(JSON.stringify(old[key]||[])!==JSON.stringify(rule[key]||[]))p.scopeChanges.push({rule:old.name,field:key,before:old[key]||[],after:rule[key]||[]});}
    resultProposals.push(p);return p;
  };
  for(const g of groups.values()){
    const evidence=summarize(g.transactions),history=historicalEvidence(g.transactions),out=g.transactions.filter(t=>t.direction==='out'),d=g.definition;
    const known=evidence.categories.filter(c=>c.outgoing && !unresolved(c.category));
    const target=d?.category || (known.length===1?known[0].category:'');
    let tier='needs_judgment',reason;
    if(d?.approved) {tier='existing_approved';reason=d.reason+' Existing user policy; individual exceptions remain excluded from the prepared session.';}
    else if(d?.narrow && target && history.recentCount>=3 && history.recentCategories[0]?.category===target && history.recentCategories[0].count/history.recentCount>=0.9) {tier='strong_proposal';reason=d.purpose+' Reliable 2023–2024 purchase history supports this category ('+history.recentCategories[0].count+' of '+history.recentCount+'). Earlier alternatives remain visible and are not overwritten. Uncategorized entries are gaps, not contradictions.';}
    else if(d?.narrow && target && known.length===1 && known[0].category===target && known[0].outgoing>=(d.minimumKnown || 3)) {tier='strong_proposal';reason=d.purpose+' Categorized outgoing purchases agree, and no other known outgoing category conflicts. Confirm usage before accepting.';}
    else reason=d?.reason || (known.length>1?'Conflicting historical categories; receipts and purchase purpose are required.': 'History or merchant identity alone does not establish purchase purpose.');
    if(tier==='strong_proposal' && !g.transactions.some(t=>!dangerIds.has(t.id))) { tier='needs_judgment'; reason+=' All records require payment or structural review; no eligible suggestion.'; }
    const analysis={merchant:g.merchant,...evidence,history,tier,reason,confidence:tier==='strong_proposal'?'Strong evidence, unapproved':tier==='existing_approved'?'User policy with exceptions':'Individual judgment',refundCandidates:possibleRefunds.filter(r=>r.family===txFamily.get(g.transactions[0].id)).length,ids:g.transactions.map(t=>t.id)};
    merchants.push(analysis);
    if(target && d){
      const rawRule={name:g.merchant,aliases:d.aliases,category:target,matchMode:d.matchMode || 'words',excludeAliases:d.excludeAliases || [],...(d.storeAliases?.length?{storeAliases:d.storeAliases}:{}),onlyCategories:[target,...dataset.categories.filter(unresolved)]};
      const mainProposal=makeProposal(g,g.transactions,rawRule,tier,reason);analysis.proposalTier=mainProposal.tier;analysis.activeRuleNames=(config.approvedRules || []).filter(r=>g.transactions.some(t=>matchingRules(t.description,[r],t,business).length)).map(r=>r.name);
      // Narrow merchant purpose plus a consistent account history can justify a
      // scoped proposal. Other accounts are explicitly outside that rule.
      if(tier==='needs_judgment' && d.narrow && !d.noScope) {
        for(const a of evidence.accounts) {
          const accountTx=out.filter(t=>t.primary?.accountId===a.id && t.primary?.account===a.name),cats=summarize(accountTx).categories.filter(c=>!unresolved(c.category));
          if(cats.length===1 && cats[0].category===target && cats[0].count>=5){
            const rule={...rawRule,name:g.merchant+' ('+a.name+')',accountIds:a.id?[a.id]:undefined,accountNames:[a.name]};
            makeProposal(g,accountTx,rule,'strong_proposal',d.purpose+' The entire outgoing history on this account has one known category ('+cats[0].count+' records). Other accounts remain in review; account scope does not prove business use.');
          }
        }
      }
    }
    if(tier==='needs_judgment')judgmentQueue.push({merchant:g.merchant,...evidence,reason,categoryOptions:known.map(c=>c.category),workflow:g.transactions.some(t=>!nonPurchaseReason(t))?'Merchant purpose review':'Payments, credits, cash or financing review',priority:out.some(t=>t.categories.some(unresolved))?'Uncategorized purchases':known.length>1?'Conflicting categories':'Confirm purpose',ids:g.transactions.map(t=>t.id)});
  }
  // Optional history-only candidates are proposals needing judgment even when
  // every known category agrees. Purpose must never be inferred from counts alone.
  if(config.includeHistoryProposals){
    const byId=new Map(dataset.transactions.map(t=>[t.id,t]));
    const history=historySuggestions(dataset.transactions,config.approvedRules || [],3,business,{families:familyRules,backlogIds,from:workingFrom,blockedIds:dangerIds});
    for(const h of history){
      if(!h.category || h.aliases.length>100 || resultProposals.some(p=>normalize(p.rule.name)===normalize(h.merchant)))continue;
      const rows=h.transactionIds.map(id=>byId.get(id)),rule={name:h.merchant.slice(0,200),aliases:h.aliases,category:h.category,matchMode:'exact',onlyCategories:[h.category,...dataset.categories.filter(unresolved)]};
      const reason=h.known+' categorized purchases agree; '+h.unresolved+' gaps. This is historical evidence only: verify merchant identity and business/personal use before accepting. Exact descriptors retain store numbers and processor distinctions.';
      const p=makeProposal({merchant:h.merchant},rows,rule,'needs_judgment',reason);
      p.historyOnly=true;p.evidence.historyReview=h;
      const m=merchants.find(m=>normalize(m.merchant)===normalize(h.merchant));if(m)m.proposalTier=p.tier;
    }
  }
  const approved=resultProposals.filter(p=>p.tier==='existing_approved').map(p=>p.rule),strong=resultProposals.filter(p=>p.tier==='strong_proposal').map(p=>p.rule);
  const coverage={
    definition:'Historical potential on outgoing, single-category, two-posting bank/card records. Excludes recognized financing, transfers, refunds, cash, owner movements, and conflicting established categories. No count is an unreviewed live backlog. Incoming amounts and all spending are gross, not netted.',
    totalTransactions:dataset.transactions.length,ledgerRows:dataset.ledgerRows,
    approved:ruleCoverage(dataset.transactions,approved,business,dangerIds),
    strongOnly:ruleCoverage(dataset.transactions,strong,business,dangerIds),
    combined:ruleCoverage(dataset.transactions,[...approved,...strong],business,dangerIds),
    allProposalsIfApproved:ruleCoverage(dataset.transactions,resultProposals.map(p=>p.rule),business,dangerIds),
    aliasCollisions,
    classificationCounts:baseline.reduce((o,t)=>(o[t.kind]=(o[t.kind]||0)+1,o),{}),
    reviewedStatus:'Unknown for every exported record',
    safetyExcluded:dangerIds.size
  };
  let proposedRules=[...(config.approvedRules || approved)];
  for(const p of resultProposals.filter(p=>p.tier==='strong_proposal'))proposedRules=acceptProposal({business,source,proposals:resultProposals},p.id,proposedRules).rules;
  if(!config.approvedRules)proposedRules=[...approved,...strong];
  coverage.baseline=ruleCoverage(dataset.transactions,config.approvedRules || approved,business,dangerIds);
  coverage.improved=ruleCoverage(dataset.transactions,proposedRules,business,dangerIds);
  if(config.approvedRules){coverage.approved=coverage.baseline;coverage.combined=coverage.improved;}
  coverage.workingBaseline=ruleCoverage(dataset.transactions.filter(t=>t.date>=workingFrom),config.approvedRules || approved,business,dangerIds);
  coverage.workingImproved=ruleCoverage(dataset.transactions.filter(t=>t.date>=workingFrom),proposedRules,business,dangerIds);
  const backlogTx=dataset.transactions.filter(t=>backlogIds.has(t.id) && t.date>=workingFrom);
  coverage.backlog={capturedAt:config.backlog?.capturedAt,total:backlogIds.size,found:backlogTx.length,baseline:ruleCoverage(backlogTx,config.approvedRules || approved,business,dangerIds),improved:ruleCoverage(backlogTx,proposedRules,business,dangerIds)};
  const sessionCandidates=[];
  for(const t of dataset.transactions){
    if(t.date<workingFrom || (config.backlog && !backlogIds.has(t.id)) || dangerIds.has(t.id))continue;
    const matches=matchingRules(t.description,proposedRules,t,business);
    if(matches.length && new Set(matches.map(r=>r.category)).size===1){
      const category=matches[0].category;
      // Required approvals are explicit; this file never enables a rule.
      const ids=resultProposals.filter(p=>p.tier==='strong_proposal' && matchingRules(t.description,[p.rule],t,business).length).map(p=>p.id);
      sessionCandidates.push({id:t.id,date:t.date,description:t.description,amountCents:t.amount,account:t.primary.account,currentCategory:t.categories[0],proposedCategory:category,action:t.categories[0]===category?'confirm_category_then_review':'change_category_then_review',requiresApproval:ids,liveValidationRequired:true,expected:recordSnapshot(t)});
    }
  }
  merchants.sort((a,b)=>b.outgoingCents-a.outgoingCents || b.transactions-a.transactions);
  for(const m of judgmentQueue)m.backlog=m.ids.filter(id=>backlogIds.has(id)).length;
  judgmentQueue.sort((a,b)=>(b.backlog-a.backlog)||(b.uncategorized>0)-(a.uncategorized>0)||b.outgoingCents-a.outgoingCents);
  sessionCandidates.sort((a,b)=>(a.action==='change_category_then_review'?0:1)-(b.action==='change_category_then_review'?0:1)||b.date.localeCompare(a.date));
  return {
    pack:{format:'wave-solver-rule-proposals',version:1,business,createdAt:source.createdAt,source,proposals:resultProposals,coverage},
    merchants,judgmentQueue,refundCandidates:possibleRefunds,
    session:{workingFrom,scope:config.backlog?'Last supplied Not Reviewed collection':'Working-period export candidates',capturedAt:config.backlog?.capturedAt,format:'wave-solver-proposed-session-plan',version:1,business,source,status:'proposals_require_approval_and_live_validation',executed:false,reviewedStatusFromExport:'unknown',candidates:sessionCandidates},
    coverage
  };
}
