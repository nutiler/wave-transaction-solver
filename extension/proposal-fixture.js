import { importAccounting } from './model.js';
import { analyzeHistory } from './analysis.js';
import { sourceHash,ruleFingerprint } from './rule-pack.js';
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
for(const [id,account,accountId,desc,direction,category] of [['1000000000000000007','Fictional Checking','fictional-bank','Card payment','out','Uncategorized Expense'],['1000000000000000008','Fictional Credit Card','fictional-card','Payment thank you','in','Uncategorized Income']]){rows.push([id,'2026-10-01',account,desc,direction==='in'?'99.00':'',direction==='out'?'99.00':'',direction==='in'?'Liability':'Asset',direction==='in'?'Credit Card':'Cash and Bank',accountId]);rows.push([id,'2026-10-01',category,desc,direction==='out'?'99.00':'',direction==='in'?'99.00':'',direction==='out'?'Expense':'Income',direction==='out'?'Expense':'Income','fixture-category']);}
const csvText=[headers,...rows].map(row=>row.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\n');
const dataset=importAccounting(csvText),hash=await sourceHash(csvText);
const pack=analyzeHistory(dataset,{business,backlog:{records:[{id:'1000000000000000004'}]},groups:[{name:'Example Cloud',aliases:['Example Cloud'],category:'Software',narrow:true,purpose:'Synthetic cloud software'},{name:'Example Storage',aliases:['Example Storage'],category:'Storage',purpose:'Synthetic storage needs purpose decision'}]},{sha256:hash,name:'Fictional test.csv',createdAt:'2026-10-04',transactions:8,ledgerRows:16}).pack;
let state={dataset,business,csvText,sample:false,rules:[{name:'Existing fixture rule',aliases:['Legacy'],category:'Software'}],pack,decisions:{},packFileName:'synthetic-proposals.json'};
let approvalSaves=0;
const output=document.getElementById('fixtureStatus');
const save=async()=>saveSession({version:1,business,csvText,sourceName:'Fictional integration test.csv',sample:false,shortlist:['1000000000000000005'],proposalPack:state.pack,proposalDecisions:state.decisions,proposalFileName:state.packFileName});
const view=installProposalReview({
 getState:()=>state,categories:()=>dataset.categories,
 imported:async (p,fileName)=>{state.pack=p;state.packFileName=fileName;state.decisions={};await save();},
 accepted:async result=>{approvalSaves++;state.rules=result.rules;state.decisions=result.decisions;await save();output.textContent='Accepted locally. Existing rule preserved: '+state.rules.some(r=>r.name==='Existing fixture rule')+'. Approved aliases: '+state.rules.at(-1).aliases.join(', ')+'. Previous versions: '+(state.rules.at(-1).previousVersions?.length || 0)+'. Approval saves: '+approvalSaves+'. Accepted proposals: '+Object.values(state.decisions).filter(d=>d==='accepted').length;},
 rejected:async decisions=>{state.decisions=decisions;await save();output.textContent='Rejected locally; existing rule count '+state.rules.length;}
});
await view.render();
document.getElementById('seedIntegration').onclick=async()=>{state.decisions={};await save();const loaded=await loadSession();output.textContent='Session round trip: '+(loaded.csvText===csvText && loaded.shortlist[0]==='1000000000000000005' && loaded.proposalPack.source.sha256===hash ? 'PASS':'FAIL')+'. Fictional integration preview ready.';};
document.getElementById('stalePack').onclick=async()=>{state.csvText+='\n';await view.render();};
document.getElementById('restorePack').onclick=async()=>{state.csvText=csvText;await view.render();};
document.getElementById('seedFile').onclick=async()=>{const file=new File([JSON.stringify(pack)],'synthetic-proposals.json',{type:'application/json'}),transfer=new DataTransfer();transfer.items.add(file);const input=document.getElementById('proposalFile');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));};

const seedBatch=document.createElement('button');seedBatch.textContent='Seed two fictional transfer pairs';seedBatch.onclick=async()=>{
 const extra=[];
 for(const [id,account,accountId,desc,direction,category] of [['1000000000000000009','Fictional Checking','fictional-bank','Card payment','out','Uncategorized Expense'],['1000000000000000010','Fictional Credit Card','fictional-card','Payment thank you','in','Uncategorized Income']]){
 extra.push([id,'2026-10-01',account,desc,direction==='in'?'87.00':'',direction==='out'?'87.00':'',direction==='in'?'Liability':'Asset',direction==='in'?'Credit Card':'Cash and Bank',accountId]);extra.push([id,'2026-10-01',category,desc,direction==='out'?'87.00':'',direction==='in'?'87.00':'',direction==='out'?'Expense':'Income',direction==='out'?'Expense':'Income','fixture-category']);
 }
 await saveSession({version:1,business,csvText:csvText+'\n'+extra.map(row=>row.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\n'),sourceName:'Fictional batch test.csv',sample:false,shortlist:[]});output.textContent='Two fictional pairs saved. Open the integration preview.';
};document.querySelector('main').append(seedBatch);

const upgrade=document.createElement('button');upgrade.textContent='Seed merchant upgrade test';upgrade.onclick=async()=>{const old={name:'Example Cloud',aliases:['EXAMPLE CLOUD'],category:'Software'};state.rules=[{name:'Existing fixture rule',aliases:['Legacy'],category:'Software'},old];state.decisions={};state.pack=structuredClone(pack);const p=state.pack.proposals.find(p=>p.rule.name==='Example Cloud');p.replaces=[ruleFingerprint(old)];p.replacementNames=['Example Cloud'];p.changeType='Improve existing rule';p.rule.aliases=['EXAMPLE CLOUD','EXAMPLECLOUD'];p.rule.storeAliases=['EXAMPLECLOUD'];await view.render();output.textContent='Upgrade pending. Existing Example Cloud aliases: '+old.aliases.join(', ');};document.querySelector('main').append(upgrade);

const stress=document.createElement('button');stress.textContent='Seed 200 fictional proposals';stress.onclick=async()=>{state.decisions={};state.rules=[{name:'Existing fixture rule',aliases:['Legacy'],category:'Software'}];state.pack=structuredClone(pack);const p=state.pack.proposals[0];state.pack.proposals=Array.from({length:200},(_,i)=>({...structuredClone(p),id:'stress-'+i,rule:{...structuredClone(p.rule),name:'Fictional Merchant '+i,aliases:['FICTIONAL MERCHANT '+i]},reason:'Synthetic purpose evidence. '.repeat(80)}));const start=performance.now();await view.render();output.textContent='200 fictional proposal headers rendered in '+Math.round(performance.now()-start)+' ms. Reasoning remains closed.';};document.querySelector('main').append(stress);
