import {verifyCategoryResult,reviewUpdateControl} from './editor.js';
import {simpleRecord} from './live-records.js';
import {approvedCommandRecord} from './command-center.js';
import {approvedRefund} from './operator-decisions.js';
const tidy=value=>String(value??'').replace(/\s+/g,' ').trim();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// The approval remains frozen. Only mutable approved fields may be corrected;
// fresh identity, money, account, date, direction and structure must still agree.
export function prepareSavedCorrection(record,snapshot,{business,categories=[],categoryGroups=[],receipt}={}) {
 if (!(receipt?.saveAttempted||receipt?.attempted)||!simpleRecord(record)||record.amount<=0||receipt.category!==record.proposed||receipt.description!==undefined&&receipt.description!==(record.approvedDescription??record.description))throw Error('The original saved approval is incomplete or changed. Nothing corrected.');
 const explicit=approvedCommandRecord(record)||approvedRefund(record);
 if((record.commandDecision||record.operatorDecision)&&!explicit)throw Error('The frozen saved approval no longer matches its original record.');
 if(record.commandDecision&&record.approvedDescription!==record.commandDecision.description)throw Error('The approved description changed. Nothing corrected.');
 if(!['Cash and Bank','Credit Card'].includes(record.primary?.type)||!Number.isSafeInteger(record.amount))throw Error('The original bank account and amount are required for correction.');
 if(explicit&&(record.commandDecision||record.operatorDecision).business!==business)throw Error('The original approval belongs to another business.');
 if(!explicit&&(record.kind!=='Merchant rule'||record.direction!=='out'))throw Error('The original transaction treatment is unavailable. Inspect this saved outcome.');
 if(snapshot?.currency!=='USD'||snapshot.structure?.singleCategory!==true||snapshot.structure?.split!==false||!Number.isFinite(Date.parse(snapshot.capturedAt))||snapshot.problems?.length)throw Error('A fresh, unambiguous USD single-category record is required for correction.');
 const verified=verifyCategoryResult(record,snapshot,business,record.proposed);
 if(verified.verification.problems.length||verified.verification.checks.some(c=>!['Category','Description'].includes(c.field)&&c.state!=='Match'))throw Error('Saved record identity, date, account, amount or direction changed. Nothing corrected.');
 for(const name of ['category','description'])if(!tidy(snapshot.fields?.[name])||/…|\.{3}/.test(snapshot.fields[name]))throw Error('Complete saved category and description must be readable before correction.');
 if(/^(?:Transfer(?: to| from| Clearing)|Payment (?:Sent|Received) for)/i.test(snapshot.fields.category))throw Error('A transfer category cannot be corrected as an expense. Inspect its counterpart.');
 const groups=categoryGroups.filter(g=>g.accounts.some(a=>a.name===record.proposed));
 if(!categories.includes(record.proposed)||groups.length!==1)throw Error('Collect the exact approved category and its Chart of Accounts group before correcting.');
 const treatment=record.commandDecision?.treatment||record.intent||'purchase',group=groups[0].name;
 if(!(['refund'].includes(treatment)?['Expenses','Equity']:treatment==='income'?['Income']:treatment==='personal-deposit'?['Equity']:['Expenses','Equity']).includes(group))throw Error('The approved category does not match this transaction treatment. Nothing corrected.');
 if(verified.reviewedVerified&&verified.descriptionVerified)return {state:'completed',verified};
 const actions=(snapshot.controls||[]).filter(c=>/^(Reviewed|Mark (as )?reviewed|Mark (as )?(unreviewed|not reviewed)|Unreview)$/i.test(c)),checkbox=snapshot.reviewCheckbox;
 const updates=(snapshot.controls||[]).some(c=>/^Review updates$/i.test(c));
 if((updates?!reviewUpdateControl(snapshot):actions.length+(typeof checkbox?.checked==='boolean'?1:0)!==1)||snapshot.reviewed==='Reviewed'&&actions.some(c=>/^Mark (as )?reviewed$/i.test(c))||checkbox?.disabled||snapshot.reviewActions?.some(a=>/^Mark (as )?reviewed$/i.test(a.name)&&a.disabled))throw Error('One usable reviewed-state control must be confirmed before correction.');
 const personal=group==='Equity',categoryPath=treatment==='refund'?[personal?'Deposit from Personal':'Refund for Expense']:treatment==='personal-deposit'?['Deposit from Personal']:treatment==='income'?[]:personal?['Personal Expense or Withdrawal']:[];
 return {state:'correction',request:{business,id:record.id,liveOnly:true,category:record.proposed,categoryPath,refund:['refund','personal-deposit'].includes(treatment),description:record.approvedDescription??record.description,expected:{...snapshot.fields},...(verified.categoryVerified&&verified.descriptionVerified?{reviewOnly:true,category:snapshot.fields.category}: {})}};
}
const signature=(receipt,record,snapshot,business)=>JSON.stringify({business,id:record.id,approvedCategory:receipt.category,approvedDescription:receipt.description??record.description,fields:Object.fromEntries(['date','description','account','type','amount','category'].map(name=>[name,snapshot.fields[name]])),currency:snapshot.currency,structure:{singleCategory:snapshot.structure.singleCategory,split:snapshot.structure.split},reviewed:'Reviewed'});

