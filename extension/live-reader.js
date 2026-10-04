// Injected only when the user presses Read live details. Keep self-contained.
// This function reads the DOM and URL only: no clicks, input edits or network calls.
export function readWavePage(testContext) {
  // The extension calls this without arguments. A supplied DOM context is only
  // used by the local mock-dialog harness; it never changes a real Wave page.
  const pageDocument = testContext?.document || document;
  const pageLocation = testContext?.location || location;
  const styleOf = testContext?.getComputedStyle || getComputedStyle;
  const visible = el => !!el && !el.hidden && !el.closest('[hidden],[aria-hidden="true"]') && styleOf(el).display !== 'none' && styleOf(el).visibility !== 'hidden' && el.getClientRects().length > 0;
  const tidy = value => String(value || '').replace(/\s+/g, ' ').trim();
  const url = new URL(pageLocation.href);
  const match = url.origin === 'https://next.waveapps.com' && url.pathname.match(/^\/([0-9a-f-]{36})\/transactions(?:\/(\d+))?\/?$/i);
  const identity = match ? { business: match[1], transaction: match[2] || null } : null;
  const result = { identity, fields: {}, reviewed: 'Unknown', controls: [], problems: [], capturedAt: new Date().toISOString() };
  if (!identity?.transaction) { result.problems.push('Open the exported transaction URL and wait for its Edit transaction dialog.'); return result; }
  const headings = [...pageDocument.querySelectorAll('h1,h2,h3,h4,h5,[role="heading"],div,span')].filter(el => visible(el) && !el.querySelector('div,span,h1,h2,h3,h4,h5') && tidy(el.textContent) === 'Edit transaction');
  const dialogs = [...pageDocument.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(el => visible(el) && tidy(el.textContent).includes('Edit transaction'));
  // Nested modal wrappers are okay; two distinct live dialogs are ambiguous.
  const outerDialogs = dialogs.filter(el => !dialogs.some(other => other !== el && other.contains(el)));
  if (outerDialogs.length > 1) { result.problems.push('Multiple visible Edit transaction dialogs; no fields read.'); return result; }
  let root = outerDialogs[0];
  if (!root && headings.length === 1) {
    let current = headings[0].parentElement;
    for (let i = 0; current && current !== pageDocument.body && i < 8; i++, current = current.parentElement) {
      if ([...current.querySelectorAll('button,[role="button"]')].some(el => visible(el) && tidy(el.textContent) === 'Save') && current.querySelectorAll('input').length >= 3) { root = current; break; }
    }
  }
  if (!root || root === pageDocument.body) { result.problems.push('Could not identify the Edit transaction dialog. Open it manually, then read again.'); return result; }
  const names = ['Date', 'Description', 'Account', 'Type', 'Amount', 'Category'];
  const fieldLabels = [...root.querySelectorAll('label,span,div,p')].filter(el => visible(el) && !el.querySelector('label,span,div,p') && names.some(name => tidy(el.textContent).toLowerCase() === name.toLowerCase()));
  result.fieldContexts = {};
  const selector = 'input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]),select,[role="combobox"],button,[role="button"],[tabindex="0"],[aria-haspopup="listbox"]';
  function valueOf(el, labelText) {
    if (el.tagName === 'SELECT') return tidy(el.selectedOptions[0]?.textContent);
    if (el.tagName === 'INPUT') return el.value.trim();
    // Wave's selected label excludes SVG titles and screen-reader menu prompts.
    const waveLabels = [...el.querySelectorAll('.wv-select__label')].filter(visible);
    if (waveLabels.length === 1) return tidy(waveLabels[0].textContent);
    if (waveLabels.length > 1) { result.problems.push(`${labelText}: multiple visible selected labels.`); return ''; }
    const selected = [...el.querySelectorAll('[class*="singleValue"],[class*="single-value"],[aria-selected="true"]')].filter(visible);
    let value = tidy(el.getAttribute('aria-valuetext') || (selected.length === 1 ? selected[0].textContent : el.textContent));
    if (labelText === 'Type') value = value.replace(/^Select a direction\s*[,.:]\s*/i, '');
    return value;
  }
  function field(labelText) {
    const aria = [...root.querySelectorAll(selector)].filter(el => visible(el) && tidy(el.getAttribute('aria-label')).toLowerCase() === labelText.toLowerCase());
    if (aria.length === 1) return valueOf(aria[0], labelText);
    if (aria.length > 1) { result.problems.push(`${labelText}: multiple visible named controls.`); return ''; }
    const labelled = [...root.querySelectorAll('label')].filter(el => visible(el) && tidy(el.textContent).toLowerCase() === labelText.toLowerCase());
    const associatedValues = [];
    for (const label of labelled) {
      const associated = label.control || (label.htmlFor ? pageDocument.getElementById(label.htmlFor) : null);
      if (associated && root.contains(associated) && visible(associated) && associated.type !== 'password') associatedValues.push(valueOf(associated, labelText));
    }
    if (associatedValues.length === 1) return associatedValues[0];
    if (associatedValues.length > 1) { result.problems.push(`${labelText}: multiple label-associated controls.`); return ''; }
    const labels = [...root.querySelectorAll('label,span,div,p')].filter(el => visible(el) && !el.querySelector('label,span,div,p') && tidy(el.textContent).toLowerCase() === labelText.toLowerCase());
    const values = new Set();
    for (const label of [...labelled, ...labels]) {
      let container = label.parentElement;
      for (let i = 0; container && container !== root && i < 4; i++, container = container.parentElement) {
        // A shared layout row is not a field wrapper. Never borrow its neighbor's input.
        if (fieldLabels.some(other => container.contains(other) && tidy(other.textContent).toLowerCase() !== labelText.toLowerCase())) break;
        result.fieldContexts[labelText] = [...container.querySelectorAll('*')].filter(el => visible(el) && !['INPUT', 'TEXTAREA'].includes(el.tagName)).slice(0, 16).map(el => ({ tag: el.tagName, role: el.getAttribute('role'), class: String(el.className || '').slice(0, 180), tabindex: el.getAttribute('tabindex'), ariaLabel: el.getAttribute('aria-label'), text: el.children.length ? undefined : tidy(el.textContent).slice(0, 180) }));
        let controls = [...container.querySelectorAll(selector)].filter(el => visible(el) && !/^Search categories[.…]*$/i.test(tidy(el.placeholder || el.getAttribute('aria-label'))));
        // Prefer a native value to decorative currency/calendar buttons.
        const native = controls.filter(el => ['INPUT', 'SELECT'].includes(el.tagName));
        if (native.length === 1) { values.add(valueOf(native[0], labelText)); break; }
        if (!native.length && controls.length === 1) { values.add(valueOf(controls[0], labelText)); break; }
        const combos = controls.filter(el => el.getAttribute('role') === 'combobox');
        if (!native.length && combos.length === 1) { values.add(valueOf(combos[0], labelText)); break; }
        if (native.length > 1) break;
      }
    }
    if (values.size === 1) return [...values][0];
    result.problems.push(`${labelText}: ${values.size > 1 ? 'ambiguous controls' : 'control not readable'}.`);
    return '';
  }
  for (const name of names) result.fields[name.toLowerCase()] = field(name);
  const buttonText = el => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('svg,[aria-hidden="true"],.sr-only,[role="tooltip"]').forEach(node=>node.remove());
    return tidy(clone.textContent || el.getAttribute('aria-label')).replace(/^[✓✔]\s*/, '');
  };
  result.controls = [...root.querySelectorAll('button,[role="button"]')].filter(visible).map(buttonText).filter(text => /^(Save|Cancel|Reviewed|Review updates|Mark (as )?reviewed|Mark (as )?(unreviewed|not reviewed)|Unreview)$/i.test(text));
  // Do not infer reviewed status from the list filter, bold font or suggestion dots.
  // An action checkbox saying "Mark as reviewed" is not proof of saved state.
  const reviewed = [...root.querySelectorAll('[role="checkbox"],input[type="checkbox"]')].filter(el => visible(el) && /^(reviewed|transaction reviewed)$/i.test(tidy(el.getAttribute('aria-label') || el.labels?.[0]?.textContent)));
  if (reviewed.length === 1) result.reviewed = (reviewed[0].checked ?? reviewed[0].getAttribute('aria-checked') === 'true') ? 'Reviewed' : 'Not reviewed';
  const confirmations = result.controls.filter(text=>/^Reviewed$/i.test(text));
  if (confirmations.length === 1) {
    if (result.reviewed === 'Not reviewed' || result.controls.some(text=>/^Mark (as )?reviewed$/i.test(text))) {
      result.reviewed = 'Unknown'; result.problems.push('Conflicting reviewed indicators in the edit dialog.');
    } else { result.reviewed = 'Reviewed'; result.reviewedEvidence = 'Edit dialog Reviewed confirmation'; }
  } else if (confirmations.length > 1) { result.reviewed = 'Unknown'; result.problems.push('Multiple Reviewed confirmation controls.'); }
  return result;
}
