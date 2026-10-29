import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../node_modules/esbuild/lib/main.js';
import {seal} from './policy.mjs';
// Exercise actual service methods offline. Provider stubs throw if an acquisition is attempted.
const built=await build({entryPoints:[new URL('./service.mjs',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'offline-provider',setup(b){
 b.onResolve({filter:/^(cloudflare:workers|@cloudflare\/playwright)$/},a=>({path:a.path,namespace:'offline'}));
 b.onLoad({filter:/.*/,namespace:'offline'},a=>({contents:a.path==='cloudflare:workers'?`export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env;}}`:`export const acquire=async binding=>{const r=await binding.fetch('https://offline.invalid/acquire');if(!r.ok)throw Error('Unable to create new browser: code: '+r.status+': message: '+await r.text());return {sessionId:'synthetic'};}, launch=acquire, connect=async()=>({newBrowserCDPSession:async()=>({send:async()=>{}}),close:async()=>{}}),limits=acquire,history=acquire;`}));
}}]});
const {OwnerState}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
function context(map=new Map()){
 const storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>Array.isArray(k)?k.forEach(x=>map.delete(x)):map.delete(k),list:async({prefix})=>new Map([...map].filter(([k])=>k.startsWith(prefix))),deleteAlarm:async()=>{},setAlarm:async()=>{},transaction:async cb=>{const snapshot=structuredClone(map);try{return await cb(storage);}catch(e){map.clear();for(const [k,v]of snapshot)map.set(k,v);throw e;}}};return {storage,map};
}
const key=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const env={STATE_KEY:key,SESSION_TTL_HOURS:'24',CANVAS_USER_ID:'10001'};
const syntheticContext={storageState:async()=>({cookies:[{domain:'canvas.sydney.edu.au',name:'synthetic-only',value:'not-a-real-session',expires:-1}],origins:[]})};
test('actual service encrypted state survives new instance and closeLogin does not erase saved session',async()=>{
 const ctx=context(),a=new OwnerState(ctx,env);await a.persist(syntheticContext,true);
 assert.equal(JSON.stringify([...ctx.map.values()]).includes('not-a-real-session'),false);
 await ctx.storage.put('login',{session_id:'synthetic',expires_at:Date.now()+2000});await a.closeLogin();
 const b=new OwnerState(ctx,env),saved=await b.storedSession();assert.ok(saved);assert.equal(saved.state.cookies.length,1);assert.equal(await ctx.storage.get('login'),undefined);
 assert.equal((await ctx.storage.get('session_lifecycle')).at(-1).event,'human_login_saved');
});
test('expiry, school rejection and encryption fault remain distinguishable without browser calls',async()=>{
 const ctx=context(),a=new OwnerState(ctx,env);await a.persist(syntheticContext,true);
 await a.invalidateSession('school_session_expired');assert.equal((await ctx.storage.get('session_diagnostic')).reason,'school_session_expired');
 await ctx.storage.put('session',await seal({state:{cookies:[],origins:[]},expires_at:Date.now()-1},key,'canvas-session'));await a.storedSession();assert.equal((await ctx.storage.get('session_lifecycle')).at(-1).event,'local_session_expired');
 await ctx.storage.put('session',{iv:'bad',ciphertext:'bad'});await assert.rejects(a.storedSession(),/session_decryption_failed/);assert.ok(await ctx.storage.get('session'));assert.equal((await ctx.storage.get('session_lifecycle')).at(-1).event,'session_decryption_failed');
});
test('empty state and failed transaction preserve previous credential record',async()=>{
 const ctx=context(),a=new OwnerState(ctx,env);await a.persist(syntheticContext,true);const old=structuredClone(await ctx.storage.get('session'));
 await assert.rejects(a.persist({storageState:async()=>({cookies:[],origins:[]})}),/empty_canvas_state_rejected/);assert.deepEqual(await ctx.storage.get('session'),old);
 const put=ctx.storage.put;ctx.storage.put=async(k,v)=>{if(k==='last_verified_at')throw Error('synthetic write failure');return put(k,v);};
 await assert.rejects(a.persist(syntheticContext),/synthetic write failure/);assert.deepEqual(await ctx.storage.get('session'),old);
});
test('quota guard rejects new login before provider acquisition and resets stale diagnostics',async()=>{
 const ctx=context(),a=new OwnerState(ctx,env);await ctx.storage.put('browser_backoff',{retry_at:Date.now()+60000});a.lastRateLimit={retry_after:'999999'};
 const r=await a.handle(new Request('https://service.local/v1/login/start',{method:'POST',body:'{}'}));const x=await r.json();assert.equal(x.status,'quota_exceeded');assert.equal(r.status,429);assert.equal(await ctx.storage.get('browser_counters'),undefined);assert.equal(a.lastRateLimit,undefined);
});
test('generic 429 retains exact Retry-After without claiming daily quota; explicit daily error is separate',async()=>{
 for(const [message,daily] of [['Rate limit exceeded',false],['Browser time limit exceeded for today',true]]){
  let calls=0;const ctx=context(),a=new OwnerState(ctx,{...env,BROWSER:{fetch:async()=>{calls++;return new Response(message,{status:429,headers:{'Retry-After':'120'}});}}});
  const r=await a.handle(new Request('https://service.local/v1/login/start',{method:'POST',body:'{}'})),x=await r.json();
  assert.equal(calls,1);assert.equal(r.status,429);assert.equal(x.upstream_http_status,429);assert.equal(x.rate_limit.retry_after,'120');assert.equal(x.rate_limit.provider_error,message);assert.equal(x.vendor_daily_quota_message,daily);assert.equal(x.automatic_retries,0);
  assert.equal((await ctx.storage.get('last_browser_failure')).category,daily?'daily_browser_time':'acquisition_rate_or_quota');
  const again=await a.handle(new Request('https://service.local/v1/login/start',{method:'POST',body:'{}'}));const blocked=await again.json();assert.equal(calls,1);assert.equal(again.status,429);assert.equal(blocked.attempts,0);assert.equal(blocked.rate_limit.retry_after,'120');assert.equal(blocked.rate_limit.provider_error,message);
 }
});
test('local acquisition cooldown makes zero upstream calls, and failed login view immediately closes acquired session',async()=>{
 let calls=0;const ctx=context(),a=new OwnerState(ctx,{...env,BROWSER:{fetch:async()=>{calls++;return Response.json({});}}});
 await ctx.storage.put('browser_counters',{attempts:1,successes:1,last_attempt_at:new Date().toISOString()});
 const request=()=>new Request('https://service.local/v1/login/start',{method:'POST',body:'{}'});
 const deferred=await (await a.handle(request())).json();assert.equal(deferred.status,'local_rate_wait');assert.equal(deferred.attempts,0);assert.equal(calls,0);
 await ctx.storage.put('browser_counters',{attempts:1,successes:1,last_attempt_at:new Date(Date.now()-21000).toISOString()});
 await a.handle(request());assert.equal(calls,1);assert.equal(await ctx.storage.get('login'),undefined);assert.equal((await ctx.storage.get('last_browser_release')).confirmed,true);
});

