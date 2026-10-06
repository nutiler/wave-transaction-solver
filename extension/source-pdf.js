export function pdfItemsToLines(items){const bands=[];for(const item of items){if(!item.str?.trim())continue;const y=item.transform[5],x=item.transform[4];let band=bands.find(b=>Math.abs(b.y-y)<2);if(!band){band={y,items:[]};bands.push(band);}band.items.push({x,text:item.str,width:item.width||0});}return bands.sort((a,b)=>b.y-a.y).map(b=>{let result='',last=0;for(const i of b.items.sort((a,b)=>a.x-b.x)){const col=Math.round(i.x/4);result+=' '.repeat(Math.max(1,Math.min(150,col-last)))+i.text;last=col+i.text.length;}return result.trimEnd();}).join('\n');}
export async function extractLocalPDF(file){
 if(file.size>30*1024*1024)throw Error('Use PDF files smaller than 30 MB.');
 const pdfjs=await import('./vendor/pdf.min.mjs');
 const workerURL=new URL('./vendor/pdf.worker.min.mjs',import.meta.url);
 // Extension URLs have an opaque URL.origin. Supply the local worker directly
 // so PDF.js never creates a CDN/blob wrapper that conflicts with extension CSP.
 const worker=new Worker(workerURL,{type:'module'});
 pdfjs.GlobalWorkerOptions.workerSrc=workerURL.href;
 pdfjs.GlobalWorkerOptions.workerPort=worker;
 let doc,loading;
 try{
  loading=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,disableFontFace:true,useSystemFonts:true,useWorkerFetch:false,useWasm:false});
  doc=await loading.promise;
  if(doc.numPages>500)throw Error('Use statements with fewer than 500 pages.');
  const pages=[];
  for(let number=1;number<=doc.numPages;number++){const page=await doc.getPage(number),text=await page.getTextContent();pages.push(pdfItemsToLines(text.items));page.cleanup();}
  return pages;
 }finally{
  try{if(doc)await doc.destroy();else if(loading)await loading.destroy();}
  finally{pdfjs.GlobalWorkerOptions.workerPort=null;worker.terminate();}
 }
}
