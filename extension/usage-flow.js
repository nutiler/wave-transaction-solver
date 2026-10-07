export const usageStages=[
 {id:'setup',label:'Connections',title:'Your Wave connection',description:'Choose your business once. Daily work starts with Scan Wave in the Command center. Exports and purchase-source files are optional.',panels:['fold-setup','fold-chart'],next:'Go to your decision desk'},
 {id:'transactions',label:'Command center',title:'Review and queue decisions',description:'Scan Wave, confirm grouped suggestions locally, and run your saved queue when ready.',panels:['commandCenter'],next:'Open rule library'},
 {id:'rules',label:'Rule library',title:'Rules and proposals',description:'Optional: accept new rule proposals or maintain saved merchant rules. Your daily decisions and execution are in the Command center.',panels:['fold-proposals','fold-merchant'],next:'Return to your decision desk'}
];
export function usageReadiness({business,dataset,report,rules=[],expenseMatches,transferMatches}={}){
 const setup=!!business,scan=!!report && !report.running && report.completeness==='count-confirmed';
 return {setup:{ready:setup,text:setup?'Connected':'Choose business'},collection:{ready:scan,text:report?.running?'Collecting…':scan?(report.records?.length || 0)+' scanned':report?'Partial scan':'Collect live list'},rules:{ready:setup,text:rules.filter(r=>!r.business || r.business===business).length+' saved rules'},transactions:{ready:setup,text:'Scan → confirm → run'},planning:{ready:setup,text:'Fresh scan verifies progress'}};
}
export function initialUsageStage(state,saved){
 if(saved==='planning'||saved==='collection')return 'transactions';if(usageStages.some(s=>s.id===saved))return saved;
 const ready=usageReadiness(state);return !ready.setup.ready?'setup':'transactions';
}
