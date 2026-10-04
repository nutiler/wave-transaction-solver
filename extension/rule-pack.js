import { validateRule, matchingRules, nonPurchaseReason } from './rules.js';
export async function sourceHash(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export function validateRulePack(pack, { business, hash, categories }) {
  if (!pack || pack.format !== 'wave-solver-rule-proposals' || pack.version !== 1 || pack.business !== business || pack.source?.sha256 !== hash || !Array.isArray(pack.proposals) || pack.proposals.length > 1000) throw new Error('This proposal pack must match the selected business and the exact imported CSV. Regenerate it for a new export.');
  const ids = new Set();
  for (const p of pack.proposals) {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) || !['existing_approved','strong_proposal','needs_judgment'].includes(p.tier) || typeof p.reason !== 'string' || !p.evidence || !Number.isSafeInteger(p.evidence.transactions) || p.evidence.transactions < 0) throw new Error('Invalid proposal evidence or duplicate ID.');
    if (p.transactionIds !== undefined && (!Array.isArray(p.transactionIds) || p.transactionIds.some(id=>typeof id!=='string' || !/^\d+$/.test(id)))) throw new Error('Transaction IDs must remain text.');
    if (p.sources !== undefined && (!Array.isArray(p.sources) || p.sources.some(url=>{try{return typeof url!=='string' || new URL(url).protocol!=='https:' || !new URL(url).hostname;}catch{return true;}}))) throw new Error('Invalid proposal sources.');
    for(const key of ['categories','accounts','descriptions']) if(p.evidence[key] !== undefined && !Array.isArray(p.evidence[key])) throw new Error('Invalid evidence distributions.');
    ids.add(p.id); validateRule(p.rule);
    if (p.rule.business && p.rule.business !== business) throw new Error('Proposal business scope differs.');
    if (!categories.includes(p.rule.category) || p.rule.onlyCategories?.some(c=>!categories.includes(c)) || p.rule.excludeCategories?.some(c=>!categories.includes(c))) throw new Error('A proposal category is not in the imported export or collected Chart of Accounts.');
  }
  return pack;
}
export function acceptProposal(pack, id, rules, decisions = {}) {
  const p = pack.proposals.find(p=>p.id===id);
  if (!p || p.tier === 'existing_approved') throw new Error('Choose a new proposal to accept.');
  validateRule(p.rule);
  const rule = { ...p.rule, business: pack.business, proposalId: p.id, sourceHash: pack.source.sha256 };
  const same = r => JSON.stringify([r.business || null,r.category,r.aliases,r.matchMode || 'words',r.accountIds || [],r.accountNames || [],r.excludedAccountIds || [],r.excludedAccountNames || [],r.excludeAliases || [],r.onlyCategories || [],r.excludeCategories || []]);
  const next = rules.some(r=>same(r)===same(rule)) ? [...rules] : [...rules,rule];
  return { rules: next, decisions: { ...decisions,[id]:'accepted' } };
}
export function ruleCoverage(transactions, rules, business = null, blockedIds = new Set()) {
  const result = { eligible:0, eligibleCents:0, covered:0, coveredCents:0, overlaps:0, overlapCents:0, conflicts:0, conflictCents:0, changes:0, changeCents:0, confirmations:0, excluded:0 };
  for (const t of transactions) {
    if (nonPurchaseReason(t) || blockedIds.has(t.id)) { result.excluded++; continue; }
    result.eligible++; result.eligibleCents+=t.amount;
    const matches=matchingRules(t.description,rules,t,business);
    if (matches.length > 1) { result.overlaps++; result.overlapCents+=t.amount; }
    if (new Set(matches.map(r=>r.category)).size > 1) { result.conflicts++; result.conflictCents+=t.amount; continue; }
    if (!matches.length) continue;
    result.covered++; result.coveredCents+=t.amount;
    if (t.categories[0]===matches[0].category) result.confirmations++;
    else { result.changes++; result.changeCents+=t.amount; }
  }
  return result;
}
