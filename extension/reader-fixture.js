import { readWavePage } from './live-reader.js';
import { readWaveChart } from './chart-reader.js';
import { chartGroups, validateCatalog } from './catalog.js';
const target = document.getElementById('fixture'), output = document.getElementById('results');
const url = 'https://next.waveapps.com/11111111-1111-1111-1111-111111111111/transactions/1000000000000000001?status=NOT_VERIFIED';
const field = (name, value, type = 'text') => `<div><label for="${name}">${name}</label><input id="${name}" type="${type}" value="${value}"></div>`;
const nativeFields = field('Date','2026-10-02','date') + field('Description','PURCHASE AUTHORIZED ON 10/01 Amazon web service aws.amazon.co WA LONG REFERENCE') + field('Account','Sample Checking') + field('Type','Withdrawal') + field('Amount','2.01') + field('Category','Computer Hosting');
const modal = (body = nativeFields, attrs = 'role="dialog"') => `<section ${attrs}><h2>Edit transaction</h2>${body}<button>Save</button><button>Cancel</button></section>`;
let passed = 0, failed = 0;
function check(name, html, assert, pageUrl = url) {
  target.innerHTML = html;
  let clicks = 0; target.addEventListener('click', () => clicks++, { once: true });
  const before = target.innerHTML, values = [...target.querySelectorAll('input')].map(el => [el.value, el.checked]);
  try {
    const snapshot = readWavePage({ document, location: { href: pageUrl }, getComputedStyle });
    assert(snapshot);
    if (target.innerHTML !== before || JSON.stringify(values) !== JSON.stringify([...target.querySelectorAll('input')].map(el => [el.value, el.checked])) || clicks) throw new Error('Reader mutated the mock dialog.');
    passed++; const li = document.createElement('li'); li.textContent = `PASS: ${name}`; output.append(li);
  } catch (e) { failed++; const li = document.createElement('li'); li.textContent = `FAIL: ${name}: ${e.message}`; output.append(li); }
}
function equal(actual, expected) { if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
check('Native labels, full description, exact ID, no review inference from filter', modal(), s => { equal(s.fields.amount,'2.01'); equal(s.fields.date,'2026-10-02'); equal(s.fields.account,'Sample Checking'); equal(s.identity.transaction,'1000000000000000001'); equal(s.fields.description.includes('LONG REFERENCE'),true); equal(s.reviewed,'Unknown'); });
check('ARIA-named controls', modal('<input aria-label="Date" value="2026-10-02"><input aria-label="Amount" value="2.01"><input aria-label="Description" value="Amazon"><button aria-label="Category">Computer Hosting</button>'), s => { equal(s.fields.category,'Computer Hosting'); equal(s.fields.amount,'2.01'); });
check('Custom dropdown wrappers and calendar decoration', modal('<div><div>Date</div><div><input value="2026-10-02"><button>Calendar</button></div></div><div><div>Amount</div><div><button>USD</button><input value="2.01"></div></div><div><div>Category</div><button role="combobox">Computer Hosting</button></div>'), s => { equal(s.fields.date,'2026-10-02'); equal(s.fields.amount,'2.01'); equal(s.fields.category,'Computer Hosting'); });
check('Visible duplicate named fields fail closed', modal('<input aria-label="Amount" value="2.01"><input aria-label="Amount" value="3.01">'), s => { equal(s.fields.amount,''); equal(s.problems.some(p=>p.includes('multiple visible')),true); });
check('Visible duplicate associated labels fail closed', modal('<label for="one">Amount</label><input id="one" value="2.01"><label for="two">Amount</label><input id="two" value="3.01">'), s => { equal(s.fields.amount,''); });
check('Hidden dialog ignored', modal(nativeFields,'role="dialog" hidden') + modal(), s => { equal(s.fields.amount,'2.01'); });
check('Two visible dialogs are ambiguous', modal() + modal(), s => { equal(Object.keys(s.fields).length,0); equal(s.problems[0].includes('Multiple visible'),true); });
check('Absent modal is unknown', '<p>No transaction dialog</p>', s => { equal(Object.keys(s.fields).length,0); });
check('Transaction-list URL is not an individual record', modal(), s => { equal(s.identity.transaction,null); equal(Object.keys(s.fields).length,0); }, url.split('/transactions/')[0] + '/transactions?status=NOT_VERIFIED');
check('Other origins are rejected', modal(), s => { equal(s.identity,null); equal(Object.keys(s.fields).length,0); }, 'https://example.com/11111111-1111-1111-1111-111111111111/transactions/1000000000000000001');
check('Mark-as-reviewed action checkbox is not saved status', modal(nativeFields + '<label><input type="checkbox" checked>Mark as reviewed</label>'), s => equal(s.reviewed,'Unknown'));
check('Explicit reviewed state is readable', modal(nativeFields + '<label><input type="checkbox" checked>Reviewed</label>'), s => equal(s.reviewed,'Reviewed'));
check('Password and notes excluded', '<input type="password" value="do-not-read">' + modal(nativeFields + '<textarea aria-label="Notes">private notes excluded</textarea>'), s => { equal(JSON.stringify(s).includes('do-not-read'),false); equal(JSON.stringify(s).includes('private notes'),false); });
check('Modal fallback with generic heading', `<section><div>Edit transaction</div>${nativeFields}<button>Save</button></section>`, s => equal(s.fields.amount,'2.01'));
check('Category never borrows adjacent amount input', modal('<div><div><label>Amount</label><input value="2.01"></div><div><label>Category</label><div>Computer Hosting</div></div></div>'), s => { equal(s.fields.category,''); equal(s.fields.amount,'2.01'); equal(s.fieldContexts.Category.some(c=>c.text==='Computer Hosting'),true); });
check('Keyboard dropdowns and selected value exclude instructions', modal('<div><label>Account</label><div tabindex="0">Sample Checking</div></div><div><label>Category</label><div tabindex="0"><span>Select category</span><span class="select__single-value">Computer Hosting</span></div></div><div><label>Type</label><button>Select a direction, Withdrawal</button></div>'), s => { equal(s.fields.account,'Sample Checking'); equal(s.fields.category,'Computer Hosting'); equal(s.fields.type,'Withdrawal'); });
check('Nested label cannot cross shared layout row', modal('<div><div><label>Category</label></div><div><label>Amount</label><input value="2.01"></div></div>'), s => equal(s.fields.category,''));
const waveDropdown = (name, value, button = false) => `<div><label class="wv-form-field__label"><span class="wv-form-field__label__text">${name}</span></label><div class="wv-form-field__element"><${button ? 'button' : 'div tabindex="0"'} class="wv-select"><span class="sr-only">Select a direction,</span><span class="wv-select__label">${value}</span><div class="wv-select__input__icon"><svg><title>open menu icon</title></svg></div></${button ? 'button' : 'div'}></div></div>`;
check('Wave selected labels exclude SVG titles and accessible prompts', modal(waveDropdown('Account','(2835) Wells Fargo Business') + waveDropdown('Category','Computer Hosting — Domain, Server, Website, Storage') + waveDropdown('Type','Withdrawal',true)), s => { equal(s.fields.account,'(2835) Wells Fargo Business'); equal(s.fields.category,'Computer Hosting — Domain, Server, Website, Storage'); equal(s.fields.type,'Withdrawal'); });
check('Open category search does not replace the selected category', modal(waveDropdown('Category','Uncategorized Expense').replace('</div></div></div>', '<input placeholder="Search categories..." value="gr"></div></div></div>')), s => equal(s.fields.category,'Uncategorized Expense'));
check('Ambiguous Wave selected labels remain unknown', modal('<div><label>Category</label><div tabindex="0"><span class="wv-select__label">First</span><span class="wv-select__label">Second</span></div></div>'), s => { equal(s.fields.category,''); equal(s.problems.some(p=>p.includes('multiple visible selected labels')),true); });
async function chartCheck(name, run) {
  try { await run(); passed++; const li=document.createElement('li'); li.textContent=`PASS: ${name}`; output.append(li); }
  catch(e) { failed++; const li=document.createElement('li'); li.textContent=`FAIL: ${name}: ${e.message}`; output.append(li); }
}
const business = '11111111-1111-1111-1111-111111111111';
const chartContext = { document, location: { href: `https://next.waveapps.com/${business}/accounting/charts` }, getComputedStyle, wait: async()=>{} };
await chartCheck('Chart collector reads five tabs, full names, and clicks no edit controls', async()=> {
  target.innerHTML = chartGroups.map((name,i)=>`<button role="tab" aria-selected="${i===0}" data-group="${i}">${name} <span>1</span></button>`).join('') + '<div id="mockAccounts"></div><button id="mockEdit">Edit account</button>';
  let edits=0; document.getElementById('mockEdit').onclick=()=>edits++;
  function select(index) { for(const tab of target.querySelectorAll('[role="tab"]')) tab.setAttribute('aria-selected',String(Number(tab.dataset.group)===index)); document.getElementById('mockAccounts').innerHTML=`<table><tr><td>${75378051+index}</td><td>${chartGroups[index]} full account name<div>Last transaction on August 24</div></td><td>Description</td></tr></table>`; }
  for(const tab of target.querySelectorAll('[role="tab"]')) tab.onclick=()=>select(Number(tab.dataset.group)); select(0);
  const result=await readWaveChart(business,chartContext); validateCatalog(result,business); equal(result.groups.length,5); equal(result.groups[3].accounts[0].name,'Expenses full account name'); equal(edits,0);
});
await chartCheck('Chart collection fails closed on a missing row', async()=> {
  target.innerHTML=chartGroups.map(name=>`<button role="tab" aria-selected="true">${name} 1</button>`).join('');
  const result=await readWaveChart(business,chartContext); equal(result.groups.length,0); equal(result.problems.length,1);
});
await chartCheck('Eight Assets rows include blank numbers and preserve names', async()=> {
  target.innerHTML=chartGroups.map((name,index)=>`<li role="tab" aria-selected="${index===0}" tabindex="0" data-group="${index}"><span class="wv-nav__link">${name}<span>${index===0 ? 8 : 1}</span></span></li>`).join('') + '<div id="blankNumberAccounts"></div>';
  function select(index) {
    for(const tab of target.querySelectorAll('[role="tab"]')) tab.setAttribute('aria-selected',String(Number(tab.dataset.group)===index));
    const count=index===0 ? 8 : 1;
    document.getElementById('blankNumberAccounts').innerHTML='<table>'+Array.from({length:count},(_,row)=>`<tr><td>${row<6 ? (row===1 ? '1441' : '753780751') : ''}</td><td>${chartGroups[index]} account ${row}<div>Last transaction on August 24</div></td><td>Description</td><td><button>Edit</button></td></tr>`).join('')+'</table>';
  }
  for(const tab of target.querySelectorAll('[role="tab"]')) tab.onclick=()=>select(Number(tab.dataset.group)); select(0);
  const result=await readWaveChart(business,chartContext); validateCatalog(result,business); equal(result.groups[0].accounts.length,8); equal(result.groups[0].accounts[6].number,null); equal(result.groups[0].accounts[1].number,'1441'); equal(result.groups[0].accounts[7].name,'Assets account 7');
});
await chartCheck('Chart collection rejects another business before clicks', async()=> {
  let clicks=0; for(const tab of target.querySelectorAll('button')) tab.onclick=()=>clicks++;
  const result=await readWaveChart('other-business',chartContext); equal(result.groups.length,0); equal(clicks,0);
});
await chartCheck('Wave account-name cells exclude add and empty rows, count editable plus built-in accounts', async()=> {
  target.innerHTML=chartGroups.map((name,index)=>`<li role="tab" aria-selected="${index===0}" tabindex="0" data-group="${index}"><span class="wv-nav__link">${name}<span class="wv-counter">${index===0 ? 8 : 1}</span></span></li>`).join('')+'<div id="waveChartRows"></div>';
  function select(index) {
    for(const tab of target.querySelectorAll('[role="tab"]')) tab.setAttribute('aria-selected',String(Number(tab.dataset.group)===index));
    const count=index===0 ? 8 : 1;
    const accountRow=(name,number,editable)=>`<tr class="wv-table__row"><td><span>${number}</span></td><td><span class="chart-of-accounts-table__account-name-column"><span>${name}</span><p class="wv-text--inline">Last transaction on August 24</p></span></td><td>Description</td><td>Archived</td><td>${editable ? '<svg class="chart-of-accounts-table__actions__edit-icon"><title>edit icon</title></svg>' : ''}</td></tr>`;
    document.getElementById('waveChartRows').innerHTML='<table>'+Array.from({length:count},(_,row)=>accountRow(`${chartGroups[index]} account ${row}`,row===7 ? '' : row===6 ? 'name-code' : '1441',true)).join('')+accountRow(`${chartGroups[index]} built-in one`,'',false)+accountRow(`${chartGroups[index]} built-in two`,'',false)+'<tr><td></td><td colspan="4"><button>Add a new account</button></td></tr><tr><td></td><td colspan="4">You haven’t added any Inventory accounts yet.</td></tr></table>';
  }
  for(const tab of target.querySelectorAll('[role="tab"]')) tab.onclick=()=>select(Number(tab.dataset.group)); select(0);
  const result=await readWaveChart(business,chartContext); validateCatalog(result,business); equal(result.groups[0].accounts.length,10); equal(result.groups[0].accounts.filter(a=>a.counted).length,8); equal(result.groups[0].accounts[7].name,'Assets account 7'); equal(result.groups[0].accounts[9].counted,false); equal(JSON.stringify(result.groups).includes('Add a new account'),false);
});
await chartCheck('Liabilities counter 19 accepts 20 exact rows with 18 edit icons',async()=> {
  target.innerHTML=chartGroups.map((name,index)=>`<li role="tab" aria-selected="${index===0}" tabindex="0" data-group="${index}">${name}<span>${index===1 ? 19 : 1}</span></li>`).join('')+'<div id="liabilityRows"></div>';
  function select(index) {
    for(const tab of target.querySelectorAll('[role="tab"]')) tab.setAttribute('aria-selected',String(Number(tab.dataset.group)===index));
    const count=index===1 ? 20 : 1;
    document.getElementById('liabilityRows').innerHTML='<table>'+Array.from({length:count},(_,row)=>`<tr><td></td><td><span class="chart-of-accounts-table__account-name-column"><span>${chartGroups[index]} account ${row}</span><p>No transactions for this account</p></span></td><td>${row<18 ? '<svg class="chart-of-accounts-table__actions__edit-icon"></svg>' : ''}</td></tr>`).join('')+'</table>';
  }
  for(const tab of target.querySelectorAll('[role="tab"]')) tab.onclick=()=>select(Number(tab.dataset.group)); select(0);
  const result=await readWaveChart(business,chartContext); validateCatalog(result,business); equal(result.groups[1].accounts.length,20); equal(result.groups[1].expected,19); equal(result.groups[1].accounts.filter(a=>a.counted).length,18);
});
target.replaceChildren(); document.getElementById('summary').textContent = `${passed} passed, ${failed} failed. These mocks do not establish compatibility with live Wave.`;
