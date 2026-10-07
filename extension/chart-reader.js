// Runs only on the selected business's Chart of Accounts. The only clicks are
// the five navigation tabs; account edit/add/archive controls are never used.
export async function readWaveChart(expectedBusiness, testContext) {
  const doc = testContext?.document || document;
  const loc = testContext?.location || location;
  const styleOf = testContext?.getComputedStyle || getComputedStyle;
  const wait = testContext?.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const tidy = v => String(v || '').replace(/\s+/g, ' ').trim();
  const visible = el => !!el && !el.closest('[hidden],[aria-hidden="true"]') && styleOf(el).display !== 'none' && styleOf(el).visibility !== 'hidden' && el.getClientRects().length > 0;
  const groups = ['Assets', 'Liabilities & Credit Cards', 'Income', 'Expenses', 'Equity'];
  const result = { business: expectedBusiness, groups: [], problems: [], diagnostics: {}, capturedAt: new Date().toISOString() };
  const identity = () => {
    const url = new URL(loc.href);
    return url.origin === 'https://next.waveapps.com' && url.pathname === `/${expectedBusiness}/accounting/charts`;
  };
  if (!identity()) { result.problems.push('Open the selected business’s Chart of Accounts.'); return result; }
  function tabInfo(name) {
    const candidates = [...doc.querySelectorAll('[role="tab"],button,a,[role="button"]')].filter(el => visible(el) && new RegExp(`^${name.replace(/&/g, '&')}\\s*(\\d+)?$`).test(tidy(el.textContent)));
    const leaves = candidates.filter(el => !candidates.some(other => other !== el && el.contains(other)));
    if (leaves.length !== 1) return null;
    const count = tidy(leaves[0].textContent).match(/(\d+)$/);
    return { el: leaves[0], count: count ? Number(count[1]) : null };
  }
  let structuredRows = false, unreadableRows = 0;
  function readRows(groupName) {
    structuredRows = false; unreadableRows = 0;
    const rows = new Map();
    function add(number, name, counted = true, section = null) {
      if (!name || /^Last transaction/i.test(name)) return;
      // The first column is an optional account number, not a Wave API ID.
      // Use a local name key so blank and repeated account numbers are supported.
      const key = JSON.stringify([groupName, name]);
      rows.set(key, { key, number: number || null, name, counted,section });
    }
    const waveRows = [...doc.querySelectorAll('tr')].filter(row => visible(row) && row.querySelector('.chart-of-accounts-table__account-name-column'));
    if (waveRows.length) {
      structuredRows = true;
      for (const row of waveRows) {
        const cells = [...row.querySelectorAll('td')];
        const nameColumn = row.querySelector('.chart-of-accounts-table__account-name-column');
        const nameNode = [...nameColumn.children].find(el => el.tagName === 'SPAN' && visible(el));
        if (!nameNode || !tidy(nameNode.textContent)) { unreadableRows++; continue; }
        const editable = !!row.querySelector('.chart-of-accounts-table__actions__edit-icon');
        let section=null;for(let previous=row.previousElementSibling;previous;previous=previous.previousElementSibling){if(previous.querySelector('.chart-of-accounts-table__account-name-column'))continue;const clone=previous.cloneNode(true);clone.querySelectorAll('svg,[aria-hidden=true],.sr-only,button').forEach(el=>el.remove());const text=tidy(clone.textContent);if(/^(?:Cash and Bank|Credit Cards?)$/i.test(text)){section=text;break;}if(previous.querySelector('td[colspan]')){section=text&&text.length<=200?text:null;break;}}
        add(tidy(cells[0]?.textContent), tidy(nameNode.textContent), editable,section);
      }
      if (rows.size !== waveRows.length) unreadableRows++;
      return [...rows.values()];
    }
    for (const row of doc.querySelectorAll('tr,[role="row"]')) {
      if (!visible(row)) continue;
      const cells = [...row.querySelectorAll('td,[role="cell"]')].filter(visible);
      if (cells.length >= 2) add(tidy(cells[0].textContent), (cells[1].innerText || cells[1].textContent).split('\n').map(tidy).find(Boolean));
    }
    // Wave can render account rows as divs. Bound each row by its account number;
    // stop before an ancestor containing multiple numbers to avoid merging accounts.
    const ids = [...doc.querySelectorAll('div,span,td')].filter(el => visible(el) && !el.children.length && /^\d{5,}$/.test(tidy(el.textContent)));
    for (const id of ids) {
      let parent = id.parentElement;
      for (let n = 0; parent && parent !== doc.body && n < 5; n++, parent = parent.parentElement) {
        if (ids.filter(other => parent.contains(other)).length > 1) break;
        const lines = (parent.innerText || '').split('\n').map(tidy).filter(Boolean);
        if (lines[0] === tidy(id.textContent) && lines.length >= 2) { add(lines[0], lines[1]); break; }
      }
    }
    return [...rows.values()];
  }
  // Validate all navigation controls before clicking any of them.
  const tabs = groups.map(name => tabInfo(name));
  if (tabs.some(tab => !tab || tab.count === null)) {
    result.problems.push('Could not identify all five account tabs and their counts.');
    result.diagnostics.controls = [...doc.querySelectorAll('[role="tab"],button,a,[role="button"]')].filter(visible).slice(0, 40).map(el => ({ tag: el.tagName, role: el.getAttribute('role'), class: el.getAttribute('class'), text: tidy(el.textContent).slice(0, 100) }));
    return result;
  }
  for (let index = 0; index < groups.length; index++) {
    if (!identity()) { result.problems.push('Wave navigated away during collection.'); break; }
    const name = groups[index], tab = tabInfo(name);
    if (!tab || tab.count !== tabs[index].count) { result.problems.push(`${name}: tab changed during collection.`); break; }
    tab.el.click();
    let accounts = [], previous = '', stable = 0, confirmed = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      await wait(150);
      if (!identity()) break;
      const currentTab = tabInfo(name);
      const selected = currentTab && (currentTab.el.getAttribute('aria-selected') === 'true' || /(?:^|[\s_-])(active|selected)(?:$|[\s_-])/.test(currentTab.el.getAttribute('class') || ''));
      accounts = readRows(name);
      const signature = JSON.stringify(accounts);
      stable = signature === previous ? stable + 1 : 0; previous = signature;
      // Wave counters exclude some built-in rows, but not consistently across
      // tabs. Recognized account rows are authoritative; the counter is a lower
      // bound, never an assumed editable-account count.
      const countOkay = structuredRows ? accounts.length >= tab.count : accounts.length === tab.count;
      if (selected && !unreadableRows && countOkay && stable >= 2) { confirmed = true; break; }
      if (attempt === 19) accounts = [];
    }
    if (!identity() || !confirmed) {
      result.problems.push(`${name}: could not read every visible account-name row and cross-check the tab count of ${tab.count}. Nothing from this tab was accepted.`);
      result.diagnostics[name] = { tab: tabInfo(name)?.el.outerHTML.slice(0, 2000), observed: readRows(name), visibleRows: [...doc.querySelectorAll('tr,[role="row"]')].filter(visible).slice(0, 12).map(row => ({ cells: [...row.querySelectorAll('td,[role="cell"]')].map(cell => tidy(cell.innerText || cell.textContent).slice(0, 400)), markup: row.outerHTML.slice(0, 3000) })) };
      break;
    }
    result.groups.push({ name, expected: tab.count, accounts, countBasis: structuredRows ? 'visible_account_name_rows' : 'exact_tab_count' });
  }
  return result;
}
