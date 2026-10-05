export const usageStages=[
 {id:'setup',label:'Set up',title:'1. Set up your session',description:'Confirm the business, import a fresh accounting.csv, and load category names when you need them.',panels:['fold-setup','fold-import','fold-chart'],next:'Continue to collect transactions'},
 {id:'collection',label:'Collect',title:'2. Collect what still needs review',description:'Collect the live Not Reviewed list. This reads Wave and checks your saved rules without editing transactions.',panels:['liveList'],next:'Continue to review rules'},
 {id:'rules',label:'Review rules',title:'3. Review and approve merchant rules',description:'Accept the rules you trust. Use the last scan to prioritize remaining merchants; accepting rules only updates this solver.',panels:['fold-proposals','fold-history','fold-merchant'],next:'Continue to approved work'},
 {id:'transactions',label:'Run approved work',title:'4. Run the work you recognize',description:'Work through transfers, confirm matching Wave suggestions, then run approved-rule expenses. Each runner requires your selection and verifies saved results.',panels:['fold-transfers','waveSuggestions','expenseBatch'],next:'Continue to remaining transactions'},
 {id:'planning',label:'Review the rest',title:'5. Review the rest and check progress',description:'Inspect uncertain purchases, incoming transactions and any stopped attempts individually. Collect a fresh list to see what remains.',panels:['fold-queue','fold-live','fold-plan'],next:'Return to collect a fresh list'}
];
export function usageReadiness({business,dataset,report,rules=[],expenseMatches,transferMatches}={}){
 const setup=!!business && !!dataset,scan=!!report && !report.running && report.completeness==='count-confirmed';
 return {setup:{ready:setup,text:setup?'Session loaded':!business?'Choose business':'Import CSV'},collection:{ready:scan,text:report?.running?'Collecting…':scan?(report.records?.length || 0)+' scanned':report?'Partial scan':'Collect live list'},rules:{ready:setup,text:rules.filter(r=>!r.business || r.business===business).length+' saved rules'},transactions:{ready:setup,text:expenseMatches===undefined?'Select work to run':expenseMatches+' expense '+(expenseMatches===1?'match':'matches')+' · '+transferMatches+' transfer '+(transferMatches===1?'candidate':'candidates')},planning:{ready:setup,text:'Fresh scan verifies progress'}};
}
export function initialUsageStage(state,saved){
 if(usageStages.some(s=>s.id===saved))return saved;
 const ready=usageReadiness(state);return !ready.setup.ready?'setup':!ready.collection.ready?'collection':'rules';
}
