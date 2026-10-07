import {parseCSV} from './csv.js';
const clean=v=>String(v??'').trim().replace(/\s+/g,' ');
const column=v=>clean(v).toLowerCase().replace(/[^a-z0-9]/g,'');
export function paypalDate(value,order='mdy') {
 if(!['mdy','dmy'].includes(order))throw Error('Choose the PayPal CSV date order.');
 let date=clean(value),m=date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 if(m)date=m[3]+'-'+m[order==='mdy'?1:2].padStart(2,'0')+'-'+m[order==='mdy'?2:1].padStart(2,'0');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Invalid PayPal transaction date.');
 return date;
}
export function paypalMoney(value) {
 let v=clean(value);if(!v)return 0;
 if(!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/.test(v))throw Error('PayPal amounts must use decimal points and two decimals; unsupported number format.');
 const negative=v.startsWith('-');v=v.replace(/^[+-]/,'').replace(/,/g,'');const [whole,fraction]=v.split('.'),result=Number(whole)*100+Number(fraction);
 if(!Number.isSafeInteger(result))throw Error('PayPal amount is too large.');return negative?-result:result;
}
export function importPayPalCSV(text,{name='',dateOrder='mdy',period=null}={}) {
 if(typeof text!=='string'||text.length>30*1024*1024||/^\s*[<{]/.test(text)||text.startsWith('PK'))throw Error('Expected a PayPal activity CSV. Login pages and ZIP reports are not CSVs.');
 const rows=parseCSV(text),required=['date','type','status','currency','gross','fee','net','transactionid'];
 const headerIndex=rows.findIndex(row=>required.every(key=>row.some(c=>column(c)===key)));
 if(headerIndex<0)throw Error('The response has no recognizable PayPal activity CSV header. Nothing saved.');
 const header=rows[headerIndex].map(column);if(new Set(header.filter(Boolean)).size!==header.filter(Boolean).length)throw Error('Duplicate PayPal CSV columns.');
 const get=(row,key)=>clean(row[header.indexOf(key)]),records=[],ids=new Set();
 for(const [offset,row] of rows.slice(headerIndex+1).entries()) {
  if(row.length!==header.length)throw Error('PayPal CSV row has missing or extra columns.');
  const id=get(row,'transactionid');if(!/^[a-z0-9]{1,64}$/i.test(id))throw Error('A PayPal activity row has no valid transaction ID.');
  if(ids.has(id))throw Error('Duplicate transaction ID inside a PayPal CSV; inspect the report.');ids.add(id);
  const date=paypalDate(get(row,'date'),dateOrder);if(period&&(date<period.start||date>period.end))throw Error('PayPal transaction dates do not match the selected report range. Nothing saved.');
  if(['gross','fee','net'].some(key=>!get(row,key)))throw Error('PayPal CSV has a missing amount.');
  const gross=paypalMoney(get(row,'gross')),fee=paypalMoney(get(row,'fee')),net=paypalMoney(get(row,'net'));
  if(gross+fee!==net)throw Error('PayPal Gross + Fee does not reconcile to Net.');
  const type=get(row,'type'),status=get(row,'status'),currency=get(row,'currency');if(!/^[A-Z]{3}$/.test(currency))throw Error('Invalid PayPal currency.');
  const funding=get(row,'paymentsource'),reference=get(row,'referencetxnid'),impact=get(row,'balanceimpact');
  const settled=/^(completed|settled)$/i.test(status)&&!/^memo$/i.test(impact)&&!/authorization|hold|order|invoice|request/i.test(type);
  let kind=/refund|reversal|chargeback/i.test(type)?'Refund':/general credit card deposit|general credit card withdrawal|buyer credit payment funding|bank deposit|add funds/i.test(type)?'Funding movement':/withdrawal|transfer|bank payment/i.test(type)?'Transfer':/loan|credit repayment|installment/i.test(type)?'Financing':gross<0&&/payment|purchase|debit/i.test(type)?'Purchase':gross>0?'Incoming payment':'Financial review';
  const merchant=get(row,'name')||type;if(kind==='Purchase'&&/pay.?in.?4|loan|installment|paypal credit/i.test(merchant))kind='Financing';else if(kind==='Purchase'&&(/\bbank\b/i.test(merchant)||/^PayPal Inc\.?$/i.test(merchant)))kind='Financial review';
  if(!settled)kind='Unsettled activity';
  const last4=funding.match(/(?:ending(?: in)?|\*+|\bx)\s*(\d{4})(?!\d)/i)?.[1]||'';
  const external=/^(credit ?card|instant ?transfer|electronicfundstransfer|directdebit|echeck)$/i.test(funding.replace(/\s/g,'')),financing=/buyercredit|paylater|creditline/i.test(funding);
  if(financing&&kind==='Purchase')kind='Financing';
  const note=[get(row,'subject'),get(row,'note')].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · '),title=get(row,'itemtitle');
  records.push({key:'paypal:'+id,provider:'paypal',sourceId:id,statementView:'account',sourceFormat:'csv',reference,date,currency,signedCents:net,amountCents:Math.abs(net),grossCents:gross,feeCents:fee,netCents:net,kind,status,type,merchant,note,funding,accountEnding:last4,embeddedFundingCents:null,bankAmountCents:Math.abs(net),bankDirection:kind==='Transfer'?(net<0?'in':'out'):net<0?'out':'in',bankExpected:settled&&external&&kind==='Purchase',instrumentKey:'paypal:'+(last4||'Unknown external account'),blocked:!settled?'PayPal activity is not a settled payment.':kind!=='Purchase'?'Funding, refunds, transfers and incoming payments need separate review.':!external?'Wallet or unspecified funding has no confirmed separate bank debit.':fee?'PayPal fees need bank reconciliation.':'',items:title?[{key:id+':item',title,productCategory:'',quantity:get(row,'quantity'),net:Math.abs(gross)}]:[],sources:[{file:name,row:headerIndex+offset+2}],issues:fee&&kind==='Purchase'?['Funding fees need separate bank reconciliation.']:[]});
 }
 return {provider:'paypal',name,records,issues:[],controls:{activityRows:records.length,empty:!records.length,dateOrder,firstDate:records.length?records.map(r=>r.date).sort()[0]:null,lastDate:records.length?records.map(r=>r.date).sort().at(-1):null,currencies:[...new Set(records.map(r=>r.currency))]}};
}
