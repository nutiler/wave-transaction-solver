import { workingQueue } from './workflow.js';
import { sourceHash, validateRulePack, acceptProposal, ruleCoverage } from './rule-pack.js';
import { proposals } from './model.js';
const money = cents => '$'+(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function installProposalReview({ getState, categories, imported, accepted, rejected }) {
  const $=id=>document.getElementById(id);
  const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  let generation=0;
  const status=message=>$('proposalStatus').textContent=message;
  async function check(pack) {
    const s=getState();
    if(!s.dataset || !s.business || s.sample)throw Error('Import a real accounting CSV and select its Wave business first.');
    const hash=await sourceHash(s.csvText);
    const current=getState();
    if(s.csvText!==current.csvText || s.business!==current.business)throw Error('Session changed while checking the proposal pack.');
    return validateRulePack(pack,{business:s.business,hash,categories:categories()});
  }
  async function render() {
    const current=++generation,s=getState(),pack=s.pack;
    $('proposalRows').replaceChildren();
    if(!pack){status('Choose a local proposed-rule-pack.local.json. Import previews proposals; it does not enable them.');$('proposalCoverage').textContent='';return;}
    try { await check(pack); } catch(e){if(generation===current){status(e.message);$('proposalCoverage').textContent='Pack retained for reference; acceptance is disabled until its exact business and CSV are restored.';}return;}
    if(generation!==current)return;
    const decisions=s.decisions || {},filter=$('proposalFilter').value,search=$('proposalSearch').value.toLowerCase();
    const strong=pack.proposals.filter(p=>p.tier==='strong_proposal');
    const list=pack.proposals.filter(p=>decisions[p.id]!=='accepted' && (!filter || p.tier===filter) && (p.rule.name+' '+p.rule.category+' '+p.reason).toLowerCase().includes(search)).sort((a,b)=>(b.evidence.eligibleChange || 0)-(a.evidence.eligibleChange || 0)||(b.evidence.eligible || 0)-(a.evidence.eligible || 0));
    status(pack.proposals.length+' proposals loaded. '+strong.length+' strong proposals. '+Object.values(decisions).filter(x=>x==='accepted').length+' accepted; '+Object.values(decisions).filter(x=>x==='rejected').length+' rejected. Accepted rules are saved under Merchant rules.');
    const activeQueue=workingQueue(proposals(s.dataset.transactions,s.rules,5,s.business),s.workFrom || '2025-01-01');
    const blockers=new Set(activeQueue.filter(t=>['Transfer candidate','Ambiguous transfer','Possible refund','Existing multi-account','Manual review'].includes(t.kind)).map(t=>t.id));
    const actual=ruleCoverage(s.dataset.transactions.filter(t=>t.date>=(s.workFrom || '2025-01-01')),s.rules,s.business,blockers);
    const potential=pack.coverage?.combined;
    $('proposalCoverage').textContent='Approved rules from '+(s.workFrom || '2025-01-01')+': '+actual.covered+' records / '+money(actual.coveredCents)+'. Conflicting matches withheld: '+actual.conflicts+'.'+(potential?' Full-history pack potential after approval: '+potential.covered+' / '+money(potential.coveredCents)+'. '+potential.changes+' proposed category changes; '+potential.confirmations+' already match.':'')+' These counts are not an unreviewed backlog.';
    if(Object.values(decisions).includes('accepted') && $('fold-merchant')) {
      const currentRules=make('button','View current rules');currentRules.className='secondary';
      currentRules.onclick=()=>{const section=$('fold-merchant');section.open=true;section.scrollIntoView({block:'start'});};
      $('proposalRows').append(currentRules);
    }
    if(!list.length) $('proposalRows').append(make('p','No proposals remain in this view. Accepted rules are saved under Merchant rules.'));
    for(const p of list) {
      const detail=make('details');detail.className='proposal-card';
      detail.append(make('summary',p.rule.name+' → '+p.rule.category+' · '+(decisions[p.id] || p.tier.replaceAll('_',' '))));
      detail.append(make('p',p.reason),make('p','Purpose evidence: '+(p.purposeEvidence || 'Not supplied')));
      if(p.sources?.length){const sources=make('p','Provider sources: ');for(const url of p.sources){const a=make('a',new URL(url).hostname);a.href=url;a.target='_blank';a.rel='noopener noreferrer';sources.append(a,make('span',' '));}detail.append(sources);}
      const e=p.evidence;
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
      const bar=make('div');bar.className='bar';
      if(p.tier==='existing_approved')bar.append(make('p','Existing user policy. Import keeps your saved rules; it does not replace them.'));
      else {
        const yes=make('button','Accept rule'),no=make('button','Reject proposal');no.className='secondary';
        yes.disabled=decisions[p.id]==='accepted';
        if(p.tier==='needs_judgment') {
          const label=make('label'),checkBox=make('input');checkBox.type='checkbox';label.className='proposal-confirm';
          label.append(checkBox,make('span','I have checked the purchase purpose and accept this scope.'));
          yes.disabled=true;checkBox.onchange=()=>{yes.disabled=!checkBox.checked || getState().decisions?.[p.id]==='accepted';};bar.append(label);
        }
        yes.onclick=async()=>{yes.disabled=true;try {await check(pack);const live=getState();if(live.pack!==pack)throw Error('Proposal pack changed. Review the current pack before accepting.');const result=acceptProposal(pack,p.id,live.rules,live.decisions);await accepted(result);await render();}catch(e){status(e.message);yes.disabled=false;}};
        no.disabled=decisions[p.id]==='rejected' || decisions[p.id]==='accepted';
        no.onclick=async()=>{try{await check(pack);if(getState().pack!==pack)throw Error('Proposal pack changed.');await rejected({...getState().decisions,[p.id]:'rejected'});await render();}catch(e){status(e.message);}};
        bar.append(yes,no);
        if(decisions[p.id]==='accepted')bar.append(make('p','Approved locally. Remove this rule in Merchant rules to disable it.'));
      }
      detail.append(bar);$('proposalRows').append(detail);
    }
  }
  $('proposalFile').onchange=async()=>{try{const file=$('proposalFile').files[0];if(!file)return;if(file.size>12*1024*1024)throw Error('Choose a proposal JSON under 12 MB.');const pack=JSON.parse(await file.text());await check(pack);await imported(pack);await render();}catch(e){status(e.message);}};
  $('proposalSearch').oninput=()=>void render();$('proposalFilter').onchange=()=>void render();
  return {render};
}
