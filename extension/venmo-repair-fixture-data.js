// Fictional records only; shared by unit tests and the isolated browser fixture.
import {fundingSnapshot} from './venmo-funding.js';
import {repairFormat,repairKey} from './venmo-reconciliation.js';
export const fixtureBusiness='11111111-1111-1111-1111-111111111111';
export function fictionalTransaction(id,date,account,amount,description,category='Tools'){
 const primary={id,date,account,accountId:account,type:'Cash and Bank',group:'Asset',description,debit:amount>0?amount:0,credit:amount<0?-amount:0};
 return {id,date,description,primary,postings:[primary,{id,date,account:category,type:'Expense',group:'Expense',description,debit:primary.credit,credit:primary.debit}],categories:[category],direction:amount>=0?'in':'out',amount:Math.abs(amount),existingTransfer:false};
}
export function fictionalRepairPlan(){
 const business=fixtureBusiness,profile='@fictional',wallet={account:'(fictional) Venmo',accountId:'fictional',type:'Cash and Bank',balanceCents:3095,earliest:'2026-01-01',latest:'2026-01-20'};
 const opening=fictionalTransaction('10','2026-01-01',wallet.account,4000,'Starting balance','Owner Equity'),purchase=fictionalTransaction('20','2026-01-10',wallet.account,-200,'Alex Camera'),bank=fictionalTransaction('30','2026-01-11','(1111) Fictional Bank',-200,'Venmo'),drop=fictionalTransaction('40','2026-01-12',wallet.account,-300,'Blair "Lunch"'),keep=fictionalTransaction('41','2026-01-13',wallet.account,-300,'Blair "Lunch"'),fee=fictionalTransaction('50','2026-01-15',wallet.account,-5,'Standalone fee'),cash=fictionalTransaction('60','2026-01-20',bank.primary.account,500,'Venmo','Rent'),personal=fictionalTransaction('70','2026-01-18',wallet.account,-100,'Morgan Gift');
 const source=(id,date,amount,values)=>({key:'venmo:'+profile+':'+id,provider:'venmo',profileIdentity:profile,profile:'personal',sourceId:id,date,currency:'USD',signedCents:amount,amountCents:Math.abs(amount),feeCents:0,status:'Complete',kind:amount<0?'Purchase':'Incoming payment',type:'Payment',funding:amount<0?'Venmo balance':'',destination:amount>0?'Venmo balance':'',merchant:'Example',note:'',issues:[],items:[],sources:[{file:'venmo/personal/2026/venmo-personal-2026-01.csv',row:5}],...values});
 const pay=source('PAY','2026-01-10',-200,{funding:'Fictional Bank Personal Checking *1111',accountEnding:'1111',merchant:'Alex',note:'Camera',bankExpected:true}),meal=source('MEAL','2026-01-12',-300,{merchant:'Blair',note:'Lunch'}),receipt=source('RENT','2026-01-19',500,{merchant:'Casey',note:'Rent'}),out=source('CASH','2026-01-20',-500,{kind:'Transfer',type:'Standard Transfer',status:'Issued',funding:'',destination:'Fictional Bank *1111',accountEnding:'1111'}),external=source('PERSONAL','2026-01-18',-100,{merchant:'Morgan',note:'Gift',funding:'Fictional Bank Personal Checking *7969',accountEnding:'7969'});
 const transfer=(b,p,r,kind,delta)=>({version:1,business,kind,bank:fundingSnapshot(b),purchase:p?fundingSnapshot(p):null,walletAccount:wallet,source:r,sourceKey:r.key,sourceId:r.sourceId,profile,sourceDate:r.date,merchant:r.merchant,note:r.note,deltaCents:delta,reason:'Fictional exact funding/cash-out proof'});
 const actions=[
  {business,profile,walletAccount:wallet,kind:'duplicate',record:fundingSnapshot(drop),keep:fundingSnapshot(keep),group:{waveIds:['40','41'],sourceKeys:[meal.key]},deltaCents:300},
  {business,profile,walletAccount:wallet,kind:'fee',record:fundingSnapshot(fee),deltaCents:5},
  {business,profile,walletAccount:wallet,kind:'opening',record:fundingSnapshot(opening),targetCents:1000,deltaCents:-3000},
  {business,profile,walletAccount:wallet,kind:'transfer',transfer:transfer(bank,purchase,pay,'funding',200),deltaCents:200},
  {business,profile,walletAccount:wallet,kind:'transfer',transfer:transfer(cash,null,out,'cashout',-500),deltaCents:-500},
  {business,profile,walletAccount:wallet,kind:'receipt',source:receipt,date:receipt.date,description:'Casey "Rent"',category:'Rent',categoryPath:['Refund for Expense'],deltaCents:500},
  {business,profile,walletAccount:wallet,kind:'external-funding',source:external,date:external.date,description:'Venmo funding from personal checking *7969',category:'Owner Investment & Drawings',categoryPath:['Deposit from Personal'],deltaCents:100}
 ];
 return {format:repairFormat,version:1,business,profile,waveSource:'wave/accounting.csv',balanceCents:3095,projectedCents:700,baseline:[opening,purchase,bank,drop,keep,fee,cash,personal],sources:[pay,meal,receipt,out,external],statements:[{profileIdentity:profile,period:'2026-01',beginningCents:1000,endingCents:700,walletMovementCents:-300,reconciles:true,source:'venmo/personal/2026/venmo-personal-2026-01.csv'}],actions};
}
export function fictionalRepairHarness(){
 const plan=fictionalRepairPlan(),business=plan.business,snapshots={},rows=[];
 const snap=t=>({identity:{business,transaction:t.id},currency:'USD',fields:{date:t.date,description:t.description,account:t.primary.account,type:t.direction==='in'?'Deposit':'Withdrawal',amount:(t.amount/100).toFixed(2),category:t.categories[0]},structure:{singleCategory:true,split:false},problems:[],reviewed:'Not reviewed'});
 for(const t of plan.baseline){snapshots[t.id]=snap(t);rows.push({id:t.id,date:t.date,account:t.primary.account,description:t.description,amountCents:t.amount});}
 let writes=0,collections=0,persisted={receipts:{},transferReceipts:{}},protectedCopy=false,failStorage=false,loseResponse=false,id=1000;
 const args={plan,business,approvedFingerprint:JSON.stringify(plan),isCurrent:()=>true,collect:async years=>{collections++;return {business,filter:'ALL',years,completeness:'count-confirmed',records:structuredClone(rows)};},read:async t=>{if(!snapshots[t.id])throw Error('Fictional record missing');return structuredClone(snapshots[t.id]);},inspect:async()=>({protected:protectedCopy,allocations:[]}),persist:async state=>{if(failStorage)throw Error('Fictional storage unavailable');persisted=structuredClone(state);},openMenu:async p=>({format:'wave-solver-transfer-menu',identity:{business,transaction:p.bank.id},matchingGroups:1,createGroups:1,matchingOptions:[],createOptions:[{text:p.walletAccount.account}],problems:[]}),edit:async(p)=>{writes++;snapshots[p.bank.id].fields.category='Transfer '+(p.bank.direction==='out'?'to ':'from ')+p.walletAccount.account;const t=fictionalTransaction(String(id++),p.bank.date,p.walletAccount.account,p.deltaCents,'Created Transfer','Transfer '+(p.bank.direction==='out'?'from ':'to ')+p.bank.primary.account);snapshots[t.id]=snap(t);rows.push({id:t.id,date:t.date,account:t.primary.account,description:t.description,amountCents:t.amount});return {saveAttempted:true};},mutate:async a=>{
  if(!persisted.receipts[repairKey(a)]?.saveAttempted)throw Error('Checkpoint must precede every mutation');writes++;
  if(['duplicate','fee'].includes(a.kind)){rows.splice(rows.findIndex(r=>r.id===a.record.id),1);delete snapshots[a.record.id];}
  else if(a.kind==='opening'){snapshots[a.record.id].fields.amount=(a.targetCents/100).toFixed(2);rows.find(r=>r.id===a.record.id).amountCents=a.targetCents;}
  else{const category=a.categoryPath[0]==='Refund for Expense'?'Refund for '+a.category:a.category;const t=fictionalTransaction(String(id++),a.date,a.walletAccount.account,a.deltaCents,a.description,category);snapshots[t.id]=snap(t);rows.push({id:t.id,date:t.date,account:t.primary.account,description:t.description,amountCents:t.amount});}
  if(loseResponse)throw Error('Fictional response lost');return {mutationAttempted:true};
 }};
 return {plan,args,snapshots,rows,get writes(){return writes;},get collections(){return collections;},get persisted(){return persisted;},set protectedCopy(v){protectedCopy=v;},set failStorage(v){failStorage=v;},set loseResponse(v){loseResponse=v;}};
}
