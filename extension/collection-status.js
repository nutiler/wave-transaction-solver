// Validates the result of this scan, never a previously cached complete report.
export function liveCollectionProblem(report,{business,previousCapture=null,error=''}={}){
 if(error)return 'Wave could not finish this collection: '+error;
 if(!report)return 'Wave returned no fresh collection. Open the intended business in Wave and retry the scan.';
 if(report.business!==business||report.filter!=='NOT_VERIFIED')return 'The collection does not belong to this business’s Not Reviewed list. Open the intended business and retry.';
 if(!report.capturedAt||report.capturedAt===previousCapture)return 'Wave did not produce a fresh collection. Retry the scan after the current Wave operation finishes.';
 if(!Array.isArray(report.records))return 'Wave returned an unreadable transaction list. Retry the scan; your queued decisions are preserved.';
 const records=report.records||[],identified=records.filter(r=>typeof r.id==='string'&&/^\d+$/.test(r.id)),unique=new Set(identified.map(r=>r.id)),total=report.expectedTotal;
 if(!report.running&&report.completeness==='count-confirmed'&&Number.isSafeInteger(total)&&total>=0&&identified.length===records.length&&unique.size===total&&records.length===total)return '';
 const count=unique.size+' identified'+(Number.isSafeInteger(total)?' of '+total+' expected transactions':' transactions; the full list count is unconfirmed');
 const details=[report.status,...(report.problems||[])].filter(Boolean).filter((value,index,all)=>all.indexOf(value)===index).slice(0,4).join(' ');
 const action=(report.problems||[]).some(p=>/Existing selection/i.test(p))?'Clear the selected transaction checkboxes in Wave, then retry the scan.':/filters|search/i.test(details)?'Clear extra searches and filters in the Wave list, then retry.':'Open the Wave list to check its loading or count status, then retry the scan.';
 return 'Live collection is incomplete: '+count+'. '+(details?details+' ':'')+action+' Your queued decisions are preserved.';
}
