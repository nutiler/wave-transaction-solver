import {installFinanceHome} from './finance-home.js';
import {installDataWorkspace} from './data-workspace.js';
import {installSubscriptionView} from './subscription-view.js';

let controller=null;
const make=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
function debugRoot(){let root=document.getElementById('debugWorkspace');if(!root){root=make('div');root.id='debugWorkspace';root.hidden=true;root.setAttribute('role','tabpanel');root.setAttribute('aria-label','Advanced tools');root.append(make('h2','Advanced tools'),make('p','Historical analysis, manual runners and diagnostics. Your daily work is in Update finances.'));document.querySelector('main footer').before(root);}return root;}
export function debugSlot(id,title){let body=document.getElementById(id);if(!body){const card=make('details');card.className='debug-card';body=make('div');body.id=id;body.className='debug-body';card.append(make('summary',title),body);debugRoot().append(card);}return body;}
export function showWorkspace(name='usage'){controller?.open(name==='debug'?'debug':'transactions');}
export function showDebug(id){controller?.open('debug');const slot=document.getElementById(id);if(slot){slot.parentElement.open=true;slot.parentElement.scrollIntoView({block:'start'});slot.parentElement.querySelector('summary').focus({preventScroll:true});}}
export function debugLink(id,label='View diagnostics'){const b=make('button',label);b.type='button';b.className='secondary';b.onclick=()=>showDebug(id);return b;}
export function showUsageSection(id){const target=document.getElementById(id);if(!target)return;if(target.closest('#debugWorkspace'))showDebug(target.closest('.debug-body')?.id);else controller?.open(target.closest('[data-stage]')?.dataset.stage||'transactions');if(target.tagName==='DETAILS')target.open=true;}

