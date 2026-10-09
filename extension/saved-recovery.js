import {verifyCategoryResult} from './editor.js';
import {simpleRecord} from './live-records.js';
const tidy=value=>String(value??'').replace(/\s+/g,' ').trim();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
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
