import test from 'node:test';
import assert from 'node:assert/strict';
import {query,safeData} from './router.mjs';
const env={CANVAS_API_TOKEN:'test-not-real',BROWSER_SERVICE_KEY:'test-not-real',BROWSER_SERVICE_URL:'https://canvas-browser.example.workers.dev'};
test('forced browser performs zero Token requests; API success does not require browser',async()=>{
 const original=globalThis.fetch;let api=0,browser=0;
 globalThis.fetch=async (url,options)=>{if(String(url).includes('workers.dev')){browser++;return Response.json({status:'browser_success',source:'browser',text:'test-only'});}api++;return Response.json([{id:1,name:'test-only'}]);};
 try{
  const b=await query('list_courses',{channel:'browser'},env);assert.equal(api,0);assert.equal(b.routing.used,'browser');
  const before=browser;const a=await query('list_courses',{channel:'api'},env);assert.equal(browser,before);assert.equal(a.count,1);
 }finally{globalThis.fetch=original;}
});
test('401 and timeout use bounded fallback, both errors remain explicit',async()=>{
 const original=globalThis.fetch;let count=0;
 const paths=[];
 globalThis.fetch=async url=>{count++;paths.push(new URL(url).pathname);return String(url).includes('workers.dev')?Response.json({status:'requires_login'}):new Response('',{status:401});};
 try{const r=await query('list_courses',{},env);assert.equal(r.channels.api.status,'token_invalid');assert.equal(r.channels.browser.status,'requires_login');assert.equal(r.routing.used,'none');assert.equal(count,3);assert.equal(paths.filter(p=>p==='/v1/read').length,1);assert.equal(paths.filter(p=>p==='/v1/tasks/save').length,1);assert.equal(r.human_assistance.task_persisted,false);}finally{globalThis.fetch=original;}
});
test('credential-bearing API fields never enter responses or course index',()=>{
 const r=safeData({secure_params:'secret',validation_token:'secret',body:'<a href="https://canvas.sydney.edu.au/files/1?verifier=secret">file</a>',title:'lesson'});
 assert.equal(JSON.stringify(r).includes('secret'),false);assert.equal(r.title,'lesson');
});
test('timeout fallback and concurrent duplicate suppression remain bounded',async()=>{
 const original=globalThis.fetch;let calls=0;let release;
 globalThis.fetch=async url=>{calls++;if(String(url).includes('workers.dev'))return Response.json({status:'browser_success',source:'browser',text:'test-only'});throw new DOMException('Timed out','TimeoutError');};
 try{const r=await query('list_courses',{},env);assert.equal(r.channels.api.status,'timeout');assert.equal(r.routing.used,'browser');assert.equal(calls,2);
 calls=0;globalThis.fetch=async()=>{calls++;await new Promise(resolve=>{release=resolve;});return Response.json([{id:1,name:'test-only'}]);};
 const first=query('list_courses',{channel:'api'},env),second=query('list_courses',{channel:'api'},env);release();const [a,b]=await Promise.all([first,second]);assert.equal(calls,1);assert.equal(a.count,1);assert.equal(b.deduplicated,true);
 }finally{globalThis.fetch=original;}
});

test('empty collections and a bounded partial crawl reuse refresh timestamps instead of rescanning',async()=>{
 const original=globalThis.fetch;let apiCalls=0,refreshed=0;
 globalThis.fetch=async(url,options)=>{
  const u=new URL(url);
  if(u.hostname.endsWith('workers.dev')){if(u.pathname==='/v1/index/update'){const d=JSON.parse(options.body);if(d.metadata_refresh_complete)refreshed=Date.now();return Response.json({status:'indexed'});}return Response.json({status:'index_success',metadata_refreshed_at:refreshed,results:[]});}
  apiCalls++;return Response.json(u.pathname.endsWith('/modules')?Array.from({length:31},(_,i)=>({id:i+1,name:'synthetic empty module'})):[]);
 };
 try{const first=await query('get_course_content',{course_id:98765,kind:'search',query:'synthetic'},env);assert.ok(first.refresh_errors.some(e=>e.startsWith('Metadata refresh capped')));assert.equal(apiCalls,32);const second=await query('get_course_content',{course_id:98765,kind:'search',query:'synthetic'},env);assert.equal(apiCalls,32);assert.equal(second.metadata_refresh_skipped,true);}finally{globalThis.fetch=original;}
});
