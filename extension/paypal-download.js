export function paypalCSVDownload(item){
 const name=String(item?.filename||''),csv=/\.csv$/i.test(name)||!/\.[a-z0-9]{1,5}$/i.test(name)&&/^(text\/csv|application\/csv|text\/comma-separated-values)(?:;|$)/i.test(item?.mime||'');
 if(!csv)return false;
 return [item.referrer,item.url,item.finalUrl].some(value=>{try{const u=new URL(value);return u.origin==='https://www.paypal.com'&&!u.username&&!u.password&&(u.protocol==='https:'||u.protocol==='blob:');}catch{return false;}});
}
export async function paypalDownloadRecovery(downloads,pending){
 if(!pending||!Number.isInteger(pending.downloadId))return {retry:true};
 const item=(await downloads.search({id:pending.downloadId}))[0];
 if(!item||item.state==='interrupted'||item.state==='complete'&&item.exists===false)return {retry:true,stale:true};
 if(!paypalCSVDownload(item))throw Error('The saved download is not a recognizable PayPal CSV. Read download status before retrying.');
 return {resumeId:pending.downloadId};
}
