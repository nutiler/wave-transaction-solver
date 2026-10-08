// Only tabs created by this helper instance can be closed automatically.
export async function waitHelperTab(tabs,id,url,{pause=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),timeoutMs=30000}={}){
 const began=now();while(now()-began<=timeoutMs){const tab=await tabs.get(id);if(!tab)throw Error('The working tab closed. Resume opens it again.');if(tab.status!=='loading'&&tab.url&&tab.url!=='about:blank'){const expected=new URL(url),actual=new URL(tab.url);if(actual.origin!==expected.origin||actual.pathname!==expected.pathname)throw Error('The provider needs sign-in or left its report page. Open it from Setup, then Resume.');return id;}await pause(250);}
 throw Error('The report tab is still loading. Resume will continue.');
}
export function helperTabs(tabs){
 const owned=new Map();
 const samePage=(value,url)=>{try{const a=new URL(value),b=new URL(url);return a.origin===b.origin&&a.pathname===b.pathname&&(b.origin!=='https://mail.google.com'||!b.hash.startsWith('#search/')||a.hash===b.hash||a.hash.startsWith(b.hash+'/'));}catch{return false;}};
 return {
  async open(key,url,active=false){let record=owned.get(key);if(record){try{const tab=await tabs.get(record.id);if(samePage(tab.url,url)){if(tab.url!==url)await tabs.update(record.id,{url,active});else if(active)await tabs.update(record.id,{active:true});return waitHelperTab(tabs,record.id,url);}}catch{}owned.delete(key);}
   const tab=await tabs.create({url,active});owned.set(key,{id:tab.id,url});return waitHelperTab(tabs,tab.id,url);
  },
  async finish(){for(const [key,record] of owned){try{const tab=await tabs.get(record.id);if(samePage(tab.url,record.url))await tabs.remove(record.id);}catch{}owned.delete(key);}}
 };
}
