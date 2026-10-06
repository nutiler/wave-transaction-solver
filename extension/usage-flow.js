export const usageStages=[
 {id:'setup',label:'Session',title:'1. Your saved session',description:'Your export, business and source files stay saved. Import a fresh CSV when needed. Solve recognized work collects the current Wave list automatically.',panels:['fold-setup','fold-import','fold-chart','liveList'],next:'Go to your decision desk'},
 {id:'transactions',label:'Do the work',title:'2. Your decision desk',description:'Start with Solve recognized work. Then choose a category for a merchant group and Apply and verify it here. Money in needs an explicit refund choice. Open Source purchases for Amazon, PayPal and Venmo evidence.',panels:['knownWork','fold-queue','sourceSolvers'],next:'Open rule library'},
 {id:'rules',label:'Rule library',title:'3. Rules and proposals',description:'Optional: accept new rule proposals or maintain saved merchant rules. Your daily decisions and execution are in Do the work.',panels:['fold-proposals','fold-merchant'],next:'Return to your decision desk'}
];
export function usageReadiness({business,dataset,report,rules=[],expenseMatches,transferMatches}={}){
 const setup=!!business && !!dataset,scan=!!report && !report.running && report.completeness==='count-confirmed';
 return {setup:{ready:setup,text:setup?'Session loaded':!business?'Choose business':'Import CSV'},collection:{ready:scan,text:report?.running?'Collecting…':scan?(report.records?.length || 0)+' scanned':report?'Partial scan':'Collect live list'},rules:{ready:setup,text:rules.filter(r=>!r.business || r.business===business).length+' saved rules'},transactions:{ready:setup,text:expenseMatches===undefined?'Select work to run':expenseMatches+' expense '+(expenseMatches===1?'match':'matches')+' · '+transferMatches+' transfer '+(transferMatches===1?'candidate':'candidates')},planning:{ready:setup,text:'Fresh scan verifies progress'}};
}
export function initialUsageStage(state,saved){
 if(saved==='planning'||saved==='collection')return 'transactions';if(usageStages.some(s=>s.id===saved))return saved;
 const ready=usageReadiness(state);return !ready.setup.ready?'setup':'transactions';
}
