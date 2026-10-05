// Rules match descriptive words, never arbitrary substrings or reference codes.
export const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function merchantText(description) {
  return String(description).replace(/\s+["“][\s\S]*$/, '').replace(/\s+(?:REF(?:ERENCE)?\b\s*(?:#|NUMBER\s*:)?|CARD\s|ATM ID\s|WEB ID\s|[SP]\d{10,})[\s\S]*$/i, '')
    .replace(/^(?:PURCHASE(?: INTL)?|RECURRING PAYMENT|DEBIT CARD) AUTHORIZED ON \d{2}\/\d{2}\s*/i, '')
    .replace(/^Recurring Payment\s*-\s*/i, '').trim();
}
export function validateRule(rule) {
  if (!rule || typeof rule.name !== 'string' || !rule.name.trim() || rule.name.length > 200 || typeof rule.category !== 'string' || !rule.category.trim() || rule.category.length > 300 || !Array.isArray(rule.aliases) || !rule.aliases.length || rule.aliases.length > 100 || rule.aliases.some(a => typeof a !== 'string' || !normalize(a) || a.length > 250)) throw new Error('Invalid merchant rule.');
  for (const key of ['accountIds','accountNames','excludedAccountIds','excludedAccountNames','excludeAliases','onlyCategories','excludeCategories','storeAliases']) {
    if (rule[key] !== undefined && (!Array.isArray(rule[key]) || rule[key].length > 200 || rule[key].some(a => typeof a !== 'string' || !a.trim() || a.length > 300))) throw new Error('Invalid rule scope or exclusion.');
  }
  if(rule.storeAliases?.some(a=>normalize(a).length<5 || !/[a-z]/.test(normalize(a))))throw Error('Store-number aliases need a distinctive merchant name of at least five characters.');
  if (rule.matchMode !== undefined && !['words','exact','prefix'].includes(rule.matchMode)) throw new Error('Invalid matching mode.');
  if (rule.direction !== undefined && rule.direction !== 'out') throw new Error('Merchant rules must be outgoing only.');
  if (rule.business !== undefined && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(rule.business)) throw new Error('Invalid business scope.');
  return rule;
}
function aliasMatches(text, alias, mode) {
  const a = normalize(alias), n = normalize(text);
  if (!a) return false;
  // Bare numeric aliases require the merchant position: REF 711 is not a store.
  if (/^\d+$/.test(a)) return n === a || n.startsWith(a + ' ');
  return mode === 'exact' ? n === a : mode === 'prefix' ? n === a || n.startsWith(a+' ') : (' '+n+' ').includes(' '+a+' ');
}
export function matchesDescription(description, rule) {
  const text = merchantText(description);
  const fee = /^(?:OVERDRAFT FEE|MONTHLY SERVICE FEE|CASH ADVANCE FEE|LATE FEE|INTERNATIONAL PURCHASE TRANSACTION FEE|PURCHASE INTEREST CHARGE|INTEREST CHARGE|ANNUAL FEE)\b/i.test(text);
  const n=normalize(text);
  const stores=!fee && (rule.storeAliases || []).some(alias=>{const a=normalize(alias);if(!/[a-z]/.test(a)||a.length<5)return false;return new RegExp('(?:^| )'+a+'(?: ?[0-9]{1,6})(?= |$)').test(n);});
  return (rule.aliases.some(a => aliasMatches(text,a,fee ? 'prefix' : rule.matchMode || 'words')) || stores) && !(rule.excludeAliases || []).some(a => aliasMatches(text,a,'words'));
}
export function matchingRules(description, rules, transaction = null, business = null) {
  return rules.filter(r => {
    if (!matchesDescription(description,r)) return false;
    if (r.business && r.business !== business) return false;
    const scoped = ['accountIds','accountNames','excludedAccountIds','excludedAccountNames','onlyCategories','excludeCategories'].some(k => r[k]?.length);
    if (scoped && !transaction?.primary) return false;
    if (transaction && transaction.direction !== 'out') return false;
    const p = transaction?.primary;
    if (r.accountIds?.length && !r.accountIds.includes(p.accountId)) return false;
    if (r.accountNames?.length && !r.accountNames.includes(p.account)) return false;
    if (r.excludedAccountIds?.includes(p.accountId) || r.excludedAccountNames?.includes(p.account)) return false;
    if (r.onlyCategories?.length && (!transaction.categories.length || transaction.categories.some(c => !r.onlyCategories.includes(c)))) return false;
    if (r.excludeCategories?.some(c => transaction.categories.includes(c))) return false;
    return true;
  });
}
export function ruleFor(description, rules, transaction = null, business = null) {
  const matches = matchingRules(description,rules,transaction,business);
  return new Set(matches.map(r => r.category)).size === 1 ? matches[0] : undefined;
}
export function nonPurchaseReason(t) {
  if (!t.primary || !t.amount || t.existingTransfer || t.postings.length !== 2 || t.categories.length !== 1) return 'Multiple, missing, or split accounting postings';
  if (/loan/i.test(t.primary.type)) return 'Loan account movement';
  if (t.direction !== 'out') return /return|refund|credit reversal/i.test(t.description) ? 'Incoming refund or return' : 'Incoming movement';
  if (/\b(return|refund|reversal)\b/i.test(t.description)) return 'Refund or reversal wording';
  const s = merchantText(t.description);
  if (/^(?:APPLECARD GSBANK PAYMENT|DEPT EDUCATION STUDENT LN|DEPOSITED ITEM RETN UNPAID|PAY OFF .* LOAN)\b/i.test(s)) return 'Card payment, student loan, returned deposit or loan principal; review separately';
  if(/\b(?:payin4|pay in 4|scratchpay|afterpay|klarna|affirm)\b/i.test(s)) return 'Installment or financing processor; check debt and the original purchase separately';
  if (/^(?:OVERDRAFT FEE|MONTHLY SERVICE FEE|CASH ADVANCE FEE|LATE FEE|INTERNATIONAL PURCHASE TRANSACTION FEE|PURCHASE INTEREST CHARGE|INTEREST CHARGE|ANNUAL FEE)\b/i.test(s)) return '';
  if (/^PAYPAL (?:INST XFER|RETRY PYMT)\s+\d+\s+[a-z]/i.test(s) && !/\s\d{8,}\s+[a-z]/i.test(s.replace(/^PAYPAL (?:INST XFER|RETRY PYMT)\s+\d+\s+/i,''))) return '';
  if (/\b(?:card payment|transfer|xfer|epay|autopay|cash advance|atm withdrawal|cash withdrawal|credit crd|cc pymt|online pmt|loan|truck payment)\b/i.test(s) || /^(?:CHECK\b|ZELLE\b|VENMO\b|Created Transfer|Standard transfer|Payment\b|INTERNET PAYMENT|ONLINE PAYMENT|DIRECTPAY|BUSINESS TO BUSINESS ACH)/i.test(s)) return 'Payment, cash, transfer, check, or loan needs separate review';
  if (t.categories.some(c => /^(?:Transfer Clearing|Owner(?:'s)? Equity|Owner Investment|Truck Payment)/i.test(c))) return 'Transfer, owner movement, or financing category';
  return '';
}
