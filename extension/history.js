import { normalize, ruleFor } from './model.js';
const payment = /\b(payment|pymt|pmt|epay|transfer|xfer|autopay|thank you|starting balance)\b/i;
const uncategorized = /^uncategorized (income|expense)$/i;
// Keep descriptors exact by default. Removing card references automatically can
// accidentally combine unrelated merchants, so new aliases require a decision.
export function historySuggestions(transactions, rules, minimum = 3) {
  const groups = new Map();
  for (const t of transactions) {
    if (!t.primary || t.direction !== 'out' || payment.test(t.description) || ruleFor(t.description, rules)) continue;
    const key = normalize(t.description);
    if (!key || /^\d+$/.test(key)) continue;
    if (!groups.has(key)) groups.set(key, { merchant: t.description.trim(), count: 0, categories: new Map(), latest: t.date, accounts: new Set() });
    const group = groups.get(key); group.count++; group.accounts.add(t.primary.account);
    if (t.date > group.latest) group.latest = t.date;
    // Multi-category and uncategorized records never count as an established rule.
    const expense = t.postings.filter(p => p.group === 'Expense');
    const categories = [...new Set(expense.map(p => p.account))];
    if (categories.length === 1 && !uncategorized.test(categories[0])) group.categories.set(categories[0], (group.categories.get(categories[0]) || 0) + 1);
  }
  return [...groups.values()].filter(g => g.count >= minimum).map(g => {
    const distribution = [...g.categories].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
    const known = distribution.reduce((sum, c) => sum + c.count, 0);
    return { merchant: g.merchant, count: g.count, distribution, known, unresolved: g.count - known, category: distribution.length === 1 && known >= minimum ? distribution[0].category : '', mixed: distribution.length > 1, latest: g.latest, accounts: [...g.accounts].sort() };
  }).sort((a, b) => b.count - a.count || a.merchant.localeCompare(b.merchant));
}
