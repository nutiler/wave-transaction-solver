// Injected only when the user presses Read live details. Keep self-contained.
// This function reads the DOM and URL only: no clicks, input edits or network calls.
export function readWavePage(testContext) {
  // A single read-only DOM observer waits for React to render the owned record.
  // Solver timers can be heavily throttled in a background Chrome tab, so avoid
  // repeated caller-side sleeps and never accept another transaction as ready.
  if(testContext?.waitForReady){
    const request=testContext.waitForReady,doc=testContext.document||document,view=doc.defaultView||globalThis;
    const milliseconds=Math.min(15000,Math.max(1000,Number(request.timeoutMs)||15000));
    return new Promise(resolve=>{
      let observer,timer,finished=false;
      const read=()=>readWavePage(testContext.document?{document:doc,location:testContext.location,getComputedStyle:testContext.getComputedStyle}:undefined);
      const finish=s=>{if(finished)return;finished=true;observer?.disconnect();if(timer) view.clearTimeout(timer);resolve(s);};
      const inspect=()=>{const s=read();if(s.identity?.business!==request.business||s.identity.transaction!==request.id)return;
        const required=['date','description','account','type',...(s.structure?.split?[]:['amount','category'])];
        if(required.every(k=>typeof s.fields[k]==='string'&&s.fields[k].trim()))finish(s);
      };
      observer=new view.MutationObserver(inspect);observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
      timer=view.setTimeout(()=>{const s=read();s.problems.push('Timed out waiting for the exact transaction form.');finish(s);},milliseconds);inspect();
    });
  }
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
        // An open Wave menu adds focusable controls, but its selected label still owns the field value.
        const waveSelects=[...container.querySelectorAll('.wv-select')].filter(visible);
        const owners=waveSelects.filter(el=>!waveSelects.some(other=>other!==el && other.contains(el)));
        if(owners.length===1){const selected=[...owners[0].querySelectorAll('.wv-select__label')].filter(visible);if(selected.length===1){values.add(valueOf(owners[0],labelText));break;}}
        if(owners.length>1)break;
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
  // Only links inside the selected Category control can identify the other
  // transfer side. Unrelated list/receipt links never become counterpart IDs.
  result.transferLinks=[];
  for(const label of fieldLabels.filter(el=>tidy(el.textContent).toLowerCase()==='category'))for(let container=label.parentElement;container&&container!==root;container=container.parentElement){
    if(fieldLabels.some(other=>other!==label&&container.contains(other)))break;
    for(const anchor of container.querySelectorAll('a[href]')){try{const target=new URL(anchor.getAttribute('href'),url.href),m=target.pathname.match(/^\/([0-9a-f-]{36})\/transactions\/(\d+)\/?$/i);if(target.origin===url.origin&&m?.[1]===identity.business&&m[2]!==identity.transaction)result.transferLinks.push(m[2]);}catch{}}
  }
  result.transferLinks=[...new Set(result.transferLinks)];
  const buttonText = el => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('svg,[aria-hidden="true"],.sr-only,[role="tooltip"]').forEach(node=>node.remove());
    return (tidy(clone.textContent) || tidy(el.getAttribute('aria-label'))).replace(/^[✓✔]\s*/, '');
  };
  const structuralButtons=[...root.querySelectorAll('button,[role=button]')].filter(visible).map(buttonText);
  const namedAmounts=[...root.querySelectorAll('input')].filter(el=>visible(el)&&tidy(el.getAttribute('aria-label')).toLowerCase()==='amount');
  const splitRows=namedAmounts.length>1&&fieldLabels.filter(el=>tidy(el.textContent).toLowerCase()==='category').length>1;
  const split=splitRows||structuralButtons.some(text=>/^(?:Remove split|Add (?:another )?split|Delete split)$/i.test(text))||/^(?:Split transaction|Multiple categories)$/i.test(result.fields.category||'');
  const currencies=new Set();for(const label of fieldLabels.filter(el=>tidy(el.textContent).toLowerCase()==='amount')){for(let container=label.parentElement;container&&container!==root;container=container.parentElement){if(fieldLabels.some(other=>other!==label&&container.contains(other)&&tidy(other.textContent).toLowerCase()!=='amount'))break;for(const el of [...container.querySelectorAll('*')].filter(el=>visible(el)&&!el.children.length&&/^(?:USD|CAD|EUR|GBP|AUD)$/i.test(tidy(el.textContent))))currencies.add(tidy(el.textContent).toUpperCase());if(currencies.size)break;}}result.currency=currencies.size===1?[...currencies][0]:null;
  result.structure={singleCategory:!split&&!!result.fields.category&&structuralButtons.filter(text=>/^Split transaction$/i.test(text)).length===1,split};
  result.controls = [...root.querySelectorAll('button,[role="button"]')].filter(visible).map(buttonText).filter(text => /^(Save|Cancel|Reviewed|Review updates|Mark (as )?reviewed|Mark (as )?(unreviewed|not reviewed)|Unreview)$/i.test(text));
  // Do not infer reviewed status from the list filter, bold font or suggestion dots.
  // An action checkbox saying "Mark as reviewed" is not proof of saved state.
  const reviewed = [...root.querySelectorAll('[role="checkbox"],input[type="checkbox"]')].filter(el => visible(el) && /^(reviewed|transaction reviewed)$/i.test(tidy(el.getAttribute('aria-label') || el.labels?.[0]?.textContent)));
  if(reviewed.length===1){
    const box=reviewed[0],checked=box.tagName==='INPUT'?box.checked:box.getAttribute('aria-checked')==='true'?true:box.getAttribute('aria-checked')==='false'?false:null;
    result.reviewCheckbox={checked,disabled:!!box.disabled || box.getAttribute('aria-disabled')==='true'};
    if(checked!==null)result.reviewed=checked?'Reviewed':'Not reviewed';else result.problems.push('Reviewed checkbox has no explicit state.');
  }else if(reviewed.length>1)result.problems.push('Multiple reviewed checkboxes.');
  result.reviewActions=[...root.querySelectorAll('button,[role="button"]')].filter(visible).map(el=>({name:buttonText(el),disabled:!!el.disabled || el.getAttribute('aria-disabled')==='true'})).filter(a=>/^(Reviewed|Mark (as )?reviewed|Mark (as )?(unreviewed|not reviewed)|Unreview)$/i.test(a.name));
  const updates=[...root.querySelectorAll('button,[role="button"]')].filter(el=>visible(el)&&/^Review updates$/i.test(buttonText(el)));
  if(updates.length)result.reviewUpdates={count:updates.length,disabled:updates.some(el=>!!el.disabled||el.getAttribute('aria-disabled')==='true')};
  result.reviewDiagnostics=[...root.querySelectorAll('button,[role="button"],[role="checkbox"],input[type="checkbox"]')].filter(visible).slice(0,25).map(el=>({tag:el.tagName,role:el.getAttribute('role'),name:buttonText(el),ariaLabel:el.getAttribute('aria-label'),checked:el.getAttribute('aria-checked'),disabled:!!el.disabled || el.getAttribute('aria-disabled')==='true',html:el.outerHTML.slice(0,1800)}));
  if(true===result.reviewCheckbox?.checked && result.controls.some(text=>/^Mark (as )?reviewed$/i.test(text))){result.reviewed='Unknown';result.problems.push('Conflicting checkbox and reviewed-action indicators.');}
  const confirmations = result.controls.filter(text=>/^Reviewed$/i.test(text));
  if (confirmations.length === 1) {
    if (result.reviewed === 'Not reviewed' || result.controls.some(text=>/^Mark (as )?reviewed$/i.test(text))) {
      result.reviewed = 'Unknown'; result.problems.push('Conflicting reviewed indicators in the edit dialog.');
    } else { result.reviewed = 'Reviewed'; result.reviewedEvidence = 'Edit dialog Reviewed confirmation'; }
  } else if (confirmations.length > 1) { result.reviewed = 'Unknown'; result.problems.push('Multiple Reviewed confirmation controls.'); }
  return result;
}
