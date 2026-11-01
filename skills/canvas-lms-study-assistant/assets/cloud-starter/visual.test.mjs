import test from 'node:test';import assert from 'node:assert/strict';
import {visualPages,allowedVisualAsset} from './cloud-browser/visual-policy.mjs';
import {mergeVisualEvidence,mcpFileContent,attachmentNeedsVisual} from './visual-result.mjs';
import {query} from './router.mjs';
test('visual page selection stays bounded and static assets cannot carry document data out',()=>{
 assert.deepEqual(visualPages('1-3'),[1,2,3]);assert.deepEqual(visualPages('2,5'),[2,5]);
 for(const x of ['1-4','0','-1','2-1','1,2,3,4','1?x=secret'])assert.throws(()=>visualPages(x));
 const url='https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0/tesseract-core-simd-lstm.wasm';assert.equal(allowedVisualAsset(url),true);
 assert.equal(allowedVisualAsset('https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz'),true);
 for(const x of [url+'?document=private','https://canvas.sydney.edu.au/api/v1/users/self/profile','https://evil.invalid/a',url.replace('https:','http:')])assert.equal(allowedVisualAsset(x),false);
 assert.equal(allowedVisualAsset(url,'POST'),false);
});
test('OCR merges with original evidence and MCP image bytes never appear in JSON text',()=>{
 const data=mergeVisualEvidence({text:'Original printed text',format:'PDF',limitations:'API text only; no OCR'},{status:'visual_success',limitations:'Selected-page OCR is approximate',processed_pages:[1],pending_pages:[2],visuals:[{page:1,text:'Approximate OCR',confidence:63,ocr_status:'ocr_completed',mimeType:'image/jpeg',data:'c3ludGhldGlj',width:10,height:20}]});
 assert.match(data.text,/Original printed text/);assert.equal(data.limitations,'Selected-page OCR is approximate');assert.equal(data.text_layer_limitations,'API text only; no OCR');assert.match(data.text,/Approximate OCR/);assert.equal(data.ocr_pages[0].confidence,63);assert.deepEqual(data.visual_reading.pending_pages,[2]);
 const content=mcpFileContent({...data,browser_supplement:{visuals:data.visuals}});assert.equal(content[1].type,'image');assert.equal(content[1].data,'c3ludGhldGlj');assert.doesNotMatch(content[0].text,/c3ludGhldGlj/);
});
test('scan detection is a hint and explicit charts can request images despite a full text layer',()=>{
 assert.equal(attachmentNeedsVisual({format:'PDF',pages:[{text:''}]}),true);
 assert.equal(attachmentNeedsVisual({format:'PDF',pages:[{text:'word '.repeat(200)}]}),false);
 assert.equal(attachmentNeedsVisual({format:'PDF',pages:[{text:'word '.repeat(200)}]},{visual:true}),true);
 assert.equal(attachmentNeedsVisual({format:'image'}),true);assert.equal(attachmentNeedsVisual({format:'DOCX'},{visual:true}),false);
});
test('API-only image read does not start OCR or depend on any browser endpoint',async()=>{
 const original=globalThis.fetch;const seen=[];globalThis.fetch=async(raw)=>{const url=String(raw);seen.push(url);if(url.includes('/api/v1/'))return Response.json({id:123,filename:'sample.png',size:4,'content-type':'image/png',url:'https://canvas.sydney.edu.au/files/123/download'});return new Response(new Uint8Array([1,2,3,4]),{headers:{'content-type':'image/png'}});};
 try{const result=await query('read_file',{course_id:101,file_id:123,channel:'api',visual:true},{CANVAS_API_TOKEN:'synthetic-only'});assert.equal(result.format,'image');assert.equal(result.completeness,'partial');assert.equal(seen.some(u=>u.includes('workers.dev')),false);}finally{globalThis.fetch=original;}
});

test('low-confidence OCR remains reviewable but never pollutes trusted extracted text',()=>{const value=mergeVisualEvidence({text:'original text'},{status:'visual_partial',visuals:[{page:1,text:'uncertain glyphs',confidence:12,ocr_status:'review_required',mimeType:'image/jpeg',data:'c3ludGhldGlj'}]});assert.equal(value.text,'original text');assert.equal(value.ocr_pages[0].text,'uncertain glyphs');});
