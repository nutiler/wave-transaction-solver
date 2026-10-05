import { workingQueue } from './workflow.js';
import { sourceHash, validateRulePack, acceptProposals, ruleCoverage } from './rule-pack.js';
import { proposals } from './model.js';
const money = cents => '$'+(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function installProposalReview({ getState, categories, imported, accepted, rejected }) {
  const $=id=>document.getElementById(id);
  const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  if(![...$('proposalFilter').options].some(o=>o.value==='backlog')){const backlogOption=make('option','Backlog proposals');backlogOption.value='backlog';$('proposalFilter').append(backlogOption);}
  const existingOption=[...$('proposalFilter').options].find(o=>o.value==='existing_approved');if(existingOption)existingOption.textContent='Current approved patterns';
  const loadedFile=make('p');loadedFile.id='proposalLoadedFile';$('proposalFile').closest('label').after(loadedFile);
  let generation=0, renderedPack=null, selectionPack=null, selectionCsv=null, selectionBusiness=null, packValid=false, busy=false, hashText=null, hashPromise=null, coverageCache=null;
  const selected=new Set(), drafts=new Map();
  const toolbar=make('div');toolbar.className='bar proposal-selection';
  const selectVisible=make('button','Select visible proposals'),clear=make('button','Clear selection'),apply=make('button','Accept selected rules'),selectionCount=make('span');
  selectVisible.className=clear.className='secondary';selectionCount.setAttribute('aria-live','polite');
  toolbar.append(selectVisible,clear,apply,selectionCount);$('proposalRows').before(toolbar);
  const selectionNote=make('p','Selecting does not save. Accept selected rules approves all checked proposals, including those hidden by a filter. Open reasoning when you need the evidence.');toolbar.after(selectionNote);
  let visible=[];
  function updateSelection(){$('proposalFile').disabled=busy;selectionCount.textContent=selected.size+' selected';apply.disabled=busy || !packValid || !selected.size;clear.disabled=busy || !selected.size;selectVisible.disabled=busy || !visible.some(p=>p.tier!=='existing_approved' && getState().decisions?.[p.id]!=='rejected');for(const input of $('proposalRows').querySelectorAll('[data-select-proposal]')){input.checked=selected.has(input.dataset.selectProposal);input.disabled=busy;}for(const button of $('proposalRows').querySelectorAll('[data-accept-proposal]'))button.disabled=busy;}
  selectVisible.onclick=()=>{for(const p of visible)if(p.tier!=='existing_approved' && getState().decisions?.[p.id]!=='rejected')selected.add(p.id);updateSelection();};
  clear.onclick=()=>{selected.clear();updateSelection();};
  apply.onclick=()=>void accept([...selected]);
  async function accept(ids, nextId=null){
    if(busy || !ids.length)return;
    nextId ||= visible.find(p=>!ids.includes(p.id) && p.tier!=='existing_approved' && getState().decisions?.[p.id]!=='rejected')?.id;
    const initial=getState(),pack=initial.pack,position={left:window.scrollX,top:window.scrollY,behavior:'instant'},panelScroll=$('proposalRows').scrollTop;
    busy=true;updateSelection();status('Checking '+ids.length+' selected proposal(s)…');
    try{
      await check(pack);const live=getState();
      if(live.pack!==pack || live.csvText!==initial.csvText || live.business!==initial.business)throw Error('Session changed. Review the current pack before accepting.');
      const edits={};for(const id of ids){const p=pack.proposals.find(p=>p.id===id);if(!p || live.decisions?.[id]==='accepted')throw Error('A selected proposal is no longer pending.');const draft={...(drafts.get(id) || p.rule)};if(!categories().includes(draft.category))throw Error('Choose an exact existing category.');if(draft.category!==p.rule.category)draft.onlyCategories=[draft.category,...categories().filter(c=>/^(?:Uncategorized |Personal Uncategorized)/i.test(c))];edits[id]=draft;}
      const result=acceptProposals(pack,ids,live.rules,live.decisions,edits);
      await accepted(result);
      for(const id of ids){selected.delete(id);drafts.delete(id);}
      await render(nextId);
      requestAnimationFrame(()=>{const panel=$('proposalRows'),card=[...panel.querySelectorAll('.proposal-card')].find(c=>c.dataset.proposalId===nextId);if(card){panel.scrollTop+=card.getBoundingClientRect().top-panel.getBoundingClientRect().top;card.querySelector('summary').focus({preventScroll:true});}else panel.scrollTop=panelScroll;window.scrollTo(position);});
    }catch(e){status(e.message);}finally{busy=false;updateSelection();}
  }
  const status=message=>$('proposalStatus').textContent=message;
  async function check(pack) {
    const s=getState();
    if(!s.dataset || !s.business || s.sample)throw Error('Import a real accounting CSV and select its Wave business first.');
    if(hashText!==s.csvText){hashText=s.csvText;hashPromise=sourceHash(s.csvText);}
    const hash=await hashPromise;
    const current=getState();
    if(s.csvText!==current.csvText || s.business!==current.business)throw Error('Session changed while checking the proposal pack.');
    return validateRulePack(pack,{business:s.business,hash,categories:categories()});
  }
  async function render(openId = null) {
    const current=++generation,s=getState(),pack=s.pack;
    if(selectionPack!==pack || selectionCsv!==s.csvText || selectionBusiness!==s.business){selected.clear();drafts.clear();selectionPack=pack;selectionCsv=s.csvText;selectionBusiness=s.business;}
    visible=[];packValid=false;updateSelection();
    const opened=renderedPack===pack ? new Set([...$("proposalRows").querySelectorAll(".proposal-card[open]")].map(card=>card.dataset.proposalId)) : new Set();
    loadedFile.textContent=pack ? 'Loaded rule pack: '+(s.packFileName || 'proposed-rule-pack.local.json')+' — saved locally; no need to choose it again.' : 'No rule pack loaded.';
    if(!pack){$('proposalRows').replaceChildren();status('Choose a local proposed-rule-pack.local.json. Import previews proposals; it does not enable them.');$('proposalCoverage').textContent='';return;}
    try { await check(pack); } catch(e){if(generation===current){$('proposalRows').replaceChildren();status(e.message);$('proposalCoverage').textContent='Pack retained for reference; acceptance is disabled until its exact business and CSV are restored.';}return;}
    if(generation!==current)return;
    $('proposalRows').replaceChildren();renderedPack=pack;
    const decisions=s.decisions || {},filter=$('proposalFilter').value,search=$('proposalSearch').value.toLowerCase();
    const strong=pack.proposals.filter(p=>p.tier==='strong_proposal');
    const list=pack.proposals.filter(p=>decisions[p.id]!=='accepted' && (!filter || (filter==='backlog'?p.evidence.backlog>0 && p.tier!=='existing_approved':p.tier===filter)) && (p.rule.name+' '+p.rule.category+' '+p.reason).toLowerCase().includes(search)).sort((a,b)=>(b.evidence.backlog || 0)-(a.evidence.backlog || 0)||(b.evidence.eligibleChange || 0)-(a.evidence.eligibleChange || 0)||(b.evidence.eligible || 0)-(a.evidence.eligible || 0));
    status(pack.proposals.length+' proposals loaded. '+strong.length+' strong; '+pack.proposals.filter(p=>p.tier==='needs_judgment').length+' need judgment; '+pack.proposals.filter(p=>p.tier==='existing_approved').length+' already-approved patterns. '+Object.values(decisions).filter(x=>x==='accepted').length+' accepted; '+Object.values(decisions).filter(x=>x==='rejected').length+' rejected. Accepted rules are saved under Merchant rules.');
    visible=list;packValid=true;updateSelection();
    const coverageKey=JSON.stringify([s.rules,s.business,s.workFrom]);
    if(!coverageCache || coverageCache.dataset!==s.dataset || coverageCache.key!==coverageKey){
    const activeQueue=s.queue ? workingQueue(s.queue,s.workFrom || '2025-01-01') : workingQueue(proposals(s.dataset.transactions,s.rules,5,s.business),s.workFrom || '2025-01-01');
    const blockers=new Set(activeQueue.filter(t=>['Transfer candidate','Ambiguous transfer','Possible refund','Existing multi-account','Manual review'].includes(t.kind)).map(t=>t.id));
    const actual=ruleCoverage(s.dataset.transactions.filter(t=>t.date>=(s.workFrom || '2025-01-01')),s.rules,s.business,blockers);
    coverageCache={dataset:s.dataset,key:coverageKey,actual};
    }
    const actual=coverageCache.actual;
    const potential=pack.coverage?.combined;
    $('proposalCoverage').textContent='Approved rules from '+(s.workFrom || '2025-01-01')+': '+actual.covered+' records / '+money(actual.coveredCents)+'. Conflicting matches withheld: '+actual.conflicts+'.'+(potential?' Full-history potential after the strong proposals are approved: '+potential.covered+' / '+money(potential.coveredCents)+'. '+potential.changes+' proposed category changes; '+potential.confirmations+' already match.':'')+' These counts are not an unreviewed backlog.';
    if(Object.values(decisions).includes('accepted') && $('fold-merchant')) {
      const currentRules=make('button','View current rules');currentRules.className='secondary';
      currentRules.onclick=()=>{const section=$('fold-merchant');section.open=true;section.scrollIntoView({block:'start'});};
      $('proposalRows').append(currentRules);
    }
    if(!list.length) $('proposalRows').append(make('p','No proposals remain in this view. Accepted rules are saved under Merchant rules.'));
    for(const p of list) {
      const detail=make('details');detail.className='proposal-card';detail.dataset.proposalId=p.id;detail.open=openId ? p.id===openId : opened.has(p.id);
      const summary=make('summary'),title=make('span');title.className='proposal-summary-text';title.append(make('span',p.rule.name),make('span','Category: '+(drafts.get(p.id)?.category || p.rule.category)),make('small',decisions[p.id] || p.tier.replaceAll('_',' ')));title.children[0].className='proposal-merchant';title.children[1].className='proposal-category';summary.append(title);detail.append(summary);
      if(p.tier!=='existing_approved'){
        const actions=make('span');actions.className='proposal-row-actions';
        const label=make('label'),checkbox=make('input');checkbox.type='checkbox';checkbox.dataset.selectProposal=p.id;checkbox.checked=selected.has(p.id);checkbox.setAttribute('aria-label','Select '+p.rule.name);label.append(checkbox,make('span','Select'));
        const yes=make('button','Accept rule');yes.dataset.acceptProposal=p.id;yes.setAttribute('aria-label','Accept rule: '+p.rule.name);
        actions.onclick=event=>event.stopPropagation();actions.onkeydown=event=>event.stopPropagation();
        checkbox.onchange=()=>{if(checkbox.checked)selected.add(p.id);else selected.delete(p.id);updateSelection();};
        yes.onclick=event=>{event.preventDefault();event.stopPropagation();const index=list.indexOf(p),pending=c=>c.tier!=='existing_approved' && decisions[c.id]!=='rejected' && !selected.has(c.id);const next=list.slice(index+1).find(pending) || list.slice(0,index).find(pending);void accept([p.id],next?.id);};
        actions.append(label,yes);summary.append(actions);
      }
      let built=false;
      const buildBody=()=>{if(built)return;built=true;
      detail.append(make('p',p.changeType || 'New merchant rule'));if(p.replacementNames?.length)detail.append(make('p','Updates these unchanged saved rules on acceptance: '+p.replacementNames.join('; ')+'. Modified rules are preserved.'));
      detail.append(make('p',p.reason),make('p','Purpose evidence: '+(p.purposeEvidence || 'Not supplied')));
      if(p.sources?.length){const sources=make('p','Provider sources: ');for(const url of p.sources){const a=make('a',new URL(url).hostname);a.href=url;a.target='_blank';a.rel='noopener noreferrer';sources.append(a,make('span',' '));}detail.append(sources);}
      if(p.scopeChanges?.length){const scopes=make('details');scopes.append(make('summary','Proposed matching-scope changes'));for(const c of p.scopeChanges)scopes.append(make('p',c.rule+' · '+c.field+': '+(c.before.join('; ')||'Unrestricted')+' → '+(c.after.join('; ')||'Unrestricted')));detail.append(scopes);}
      const e=p.evidence;
      if(e.history){const h=e.history;detail.append(make('p','2023–2024 evidence: '+h.recentCount+' categorized purchases. '+(h.recentCategories.map(c=>c.category+': '+c.count).join('; ')||'No categorized purchases in those years')+'. Weight 5×, versus 1× for 2022 and earlier and 2× for 2025 onward. Uncategorized records do not count as contradictions.'));const years=make('details');years.append(make('summary','Category history by year'));for(const y of h.byYear)years.append(make('p',y.year+': '+Object.entries(y.categories).map(([c,n])=>c+': '+n).join('; ')));detail.append(years);}
      if(e.backlog!==undefined){detail.append(make('p','Matches '+e.backlog+' eligible transactions in the supplied backlog ('+money(e.backlogCents || 0)+'). Live validation remains required.'));const backlog=make('details');backlog.append(make('summary','Affected backlog transactions'));for(const t of e.backlogTransactions || [])backlog.append(make('p',t.date+' · '+t.description+' · '+money(t.amountCents)+' · '+t.account+' · '+t.category+' · ID '+t.id));detail.append(backlog);}
      if(p.rule.storeAliases?.length)detail.append(make('p','Store-number variants: '+p.rule.storeAliases.join(', ')));
      detail.append(make('p',e.transactions+' records, '+money(e.outgoingCents || 0)+' gross outgoing, '+e.incoming+' incoming records. '+e.earliest+' through '+e.latest+'. '+e.uncategorized+' uncategorized. '+e.eligible+' eligible; '+e.eligibleChange+' category changes. Reviewed status unknown.'));
      detail.append(make('p','Aliases ('+(p.rule.matchMode || 'words')+'): '+p.rule.aliases.join(', ')));
      if(p.rule.accountIds?.length || p.rule.accountNames?.length) detail.append(make('p','Only accounts: '+(p.rule.accountNames || p.rule.accountIds).join(', ')));
      if(p.rule.excludedAccountNames?.length || p.rule.excludedAccountIds?.length)detail.append(make('p','Excluded accounts: '+(p.rule.excludedAccountNames || p.rule.excludedAccountIds).join(', ')));
      if(p.rule.onlyCategories?.length)detail.append(make('p','Only current categories: '+p.rule.onlyCategories.join('; ')));
      if(p.rule.excludeAliases?.length)detail.append(make('p','Excluded descriptors: '+p.rule.excludeAliases.join(', ')));
      if(p.rule.excludeCategories?.length)detail.append(make('p','Excluded categories: '+p.rule.excludeCategories.join('; ')));
      const ul=make('ul');for(const c of e.categories || [])ul.append(make('li',c.category+': '+c.count+' records ('+c.outgoing+' outgoing, '+c.incoming+' incoming).'));detail.append(ul);
      const accounts=make('p','History accounts: '+(e.accounts || []).map(a=>a.name+' ('+a.count+')').join('; '));detail.append(accounts);
      const variants=make('details');variants.append(make('summary','Descriptor variants and exclusions'));const dl=make('ul');for(const d of e.descriptions || [])dl.append(make('li',d.description+' ('+d.count+')'));for(const x of p.exclusions || [])dl.append(make('li','Excluded: '+x));variants.append(dl);detail.append(variants);
      const draft=drafts.get(p.id) || p.rule;
      const edit=make('details');edit.append(make('summary','Edit aliases or category before accepting'));const aliasLabel=make('label','Aliases, one per line'),aliasInput=make('textarea');aliasInput.value=draft.aliases.join('\n');aliasLabel.append(aliasInput);const catLabel=make('label','Exact category'),categoryInput=make('select');for(const name of categories()){const option=make('option',name);option.value=name;categoryInput.append(option);}categoryInput.value=draft.category;catLabel.append(categoryInput);const storeLabel=make('label','Store-number aliases, one per line'),storeInput=make('textarea');storeInput.value=(draft.storeAliases || []).join('\n');storeLabel.append(storeInput);edit.append(aliasLabel,catLabel,storeLabel,make('p','Edits take effect only when you accept. Existing account restrictions and exclusions remain. Changing the category limits matches to that category and uncategorized records.'));if(p.tier!=='existing_approved')detail.append(edit);
      const rememberDraft=()=>{drafts.set(p.id,{...p.rule,aliases:aliasInput.value.split(/\n/).map(a=>a.trim()).filter(Boolean),storeAliases:storeInput.value.split(/\n/).map(a=>a.trim()).filter(Boolean),category:categoryInput.value});title.children[1].textContent='Category: '+categoryInput.value;};aliasInput.oninput=storeInput.oninput=categoryInput.onchange=rememberDraft;
      const bar=make('div');bar.className='bar';
      if(p.tier==='existing_approved')bar.append(make('p','Existing user policy. Import keeps your saved rules; it does not replace them.'));
      else {
        const no=make('button','Reject proposal');no.className='secondary';
        if(p.tier==='needs_judgment')bar.append(make('p','Needs your judgment: Accept rule approves this category for the displayed scope.'));
        no.disabled=decisions[p.id]==='rejected' || decisions[p.id]==='accepted';
        no.onclick=async()=>{if(busy)return;try{await check(pack);if(getState().pack!==pack)throw Error('Proposal pack changed.');await rejected({...getState().decisions,[p.id]:'rejected'});selected.delete(p.id);await render();}catch(e){status(e.message);}};
        bar.append(no);
        if(decisions[p.id]==='accepted')bar.append(make('p','Approved locally. Remove this rule in Merchant rules to disable it.'));
      }
      detail.append(bar);
      };
      detail.addEventListener('toggle',()=>{if(detail.open)buildBody();});
      if(detail.open)buildBody();$('proposalRows').append(detail);
    }
    updateSelection();
  }
  $('proposalFile').onchange=async()=>{try{const file=$('proposalFile').files[0];if(!file)return;if(file.size>12*1024*1024)throw Error('Choose a proposal JSON under 12 MB.');const pack=JSON.parse(await file.text());await check(pack);await imported(pack,file.name);await render();}catch(e){status(e.message);}};
  $('proposalSearch').oninput=()=>void render();$('proposalFilter').onchange=()=>void render();
  return {render};
}
