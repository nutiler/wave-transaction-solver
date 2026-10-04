export function recordSnapshot(t) {
  return { id: t.id, date: t.date, description: t.description, account: t.primary?.account || null, accountId: t.primary?.accountId || null, accountType: t.primary?.type || null, amountCents: t.amount, direction: t.direction, categories: [...t.categories].sort(), postings: t.postings.map(p => ({ account: p.account, accountId: p.accountId, type: p.type, group: p.group, debitCents: p.debit, creditCents: p.credit, modified: p.modified })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
}
export function actionable(t) { return ['Merchant rule', 'Transfer candidate'].includes(t.kind) && !!t.proposed && !!t.primary; }
export function buildPlan(queue, selectedIds, { business, sourceName, sample = false, createdAt = new Date().toISOString() }) {
  if (!sample && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(business || '')) throw new Error('Select and confirm the Wave business before exporting a real plan.');
  const byId = new Map(queue.map(t => [t.id, t])), consumed = new Set(), entries = [];
  for (const id of selectedIds) {
    const t = byId.get(id); if (!t) throw new Error(`Selected transaction ${id} is absent from the current export.`);
    if (consumed.has(id)) continue;
    if (!actionable(t)) throw new Error(`Transaction ${id} is no longer eligible for a proposed action.`);
    if (t.kind === 'Transfer candidate') {
      const other = byId.get(t.partner?.id);
      if (!other || other.kind !== 'Transfer candidate' || other.partner?.id !== id) throw new Error(`Transfer ${id} does not have a unique reciprocal counterpart.`);
      consumed.add(id); consumed.add(other.id);
      const pair = [t, other].sort((a, b) => a.id.localeCompare(b.id));
      entries.push({ action: 'propose_existing_transfer_match', ids: pair.map(r => r.id), expected: pair.map(recordSnapshot), requestReviewAfterMatch: true, reason: t.reason });
    } else {
      consumed.add(id);
      entries.push({ action: t.categories.length === 1 && t.categories[0] === t.proposed ? 'propose_category_confirmation_and_review' : 'propose_category_change_and_review', ids: [id], expected: [recordSnapshot(t)], category: t.proposed, requestReviewAfterMatch: true, reason: t.reason });
    }
  }
  return { format: 'wave-solver-draft-plan', version: 1, status: 'draft_requires_live_validation', sample, business: sample ? null : business, sourceName, createdAt, reviewedStatusFromExport: 'unknown', executed: false, entries };
}
export function validatePlan(plan, transactions, business) {
  if (!plan || plan.format !== 'wave-solver-draft-plan' || plan.version !== 1 || !Array.isArray(plan.entries)) throw new Error('Unsupported solver plan format.');
  if (plan.sample) throw new Error('Fictional sample plans cannot be matched to real Wave data.');
  if (!business || business !== plan.business) throw new Error('This plan belongs to a different or unselected Wave business.');
  if (plan.entries.length > 100000) throw new Error('Plan has too many entries.');
  const byId = new Map(transactions.map(t => [t.id, t]));
  const seen = new Set();
  return plan.entries.map(entry => {
    if (!entry || typeof entry !== 'object') throw new Error('Malformed plan entry.');
    if (!Array.isArray(entry.ids) || !Array.isArray(entry.expected) || !entry.ids.length || entry.ids.length !== entry.expected.length) throw new Error('Malformed plan entry.');
    const transfer = entry.action === 'propose_existing_transfer_match';
    if (!transfer && !['propose_category_confirmation_and_review', 'propose_category_change_and_review'].includes(entry.action)) throw new Error('Unsupported action in draft plan.');
    if (entry.ids.length !== (transfer ? 2 : 1)) throw new Error('Incorrect number of records for draft action.');
    if (!transfer && (typeof entry.category !== 'string' || !entry.category.trim())) throw new Error('Missing category in draft plan.');
    const problems = [];
    for (let i = 0; i < entry.ids.length; i++) {
      const id = entry.ids[i], t = byId.get(id);
      if (typeof id !== 'string' || !/^\d+$/.test(id) || seen.has(id)) throw new Error('Invalid or repeated transaction ID in draft plan.');
      seen.add(id);
      if (entry.expected[i]?.id !== id) throw new Error('Plan IDs and snapshots disagree.');
      if (!t) problems.push(`${id}: absent from fresh export`);
      else if (JSON.stringify(recordSnapshot(t)) !== JSON.stringify(entry.expected[i])) problems.push(`${id}: changed since plan was created`);
    }
    return { ids: entry.ids, state: problems.length ? 'Stale' : 'Unchanged in export', problems, requiresLiveValidation: true };
  });
}
