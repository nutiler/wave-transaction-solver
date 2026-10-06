export const usageStages=[
 {id:'setup',label:'Import',title:'1. Start with your export',description:'Confirm the business, import a fresh accounting.csv, and load category names when you need them.',panels:['fold-setup','fold-import','fold-chart'],next:'Continue to collect transactions'},
 {id:'collection',label:'Collect & inspect',title:'2. Find and inspect unfinished work',description:'Collect Not Reviewed for bookkeeping, or use the optional full-history collection. Compare either source with your CSV and optionally inspect its transaction dialogs. Nothing is edited here.',panels:['liveList','allCollection','bulkInspector'],next:'Continue to review rules'},
 {id:'rules',label:'Approve rules',title:'3. Review and approve merchant rules',description:'Accept the rules you trust. Use the last scan to prioritize remaining merchants; accepting rules only updates this solver.',panels:['fold-proposals','fold-history','fold-merchant'],next:'Continue to approved work'},
 {id:'transactions',label:'Run approved work',title:'4. Run the work you recognize',description:'Work through transfers, confirm matching Wave suggestions, then run approved-rule expenses. Each runner requires your selection and verifies saved results.',panels:['fold-transfers','waveSuggestions','expenseBatch'],next:'Continue to remaining transactions'},
 {id:'planning',label:'Resolve & rescan',title:'5. Resolve the remaining live records',description:'This queue contains records from your latest live Not Reviewed collection. Inspect an exception, approve a rule in step 3 or apply one planned change in its live check. Return to step 2 to confirm what remains.',panels:['fold-queue','fold-live'],next:'Return to collect a fresh list'}
];
export function usageReadiness({business,dataset,report,rules=[],expenseMatches,transferMatches}={}){
 const setup=!!business && !!dataset,scan=!!report && !report.running && report.completeness==='count-confirmed';
 return {setup:{ready:setup,text:setup?'Session loaded':!business?'Choose business':'Import CSV'},collection:{ready:scan,text:report?.running?'Collecting…':scan?(report.records?.length || 0)+' scanned':report?'Partial scan':'Collect live list'},rules:{ready:setup,text:rules.filter(r=>!r.business || r.business===business).length+' saved rules'},transactions:{ready:setup,text:expenseMatches===undefined?'Select work to run':expenseMatches+' expense '+(expenseMatches===1?'match':'matches')+' · '+transferMatches+' transfer '+(transferMatches===1?'candidate':'candidates')},planning:{ready:setup,text:'Fresh scan verifies progress'}};
}
export function initialUsageStage(state,saved){
 if(usageStages.some(s=>s.id===saved))return saved;
 const ready=usageReadiness(state);return !ready.setup.ready?'setup':!ready.collection.ready?'collection':'rules';
}
