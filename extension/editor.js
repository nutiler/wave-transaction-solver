import { compareLive } from './model.js';
import { buildPlan, validatePlan } from './plan.js';

export function prepareCategoryEdit(transaction, snapshot, { business, sample, shortlist, queue, loadedPlan, categories, categoryGroups }) {
  if (sample || !business) throw new Error('Select a real Wave business and export first.');
  if (!transaction || transaction.kind !== 'Merchant rule' || transaction.direction !== 'out' || transaction.postings.length !== 2 || transaction.categories.length !== 1 || !transaction.primary || transaction.amount <= 0) throw new Error('Apply currently supports only single-category merchant purchases.');
  if (!categories.includes(transaction.proposed)) throw new Error('Collect the exact category name from Chart of Accounts first.');
  let entry;
  if (shortlist.has(transaction.id)) entry = buildPlan(queue, [transaction.id], { business, sourceName: '' }).entries[0];
  else if (loadedPlan) {
    const validations = validatePlan(loadedPlan, queue, business);
    const index = loadedPlan.entries.findIndex(e => e.ids.length === 1 && e.ids[0] === transaction.id);
    if (index >= 0 && validations[index].state === 'Unchanged in export') entry = loadedPlan.entries[index];
  }
  if (!entry || entry.category !== transaction.proposed || !entry.requestReviewAfterMatch) throw new Error('Tick this transaction’s Plan checkbox, or import its unchanged draft plan.');
  if (!snapshot?.fields || snapshot.identity?.business !== business || snapshot.problems?.length || compareLive(transaction, snapshot).checks.some(c => c.state !== 'Match')) throw new Error('All live fields must match the export before Apply.');
  const groups = (categoryGroups || []).filter(group => group.accounts.some(account => account.name === entry.category));
  const categoryPath = groups.length === 1 && groups[0].name === 'Equity' ? ['Personal Expense or Withdrawal'] : [];
  return { business, id: transaction.id, category: entry.category, categoryPath, expected: { ...snapshot.fields } };
}

export function verifyCategoryResult(transaction, snapshot, business, category) {
  const result = compareLive({ ...transaction, categories: [category] }, snapshot);
  const categoryVerified = snapshot.identity?.business === business && !snapshot.problems?.length && result.checks.every(c => c.state === 'Match');
  const controls = snapshot.controls || [];
  const inverse = controls.filter(name => /^(Reviewed|Mark (as )?(unreviewed|not reviewed)|Unreview)$/i.test(name));
  const mark = controls.filter(name => /^Mark (as )?reviewed$/i.test(name));
  const reviewedVerified = categoryVerified && (snapshot.reviewed === 'Reviewed' || (inverse.length === 1 && mark.length === 0));
  const message = categoryVerified ? reviewedVerified ? 'Saved category and reviewed status verified after reloading Wave.' : 'Saved category verified. Reviewed status is not confirmed; check it in Wave.' : 'Saved result could not be verified. Inspect Wave; Apply will not repeat this attempt.';
  return { categoryVerified, reviewedVerified, message };
}

export function resetAttemptReceipt(transaction, snapshot, business, receipt, resetAt = new Date().toISOString()) {
  if (!receipt?.saveAttempted) throw new Error('This record has no locked Apply attempt.');
  if (!transaction || transaction.kind !== 'Merchant rule' || transaction.direction !== 'out' || transaction.postings.length !== 2 || transaction.categories.length !== 1 || !transaction.primary) throw new Error('Reset supports only the original single-category merchant purchase.');
  if (!snapshot?.fields || snapshot.identity?.business !== business || snapshot.problems?.length || compareLive(transaction,snapshot).checks.some(check=>check.state !== 'Match')) throw new Error('The freshly loaded Wave record must match all original export fields before resetting.');
  if (transaction.categories[0] === receipt.category) throw new Error('The original category already equals the previous target. Review this transaction manually before starting another attempt.');
  if (snapshot.reviewed === 'Reviewed' || (snapshot.controls || []).some(name=>/^(Reviewed|Mark (as )?(unreviewed|not reviewed)|Unreview)$/i.test(name))) throw new Error('Wave still indicates this record is reviewed. Restore its original state before resetting.');
  const { previousAttempts = [], ...previous } = receipt;
  return { category: transaction.proposed, saveAttempted:false, categoryVerified:false, reviewedVerified:false, resetAt, previousAttempts:[...previousAttempts,{...previous, resetAt}], message:'Previous attempt reset after a fresh original-record check. Re-planned; nothing changed in Wave.' };
}