test('overlapping phone and desktop progress share one credential action and independent responses',async()=>{
 const service=new OwnerState(context(),env);let finish,calls=0;
 service.progressLoginOnce=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
 const first=service.progressLogin(),second=service.progressLogin();assert.equal(calls,1);
 finish(Response.json({status:'autofill_progress',phase:'push'}));
 const [a,b]=await Promise.all([first,second]);assert.deepEqual(await a.json(),await b.json());assert.equal(service.loginProgress,null);
});

test('status shares only pending-window metadata and never launches browser or exports its identifier',async()=>{
 const ctx=context();await ctx.storage.put('login',{session_id:'synthetic-secret-session',expires_at:Date.now()+240000,autofill_enabled:true});
 const service=new OwnerState(ctx,env);const result=await service.handle(new Request('https://service.test/v1/status',{method:'POST',body:'{}'}));const value=await result.json();
 assert.equal(value.login_pending.autofill_enabled,true);assert.equal(value.login_pending.manual_selected,false);assert.equal(JSON.stringify(value).includes('synthetic-secret-session'),false);assert.equal(value.local_acquisition_counters,null);
});

test('legacy challenge-detected flag never becomes claimed phone display or delivery',async()=>{
 const ctx=context();await ctx.storage.put('autofill_event',{status:'mfa_required',challenge_displayed:true});
 const result=await new OwnerState(ctx,env).autofillStatus();assert.equal(result.challenge_detected,true);assert.equal(result.challenge_displayed,undefined);assert.equal(result.phone_display,'unverified');assert.equal(result.phone_delivery,'unverified');
});

test('new source route executes through the existing outer queue without waiting on itself',async()=>{
 const service=new OwnerState(context(),{...env,BROWSER:{fetch:async()=>new Response('synthetic blocked provider',{status:503})}});await service.persist(syntheticContext,true);
 let timer;try{const response=await Promise.race([service.fetch(new Request('https://service.invalid/v1/sources/student-portal',{method:'POST',body:JSON.stringify({course_id:101,consent:true,fresh:true})})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Queue deadlock')),500);})]);assert.equal((await response.json()).status,'browser_error');}finally{clearTimeout(timer);}
});
