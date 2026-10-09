import {venmoPage} from './venmo-page.js';
const $=id=>document.getElementById(id),url='https://account.venmo.com/statement?month=7&profileId=all-profiles-id&year=2023',location={origin:'https://account.venmo.com',pathname:'/statement',href:url};
$('fixtureRun').onclick=async()=>{
 const log=[],check=(okay,label)=>{if(!okay)throw Error(label);log.push('PASS '+label);},read=()=>venmoPage({action:'read'},{document,location});
 try{
  let result=await read();check(result.emptyStatement?.month==='2023-07'&&result.emptyStatement.profiles.length===2,'Explicit empty message, displayed month and both active profiles produce empty-page evidence');
  $('month').textContent='August 2023';check(!(await read()).emptyStatement,'A displayed month that disagrees with the URL is held');$('month').textContent='July 2023';
  $('message').textContent='';check(!(await read()).emptyStatement,'Missing CSV buttons alone do not prove an empty statement');$('message').textContent='No transactions yet for this month, but as soon as they start rolling in, we’ll list them here.';
  const busy=document.createElement('div');busy.setAttribute('role','progressbar');busy.textContent='Loading';document.body.append(busy);check(!(await read()).emptyStatement,'Loading pages remain unconfirmed');busy.remove();
  $('profile').textContent='All profiles @fictionalperson';check(!(await read()).emptyStatement,'Both profile identities must be visible');$('profile').textContent='All profiles @fictionalperson @fictionalshop';
  const csv=document.createElement('button');csv.textContent='Download CSV';document.body.append(csv);check(!(await read()).emptyStatement,'Existing download controls take precedence over a stale empty message');csv.remove();
  $('fixtureResult').textContent=log.join('\n');
 }catch(e){$('fixtureResult').textContent=log.join('\n')+'\nFAIL '+e.message;}
};