// Runs only after the user clicks Apply. Every action stays inside the exact record.
export async function editWaveTransaction(request, testContext) {
  const doc = testContext?.document || document, loc = testContext?.location || location;
  const style = testContext?.getComputedStyle || getComputedStyle;
  const wait = testContext?.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const tidy = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = el => !!el && !el.hidden && !el.closest('[hidden],[aria-hidden="true"]') && style(el).display !== 'none' && style(el).visibility !== 'hidden' && el.getClientRects().length > 0;
  let saveAttempted = false, reviewRequested = false, stage = 'preflight';
  function identity() {
    const url = new URL(loc.href);
    if (url.origin !== 'https://next.waveapps.com' || url.pathname !== '/' + request.business + '/transactions/' + request.id) throw new Error('Wave navigated away from the requested transaction.');
  }
  function root() {
    const dialogs = [...doc.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(el => visible(el) && tidy(el.textContent).includes('Edit transaction'));
    const outer = dialogs.filter(el => !dialogs.some(other => other !== el && other.contains(el)));
    if (outer.length === 1) return outer[0];
    if (outer.length > 1) throw new Error('Multiple edit dialogs are open.');
    const headings = [...doc.querySelectorAll('h1,h2,h3,h4,h5,div,span')].filter(el => visible(el) && !el.children.length && tidy(el.textContent) === 'Edit transaction');
    if (headings.length === 1) {
      for (let el = headings[0].parentElement, i = 0; el && el !== doc.body && i < 8; el = el.parentElement, i++) {
        if (el.querySelectorAll('input').length >= 3 && [...el.querySelectorAll('button')].some(b => tidy(b.textContent) === 'Save')) return el;
      }
    }
    throw new Error('Open the Edit transaction dialog before applying.');
  }
  function control(dialog, name) {
    const selector = 'input:not([type="hidden"]):not([type="checkbox"]),select,[role="combobox"],.wv-select';
    const named = [...dialog.querySelectorAll(selector)].filter(el => visible(el) && tidy(el.getAttribute('aria-label')) === name);
    if (named.length === 1) return named[0];
    const labels = [...dialog.querySelectorAll('label,span')].filter(el => visible(el) && !el.children.length && tidy(el.textContent) === name);
    const found = new Set();
    for (const label of labels) {
      const linked = label.control || (label.htmlFor && doc.getElementById(label.htmlFor));
      if (linked && dialog.contains(linked) && visible(linked)) { found.add(linked); continue; }
      for (let el = label.parentElement, i = 0; el && el !== dialog && i < 4; el = el.parentElement, i++) {
        const labelsHere = [...el.querySelectorAll('label,span')].filter(l => !l.children.length && ['Date','Description','Account','Type','Amount','Category'].includes(tidy(l.textContent)));
        if (labelsHere.some(l => tidy(l.textContent) !== name)) break;
        const controls = [...el.querySelectorAll(selector)].filter(visible);
        const top = controls.filter(c => !controls.some(other => other !== c && other.contains(c)));
        if (top.length === 1) { found.add(top[0]); break; }
      }
    }
    if (found.size !== 1) throw new Error(name + ': cannot identify one editable control.');
    return [...found][0];
  }
  function value(el) {
    if (el.tagName === 'INPUT') return tidy(el.value);
    if (el.tagName === 'SELECT') return tidy(el.selectedOptions[0]?.textContent);
    const labels = [...el.querySelectorAll('.wv-select__label')].filter(visible);
    if (labels.length !== 1) throw new Error('Selected dropdown value is ambiguous.');
    return tidy(labels[0].textContent);
  }
  function assertFields(category) {
    identity(); const dialog = root();
    for (const name of ['Date','Description','Account','Type','Amount','Category']) {
      const actual = value(control(dialog, name)), expected = name === 'Category' ? category : request.expected[name.toLowerCase()];
      const money = text => { const s = tidy(text).replace(/[$,]/g, ''); if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN; return Math.round(Number(s) * 100); };
      if (name === 'Amount' ? money(actual) !== money(expected) : actual !== tidy(expected)) throw new Error(name + ' changed or could not be read. Nothing further clicked.');
    }
    return dialog;
  }
  const buttons = (dialog, names) => [...dialog.querySelectorAll('button,[role="button"]')].filter(el => {
    if (!visible(el)) return false;
    const clone = el.cloneNode(true); clone.querySelectorAll('svg,[aria-hidden="true"],.sr-only,[role="tooltip"]').forEach(node=>node.remove());
    return names.includes(tidy(clone.textContent || el.getAttribute('aria-label')).replace(/^[✓✔]\s*/, ''));
  });
  function enabled(el) { return !el.disabled && el.getAttribute('aria-disabled') !== 'true'; }
  try {
    if (!request || !/^[0-9a-f-]{36}$/i.test(request.business || '') || !/^\d+$/.test(request.id || '') || !tidy(request.category) || !request.expected) throw new Error('Invalid edit request.');
    let dialog = assertFields(request.expected.category);
    if (buttons(dialog, ['Save']).length !== 1) throw new Error('Cannot identify one Save button.');
    const review = buttons(dialog, ['Mark as reviewed', 'Mark reviewed']);
    const alreadyReviewed = buttons(dialog, ['Reviewed','Mark as unreviewed','Mark as not reviewed','Mark unreviewed','Unreview']);
    if (review.length + alreadyReviewed.length !== 1) throw new Error('Cannot identify a reviewed-state control. Copy the field diagnostics.');
    reviewRequested = alreadyReviewed.length === 1;
    if (tidy(request.expected.category) !== tidy(request.category)) {
      stage = 'category selection';
      const category = control(dialog, 'Category');
      if (category.tagName === 'SELECT') {
        const options = [...category.options].filter(o => tidy(o.textContent) === tidy(request.category) && !o.disabled);
        if (options.length !== 1) throw new Error('Exact category is missing or ambiguous.');
        category.value = options[0].value; category.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const openSearch = [...doc.querySelectorAll('input')].filter(el => visible(el) && /^Search categories[.…]*$/i.test(tidy(el.placeholder || el.getAttribute('aria-label'))));
        if (openSearch.length > 1) throw new Error('Multiple category menus are open.');
        if (!openSearch.length) {
          const toggles = [...category.querySelectorAll('.wv-select__toggle')].filter(visible);
          if (toggles.length > 1) throw new Error('Multiple category toggle controls are visible.');
          const toggle = toggles[0] || category;
          if (!enabled(toggle)) throw new Error('The category toggle is disabled.');
          assertFields(request.expected.category); toggle.click();
        }
        const optionText = el => {
          const clone = el.cloneNode(true);
          clone.querySelectorAll('svg,[aria-hidden="true"],.sr-only,[role="tooltip"]').forEach(node => node.remove());
          return tidy(clone.textContent);
        };
        function menuScopes() {
          const scopes = new Set([category]);
          const search = [...doc.querySelectorAll('input')].filter(el => visible(el) && /^Search categories[.…]*$/i.test(tidy(el.placeholder || el.getAttribute('aria-label'))));
          if (search.length > 1) throw new Error('Multiple category search menus are visible.');
          if (search.length === 1) {
            const otherFields = ['Date','Description','Account','Type','Amount'].map(name => control(root(), name));
            for (let el = search[0].parentElement, i = 0; el && el !== doc.body && i < 8; el = el.parentElement, i++) {
              if (otherFields.some(field => el.contains(field))) break;
              scopes.add(el);
            }
          }
          return [...scopes];
        }
        function exactOptions(text) {
          const matches = new Set();
          for (const scope of menuScopes()) {
            for (const el of scope.querySelectorAll('[role="option"],li,button,a,[role="menuitem"],div,span')) {
              if (visible(el) && !el.closest('.wv-select__label') && optionText(el) === tidy(text)) matches.add(el);
            }
          }
          return [...matches].filter(el => ![...matches].some(other => other !== el && el.contains(other)));
        }
        async function waitOptions(text) {
          for (let i = 0; i < 20; i++) {
            assertFields(request.expected.category);
            const options = exactOptions(text);
            if (options.length) return options;
            await wait(100);
          }
          return [];
        }
        const path = request.categoryPath || [];
        if (path.length > 1 || path.some(name => name !== 'Personal Expense or Withdrawal')) throw new Error('Unsupported category navigation path.');
        // Equity categories live behind Wave's personal-expense submenu.
        let options = await waitOptions(request.category);
        if (!options.length && path.length) {
          const branches = await waitOptions(path[0]);
          if (branches.length !== 1 || !enabled(branches[0])) throw new Error('Cannot identify the Personal Expense or Withdrawal submenu. Copy diagnostics.');
          assertFields(request.expected.category); branches[0].click();
          await wait(150);
          options = await waitOptions(request.category);
        }
        if (!options.length) {
          const searches = [...doc.querySelectorAll('input')].filter(el => visible(el) && /^Search categories[.…]*$/i.test(tidy(el.placeholder || el.getAttribute('aria-label'))));
          if (searches.length === 1) {
            assertFields(request.expected.category);
            const input = searches[0];
            const setter = Object.getOwnPropertyDescriptor(doc.defaultView.HTMLInputElement.prototype, 'value').set;
            setter.call(input, request.category); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
            options = await waitOptions(request.category);
          }
        }
        if (options.length !== 1 || !enabled(options[0])) throw new Error('Exact category option not found in the category menu. Copy diagnostics so its markup can be checked.');
        assertFields(request.expected.category); options[0].click();
      }
      let ready = false;
      for (let i = 0; i < 20; i++) { try { dialog = assertFields(request.category); ready = true; break; } catch { await wait(100); } }
      if (!ready) throw new Error('Category selection could not be confirmed. Save was not clicked.');
    }
    dialog = assertFields(request.category);
    stage = 'review';
    let mark = buttons(dialog, ['Mark as reviewed','Mark reviewed']);
    // Wave may keep Review disabled while the purchase is uncategorized or loading.
    for (let i = 0; mark.length === 1 && !enabled(mark[0]) && i < 15; i++) {
      await wait(100); dialog = assertFields(request.category);
      mark = buttons(dialog, ['Mark as reviewed','Mark reviewed']);
    }
    if (mark.length === 1 && enabled(mark[0])) {
      // Some Wave layouts use this as a save-and-review action.
      assertFields(request.category); saveAttempted = true; reviewRequested = true; mark[0].click();
      for (let i = 0; i < 10; i++) { await wait(100); if (!visible(dialog)) return { saveAttempted, stage, reviewRequested }; }
      dialog = assertFields(request.category);
    }
    stage = 'save';
    const save = buttons(dialog, ['Save']);
    if (save.length !== 1 || !enabled(save[0])) throw new Error('Save is unavailable. Check the Wave dialog before continuing.');
    assertFields(request.category); saveAttempted = true; save[0].click();
    for (let i = 0; i < 40; i++) { await wait(100); if (!visible(dialog)) return { saveAttempted, stage, reviewRequested }; }
    return { saveAttempted, reviewRequested, stage, problem: 'Wave did not close the dialog after Save. Check for a validation error; no retry was made.' };
  } catch (error) {
    return { saveAttempted, stage, problem: error.message, categorySearches: [...doc.querySelectorAll('input')].filter(el => visible(el) && /categor/i.test(el.placeholder || el.getAttribute('aria-label') || '')).slice(0, 2).map(el => { let popup = el.parentElement; for (let i = 0; i < 3 && popup?.parentElement && popup.parentElement !== doc.body; i++) { if (popup.parentElement.querySelector('textarea,input[type="password"],input[type="date"]')) break; popup = popup.parentElement; } const clone = popup.cloneNode(true); clone.querySelectorAll('script,textarea,input[type="password"]').forEach(node => node.remove()); return clone.outerHTML.slice(0, 12000); }), categoryControls: [...doc.querySelectorAll(".wv-select,.wv-select__menu,[role=\"listbox\"]")].filter(visible).filter(el => tidy(el.textContent).includes(request?.expected?.category || request?.category || "\u0000")).slice(0, 2).map(el => el.outerHTML.slice(0, 5000)) };
  }
}
