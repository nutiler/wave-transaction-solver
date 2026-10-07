// Live records are observed transaction fields, not synthetic accounting postings.
const tidy=s=>String(s??'').replace(/\s+/g,' ').trim();
const money=s=>{const value=tidy(s).replace(/^USD\s*/i,'').replace(/[$,]/g,'');return /^\d+(?:\.\d{1,2})?$/.test(value)?Math.round(Number(value)*100):null;};
export function simpleRecord(t){
 if(t?.origin!=='wave-live')return !!t?.primary&&t.postings?.length===2&&t.categories?.length===1&&!t.existingTransfer&&!/loan/i.test(t.primary.type);
 const b=t.liveBaseline,f=b?.fields;
 return !!f&&b.currency==='USD'&&b.structure?.singleCategory===true&&b.structure?.split===false&&b.identity?.transaction===t.id&&b.identity?.business===t.liveBusiness&&['Cash and Bank','Credit Card'].includes(t.primary?.type)&&t.postings?.length===0&&t.categories?.length===1&&!t.existingTransfer&&f.date===t.date&&f.description===t.description&&f.account===t.primary.account&&f.category===t.categories[0]&&money(f.amount)===t.amount&&f.type===(t.direction==='out'?'Withdrawal':t.direction==='in'?'Deposit':null);
}
export function liveRecord(row,snapshot,{business,history=[],catalog}={}){
 if(row?.identity!=='Wave transaction ID'||typeof row.id!=='string'||!/^\d+$/.test(row.id)||snapshot?.identity?.business!==business||snapshot.identity.transaction!==row.id)throw Error('Cannot confirm the live transaction identity.');
 if(snapshot.currency!=='USD')throw Error('Currency must be explicitly USD in the live edit dialog.');
 const f=snapshot.fields;
 if(!f||snapshot.problems?.length)throw Error(snapshot?.problems?.join('; ')||'Live fields are unreadable.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(f.date)||!Number.isFinite(Date.parse(f.date))||new Date(f.date).toISOString().slice(0,10)!==f.date||['description','account','category'].some(k=>!tidy(f[k])||/[.…]{3}|…/.test(f[k])))throw Error('A live field is missing or truncated.');
 const amount=money(f.amount),direction=f.type==='Withdrawal'?'out':f.type==='Deposit'?'in':null;
 if(!Number.isSafeInteger(amount)||amount<=0||!direction)throw Error('Money direction or amount is not explicit.');
 if(row.date!==f.date||row.amountCents!==amount||['description','account','category'].some(k=>tidy(row[k])!==tidy(f[k])))throw Error('List and edit-dialog fields disagree. Scan Wave again.');
 if(snapshot.structure?.singleCategory!==true||snapshot.structure?.split!==false)throw Error('Split or unreadable transaction structure needs individual handling.');
 const known=history.filter(t=>t.primary?.account===f.account).map(t=>t.primary),types=[...new Set(known.map(p=>p.type))];
 const chart=(catalog?.groups||[]).flatMap(g=>g.accounts.map(a=>({...a,group:g.name}))).filter(a=>a.name===f.account);
 if(chart.length>1)throw Error('Account type cannot be confirmed: duplicate account names in Chart of Accounts.');
 const section=chart.length===1?chart[0].section:null;const type=section?(/^Cash and Bank$/i.test(section)?'Cash and Bank':/^Credit Cards?$/i.test(section)?'Credit Card':null):types.length===1?types[0]:null;
 if(types.length>1||section&&types.length===1&&types[0]!==type)throw Error('Account type conflicts with saved history. Refresh Chart of Accounts in Connections.');
 if(!['Cash and Bank','Credit Card'].includes(type))throw Error('Account type is unknown or involves a loan. Refresh Chart of Accounts in Connections.');
 // Display names and chart numbers do not prove the current Wave account ID.
 const record={id:row.id,date:f.date,description:f.description,amount,direction,primary:{account:f.account,type,accountId:null},categories:[f.category],postings:[],kind:'Unclassified',origin:'wave-live',liveBusiness:business,liveBaseline:{currency:snapshot.currency,identity:{business,transaction:row.id},fields:{...f},structure:{singleCategory:true,split:false}},existingTransfer:/^(?:Transfer(?: to| from| Clearing)|Payment (?:Sent|Received) for)/i.test(f.category)};
 return record;
}
export function assertLiveStructure(t,snapshot){
 if(t?.origin==='wave-live'&&(snapshot?.identity?.business!==t.liveBusiness||snapshot.identity.transaction!==t.id||snapshot.currency!=='USD'||snapshot.structure?.singleCategory!==true||snapshot.structure?.split!==false))throw Error('Live record structure changed or became unreadable. Nothing applied.');
}
