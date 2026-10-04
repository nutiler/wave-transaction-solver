export const chartGroups = ['Assets', 'Liabilities & Credit Cards', 'Income', 'Expenses', 'Equity'];
export function validateCatalog(catalog, business) {
  if (!catalog || catalog.business !== business || !Array.isArray(catalog.groups) || catalog.groups.length !== 5 || catalog.problems?.length) throw new Error('A complete Chart of Accounts for this business is required.');
  const keys = new Set();
  for (const name of chartGroups) {
    const groups = catalog.groups.filter(g => g.name === name);
    if (groups.length !== 1) throw new Error(`Missing or repeated ${name} tab.`);
    const group = groups[0];
    if (!Number.isInteger(group.expected) || group.expected < 0 || !Array.isArray(group.accounts) || group.accounts.length < group.expected) throw new Error(`${name}: fewer account names than the Wave tab count.`);
    for (const account of group.accounts) {
      if (typeof account.name !== 'string' || !account.name.trim() || account.name.length > 300 || account.key !== JSON.stringify([name, account.name]) || keys.has(account.key) || (account.counted !== undefined && typeof account.counted !== 'boolean') || (account.number !== null && (typeof account.number !== 'string' || account.number.length > 100))) throw new Error('Invalid or duplicate chart account.');
      keys.add(account.key);
    }
  }
  return catalog;
}
export function categoryNames(catalog, exported = []) {
  return [...new Set([...exported, ...(catalog?.groups || []).flatMap(g => g.accounts.map(a => a.name))])].sort((a,b) => a.localeCompare(b));
}
