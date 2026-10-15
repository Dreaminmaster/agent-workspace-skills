import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loginFeedback,loginFlowScript} from './login-feedback.mjs';
import {browserRoute,browserService} from './browser.mjs';
const now=Date.parse('2026-10-12T03:58:44.093Z'),deadline='2026-10-13T00:00:00.093Z';
const quota={status:'quota_exceeded',retry_at:deadline,rate_limit:{retry_after:'72076',provider_error:'Rate limit exceeded'}};
test('exact 429 feedback and cooldown also survive stored status and HTTP 502 wrapping',()=>{
 for(const [data,http] of [[quota,429],[quota,502],[{status:'requires_login',browser_retry_at:deadline,last_browser_failure:{rate_limit:quota.rate_limit}},200]]){
  const x=loginFeedback(data,http,now);assert.equal(x.blocked,true);assert.equal(x.retryAt,Date.parse(deadline));assert.match(x.text,/72076/);assert.match(x.text,/不是学校账号或密码错误/);assert.match(x.text,/11:00:00/);assert.match(x.text,/不保证/);
 }
 assert.equal(loginFeedback({status:'requires_login'},200,now).blocked,false);
 assert.doesNotMatch(loginFeedback({status:'local_rate_wait',retry_at:deadline},200,now).text,/HTTP 429/);
 assert.match(loginFeedback({status:'requires_login',login_diagnostic:{authentication_state:'login_window_expired'}},200,now).text,/超时/);
});
test('Site preserves structured provider HTTP 429 and returns retry headers to its owner UI',async()=>{
 const saved=globalThis.fetch;globalThis.fetch=async()=>Response.json(quota,{status:429,headers:{'Retry-After':'72076'}});
 try{
  const env={BROWSER_SERVICE_KEY:'synthetic-only',BROWSER_SERVICE_URL:'https://canvas-browser.example.workers.dev'};
  const bridged=await browserService(env,'/v1/login/start');assert.equal(bridged.service_http_status,429);assert.equal(bridged.rate_limit.retry_after,'72076');
  const r=await browserRoute(new Request('https://canvas-study.example.chatgpt.site/browser/start',{method:'POST',headers:{Origin:'https://canvas-study.example.chatgpt.site','X-Canvas-UI':'1'}}),env);assert.equal(r.status,429);assert.ok(r.headers.get('Retry-After'));assert.equal((await r.json()).rate_limit.provider_error,'Rate limit exceeded');
 }finally{globalThis.fetch=saved;}
});
function harness(responses){
 const ids=['autostart','result','live','start','complete','cancel','status','revoke','read','evidence','autoresume','autoverify','taskid','loginclock','autofill','manual','freshlogin','autofilllabel'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{textContent:'',value:'',checked:true,style:{},removeAttribute(){},scrollIntoView(){}}]));
 nodes.autofill.checked=false;nodes.freshlogin.checked=false;
 let calls=[],timeouts=[],intervals=[],resume=0,disconnect=0,now=Date.now();class Clock extends Date{static now(){return now;}}
 const ctx={document:{getElementById:id=>nodes[id],hidden:false,addEventListener(){}},window:{CanvasPhoneInput:{connect(){},disconnect(){disconnect++;}},CanvasResumeTask:async()=>{resume++;},addEventListener(){}},fetch:async path=>{calls.push(path);return Response.json(responses.shift());},Date:Clock,URL,JSON,Number,Error,AbortSignal,setInterval(fn){intervals.push(fn);},setTimeout(fn){timeouts.push(fn);return timeouts.length;},clearTimeout(){}};
 vm.runInNewContext(loginFlowScript,ctx);
 const settle=()=>new Promise(r=>setImmediate(r));
 return {nodes,calls,timeouts,settle,advance(ms){now+=ms;for(const fn of intervals)fn();},get resume(){return resume;},get disconnect(){return disconnect;}};
}
test('finally never reenables start during quota; button click makes zero repeated requests',async()=>{
 const future={...quota,retry_at:new Date(Date.now()+72076000).toISOString()};
 const h=harness([future]);await h.settle();assert.equal(h.nodes.start.disabled,true);await h.nodes.start.onclick();assert.equal(h.calls.length,1);assert.match(h.nodes.result.textContent,/72076/);
});
test('login detection only completes the existing window and resumes selected task once',async()=>{
 const h=harness([{status:'requires_login'},{status:'requires_login',live_url:'synthetic-not-a-real-link',expires_at:Date.now()+240000},{status:'authenticated',expires_at:Date.now()+3600000}]);
 await h.settle();h.nodes.taskid.value='00000000-0000-4000-8000-000000000001';await h.nodes.start.onclick();assert.equal(h.timeouts.length,2);await h.timeouts[0]();await h.settle();assert.deepEqual(h.calls,['/browser/status','/browser/start','/browser/complete']);assert.equal(h.resume,1);assert.equal(h.disconnect,1);
});
test('generated page scripts parse and owner UI exposes errors before school frame',async()=>{
 const response=await browserRoute(new Request('https://canvas-study.example.chatgpt.site/browser'),{});
 const html=await response.text();for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 assert.ok(html.indexOf('id="result"')<html.indexOf('id="schoolframe"'));assert.match(html,/id="autoresume" type="checkbox" disabled/);assert.match(html,/id="autoverify" type="checkbox" disabled/);
});

