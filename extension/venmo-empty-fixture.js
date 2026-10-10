import {venmoPage} from './venmo-page.js';
const $=id=>document.getElementById(id),url='https://account.venmo.com/statement?month=7&profileId=all-profiles-id&year=2023',location={origin:'https://account.venmo.com',pathname:'/statement',href:url};
$('fixtureRun').onclick=async()=>{
 const log=[],check=(okay,label)=>{if(!okay)throw Error(label);log.push('PASS '+label);},read=()=>venmoPage({action:'read'},{document,location});
 try{
  let result=await read();check(result.emptyStatement?.month==='2023-07'&&result.emptyStatement.profiles.length===2,'Explicit empty message, displayed month and both active profiles produce empty-page evidence');
  const heading=$('month'),plain=document.createElement('div');plain.id='month';plain.innerHTML='<span>July 2023</span>';heading.replaceWith(plain);check((await read()).emptyStatement?.month==='2023-07','Plain div/span month labels support Venmo’s empty statement layout');
  $('month').textContent='August 2023';const selectedMonth=document.createElement('button');selectedMonth.innerHTML='<span>July 2023</span>';document.body.append(selectedMonth);check(!(await read()).emptyStatement,'A selected dropdown month cannot override a stale statement-body month');selectedMonth.remove();$('month').textContent='July 2023';
  $('message').textContent='';check(!(await read()).emptyStatement,'Missing CSV buttons alone do not prove an empty statement');$('message').textContent='No transactions yet for this month, but as soon as they start rolling in, we’ll list them here.';
  const busy=document.createElement('div');busy.setAttribute('role','progressbar');busy.textContent='Loading';document.body.append(busy);check(!(await read()).emptyStatement,'Loading pages remain unconfirmed');busy.remove();
  $('profile').textContent='All profiles @fictionalperson';check(!(await read()).emptyStatement,'Both profile identities must be visible');$('profile').textContent='All profiles @fictionalperson @fictionalshop';
  const csv=document.createElement('button');csv.textContent='Download CSV';document.body.append(csv);check(!(await read()).emptyStatement,'Existing download controls take precedence over a stale empty message');csv.remove();
  const {waitForVenmoControls,collectVenmoMonths,venmoCoverage}=await import('./venmo.js'),{confirmedVenmoEmpty}=await import('./venmo-empty.js');
  const info=await waitForVenmoControls(read,{allowEmpty:true,attempts:1}),period={month:'2023-07',start:'2023-07-01',end:'2023-07-31'},handles={personal:'@fictionalperson',business:'@fictionalshop'};let prepared=0;
  const collect=entries=>collectVenmoMonths({periods:[period],entries,prepare:async()=>{prepared++;return {emptyStatement:info.emptyStatement,profileHandles:handles};},read:()=>{throw Error('Empty month must not download');},save:()=>{throw Error('Empty month must not invent a CSV');},persist:async()=>{},verifyEmpty:async(e,p,profile)=>confirmedVenmoEmpty(e,p,handles[profile])});
  const saved=await collect({}),coverage=venmoCoverage({startMonth:'2023-07',latestCollection:{asOf:'2023-07-31'},entries:saved.entries});check(coverage.noActivity===2&&!coverage.unconfirmed.length,'Empty month records both profile proofs without a coverage gap');await collect(saved.entries);check(prepared===1,'Resume skips confirmed empty months instead of opening them again');
  $('fixtureResult').textContent=log.join('\n');
 }catch(e){$('fixtureResult').textContent=log.join('\n')+'\nFAIL '+e.message;}
};