// A category-only disagreement can be resolved by an explicit local choice.
// Identity, all other approved fields, USD, structure and saved Reviewed state
// must be confirmed. Transfers and missing baselines cannot use this path.
export function currentCategoryChoice(receipt,record,snapshot,business){
 if(!/^[0-9a-f-]{36}$/i.test(business||'')||!(receipt?.saveAttempted||receipt?.attempted)||!simpleRecord(record)||!/^\d+$/.test(record?.id||'')||!tidy(receipt.category)||snapshot?.currency!=='USD'||snapshot.structure?.singleCategory!==true||snapshot.structure?.split!==false)return null;
 if(!['Cash and Bank','Credit Card'].includes(record.primary?.type)||!['out','in'].includes(record.direction)||!Number.isSafeInteger(record.amount)||record.amount<=0||!Number.isFinite(Date.parse(snapshot.capturedAt)))return null;
 if((snapshot.controls||[]).some(name=>/^Mark (as )?reviewed$/i.test(name))&&snapshot.reviewed==='Reviewed')return null;
 const category=snapshot.fields?.category;
 if(!tidy(category)||/…|\.{3}/.test(category)||/^(?:Transfer(?: to| from| Clearing)|Payment (?:Sent|Received) for)/i.test(category)||tidy(category).toLowerCase()===tidy(receipt.category).toLowerCase())return null;
 let verified;try{verified=verifyCategoryResult({...record,approvedDescription:receipt.description},snapshot,business,category);}catch{return null;}
 if(!verified.categoryVerified||!verified.reviewedVerified||!verified.descriptionVerified)return null;
 return {business,id:record.id,approvedCategory:receipt.category,currentCategory:category,description:receipt.description??record.description,signature:signature(receipt,record,snapshot,business)};
}
export function keepCurrentCategory(receipt,record,snapshot,business,shown,acceptedAt=new Date().toISOString()){
 const fresh=currentCategoryChoice(receipt,record,snapshot,business);
 if(!fresh||!same(fresh,shown))throw Error('Wave or the saved approval changed since this comparison. Recheck and review the new values before keeping a category.');
 return {...receipt,resolution:{kind:'kept-current-category',...fresh,baseline:structuredClone(record),snapshot:structuredClone(snapshot),acceptedAt},message:'Kept the current reviewed Wave category: '+fresh.currentCategory+'. Recorded locally; the earlier approval was retained and Wave was not edited.'};
}
export function receiptLocallyResolved(key,receipt,business){
 const r=receipt?.resolution;
 if(r?.kind!=='kept-current-category'||!Number.isFinite(Date.parse(r.acceptedAt))||r.business!==business||![business+':'+r.id,business+':suggestion:'+r.id].includes(key))return false;
 const fresh=currentCategoryChoice(receipt,r.baseline,r.snapshot,business);
 return !!fresh&&same(fresh,{business:r.business,id:r.id,approvedCategory:r.approvedCategory,currentCategory:r.currentCategory,description:r.description,signature:r.signature});
}
