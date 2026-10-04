import { importAccounting } from './model.js';
import { analyzeHistory } from './analysis.js';
import { sourceHash } from './rule-pack.js';
import { loadSession, saveSession } from './session.js';
import { installProposalReview } from './proposal-view.js';
const business='11111111-1111-1111-1111-111111111111';
const headers=['Transaction ID','Transaction Date','Account Name','Transaction Description','Debit Amount (Two Column Approach)','Credit Amount (Two Column Approach)','Account Group','Account Type','Account ID'];
const rows=[];
for(let n=1;n<=6;n++){
 const id='100000000000000000'+n,desc=n<=4?'Example Cloud':n===5?'Chevron #123':'Example Storage',category=n<=3?'Software':n===5?'Equipment Fuel — Diesel, Gas, Machinery Fuel':n===6?'Storage':'Uncategorized Expense';
 rows.push([id,'2026-10-01','Fictional Checking',desc,'','10.00','Asset','Cash and Bank','fictional-bank']);
 rows.push([id,'2026-10-01',category,desc,'10.00','','Expense','Expense','fictional-category']);
}
const csvText=[headers,...rows].map(row=>row.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\n');
const dataset=importAccounting(csvText),hash=await sourceHash(csvText);
const pack=analyzeHistory(dataset,{business,groups:[{name:'Example Cloud',aliases:['Example Cloud'],category:'Software',narrow:true,purpose:'Synthetic cloud software'},{name:'Example Storage',aliases:['Example Storage'],category:'Storage',purpose:'Synthetic storage needs purpose decision'}]},{sha256:hash,name:'Fictional test.csv',createdAt:'2026-10-04',transactions:6,ledgerRows:12}).pack;
let state={dataset,business,csvText,sample:false,rules:[{name:'Existing fixture rule',aliases:['Legacy'],category:'Software'}],pack,decisions:{}};
const output=document.getElementById('fixtureStatus');
const save=async()=>saveSession({version:1,business,csvText,sourceName:'Fictional integration test.csv',sample:false,shortlist:['1000000000000000005'],proposalPack:state.pack,proposalDecisions:state.decisions});
const view=installProposalReview({
 getState:()=>state,categories:()=>dataset.categories,
 imported:async p=>{state.pack=p;state.decisions={};await save();},
 accepted:async result=>{state.rules=result.rules;state.decisions=result.decisions;await save();output.textContent='Accepted locally. Existing rule preserved: '+state.rules.some(r=>r.name==='Existing fixture rule');},
 rejected:async decisions=>{state.decisions=decisions;await save();output.textContent='Rejected locally; existing rule count '+state.rules.length;}
});
await view.render();
document.getElementById('seedIntegration').onclick=async()=>{state.decisions={};await save();const loaded=await loadSession();output.textContent='Session round trip: '+(loaded.csvText===csvText && loaded.shortlist[0]==='1000000000000000005' && loaded.proposalPack.source.sha256===hash ? 'PASS':'FAIL')+'. Fictional integration preview ready.';};
document.getElementById('stalePack').onclick=async()=>{state.csvText+='\n';await view.render();};
document.getElementById('restorePack').onclick=async()=>{state.csvText=csvText;await view.render();};
document.getElementById('seedFile').onclick=async()=>{const file=new File([JSON.stringify(pack)],'synthetic-proposals.json',{type:'application/json'}),transfer=new DataTransfer();transfer.items.add(file);const input=document.getElementById('proposalFile');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));};
