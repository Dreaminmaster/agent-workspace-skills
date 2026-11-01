import pdfSource from './visual-assets/pdf.mjs.txt';
import pdfWorkerSource from './visual-assets/pdf.worker.mjs.txt';
import tesseractSource from './visual-assets/tesseract.js.txt';
import tesseractWorkerSource from './visual-assets/tesseract.worker.js.txt';
import {base64} from './policy.mjs';

import {VISUAL_HOSTS,allowedVisualAsset,visualPages} from './visual-policy.mjs';
export {VISUAL_HOSTS,allowedVisualAsset,visualPages};
export async function readVisualAttachment(browser,file,bytes,options={}){
 const requested=visualPages(options.pages),language=options.ocr_language||'eng';
 if(!['eng','eng+chi_sim'].includes(language))throw Error('unsupported_ocr_language');
 const pdf=/\.pdf$/i.test(file.filename||file.display_name||'')||file['content-type']?.includes('pdf');
 const image=/\.(?:png|jpe?g|webp)$/i.test(file.filename||file.display_name||'')||/^image\/(?:png|jpeg|webp)$/.test(file['content-type']||'');
 if(!pdf&&!image)return {status:'format_not_rendered',limitations:'PDF, PNG, JPEG and WebP visual reading only. Office text extraction remains available.'};
 // Analysis runs in a fresh, credential-free context. Only fixed static GET assets
 // can leave it; no source URL, document byte, arbitrary header or query is sent out.
 const context=await browser.newContext({serviceWorkers:'block'});
 try{
  await context.route('**/*',route=>allowedVisualAsset(route.request().url(),route.request().method())?route.continue({headers:{Accept:'*/*'}}):route.abort());
  const page=await context.newPage();await page.addScriptTag({content:tesseractSource});
  let timer;const work=page.evaluate(async input=>{
   let document,ocrWorker;const images=[],created=[];
   const blobURL=(text,type)=>{const url=URL.createObjectURL(new Blob([text],{type}));created.push(url);return url;};
   const raw=Uint8Array.from(atob(input.binary),c=>c.charCodeAt(0));
   try{
    let count=1,selected=input.requested,detected=[];
    if(input.pdf){const lib=await import(blobURL(input.pdfSource,'text/javascript'));lib.GlobalWorkerOptions.workerSrc=blobURL(input.pdfWorkerSource,'text/javascript');
     document=await lib.getDocument({data:raw,isEvalSupported:false,useSystemFonts:true,enableXfa:false,useWorkerFetch:false}).promise;count=document.numPages;
     if(count>200)throw Error('too_many_pages');
     if(!selected){if(input.explicit)selected=[1];else{for(let n=1;n<=Math.min(count,20);n++){const p=await document.getPage(n),content=await p.getTextContent();if(content.items.map(i=>i.str||'').join(' ').trim().length<120)detected.push(n);p.cleanup();}selected=detected.slice(0,3);}}
    }else selected=selected||[1];
    if(selected.some(n=>n>count))return {status:'page_out_of_range',total_pages:count,visuals:[]};
    if(!selected.length)return {status:'text_layer_only',total_pages:count,visuals:[],scan_detection_scope:Math.min(count,20),limitations:'No sparse page detected in the checked range. Images and charts have not been inspected; request visual=true and pages explicitly.'};
    for(const number of selected){
     const canvas=document?null:globalThis.document.createElement('canvas');let output=canvas;
     if(document){const p=await document.getPage(number),v=p.getViewport({scale:1}),scale=Math.min(1800/v.width,Math.sqrt(4000000/(v.width*v.height))),viewport=p.getViewport({scale});output=globalThis.document.createElement('canvas');output.width=Math.ceil(viewport.width);output.height=Math.ceil(viewport.height);await p.render({canvasContext:output.getContext('2d'),viewport,background:'#ffffff'}).promise;p.cleanup();}
     else{const bitmap=await createImageBitmap(new Blob([raw],{type:input.mime})),scale=Math.min(1,1800/bitmap.width,Math.sqrt(4000000/(bitmap.width*bitmap.height)));output.width=Math.ceil(bitmap.width*scale);output.height=Math.ceil(bitmap.height*scale);const ic=output.getContext('2d');ic.fillStyle='#ffffff';ic.fillRect(0,0,output.width,output.height);ic.drawImage(bitmap,0,0,output.width,output.height);bitmap.close();}
     let text='',confidence=null,ocr_status='not_requested';
     if(input.ocr){try{if(!ocrWorker){ocrWorker=await Tesseract.createWorker(input.language,1,{workerPath:blobURL(input.tesseractWorkerSource,'text/javascript'),workerBlobURL:false,corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',langPath:'https://tessdata.projectnaptha.com/4.0.0',cacheMethod:'none',logger:()=>{}});await ocrWorker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'});}
      const ocrCanvas=globalThis.document.createElement('canvas');ocrCanvas.width=output.width;ocrCanvas.height=output.height;const ctx=ocrCanvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(output,0,0);const pixels=ctx.getImageData(0,0,ocrCanvas.width,ocrCanvas.height),values=pixels.data,w=ocrCanvas.width,h=ocrCanvas.height;let dark=0;
      for(let i=0;i<values.length;i+=4)if(values[i]*0.299+values[i+1]*0.587+values[i+2]*0.114<150)dark++;
      if(dark/(w*h)<0.2){for(let i=0;i<values.length;i+=4){const v=values[i]*0.299+values[i+1]*0.587+values[i+2]*0.114<150?0:255;values[i]=values[i+1]=values[i+2]=v;}
       // Remove long rule lines only from the OCR copy; the evidence image is untouched.
       const erase=new Uint8Array(w*h);for(let y=0;y<h;y++){let a=0;while(a<w){if(values[(y*w+a)*4]!==0){a++;continue;}let b=a;while(b<w&&values[(y*w+b)*4]===0)b++;if(b-a>w*0.08)for(let x=a;x<b;x++)erase[y*w+x]=1;a=b;}}
       for(let x=0;x<w;x++){let a=0;while(a<h){if(values[(a*w+x)*4]!==0){a++;continue;}let b=a;while(b<h&&values[(b*w+x)*4]===0)b++;if(b-a>h*0.08)for(let y=a;y<b;y++)erase[y*w+x]=1;a=b;}}
       for(let i=0;i<erase.length;i++)if(erase[i])values[i*4]=values[i*4+1]=values[i*4+2]=255;ctx.putImageData(pixels,0,0);
      }
      const result=await ocrWorker.recognize(ocrCanvas);text=result.data.text.slice(0,25000);confidence=result.data.confidence;ocr_status=confidence<60?'review_required':'ocr_completed';ocrCanvas.width=ocrCanvas.height=0;}catch{ocr_status='ocr_unavailable';}}
     const preview=globalThis.document.createElement('canvas'),scale=Math.min(1,1400/output.width);preview.width=Math.round(output.width*scale);preview.height=Math.round(output.height*scale);preview.getContext('2d').drawImage(output,0,0,preview.width,preview.height);
     let data=preview.toDataURL('image/jpeg',0.8).split(',')[1];if(data.length>800000)data=preview.toDataURL('image/jpeg',0.45).split(',')[1];
     images.push({page:number,text,confidence,ocr_status,mimeType:'image/jpeg',data:data.length<=1000000?data:null,width:preview.width,height:preview.height});output.width=output.height=0;
    }
    const pending=input.explicit?Array.from({length:count},(_,i)=>i+1).filter(n=>!selected.includes(n)):detected.filter(n=>!selected.includes(n));
    return {status:images.every(i=>i.data&&(!input.ocr||i.ocr_status==='ocr_completed'))?'visual_success':'visual_partial',total_pages:count,processed_pages:selected,pending_pages:pending,scan_detection_scope:input.explicit?null:Math.min(count,20),visuals:images,limitations:'OCR can misread symbols, tables, handwriting and numbers. Use the attached images to interpret diagrams and charts; distinguish printed values from estimates. Unprocessed pages and Office embedded graphics are not covered.'};
   }finally{if(ocrWorker)await ocrWorker.terminate().catch(()=>{});if(document)await document.destroy().catch(()=>{});for(const url of created)URL.revokeObjectURL(url);}
  },{binary:base64(bytes),pdf,mime:file['content-type']||'image/png',requested,language,explicit:options.visual===true||requested!==null,ocr:options.ocr!==false,pdfSource,pdfWorkerSource,tesseractWorkerSource});
  try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('visual_budget')),65000);})]);}finally{clearTimeout(timer);}
 }catch{return {status:'visual_unavailable',visuals:[],limitations:'Visual rendering or OCR did not finish within the bounded cloud session. No visual coverage is claimed; ordinary extracted text remains available.'};}
 finally{await context.close().catch(()=>{});}
}
