import { normalize, merchantText, matchesDescription, nonPurchaseReason, matchingRules } from './rules.js';
import { proposals } from './model.js';
import { ruleCoverage } from './rule-pack.js';
import { recordSnapshot } from './plan.js';

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
export function cleanDescriptor(description) {
  // Leave unknown merchants conservatively separate. No global number stripping.
  return normalize(merchantText(description));
}
export function analyzeHistory(dataset, config, source) {
  const business=config.business;
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
    const evidence=summarize(ts),known=evidence.categories.filter(c=>c.outgoing && !unresolved(c.category));
    const safe=ts.filter(t=>!dangerIds.has(t.id)&&matchingRules(t.description,[rule],t,business).length);
    if (tier==='strong_proposal' && !safe.length) { tier='needs_judgment'; reason+=' No eligible purchase record survives payment safeguards; review individually.'; }
    const p={id:'proposal-'+resultProposals.length,tier,rule:{...rule,direction:'out'},reason,evidence:{...evidence,knownOutgoing:known.reduce((n,c)=>n+c.outgoing,0),eligible:safe.length,eligibleCents:money(safe),eligibleChange:safe.filter(t=>t.categories[0]!==rule.category).length,excluded:ts.length-safe.length},exclusions:['Incoming credits, transfers, financing, owner movements, cash withdrawals, split postings, and identified refund pairs','Already categorized in another category'],transactionIds:safe.map(t=>t.id),sources:g.definition?.sources || [],purposeEvidence:g.definition?.purpose || 'Purchase purpose not established from the bank description',approved:false};
    resultProposals.push(p);return p;
  };
  for(const g of groups.values()){
    const evidence=summarize(g.transactions),out=g.transactions.filter(t=>t.direction==='out'),d=g.definition;
    const known=evidence.categories.filter(c=>c.outgoing && !unresolved(c.category));
    const target=d?.category || (known.length===1?known[0].category:'');
    let tier='needs_judgment',reason;
    if(d?.approved) {tier='existing_approved';reason=d.reason+' Existing user policy; individual exceptions remain excluded from the prepared session.';}
    else if(d?.narrow && target && known.length===1 && known[0].category===target && known[0].outgoing>=3) {tier='strong_proposal';reason=d.purpose+' At least three outgoing records agree, and no other known outgoing category conflicts. Confirm usage before accepting.';}
    else reason=d?.reason || (known.length>1?'Conflicting historical categories; receipts and purchase purpose are required.': 'History or merchant identity alone does not establish purchase purpose.');
    if(tier==='strong_proposal' && !g.transactions.some(t=>!dangerIds.has(t.id))) { tier='needs_judgment'; reason+=' All records require payment or structural review; no eligible suggestion.'; }
    const analysis={merchant:g.merchant,...evidence,tier,reason,confidence:tier==='strong_proposal'?'Strong evidence, unapproved':tier==='existing_approved'?'User policy with exceptions':'Individual judgment',refundCandidates:possibleRefunds.filter(r=>r.family===txFamily.get(g.transactions[0].id)).length,ids:g.transactions.map(t=>t.id)};
    merchants.push(analysis);
    if(target && d){
      const rawRule={name:g.merchant,aliases:d.aliases,category:target,matchMode:d.matchMode || 'words',excludeAliases:d.excludeAliases || [],onlyCategories:[target,...dataset.categories.filter(unresolved)]};
      makeProposal(g,g.transactions,rawRule,tier,reason);
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
  const proposedRules=[...approved,...strong],sessionCandidates=[];
  for(const t of dataset.transactions){
    if(dangerIds.has(t.id))continue;
    const matches=matchingRules(t.description,proposedRules,t,business);
    if(matches.length && new Set(matches.map(r=>r.category)).size===1){
      const category=matches[0].category;
      // Required approvals are explicit; this file never enables a rule.
      const ids=resultProposals.filter(p=>p.tier==='strong_proposal' && matchingRules(t.description,[p.rule],t,business).length).map(p=>p.id);
      sessionCandidates.push({id:t.id,date:t.date,description:t.description,amountCents:t.amount,account:t.primary.account,currentCategory:t.categories[0],proposedCategory:category,action:t.categories[0]===category?'confirm_category_then_review':'change_category_then_review',requiresApproval:ids,liveValidationRequired:true,expected:recordSnapshot(t)});
    }
  }
  merchants.sort((a,b)=>b.outgoingCents-a.outgoingCents || b.transactions-a.transactions);
  judgmentQueue.sort((a,b)=>(b.uncategorized>0)-(a.uncategorized>0)||b.outgoingCents-a.outgoingCents);
  sessionCandidates.sort((a,b)=>(a.action==='change_category_then_review'?0:1)-(b.action==='change_category_then_review'?0:1)||b.date.localeCompare(a.date));
  return {
    pack:{format:'wave-solver-rule-proposals',version:1,business,createdAt:source.createdAt,source,proposals:resultProposals,coverage},
    merchants,judgmentQueue,refundCandidates:possibleRefunds,
    session:{format:'wave-solver-proposed-session-plan',version:1,business,source,status:'proposals_require_approval_and_live_validation',executed:false,reviewedStatusFromExport:'unknown',candidates:sessionCandidates},
    coverage
  };
}
