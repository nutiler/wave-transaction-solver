import {parseCSV} from './csv.js';
export const appleCardVersion=1;
export const appleCardURL='https://card.apple.com/';
export const appleCardOrigins=['https://card.apple.com/*','https://accounting.waveapps.com/transactions/*','https://accounting.waveapps.com/manual_import/*'];
export const defaultAppleAccountURL=''; // Personal account links live in ignored settings.local.js.
const tidy=v=>String(v??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const iso=s=>{const m=tidy(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/),value=m?m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'):tidy(s);if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Invalid Apple Card date: '+tidy(s));return value;};
const money=s=>{const text=tidy(s).replace(/,/g,'');if(!/^-?\d+(?:\.\d{1,2})?$/.test(text))throw Error('Unreadable Apple Card amount.');const value=Math.round(Number(text)*100);if(!Number.isSafeInteger(value)||value===0)throw Error('Apple Card amount must be a nonzero number of cents.');return value;};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
export function appleAccountScope(value){
 const u=new URL(value),business=u.pathname.match(/^\/([0-9a-f-]{36})\/transactions\/?$/i)?.[1];if(u.origin!=='https://next.waveapps.com'||u.username||u.password||!business||u.searchParams.size!==1||!u.searchParams.has('anchorId')||u.hash)throw Error('Use the exact Wave Apple Card account-filter URL.');
 let decoded;try{decoded=atob(u.searchParams.get('anchorId'));}catch{throw Error('Wave account identity could not be decoded.');}const m=decoded.match(/^Account:(\d+);Business:([0-9a-f-]{36})$/i);if(!m||m[2].toLowerCase()!==business.toLowerCase())throw Error('The account belongs to a different Wave business.');return {business:business.toLowerCase(),accountId:m[1],accountURL:u.href,currency:'USD',accountType:'Credit Card'};
}
export function appleStatementHeader(header){return ['Transaction Date','Clearing Date','Description','Merchant','Category','Type','Amount (USD)','Purchased By'].every(name=>header.includes(name));}
export async function parseAppleCard(text,{name='Apple Card export.csv'}={}){
 const rows=parseCSV(text),header=rows[0];if(!header||!appleStatementHeader(header)||new Set(header).size!==header.length)throw Error('Choose the original Apple Card transactions CSV with Clearing Date, Type and Amount (USD).');
 const index=key=>header.indexOf(key),counts=new Map(),records=[];
 for(const [position,row] of rows.slice(1).entries()){
  if(!row.some(Boolean))continue;if(row.length!==header.length)throw Error('Apple Card row '+(position+2)+' has an unexpected column count.');const field=key=>row[index(key)],type=tidy(field('Type')),amountCents=money(field('Amount (USD)')),transactionDate=iso(field('Transaction Date')),date=iso(field('Clearing Date')),description=tidy(field('Description')),merchant=tidy(field('Merchant')),purchasedBy=tidy(field('Purchased By'));
  if(!description||description.length>1000||date<transactionDate)throw Error('Apple Card row '+(position+2)+' has missing description or inconsistent dates.');
  if(!['Purchase','Debit','Interest','Other','Payment','Credit'].includes(type)||['Purchase','Debit','Interest'].includes(type)&&amountCents<0||['Payment','Credit'].includes(type)&&amountCents>0)throw Error('Apple Card row '+(position+2)+' has an unsupported type or inconsistent amount sign.');
  const identity=JSON.stringify([transactionDate,date,description,merchant,type,amountCents,purchasedBy]),fingerprint=await digest(identity),occurrence=(counts.get(fingerprint)||0)+1;counts.set(fingerprint,occurrence);
  records.push({key:fingerprint+':'+occurrence,fingerprint,occurrence,date,transactionDate,description,merchant,purchasedBy,type,category:field('Category'),amountCents,currency:'USD',direction:amountCents>0?'out':'in',original:Object.fromEntries(header.map((h,i)=>[h,row[i]]))});
 }
 if(!records.length)throw Error('The Apple Card CSV contains no posted transactions.');records.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));return {version:1,name,sha256:await digest(text),currency:'USD',records,earliest:records[0].date,latest:records.at(-1).date,types:Object.fromEntries([...new Set(records.map(r=>r.type))].map(t=>[t,records.filter(r=>r.type===t).length]))};
}
const matchKey=r=>JSON.stringify([r.date,Math.abs(r.amountCents),r.direction,tidy(r.description)]);
const nearKey=r=>JSON.stringify([r.date,Math.abs(r.amountCents)]);
export function validateAppleHistory(history,scope,now=Date.now()){
 if(!scope?.business||!/^\d+$/.test(scope.accountId||'')||!tidy(scope.accountName)||scope.currency!=='USD'||scope.accountType!=='Credit Card')throw Error('A bound USD Apple Card credit-card account is required.');
 if(history?.business!==scope.business||history.accountId!==scope.accountId||history.accountName!==scope.accountName||history.currency!=='USD'||history.accountType!=='Credit Card'||history.completeness!=='count-confirmed'||history.running||!Array.isArray(history.records)||history.expectedTotal!==history.records.length||!Number.isFinite(Date.parse(history.capturedAt))||now-Date.parse(history.capturedAt)<-60000||now-Date.parse(history.capturedAt)>5*60000)throw Error('A fresh, complete read of this exact Wave account is required.');
 const ids=new Set();for(const r of history.records){if(!/^\d+$/.test(r.id||'')||ids.has(r.id)||r.account!==scope.accountName||r.currency!=='USD'||!['out','in'].includes(r.direction)||!Number.isSafeInteger(r.amountCents)||r.amountCents<=0||!tidy(r.description))throw Error('Wave account history has unreadable or conflicting transaction identities.');iso(r.date);ids.add(r.id);}return history;
}
export function planAppleImport(statement,history,scope,state={}){
 validateAppleHistory(history,scope);if(state.business&&state.business!==scope.business||state.accountId&&state.accountId!==scope.accountId)throw Error('The saved importer state belongs to another account.');
 const byID=new Map(history.records.map(r=>[r.id,r])),available=new Map(),near=new Map(),used=new Set(),existing=[],missing=[],held=[];
 for(const r of history.records){const k=matchKey(r);if(!available.has(k))available.set(k,[]);available.get(k).push(r);const n=nearKey(r);if(!near.has(n))near.set(n,[]);near.get(n).push(r);}
 // Resolve prior verified IDs first, even if the operator changed their description.
 for(const r of statement.records){const saved=state.verified?.[r.key],live=saved?.waveId?byID.get(saved.waveId):null;if(!saved)continue;if(!live){held.push({record:r,reason:'Previously imported Wave record is missing; it will not be recreated automatically.'});continue;}used.add(live.id);if(![r.date,r.transactionDate].includes(saved.date||r.date)||live.date!==(saved.date||r.date)||live.direction!==r.direction||live.amountCents!==Math.abs(r.amountCents)){held.push({record:r,waveId:live.id,reason:'Previously imported Wave record changed its date, amount or direction.'});continue;}existing.push({record:r,waveId:live.id,liveDate:live.date,proof:'Saved import identity'});}
 const resolved=new Set([...existing,...held].map(x=>x.record.key)),today=new Date().toISOString().slice(0,10);
 for(const r of statement.records){if(resolved.has(r.key))continue;if(r.date>today){held.push({record:r,reason:'Future-dated rows are not posted history and will not be imported.'});continue;}const match=(available.get(matchKey(r))||[]).find(w=>!used.has(w.id));if(match){used.add(match.id);existing.push({record:r,waveId:match.id,proof:'Exact posted date, signed amount and original description'});}else missing.push(r);}
 // Older manual CSV imports may have selected Transaction Date instead of Clearing Date.
 const unmatched=[];for(const r of missing){const alt=r.transactionDate!==r.date?(available.get(matchKey({...r,date:r.transactionDate}))||[]).find(w=>!used.has(w.id)):null;if(alt){used.add(alt.id);existing.push({record:r,waveId:alt.id,liveDate:alt.date,proof:'Exact original transaction date, signed amount and description (manual import)'});}else unmatched.push(r);}
 // Unknown same-date/amount records may be manual entries or renamed imports.
 const safe=[];for(const r of unmatched){const candidates=[...(near.get(nearKey(r))||[]),...(r.transactionDate!==r.date?near.get(nearKey({...r,date:r.transactionDate}))||[]:[])].filter(w=>!used.has(w.id));if(candidates.length)held.push({record:r,candidates:candidates.map(w=>w.id),reason:'Possible existing transaction with the same original or posting date and amount. Inspect before adding.'});else safe.push(r);}
 const pending=state.pending?.attempted?state.pending:null;
 return {version:1,business:scope.business,accountId:scope.accountId,accountName:scope.accountName,sourceHash:statement.sha256,sourceName:statement.name,preparedAt:new Date().toISOString(),historyCapturedAt:history.capturedAt,beforeIds:history.records.map(r=>r.id),existing,missing:safe,held,locked:!!pending,pending,earliest:statement.earliest,latest:statement.latest};
}
export function appleExportStart(history,scope,{floor,end}){
 validateAppleHistory(history,scope);return {...appleExportDate({floor,end,lastWaveDate:history.records.map(r=>r.date).sort().at(-1)||null}),historyCapturedAt:history.capturedAt};
}
export function appleExportDate({floor,end,lastWaveDate=null}){
 floor=iso(floor);end=iso(end);if(floor>end)throw Error('Apple’s available export range is invalid.');if(lastWaveDate)lastWaveDate=iso(lastWaveDate);if(lastWaveDate&&lastWaveDate>end)throw Error('The latest Wave Apple Card transaction is future dated. Inspect it before exporting.');
 return {start:lastWaveDate&&lastWaveDate>floor?lastWaveDate:floor,lastWaveDate};
}
export function appleWaveCSV(records){const quote=v=>'"'+String(v).replaceAll('"','""')+'"';return [['Date','Description','Amount'],...records.map(r=>[r.date,r.description,(r.amountCents/100).toFixed(2)])].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';}
export function beginAppleUpload(state,plan){if(plan.locked||plan.held.length||!plan.missing.length||state.pending?.attempted)throw Error('Resolve held or uncertain imports before uploading.');return {...state,version:1,business:plan.business,accountId:plan.accountId,pending:{attempted:true,startedAt:new Date().toISOString(),sourceHash:plan.sourceHash,records:structuredClone(plan.missing),beforeIds:[...plan.beforeIds],phase:'final-confirmation'},lastPlan:{sourceHash:plan.sourceHash,count:plan.missing.length}};}
export function verifyAppleUpload(state,history,scope){
 validateAppleHistory(history,scope);if(state.business!==scope.business||state.accountId!==scope.accountId||!state.pending?.attempted)throw Error('No pending import exists for this account.');const available=new Map(),used=new Set(Object.values(state.verified||{}).map(v=>v.waveId));for(const id of state.pending.beforeIds||[])used.add(id);
 for(const r of history.records){const key=matchKey(r);if(!available.has(key))available.set(key,[]);available.get(key).push(r);}const matched=[],missing=[];
 for(const r of state.pending.records){const live=(available.get(matchKey(r))||[]).find(w=>!used.has(w.id));if(live){used.add(live.id);matched.push({record:r,waveId:live.id});}else missing.push(r.key);}
 const extra=[...new Set(state.pending.records.map(matchKey))].flatMap(k=>(available.get(k)||[]).filter(w=>!used.has(w.id))).map(w=>w.id);
 if(missing.length||extra.length)return {verified:false,matched:matched.length,missing,extra,state};
 const verified={...state.verified};for(const x of matched)verified[x.record.key]={waveId:x.waveId,date:x.record.date,amountCents:x.record.amountCents,verifiedAt:new Date().toISOString()};return {verified:true,matched:matched.length,missing:[],state:{...state,verified,pending:null,completedAt:new Date().toISOString(),history:[...(state.history||[]).slice(-99),{...state.pending,phase:'verified',waveIds:matched.map(x=>x.waveId),verifiedAt:new Date().toISOString()}]}};
}