export function installWorkspace({getState=()=>({}),getSubscriptionState=()=>({}),onStageChange=()=>{},command=()=>null}={}){
 const main=document.querySelector('main');document.body.classList.add('finance-app');
 const heading=main.querySelector(':scope>h1'),intro=heading.nextElementSibling;
 heading.textContent='Update my finances';intro.textContent='A clear path from new transactions to verified bookkeeping.';
 main.querySelector(':scope>.notice')?.remove();
 const header=main.querySelector('header'),loadedVersion=globalThis.chrome?.runtime?.getManifest?.().version||'0.99.8';header.querySelector('strong').textContent='∿  Wave Solver';header.querySelector('.badge').textContent='1.0 PREVIEW · v'+loadedVersion+' · LOCAL & PRIVATE';
 const usage=make('div');usage.id='usageWorkspace';main.querySelector('footer').before(usage);
 const nav=make('nav');nav.className='workspace-nav finance-nav';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Wave Solver');
 const groups=new Map(),buttons=new Map();
 for(const [id,label] of [['transactions','Update finances'],['subscriptions','Subscriptions'],['setup','Data & setup'],['rules','Rules'],['debug','Advanced']]){
  const group=id==='debug'?debugRoot():make('div');if(id!=='debug'){group.id='usage-'+id;group.className='workflow-group';group.dataset.stage=id;group.setAttribute('role','tabpanel');usage.append(group);}group.setAttribute('aria-labelledby','workspace-'+id);groups.set(id,group);
  const b=make('button',label);b.type='button';b.id='workspace-'+id;b.dataset.stage=id;b.setAttribute('role','tab');b.setAttribute('aria-controls',group.id);b.onclick=()=>controller.open(id);buttons.set(id,b);nav.append(b);
 }
 header.after(nav);const section=id=>document.getElementById(id)?.closest('section');
 const daily=groups.get('transactions'),data=groups.get('setup'),rules=groups.get('rules');
 const home=installFinanceHome({parent:daily,getState,command,openData:()=>controller.open('setup')});
 const subscriptions=installSubscriptionView({parent:groups.get('subscriptions'),getState:getSubscriptionState,openHistory:()=>showUsageSection('allCollection'),openData:()=>controller.open('setup')});
 if(section('commandCenter'))daily.append(section('commandCenter'));
 data.append(make('h2','Your data & connections'),make('p','Connect once. Scan Wave for daily work; refresh files when you need history or purchase details.'));
 installDataWorkspace({parent:data,getState,command});
 for(const id of ['fold-setup','fold-chart'])if(section(id))data.append(section(id));
 if(section('fold-import'))debugSlot('manual-history','Manual Wave accounting import').append(section('fold-import'));
 const ruleScope=make('p');rules.append(make('h2','Your approved rules'),ruleScope,make('p','New custom rules apply to the entered aliases across this business’s accounts. Existing account and category limits are retained while editing. Confirming a transaction never creates a reusable merchant rule.'));
 for(const id of ['fold-merchant','fold-proposals'])if(section(id))rules.append(section(id));
 for(const [id,label] of [['liveList','Manual live-list collection'],['knownWork','Legacy recognized-work executor'],['fold-queue','Historical transaction review'],['sourceSolvers','Source evidence, accounts & purchase approvals'],['allCollection','Full-history collection'],['bulkInspector','Bulk inspection'],['fold-history','Historical rule analysis'],['amazonReview','Amazon purchase detail review'],['fold-transfers','Manual transfer runner'],['waveSuggestions','Wave suggestion diagnostics'],['expenseBatch','Manual expense runner'],['fold-live','Individual transaction editor'],['fold-plan','Draft shortlist & export']])if(section(id))debugSlot('advanced-'+id,label).append(section(id));
 for(const s of [...main.children].filter(n=>n.tagName==='SECTION'))debugSlot('retainedTools','Additional diagnostics').append(s);
 debugSlot('chartTools','Chart of Accounts diagnostics').append(document.getElementById('chartDebug'));
 debugSlot('liveTools','Live transaction diagnostics').append(document.getElementById('diagnosticToggle').closest('.bar'),document.getElementById('diagnostics'));
 document.getElementById('readChart').parentElement.append(debugLink('chartTools'));document.getElementById('read').parentElement.append(debugLink('liveTools'));
 const custom=make('details');custom.className='custom-rule';custom.id='customRule';custom.append(make('summary','Add or edit a scoped rule'),document.getElementById('ruleForm'));document.getElementById('categories').before(custom);
 const options=make('details');options.className='setup-options';options.append(make('summary','Working period & session options'),document.getElementById('workFrom')?.closest('label'),document.getElementById('clear'));data.append(options);
 debugSlot('sampleTools','Fictional sample').append(document.getElementById('sample'));
 for(const title of document.querySelectorAll('.step-title'))title.textContent=title.textContent.replace(/^\d+\.\s*/,'');
 main.querySelector('footer').textContent='Your files and decisions stay on this computer. Wave changes require your approved queue.';
 let active='transactions',seen=null;
 function refresh(){home.refresh();if(active==='subscriptions')subscriptions.refresh();ruleScope.textContent=getState().business?'Business scope: '+getState().business:'Choose a Wave business before adding rules.';if(seen!==getState().business){seen=getState().business;void home.restore();}buttons.get('setup').classList.toggle('needs-setup',!getState().business);}
 function open(id,{save=true,focus=false}={}){
  if(['collection','planning','usage'].includes(id))id='transactions';if(!groups.has(id))id='transactions';active=id;
  for(const [key,g] of groups)g.hidden=key!==id;
  usage.hidden=id==='debug';
  for(const [key,b] of buttons){b.setAttribute('aria-selected',String(key===id));b.tabIndex=key===id?0:-1;}
  heading.textContent=id==='subscriptions'?'Subscriptions':'Update my finances';intro.textContent=id==='subscriptions'?'Your recurring charges, costs, and expected billing dates.':'A clear path from new transactions to verified bookkeeping.';
  document.getElementById('commandCenter').open=true;
  if(focus)buttons.get(id).focus();refresh();document.dispatchEvent(new CustomEvent('finance-workspace',{detail:id}));if(save)onStageChange(id);
 }
 nav.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const ids=[...buttons.keys()],index=ids.indexOf(active);e.preventDefault();open(e.key==='Home'?ids[0]:e.key==='End'?ids.at(-1):ids[(index+(e.key==='ArrowRight'?1:-1)+ids.length)%ids.length],{focus:true});};
 controller={open,refresh,current:()=>active,restore:()=>open('transactions',{save:false})};
 document.addEventListener('finance-state',refresh);open('transactions',{save:false});return controller;
}
