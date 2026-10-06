import {compareLive,normalize} from './model.js';
export function compareCollectedRows(report,transactions=[],{business,from='2025-01-01'}={}){
 const byId=new Map(transactions.map(t=>[t.id,t])),counts=new Map();for(const r of report?.records || [])if(r.id)counts.set(r.id,(counts.get(r.id)||0)+1);
 return (report?.records || []).map(row=>{const t=byId.get(row.id);const base={id:row.id || null,date:row.date,description:row.description,account:row.account,reviewed:row.reviewed || 'Unknown',level:'list',checks:[]};
 if(business && report.business!==business)return {...base,state:'needs-details',reason:'Collection belongs to another business.'};
 if(row.date && row.date<from)return {...base,state:'before-period',reason:'Completed period; excluded from current work.'};
 if(!row.id || counts.get(row.id)!==1 || !['Wave transaction ID','Unique full-field export match'].includes(row.identity))return {...base,state:'needs-details',reason:'Transaction identity is unresolved or duplicated.'};
 if(!t)return {...base,state:'missing-export',reason:'Missing from accounting.csv. Import a fresh export.'};
 const check=(field,expected,live,equal)=>base.checks.push({field,exported:expected,live:live??'Not readable',state:live===null || live===undefined || live==='' || /(?:…|\.\.\.)/.test(String(live))?'Unknown':equal?'Match':'Different'});
 check('Date',t.date,row.date,t.date===row.date);check('Description',t.description,row.description,t.description.trim()===row.description?.trim());check('Account',t.primary?.account,row.account,!!t.primary && normalize(t.primary.account)===normalize(row.account));check('Amount',t.amount,row.amountCents,Number.isInteger(row.amountCents)&&row.amountCents===t.amount);check('Category',t.categories.join(' + '),row.category,t.categories.length===1 && normalize(t.categories[0])===normalize(row.category));
 const state=base.checks.some(c=>c.state==='Different')?'changed':base.checks.some(c=>c.state==='Unknown') || row.identity!=='Wave transaction ID'?'needs-details':'list-match';
 return {...base,state,reason:state==='list-match'?'Visible list fields match. Direction and dialog fields still require inspection.':state==='changed'?'Visible fields differ from the CSV. Inspect before editing.':'Some list fields or independent identity evidence are unavailable.'};
 });
}
export function compareInspectedRecord(t,snapshot,business){
 const result=compareLive(t,{...snapshot,fields:snapshot.fields || {}}),problems=[...(snapshot.problems || [])];if(snapshot.identity?.business!==business)problems.push('Different or unreadable business identity.');
 const state=problems.length?'needs-details':result.checks.some(c=>c.state==='Different')?'changed':result.checks.some(c=>c.state==='Unknown')?'needs-details':'inspected-match';
 return {id:t.id,date:t.date,description:t.description,account:t.primary?.account,level:'dialog',state,checks:result.checks,reviewed:result.reviewed,problems,reason:state==='inspected-match'?'All readable export fields match. Reviewed status: '+result.reviewed+'.':state==='changed'?'Dialog fields differ from the CSV. Review the differences.':'Inspection incomplete. '+problems.join(' ')};
}
export function remainingWork(queue,report,{business,from='2025-01-01',receipts={}}={}){
 if(!report || report.filter==='ALL' || report.business!==business)return [];
 const pending=new Set((report.records || []).filter(r=>r.id && r.reviewed!=='Reviewed' && r.date>=from).map(r=>r.id));
 const completed=new Set();for(const [key,r] of Object.entries(receipts)){if(!key.startsWith(business+':'))continue;if(r.reviewedVerified)completed.add(key.split(':').at(-1));if(r.verified && Array.isArray(r.ids))r.ids.forEach(id=>completed.add(id));}
 return queue.filter(t=>pending.has(t.id) && !completed.has(t.id));
}

export function liveRunQueue(queue,report,business,from='2025-01-01'){
 if(!report || report.filter==='ALL' || report.business!==business || report.running || report.completeness!=='count-confirmed')return [];
 const ids=new Set((report.records || []).filter(r=>typeof r.id==='string' && r.date>=from && r.reviewed!=='Reviewed' && ['Wave transaction ID','Unique full-field export match'].includes(r.identity)).map(r=>r.id));
 const partners=new Set(queue.filter(t=>ids.has(t.id) && t.kind==='Transfer candidate').map(t=>t.partner?.id));return queue.filter(t=>ids.has(t.id) || partners.has(t.id));
}
