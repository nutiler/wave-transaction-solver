import {installVenmoRepairView} from './venmo-repair-view.js';
import {fictionalRepairHarness} from './venmo-repair-fixture-data.js';
import {venmoRepairPage} from './venmo-repair-page.js';
import {loadLocalFeature} from './session.js';
const h=fictionalRepairHarness();let business=h.plan.business;
const state=()=>({business,transactions:h.plan.baseline,receipts:{},extensionMode:true,sample:false,busy:false});
const view=installVenmoRepairView({parent:document.getElementById('view'),getState:state,makeAdapter:()=>({...h.args,mutate:async(a,fields)=>{const saved=await loadLocalFeature('venmo:reconciliation:'+h.plan.business),funding=await loadLocalFeature('venmo:funding:'+h.plan.business);await h.args.persist({receipts:saved.receipts,transferReceipts:funding.receipts});return h.args.mutate(a,fields);}}),loadPrepared:async owner=>owner===h.plan.business?{plan:h.plan,transactions:h.plan.baseline,records:h.plan.sources,statements:h.plan.statements}:null});
await view.refresh();
globalThis.repairFixture={writes:()=>h.writes,collections:()=>h.collections,other:async()=>{business='22222222-2222-2222-2222-222222222222';await view.refresh();},original:async()=>{business=h.plan.business;await view.refresh();}};
const el=(tag,text)=>Object.assign(document.createElement(tag),text===undefined?{}:{textContent:text});
function formFixture({creating=false,protectedCopy=false,split=false,changed=false,iconDelete=false,delayedSave=false,failedSave=false,existingNotice=false}={}){
 const host=document.getElementById('forms');host.replaceChildren();let saves=0,deletes=0,reviewClicks=0,category='Tools',values={};const expected={date:'2026-01-15',description:'Fictional entry',account:'(fictional) Venmo',type:'Withdrawal',amount:'0.05',category:'Tools'};
 const build=()=>{
  const root=el('section');root.setAttribute('role','dialog');root.append(el('h2',creating?'Add deposit':'Edit transaction'));
  for(const name of ['Date','Description','Account','Type','Amount','Category']){
   const field=el('div');field.append(el('label',name));let c;
   if(name==='Category'){c=el('div');c.className='wv-select';const label=el('span',creating?'Uncategorized Income':split?'Split transaction':'Tools');label.className='wv-select__label';c.append(label);c.onclick=()=>{const menu=el('div');menu.className='wv-select__menu';const branch=el('button','Refund for Expense');branch.className='wv-select__menu__option';branch.onclick=()=>{menu.replaceChildren();const option=el('button','Rent');option.className='wv-select__menu__option';option.onclick=()=>{category='Refund for Rent';label.textContent=category;menu.remove();};menu.append(option);};menu.append(branch);host.append(menu);};}
   else if(name==='Account'){c=el('select');c.setAttribute('aria-label',name);for(const name of ['Fictional Bank','(fictional) Venmo']){const o=el('option',name);o.value=name;c.append(o);}c.value=creating?'Fictional Bank':expected.account;}
   else{c=el('input');c.setAttribute('aria-label',name);c.value=creating?({Date:'2026-01-01',Description:'',Type:'Deposit',Amount:'0.00'}[name]||''):name==='Amount'&&changed?'9.99':expected[name.toLowerCase()];}
   values[name]=c;field.append(c);if(name==='Amount')field.append(el('span','USD'));root.append(field);
  }
  if(split)for(const [amount,name] of [['0.02','Fee A'],['0.03','Fee B']]){const row=el('div');row.dataset.splitRow='true';const input=el('input');input.value=amount;const label=el('span',name);label.className='wv-select__label';row.append(input,label);root.append(row);}
  const notes=el('textarea');notes.value=protectedCopy?'Retain this receipt note':'';root.append(notes);
  if(existingNotice){const notice=el('p','This transaction has already been reconciled');notice.setAttribute('role','alert');root.append(notice);}
  const review=el('button','Reviewed');review.onclick=()=>reviewClicks++;const save=el('button','Save');save.onclick=()=>{saves++;if(failedSave){const alert=el('p','Amount could not be saved');alert.setAttribute('role','alert');root.append(alert);}else if(delayedSave)setTimeout(()=>root.hidden=true,50);else root.hidden=true;};const trash=el('button',iconDelete?'':'Delete transaction');if(iconDelete){const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('aria-label','TrashIcon');trash.append(icon);}trash.onclick=()=>{const d=el('div');d.setAttribute('role','dialog');d.append(el('h2','Delete transaction?'));const confirm=el('button','Delete');confirm.onclick=()=>{deletes++;d.hidden=true;root.hidden=true;};d.append(confirm);host.append(d);};root.append(review,save,trash);host.append(root);
 };
 if(creating){const add=el('button','Add transaction');add.onclick=()=>{const deposit=el('button','Add deposit');deposit.onclick=()=>{add.hidden=deposit.hidden=true;build();};host.append(deposit);};host.append(add);}else build();
 const context={document,location:{href:'https://next.waveapps.com/'+h.plan.business+'/transactions'+(creating?'':'/50')},getComputedStyle,wait:delayedSave?ms=>new Promise(r=>setTimeout(r,Math.min(ms,20))):async()=>{}};
 return {context,expected,state:()=>({saves,deletes,reviewClicks,category,amount:values.Amount?.value,account:values.Account?.value})};
}
document.getElementById('formChecks').onclick=async()=>{
 const rows=document.getElementById('formResults');rows.replaceChildren();let count=0,passed=0;
 const check=async(name,options,request,test)=>{const f=formFixture(options),r=await venmoRepairPage({business:h.plan.business,id:'50',expected:f.expected,...request},f.context),ok=test(r,f.state());count++;if(ok)passed++;rows.append(el('li',(ok?'PASS: ':'FAIL: ')+name+(r.problem?' · '+r.problem:'')));};
 await check('Opening amount changes without reviewed clicks',{}, {kind:'opening',targetCents:1000},(r,s)=>r.mutationAttempted&&!r.problem&&s.saves===1&&s.reviewClicks===0&&s.amount==='10.00');
 await check('Exact duplicate deletion confirms once',{}, {kind:'duplicate'},(r,s)=>r.mutationAttempted&&!r.problem&&s.deletes===1&&s.reviewClicks===0);
 await check('Icon-only delete control confirms once',{iconDelete:true},{kind:'duplicate'},(r,s)=>r.mutationAttempted&&!r.problem&&s.deletes===1);
 await check('Delayed Save closes before verification can navigate',{delayedSave:true},{kind:'opening',targetCents:1000},(r,s)=>r.formClosed&&!r.problem&&s.saves===1);
 await check('Existing notice is preserved while Save finishes',{delayedSave:true,existingNotice:true},{kind:'opening',targetCents:1000},(r,s)=>r.formClosed&&!r.problem&&s.saves===1);
 await check('Save validation failure remains locked without another click',{failedSave:true},{kind:'opening',targetCents:1000},(r,s)=>r.mutationAttempted&&/Amount could not be saved/.test(r.problem)&&s.saves===1);
 await check('Protected copy cannot be deleted',{protectedCopy:true},{kind:'duplicate'},(r,s)=>!r.mutationAttempted&&!!r.problem&&s.deletes===0);
 await check('Changed amount cannot be deleted',{changed:true},{kind:'fee'},(r,s)=>!r.mutationAttempted&&!!r.problem&&s.deletes===0);
 await check('Exact split fee allocations can be removed',{split:true},{kind:'fee',split:true,allocations:[['Fee A',2],['Fee B',3]]},(r,s)=>r.mutationAttempted&&!r.problem&&s.deletes===1);
 await check('Changed split allocation blocks removal',{split:true},{kind:'fee',split:true,allocations:[['Fee A',1],['Fee B',4]]},(r,s)=>!r.mutationAttempted&&!!r.problem&&s.deletes===0);
 await check('Missing receipt uses exact account and refund category',{creating:true},{kind:'receipt',target:{date:'2026-01-19',description:'Casey Rent',account:'(fictional) Venmo',type:'Deposit',amount:'5.00',category:'Rent'},categoryPath:['Refund for Expense']},(r,s)=>r.mutationAttempted&&!r.problem&&s.saves===1&&s.category==='Refund for Rent'&&s.account==='(fictional) Venmo'&&s.reviewClicks===0);
 document.getElementById('forms').replaceChildren();document.getElementById('formStatus').textContent=passed+' of '+count+' passed';
};