test('production safety switches perform no completion polling or automatic task resume',async()=>{
 const h=harness([{status:'requires_login'},{status:'requires_login',live_url:'synthetic',expires_at:Date.now()+240000},{status:'authenticated'}]);
 await h.settle();for(const id of ['autoverify','autoresume']){h.nodes[id].checked=false;h.nodes[id].disabled=true;}
 h.nodes.taskid.value='00000000-0000-4000-8000-000000000001';await h.nodes.start.onclick();assert.equal(h.timeouts.length,1);assert.equal(h.calls.length,2);await h.nodes.complete.onclick();assert.equal(h.resume,0);
});

test('manual login expiry countdown works with experimental switches off and makes zero extra requests',async()=>{
 const h=harness([{status:'requires_login'},{status:'requires_login',live_url:'synthetic',expires_at:Date.now()+240000}]);await h.settle();
 h.nodes.autoverify.disabled=true;h.nodes.autoverify.checked=false;await h.nodes.start.onclick();assert.equal(h.nodes.loginclock.hidden,false);assert.match(h.nodes.loginclock.textContent,/剩余/);
 h.advance(241000);assert.match(h.nodes.result.textContent,/窗口已到期/);assert.equal(h.disconnect,1);assert.equal(h.nodes.loginclock.hidden,true);assert.deepEqual(h.calls,['/browser/status','/browser/start']);
 h.advance(2000);assert.equal(h.disconnect,1);assert.equal(h.calls.length,2);
});

test('explicit one-click automatic login requires configured Secrets, uses existing SSO recovery and obeys quota',async()=>{
 const h=harness([{status:'authenticated',autofill_configured:true},{status:'requires_login',live_url:'synthetic',expires_at:Date.now()+240000}]);await h.settle();h.nodes.freshlogin.checked=true;
 assert.equal(h.nodes.autostart.disabled,false);await h.nodes.autostart.onclick();assert.equal(h.nodes.autofill.checked,true);assert.equal(h.nodes.freshlogin.checked,false);assert.deepEqual(h.calls,['/browser/status','/browser/start']);
 const limited=harness([{...quota,autofill_configured:true,retry_at:new Date(Date.now()+3600000).toISOString()}]);await limited.settle();await limited.nodes.autostart.onclick();assert.equal(limited.calls.length,1);assert.equal(limited.nodes.autostart.disabled,true);
});

test('phone reload attaches to existing opted-in login without start and ignores old saved status until new login finishes',async()=>{
 const h=harness([{status:'authenticated',verification:'last_saved_only',autofill_configured:true,login_pending:{expires_at:Date.now()+240000,autofill_enabled:true,manual_selected:false}},{status:'mfa_required'}]);await h.settle();
 assert.match(h.nodes.result.textContent,/接入现有/);assert.equal(h.nodes.autoverify.checked,true);assert.equal(h.disconnect,0);assert.equal(h.resume,0);
 await h.timeouts[0]();await h.settle();assert.deepEqual(h.calls,['/browser/status','/browser/progress']);assert.match(h.nodes.result.textContent,/不证明通知已送达/);
});
test('quota or manual switch prevents automatic phone attachment',async()=>{
 for(const extra of [{status:'quota_exceeded',retry_at:new Date(Date.now()+3600000).toISOString()},{status:'authenticated',login_pending:{expires_at:Date.now()+240000,autofill_enabled:true,manual_selected:true}}]){
  const h=harness([{autofill_configured:true,...extra}]);await h.settle();assert.equal(h.timeouts.length,0);assert.equal(h.calls.length,1);
 }
});

test('phone opened before desktop start discovers existing window through metadata only',async()=>{
 const h=harness([{status:'authenticated',autofill_configured:true},{status:'authenticated',autofill_configured:true,login_pending:{expires_at:Date.now()+240000,autofill_enabled:true,manual_selected:false}},{status:'mfa_required'}]);await h.settle();assert.equal(h.timeouts.length,1);
 await h.timeouts[0]();await h.settle();assert.match(h.nodes.result.textContent,/接入现有/);await h.timeouts[1]();await h.settle();assert.deepEqual(h.calls,['/browser/status','/browser/status','/browser/progress']);assert.equal(h.resume,0);
});
test('window discovery is bounded to eight metadata checks and old saved status never resumes a new-login task',async()=>{
 const h=harness(Array.from({length:9},()=>({status:'authenticated',autofill_configured:true})));await h.settle();h.nodes.taskid.value='00000000-0000-4000-8000-000000000002';h.nodes.autoresume.checked=true;
 for(let i=0;i<8;i++){await h.timeouts[i]();await h.settle();}
 assert.equal(h.timeouts.length,8);assert.equal(h.calls.length,9);assert.ok(h.calls.every(p=>p==='/browser/status'));assert.equal(h.resume,0);
});
