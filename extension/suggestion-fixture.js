import {waveSuggestionAction} from './suggestions.js';
import {waveListScan} from './list-scan.js';
const business='11111111-1111-1111-1111-111111111111',id='1000000000000000001';
const expected={date:'2026-10-01',description:'Example Cloud',account:'Fictional Checking',category:'Software',amountCents:1000};
function setup({category='Software',disabled=false,label='ConfirmAutocatIcon',duplicate=false,foreign=false,encoded=false}={}){
 const mount=document.getElementById('fixture');mount.innerHTML='<span>Not Reviewed</span><p>Showing 1 of 1 transactions</p><table><thead><tr><td>Date</td><td>Description</td><td>Account</td><td>Category</td><td>Amount</td><td>Actions</td></tr></thead><tbody><tr class="wv-table__row" data-reviewed="false"><td>Oct 1, 2026</td><td>Example Cloud</td><td>Fictional Checking</td><td></td><td>$10.00</td><td><button>Thumbs-up</button><button>Mark as reviewed</button></td></tr></tbody></table>';
 const row=mount.querySelector('tbody tr'),button=row.querySelector('button');row.children[3].textContent=category;
 if(encoded){const box=document.createElement('input');box.type='checkbox';box.dataset.testid='BulkCheckbox'+btoa('Business:'+business+';Transaction:'+id);row.children[0].append(box);}else row.dataset.transactionId=id;
 if(foreign){const a=document.createElement('a');a.href='https://next.waveapps.com/22222222-2222-2222-2222-222222222222/transactions/'+id;row.children[0].append(a);}
 button.innerHTML='<svg class="wv-svg-icon transactions-list-v2__row__verify-icon__svg"><title>approve icon</title><use href="#wvi-approve"></use></svg>';button.className='wv-button--icon transactions-list-v2__row__verify-icon transactions-list-v2__row__verify-icon--unverified';button.setAttribute('aria-label',label);button.disabled=disabled;let thumbs=0,reviews=0;button.onclick=()=>{thumbs++;button.remove();};row.querySelectorAll('button')[1].onclick=()=>reviews++;
 if(duplicate)row.parentElement.append(row.cloneNode(true));
 const context={document,location:{href:'https://next.waveapps.com/'+business+'/transactions?status=NOT_VERIFIED'},getComputedStyle,window:{},wait:async()=>{},now:()=>Date.now()};
 return {context,thumbs:()=>thumbs,reviews:()=>reviews,row};
}
document.getElementById('run').onclick=async()=>{const output=document.getElementById('results');output.replaceChildren();let passed=0,failed=0;
 const check=async(name,fn)=>{try{await fn();passed++;const li=document.createElement('li');li.textContent='PASS '+name;output.append(li);}catch(e){failed++;const li=document.createElement('li');li.textContent='FAIL '+name+': '+e.message;output.append(li);}};
 const equal=(a,b)=>{if(a!==b)throw Error('Expected '+b+', got '+a);};
 const confirm=f=>waveSuggestionAction({action:'confirm',business,id,category:'Software',expected},f.context);
 await check('Inspection is read-only and identifies the thumbs-up',()=>{const f=setup(),r=waveSuggestionAction({action:'inspect',business,id},f.context);equal(r.suggestionVisible,true);equal(f.thumbs(),0);equal(f.reviews(),0);});
 await check('Click only the exact suggestion control, never the separate reviewed button',()=>{const f=setup(),r=confirm(f);equal(r.confirmed,true);equal(f.thumbs(),1);equal(f.reviews(),0);});
 await check('Tooltip wording is also supported',()=>{const f=setup({label:'Confirm the auto-updated category'});equal(confirm(f).confirmed,true);equal(f.thumbs(),1);});
 await check('Wave encoded transaction identity is supported',()=>{const f=setup({encoded:true});equal(confirm(f).confirmed,true);equal(f.thumbs(),1);});
 for(const [name,options] of [['changed category',{category:'Office'}],['disabled control',{disabled:true}],['ambiguous row',{duplicate:true}],['foreign identity',{foreign:true}],['generic review is not a thumbs-up',{label:'Mark as reviewed'}],['approve glyph alone is insufficient',{label:''}]])await check(name+' prevents any click',()=>{const f=setup(options);equal(confirm(f).confirmed,false);equal(f.thumbs(),0);equal(f.reviews(),0);});
 await check('Changed transaction fields prevent confirmation',()=>{const f=setup();f.row.children[4].textContent='$11.00';equal(confirm(f).confirmed,false);equal(f.thumbs(),0);});
 await check('Navigation to another business prevents confirmation',()=>{const f=setup();f.context.location.href='https://next.waveapps.com/22222222-2222-2222-2222-222222222222/transactions?status=NOT_VERIFIED';equal(confirm(f).confirmed,false);equal(f.thumbs(),0);});
 await check('Scan captures suggested category without confirming or reviewing',async()=>{const f=setup();waveListScan({action:'start',business},f.context);await f.context.window.__dandelionWaveListScanV1.done;const report=f.context.window.__dandelionWaveListScanV1.report;equal(report.records[0].waveSuggestion,true);equal(report.records[0].reviewed,'Not reviewed');equal(f.thumbs(),0);equal(f.reviews(),0);});
 document.getElementById('status').textContent=passed+' passed, '+failed+' failed';document.getElementById('fixture').replaceChildren();
};
