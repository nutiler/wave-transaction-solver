import { editWaveTransaction } from './editor.js';
const business = '11111111-1111-1111-1111-111111111111', id = '1000000000000000001';
const expected = { date: '2026-09-20', description: 'Test Store', account: 'Test Card', type: 'Withdrawal', amount: '52.80', category: 'Uncategorized Expense' };
const request = { business, id, category: 'Personal Groceries', expected };
const mount = document.getElementById('fixture');
function fixture({ custom = false, reviewSave = false, original = expected, missing = false, duplicate = false, validationError = false, reviewDisabled = false, reviewEnablesOnCategory = false, personalSubmenu = false, searchRequired = false, distractor = false, innerToggleOnly = false, portal = false, confirmedReviewed = false, transferMenu = null, targetCategory = request.category } = {}) {
  mount.replaceChildren();
  const dialog = document.createElement('section'); dialog.setAttribute('role','dialog');
  dialog.innerHTML = '<h2>Edit transaction</h2>';
  for (const name of ['Date','Description','Account','Type','Amount','Category']) {
    const wrapper = document.createElement('div'), label = document.createElement('label'); label.textContent = name;
    const field = document.createElement(['Account','Type','Category'].includes(name) ? 'select' : 'input'); field.setAttribute('aria-label',name);
    if (field.tagName === 'SELECT') {
      const option = document.createElement('option'); option.textContent = original[name.toLowerCase()]; field.append(option);
      if (name === 'Category' && !missing) { const option = document.createElement('option'); option.textContent = request.category; field.append(option); if(duplicate) field.append(option.cloneNode(true)); }
    } else field.value = original[name.toLowerCase()];
    wrapper.append(label,field); dialog.append(wrapper);
  }
  let selected = original.category, reviewed = confirmedReviewed, saves = 0;
  const category = dialog.querySelector('[aria-label="Category"]');
  category.onchange = () => { selected = category.value; if (reviewEnablesOnCategory) mark.disabled = false; };
  if (custom) {
    const wrapper = category.parentElement; category.remove();
    const control = document.createElement('div'); control.className = 'wv-select'; control.tabIndex = 0;
    const label = document.createElement('span'); label.className = 'wv-select__label'; label.textContent = original.category; control.append(label); wrapper.append(control);
    const toggle = document.createElement('div'); toggle.className = 'wv-select__input wv-select__toggle';
    toggle.append(label); control.append(toggle);
    (innerToggleOnly ? toggle : control).onclick = event => {
      if (event.target.closest('input')) return;
      document.querySelector('.menu')?.remove();
      const list = document.createElement('div'); list.className = 'menu';
      const search = document.createElement('input'); search.placeholder = 'Search categories...'; list.append(search);
      function showOptions() {
        list.querySelectorAll('.category-option').forEach(option => option.remove());
        for (let i = 0; i < (missing ? 0 : duplicate ? 2 : 1); i++) {
          const option = document.createElement('div'); option.className = 'category-option';
          const name = document.createElement('span'); name.textContent = request.category;
          const icon = document.createElementNS('http://www.w3.org/2000/svg','svg'); const title=document.createElementNS('http://www.w3.org/2000/svg','title'); title.textContent='More information'; icon.append(title); option.append(name,icon);
          option.onclick = event => { event.stopPropagation(); label.textContent = request.category; selected = request.category; if (reviewEnablesOnCategory) mark.disabled = false; list.remove(); }; list.append(option);
        }
      }
      if (personalSubmenu) {
        const branch = document.createElement('a'); branch.href='#'; branch.textContent = 'Personal Expense or Withdrawal'; list.append(branch);
        branch.onclick = event => { event.preventDefault(); event.stopPropagation(); branch.remove(); showOptions(); };
      } else if (!searchRequired) showOptions();
      search.oninput = () => { if (search.value === request.category) showOptions(); };
      (portal ? mount : control).append(list);
    };
    if(transferMenu){
      const list=document.createElement('div');list.className='wv-select__menu__options';list.setAttribute('role','menu');
      if(!transferMenu.createOnly){const heading=document.createElement('div');heading.textContent='Select Account with Matching Transaction';list.append(heading);}
      const appendOption=()=>{const option=document.createElement('div');option.className='wv-select__menu__option';option.setAttribute('role','menuitemradio');option.textContent=transferMenu.label;if(transferMenu.wrongId)option.dataset.transactionId='1000000000000000003';if(transferMenu.disabled)option.setAttribute('aria-disabled','true');option.onclick=()=>{label.textContent=targetCategory;selected=targetCategory;list.remove();};list.append(option);};
      if(!transferMenu.createOnly){appendOption();if(duplicate)appendOption();}
      const create=document.createElement('div');create.textContent='Select Account to Create Transfer';list.append(create);appendOption();mount.append(list);
    }
    if (distractor) { const outside=document.createElement('button'); outside.textContent=request.category; outside.onclick=()=>{ selected='WRONG OUTSIDE MENU'; }; dialog.append(outside); }

  }
  const mark = document.createElement('button'); mark.innerHTML = confirmedReviewed ? '<svg><title>checkmark icon</title></svg>Reviewed' : 'Mark as reviewed'; mark.disabled = reviewDisabled;
  mark.onclick = () => { reviewed = true; mark.textContent = 'Mark as unreviewed'; if(reviewSave) { saves++; dialog.hidden = true; } };
  const save = document.createElement('button'); save.textContent = 'Save'; save.onclick = () => { saves++; if(!validationError) dialog.hidden = true; };
  dialog.append(mark,save); mount.append(dialog);
  return { document, location: { href: 'https://next.waveapps.com/' + business + '/transactions/' + id }, getComputedStyle, wait: async () => {}, state: () => ({ selected, reviewed, saves }) };
}
document.getElementById('run').onclick = async () => {
  const checks = document.getElementById('checks'); checks.replaceChildren(); let failures = 0;
  async function check(name, options, verify, override = request) {
    const context = fixture(options), result = await editWaveTransaction(override, context), state = context.state();
    const ok = verify(result,state); failures += !ok;
    const item = document.createElement('li'); item.textContent = (ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + JSON.stringify({ result,state })); checks.append(item);
  }
  await check('Native dropdown selects category, requests review, and saves once', {}, (r,s) => !r.problem && s.selected === request.category && s.reviewed && s.saves === 1);
  await check('Wave-style dropdown uses exact selected label', { custom:true }, (r,s) => !r.problem && s.selected === request.category && s.saves === 1);
  await check('Review action that saves closes without a second save', { reviewSave:true }, (r,s) => !r.problem && s.reviewed && s.saves === 1);
  await check('Initially disabled review enables after category selection', { custom:true,reviewDisabled:true,reviewEnablesOnCategory:true }, (r,s) => !r.problem && r.reviewRequested && s.reviewed && s.saves === 1);
  await check('Permanently disabled review saves category without claiming reviewed', { reviewDisabled:true }, (r,s) => !r.problem && !r.reviewRequested && !s.reviewed && s.selected === request.category && s.saves === 1);
  await check('Personal category submenu opens before selecting the exact account', { custom:true,personalSubmenu:true }, (r,s) => !r.problem && s.selected === request.category && s.saves === 1, {...request,categoryPath:['Personal Expense or Withdrawal']});
  await check('Category search reveals an exact hidden option', { custom:true,searchRequired:true }, (r,s) => !r.problem && s.selected === request.category && s.saves === 1);
  await check('Same category text outside the menu is ignored', { custom:true,distractor:true }, (r,s) => !r.problem && s.selected === request.category && s.saves === 1);
  await check('Wave inner toggle opens a separate popup and selects its personal submenu', { custom:true,innerToggleOnly:true,portal:true,personalSubmenu:true }, (r,s) => !r.problem && s.selected === request.category && s.saves === 1, {...request,categoryPath:['Personal Expense or Withdrawal']});
  await check('Already-reviewed confirmation is preserved and never clicked', { confirmedReviewed:true }, (r,s) => !r.problem && s.reviewed && s.saves === 1);
  await check('Changed amount is blocked before any edit', { original:{...expected,amount:'99.00'} }, (r,s) => !r.saveAttempted && !!r.problem && s.saves === 0 && s.selected === expected.category);
  await check('Changed transaction identity is blocked', {}, (r,s) => !r.saveAttempted && !!r.problem && s.saves === 0, {...request,id:'1000000000000000002'});
  await check('Missing category does not click Save', { custom:true,missing:true }, (r,s) => !r.saveAttempted && !!r.problem && s.saves === 0);
  await check('Ambiguous category does not click Save', { custom:true,duplicate:true }, (r,s) => !r.saveAttempted && !!r.problem && s.saves === 0);
  await check('Wave validation error reports unverified save, without retry', { validationError:true }, (r,s) => r.saveAttempted && !!r.problem && s.saves === 1);
  const transfer={id:'1000000000000000002',account:'Fictional Destination Card',date:'2026-09-19',description:'Payment thank you',label:'Transfer to Fictional Destination Card - Sep 19, 2026 - Payment thank you'};
  const transferRequest={...request,category:'Transfer to '+transfer.account,transfer};
  const transferFixture={custom:true,targetCategory:transferRequest.category,transferMenu:{label:transfer.label}};
  await check('Existing transfer selects only the matching group, requests review, and saves once',transferFixture,(r,s)=>!r.problem && r.reviewRequested && s.reviewed && s.saves===1 && s.selected===transferRequest.category,transferRequest);
  await check('Create-transfer option with the same label cannot be selected',{...transferFixture,transferMenu:{label:transfer.label,createOnly:true}},(r,s)=>!!r.problem && !r.saveAttempted && s.saves===0 && s.selected===expected.category,transferRequest);
  await check('Duplicate existing transfer matches cannot be saved',{...transferFixture,duplicate:true},(r,s)=>!!r.problem && !r.saveAttempted && s.saves===0,transferRequest);
  await check('Disabled existing transfer cannot be selected',{...transferFixture,transferMenu:{label:transfer.label,disabled:true}},(r,s)=>!!r.problem && !r.saveAttempted && s.saves===0,transferRequest);
  await check('Wrong counterpart transaction ID blocks the edit',{...transferFixture,transferMenu:{label:transfer.label,wrongId:true}},(r,s)=>!!r.problem && !r.saveAttempted && s.saves===0,transferRequest);
  await check('Unexpected selected transfer value blocks Save',{...transferFixture,targetCategory:'Unexpected transfer account'},(r,s)=>!!r.problem && r.saveAttempted && s.saves===0,transferRequest);
  await check('Transfer review action that saves never issues a second Save',{...transferFixture,reviewSave:true},(r,s)=>!r.problem && r.saveAttempted && s.reviewed && s.saves===1,transferRequest);
  mount.replaceChildren(); document.getElementById('result').textContent = failures ? failures + ' failed' : 'All 22 editor checks passed';
};
