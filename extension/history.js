import { normalize, merchantText, matchesDescription, matchingRules, ruleFor, nonPurchaseReason, validateRule } from './rules.js';
import { proposals } from './model.js';
const unresolved = c => /^(?:Uncategorized |Personal Uncategorized)/i.test(c);
// Clean only documented bank wrappers. Preserve store numbers, processor names,
// and quoted payment memos: these can distinguish otherwise unrelated purchases.
export function historyDescriptor(description) {
  const text=String(description);
  return text.includes('"') || text.includes('“') ? text.trim() : merchantText(text);
}
export function historySuggestions(transactions, rules, minimum=3, business=null, options={}) {
  const blocked=options.blockedIds || new Set(proposals(transactions,[],5,business).filter(t=>['Transfer candidate','Ambiguous transfer','Possible refund','Existing multi-account','Manual review'].includes(t.kind)).map(t=>t.id));
  const definitions=(options.families || []).filter(r=>!r.business || r.business===business);
  const keys=new Map();
  const keyFor=t=>{
    if(keys.has(t.id))return keys.get(t.id);
    const matched=definitions.filter(r=>matchesDescription(t.description,r));
    const names=[...new Set(matched.map(r=>r.name))];
    const key=names.length===1 ? {key:'family:'+normalize(names[0]),name:names[0]} : {key:'exact:'+normalize(historyDescriptor(t.description)),name:historyDescriptor(t.description)};
    keys.set(t.id,key);return key;
  };
  const groups=new Map(), backlog=new Set(options.backlogIds || []), from=options.from || '2025-01-01';
  for(const t of transactions) {
    if(nonPurchaseReason(t) || blocked.has(t.id) || /["“]/.test(t.description))continue;
    const {key,name}=keyFor(t);if(!normalize(name) || /^\d+$/.test(normalize(name)))continue;
    if(!groups.has(key))groups.set(key,{id:key,merchant:name,rows:[],aliases:new Set(),accounts:new Set(),incoming:0,excluded:0});
    const g=groups.get(key);g.rows.push(t);g.aliases.add(historyDescriptor(t.description));g.accounts.add(t.primary.account);
  }
  for(const t of transactions){const g=groups.get(keyFor(t).key);if(g && !g.rows.includes(t)){if(t.direction==='in')g.incoming++;else g.excluded++;}}
  return [...groups.values()].filter(g=>!rules.some(r=>r.historyApproved && r.historyKey===g.id && (!r.business || r.business===business) && [...g.aliases].every(a=>r.aliases.some(b=>normalize(a)===normalize(b)))) && g.rows.length>=minimum && g.rows.some(t=>!ruleFor(t.description,rules,t,business))).map(g=>{
    const distribution=new Map(),recent=new Map(),years=new Map(),weighted=new Map();
    for(const t of g.rows){const c=t.categories[0];if(unresolved(c))continue;const y=t.date.slice(0,4),weight=y==='2023'||y==='2024'?5:y>='2025'?2:1;
      distribution.set(c,(distribution.get(c)||0)+1);weighted.set(c,(weighted.get(c)||0)+weight);
      if(y==='2023'||y==='2024')recent.set(c,(recent.get(c)||0)+1);
      if(!years.has(y))years.set(y,{});years.get(y)[c]=(years.get(y)[c]||0)+1;
    }
    const dist=[...distribution].map(([category,count])=>({category,count})).sort((a,b)=>b.count-a.count || a.category.localeCompare(b.category));
    const rec=[...recent].map(([category,count])=>({category,count})).sort((a,b)=>b.count-a.count || a.category.localeCompare(b.category));
    const scores=[...weighted].sort((a,b)=>b[1]-a[1]),known=dist.reduce((n,c)=>n+c.count,0);
    const category=dist.length===1 && known>=minimum?dist[0].category:'';
    const recommendedCategory=rec[0]?.count>=minimum && rec[0].count/rec.reduce((n,c)=>n+c.count,0)>=0.9?rec[0].category:category;
    const uncovered=g.rows.filter(t=>!ruleFor(t.description,rules,t,business)),working=uncovered.filter(t=>t.date>=from),pending=working.filter(t=>backlog.has(t.id));
    return {id:g.id,merchant:g.merchant,aliases:[...g.aliases].sort(),count:g.rows.length,distribution:dist,known,unresolved:g.rows.length-known,category,recommendedCategory,mixed:dist.length>1,
      earliest:g.rows.map(t=>t.date).sort()[0],latest:g.rows.map(t=>t.date).sort().at(-1),accounts:[...g.accounts].sort(),outgoingCents:g.rows.reduce((n,t)=>n+t.amount,0),incoming:g.incoming,excluded:g.excluded,
      recentDistribution:rec,byYear:[...years].sort().map(([year,categories])=>({year,categories})),weightedCategory:scores[0]?.[0] || '',weights:{'2023–2024':5,'2025 onward':2,'Earlier':1},
      uncovered:uncovered.length,working:working.length,backlog:pending.length,backlogCents:pending.reduce((n,t)=>n+t.amount,0),transactionIds:g.rows.map(t=>t.id),
      reason:dist.length>1?'Conflicting history: choose the purchase purpose. The 2023–2024 recommendation is evidence, not approval.':known<minimum?'Fewer than three categorized purchases: choose a category after reviewing the purpose.':'Consistent categorized purchases; uncategorized entries are gaps, not contradictions. Confirm purpose before accepting.'};
  }).sort((a,b)=>b.backlog-a.backlog || b.working-a.working || b.count-a.count || a.merchant.localeCompare(b.merchant));
}
// Pure, all-or-nothing preparation. The caller saves the returned rules once.
export function acceptHistoryRules(items, selections, rules, {business,categories,transactions}) {
  if(!business || !Array.isArray(selections) || !selections.length || new Set(selections.map(s=>s.id)).size!==selections.length)throw Error('Choose distinct history suggestions for a selected business.');
  const next=[...rules],added=[];
  for(const selection of selections){
    const item=items.find(i=>i.id===selection.id);
    if(!item || !categories.includes(selection.category) || unresolved(selection.category))throw Error('Choose an existing, resolved category for every selected merchant.');
    if(item.aliases.length>100)throw Error('This merchant has too many variants. Use the proposal pack or prepare a narrower rule.');
    const rule={name:item.merchant.slice(0,200),aliases:[...item.aliases],category:selection.category,business,direction:'out',matchMode:'exact',onlyCategories:[selection.category,...categories.filter(unresolved)],historyApproved:true,historyKey:item.id};
    validateRule(rule);
    const eligible=transactions.filter(t=>!nonPurchaseReason(t) && matchingRules(t.description,[rule],t,business).length);
    if(!eligible.length)throw Error('No eligible purchases remain for '+item.merchant+'.');
    if(eligible.some(t=>matchingRules(t.description,next,t,business).some(r=>r.category!==rule.category)))throw Error('A selected history rule conflicts with an approved or selected rule: '+item.merchant+'.');
    if(eligible.every(t=>matchingRules(t.description,next,t,business).some(r=>r.category===rule.category)))throw Error('This merchant is already covered: '+item.merchant+'.');
    next.push(rule);added.push(rule);
  }
  return {rules:next,added};
}
