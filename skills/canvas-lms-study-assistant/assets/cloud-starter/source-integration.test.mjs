import test from 'node:test';import assert from 'node:assert/strict';
import worker from './worker.mjs';import {query} from './router.mjs';import {UniversalReader} from './universal/router.mjs';import {permittedPortalRequest,portalEntry,validPortalRequest} from './cloud-browser/student-portal.mjs';import {download,readAttachment} from './files.mjs';
const frame=course=>`https://canvas.sydney.edu.au/courses/${course}/external_tools/retrieve?display=borderless&url=`+encodeURIComponent('https://sres.sydney.edu.au/lti/launch?custom_launch_uuid=SYNTHETIC');
test('general SRES derives course-specific launch and retains explicit owner consent',()=>{
 assert.equal(validPortalRequest({course_id:101,consent:true}),true);assert.equal(validPortalRequest({course_id:101,consent:true,report_label:'Exam information'}),true);
 for(const x of [{course_id:101},{course_id:101,consent:true,url:frame(102)},{course_id:101,consent:true,report_label:'Delete portfolio'}])assert.equal(validPortalRequest(x),false);
 assert.equal(portalEntry(frame(101),101),true);assert.equal(portalEntry(frame(102),101),false);assert.equal(portalEntry(frame(101).replace('sres.sydney.edu.au','evil.invalid'),101),false);
 assert.equal(permittedPortalRequest(frame(101),'GET',true,101),true);assert.equal(permittedPortalRequest(frame(101),'POST',true,101),false);
 for(const [url,method]of [['https://sres.sydney.edu.au/portals/id/submit','GET'],['https://sres.sydney.edu.au/api/grades','POST'],['https://canvas.sydney.edu.au/courses/101/assignments/2','GET']])assert.equal(permittedPortalRequest(url,method,true,101),false);
});
test('concurrency applies across separate query calls; cache is scoped, bounded, deduplicated and error-safe',async()=>{
 let active=0,peak=0,calls=0;const hub=new UniversalReader({maxConcurrent:2,maxEntries:2}).register({id:'test',capabilities:['read'],read:async(_cap,p)=>{active++;calls++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,3));active--;if(p.fail)throw Error('Bearer PRIVATE_REALISTIC_TEST');return {status:'ok',read_at:'original-time',items:[p]};}});
 await Promise.all(Array.from({length:6},(_,id)=>hub.query({provider:'test',capability:'read',params:{id},scope:'a'})));assert.equal(peak,2);assert.ok(hub.cache.size<=2);
 const x={provider:'test',capability:'read',params:{id:1},scope:'a'};await hub.query(x);const before=calls;assert.equal((await hub.query(x)).read_at,'original-time');assert.equal(calls,before);await hub.query({...x,scope:'b'});assert.equal(calls,before+1);
 assert.doesNotMatch(JSON.stringify(await hub.query({...x,params:{fail:true}})),/PRIVATE_REALISTIC_TEST/);
});
test('MCP advertises new tools but keeps pinned-owner invocation protection and no permission fiction',async()=>{
 const request=name=>new Request('https://site.invalid/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:name==='list'?'tools/list':'tools/call',params:{name,arguments:{}}})});
 const listed=await (await worker.fetch(request('list'),{})).json();assert.ok(listed.result.tools.find(t=>t.name==='read_student_portal'));assert.equal((await worker.fetch(request('get_source_capabilities'),{OWNER_EMAIL:'owner@invalid'})).status,403);
 const value=await query('get_source_capabilities',{},{});assert.equal(value.sources.find(s=>s.provider==='pebblepad').adapter,'interface_only');assert.equal(value.sources.find(s=>s.provider==='notion').status,'connector_required');
 await assert.rejects(query('read_student_portal',{course_id:101,url:'https://evil.invalid'},{}));
});
test('regional attachment redirect never forwards bearer and rejects credentials or ports',async()=>{
 const original=globalThis.fetch,seen=[];globalThis.fetch=async(url,options)=>{seen.push({url:String(url),headers:options.headers});return seen.length===1?new Response(null,{status:302,headers:{location:'https://instructure-uploads-apse2.s3.ap-southeast-2.amazonaws.com/test.pdf'}}):new Response(new Uint8Array([37,80,68,70]));};
 try{assert.equal((await download('https://canvas.sydney.edu.au/files/1/download','synthetic-token')).length,4);assert.equal(seen[0].headers.Authorization,'Bearer synthetic-token');assert.equal(seen[1].headers.Authorization,undefined);
 await assert.rejects(download('https://user:pass@canvas.sydney.edu.au/test','synthetic-token'));await assert.rejects(download('https://canvas.sydney.edu.au:8443/test','synthetic-token'));
 }finally{globalThis.fetch=original;}
});
test('attachment metadata failure retries one authorised course download and uses existing extractor',async()=>{
 const original=globalThis.fetch,seen=[];globalThis.fetch=async url=>{seen.push(String(url));return seen.length===1?new Response(null,{status:406}):new Response('synthetic course note',{headers:{'Content-Type':'text/plain'}});};
 try{const r=await readAttachment({id:1,filename:'note.txt',url:'https://canvas.sydney.edu.au/files/1/download',size:30,'content-type':'text/plain'},'synthetic',101);assert.equal(r.text,'synthetic course note');assert.equal(seen.length,2);assert.equal(seen[1],'https://canvas.sydney.edu.au/courses/101/files/1/download');}finally{globalThis.fetch=original;}
});

test('browser binary fallback parses private bytes and never exposes the binary envelope',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,init)=>{calls++;assert.ok(String(url).endsWith('/v1/files/download'));assert.deepEqual(JSON.parse(init.body),{course_id:101,file_id:1});return Response.json({status:'file_downloaded',file:{id:1,filename:'note.txt','content-type':'text/plain'},binary_base64:btoa('owner authorised study text'),fetched_at:'2026-01-01T00:00:00Z'});};
 try{const r=await query('read_file',{course_id:101,file_id:1,channel:'browser'},{BROWSER_SERVICE_URL:'https://canvas-browser.example.workers.dev',BROWSER_SERVICE_KEY:'synthetic'});assert.equal(r.text,'owner authorised study text');assert.equal(r.binary_parsed,true);assert.equal(r.source,'browser');assert.equal(r.fetched_at,'2026-01-01T00:00:00Z');assert.equal(JSON.stringify(r).includes('binary_base64'),false);assert.equal(calls>=1,true);}finally{globalThis.fetch=original;}
});
test('browser download never accepts arbitrary hosts, credentials or nonstandard ports',async()=>{
 const {approvedFileHop,downloadOwnerFile}=await import('./cloud-browser/file-download.mjs');
 assert.equal(approvedFileHop('https://canvas.sydney.edu.au/courses/101/files/1/download'),true);
 for(const url of ['https://evil.invalid/file','http://canvas.sydney.edu.au/file','https://user:pass@canvas.sydney.edu.au/file','https://canvas.sydney.edu.au:8443/file'])assert.equal(approvedFileHop(url),false);
 await assert.rejects(downloadOwnerFile({},{course_id:101,file_id:1,url:'https://evil.invalid'}),/invalid_target/);
 const r=await downloadOwnerFile({storedSession:async()=>null},{course_id:101,file_id:1});assert.equal(r.status,'requires_login');
});
