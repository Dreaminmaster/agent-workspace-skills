import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredAutofill,eligibleAutofill,advanceAutofill} from './autofill.mjs';
const env={SSO_AUTOFILL_ENABLED:'1',SSO_USERNAME:'synthetic-user',SSO_PASSWORD:'synthetic-password-only'};
const fresh=()=>({expires_at:Date.now()+60000,autofill_enabled:true,autofill_counts:{}});
test('password autofill requires provider flag, both Secrets and per-window owner opt-in',async()=>{
 assert.equal(await configuredAutofill({}),false);assert.equal(await configuredAutofill({...env,SSO_AUTOFILL_ENABLED:'0'}),false);
 assert.equal(await eligibleAutofill({...fresh(),autofill_enabled:false},env),false);assert.equal(await eligibleAutofill(fresh(),env),true);
});
test('foreign origins and disabled feature never receive any evaluation or secret',async()=>{
 for(const [url,settings]of [['https://sso.sydney.edu.au.evil.test/',env],['https://canvas.sydney.edu.au/',env],['https://sso.sydney.edu.au/',{}]]){
  let calls=0;const r=await advanceAutofill({url:()=>url,evaluate:async()=>{calls++;}},fresh(),settings,async()=>{});assert.equal(r.status,'manual_login');assert.equal(calls,0);
 }
});
test('reserves actions before transmission; inspection and checkpoint contain no secret; failure never returns it',async()=>{
 let evals=0,checkpointed=false;const login=fresh();const page={url:()=> 'https://sso.sydney.edu.au/',evaluate:async(fn,arg)=>{
  evals++;if(evals===1){assert.equal(arg.password,undefined);assert.equal(arg.username,undefined);return {phase:'password'};}
  assert.ok(checkpointed);assert.equal(arg.password,env.SSO_PASSWORD);assert.equal(arg.username,undefined);throw Error(env.SSO_PASSWORD);
 }};
 const r=await advanceAutofill(page,login,env,async state=>{assert.equal(JSON.stringify(state).includes(env.SSO_PASSWORD),false);checkpointed=true;});
 assert.equal(r.status,'manual_login');assert.equal(JSON.stringify(r).includes(env.SSO_PASSWORD),false);assert.equal(login.autofill_counts.password,1);assert.equal(login.autofill_stopped,true);
});
test('MFA display never invokes approval or stores the confirmation number',async()=>{
 let evaluated=0,writes=0;const login=fresh(),r=await advanceAutofill({url:()=> 'https://sso.sydney.edu.au/',evaluate:async()=>{evaluated++;return {phase:'mfa_wait',confirmation_number:'42'};}},login,env,async()=>writes++);
 assert.equal(r.status,'mfa_required');assert.equal(r.confirmation_number,'42');assert.equal(evaluated,1);assert.equal(writes,0);assert.equal(JSON.stringify(login).includes('42'),false);
});
test('unknown form fails closed without submitting credentials or repeating actions',async()=>{
 let calls=0;const login=fresh(),page={url:()=> 'https://sso.sydney.edu.au/',evaluate:async()=>{calls++;return {phase:'manual'};}};
 assert.equal((await advanceAutofill(page,login,env,async()=>{})).status,'manual_login');await advanceAutofill(page,login,env,async()=>{});assert.equal(calls,1);
});

test('actual DOM guards reject password-reset, enrolment, unknown headings and foreign form actions',async()=>{
 for(const [path,heading,action]of [['/reset_password','Sign In','/'],['/login','Reset Password','/'],['/login','Enroll Okta Verify','/'],['/login','Sign In','https://evil.invalid/']]){
  let inspect=0,transmit=0;const form={closest:()=>({}),getAttribute:()=>action,querySelectorAll:()=>[{disabled:false,getClientRects:()=>[1]}]};
  const field={type:'text',id:'okta-signin-username',disabled:false,getClientRects:()=>[1],closest:()=>form};
  const document={querySelector:()=>({textContent:heading}),querySelectorAll:s=>s.includes('okta-signin-username')?[field]:[]};
  const page={url:()=> 'https://sso.sydney.edu.au'+path,evaluate:async(fn,arg)=>{inspect++;if(arg.password||arg.username)transmit++;return vm.runInNewContext('('+fn.toString()+')(arg)',{arg,document,location:{origin:'https://sso.sydney.edu.au',href:'https://sso.sydney.edu.au'+path,pathname:path},URL});}};
  const r=await advanceAutofill(page,fresh(),env,async()=>{});assert.equal(r.status,'manual_login');assert.equal(inspect,1);assert.equal(transmit,0);
 }
});

test('Secrets Store health reads only enable flag, never username or password values',async()=>{
 let flag=0,user=0,password=0;const bindings={SSO_AUTOFILL_ENABLED:{get:async()=>{flag++;return '1';}},SSO_USERNAME:{get:async()=>{user++;return 'synthetic-user';}},SSO_PASSWORD:{get:async()=>{password++;return 'synthetic-password';}}};
 assert.equal(await configuredAutofill(bindings),true);assert.equal(flag,1);assert.equal(user,0);assert.equal(password,0);
 bindings.SSO_AUTOFILL_ENABLED.get=async()=>{throw Error('synthetic unavailable');};assert.equal(await configuredAutofill(bindings),false);assert.equal(password,0);
});
test('Secrets Store password fetched only at approved action, never exported or cached',async()=>{
 let password=0,evaluations=0;const bindings={SSO_AUTOFILL_ENABLED:{get:async()=> '1'},SSO_USERNAME:{get:async()=>{throw Error('username must not be read for password-only step');}},SSO_PASSWORD:{get:async()=>{password++;return 'synthetic-pass';}}};
 const login=fresh(),r=await advanceAutofill({url:()=> 'https://sso.sydney.edu.au/',evaluate:async(fn,arg)=>{evaluations++;if(evaluations===1)return {phase:'password'};assert.equal(arg.password,'synthetic-pass');return true;}},login,bindings,async()=>{});
 assert.equal(r.status,'autofill_progress');assert.equal(password,1);assert.equal(JSON.stringify(login).includes('synthetic-pass'),false);assert.equal(JSON.stringify(r).includes('synthetic-pass'),false);
});

function factorDOM({heading="Verify it's you with a security method",label='Okta Verify',duplicates=false,action='/login',push=false}={}){
 let clicks=0;
 const visible={disabled:false,getClientRects:()=>[1]};
 const form={...visible,getAttribute:()=>action,closest:()=>({}),querySelectorAll:()=>[button]};
 const button={...visible,tagName:'A',textContent:push?'Send push':'Select',closest:()=>form,click(){clicks++;}};
 const row={...visible,querySelector:()=>({textContent:label}),querySelectorAll:()=>[button]};
 const document={querySelector:()=>({textContent:heading}),querySelectorAll:s=>s==='.authenticator-verify-list .authenticator-row'?(push?[]:duplicates?[row,row]:[row]):s==='form'?[form]:s==='form button,form input[type="submit"],form a'?[button]:[]};
 return {document,get clicks(){return clicks;}};
}
function domPage(dom){return {url:()=> 'https://sso.sydney.edu.au/login',evaluate:async(fn,arg)=>vm.runInNewContext('('+fn.toString()+')(arg)',{arg,document:dom.document,location:{origin:'https://sso.sydney.edu.au',href:'https://sso.sydney.edu.au/login',pathname:'/login'},URL})};}
test('official verify list selects only unique existing Okta Verify, once, with no credential retrieval',async()=>{
 const dom=factorDOM(),login=fresh();const noCredentials={...env,SSO_USERNAME:{get(){throw Error('unexpected username retrieval');}},SSO_PASSWORD:{get(){throw Error('unexpected password retrieval');}}};
 assert.equal((await advanceAutofill(domPage(dom),login,noCredentials,async()=>{})).phase,'verify');assert.equal(dom.clicks,1);
 assert.equal((await advanceAutofill(domPage(dom),login,noCredentials,async()=>{})).status,'autofill_wait');assert.equal(dom.clicks,1);
});
test('factor selection refuses enrollment, duplicates, other factors and foreign form actions',async()=>{
 for(const options of [{heading:'Set up security methods'},{duplicates:true},{label:'Google Authenticator'},{action:'https://evil.invalid/'}]){
  const dom=factorDOM(options);assert.equal((await advanceAutofill(domPage(dom),fresh(),env,async()=>{})).status,'manual_login');assert.equal(dom.clicks,0);
 }
});
test('official push title sends once; pending push waits for human without resend',async()=>{
 const dom=factorDOM({heading:'Get a push notification',push:true}),login=fresh();
 assert.equal((await advanceAutofill(domPage(dom),login,env,async()=>{})).phase,'push');assert.equal(dom.clicks,1);
 assert.equal((await advanceAutofill(domPage(dom),login,env,async()=>{})).status,'mfa_required');assert.equal(dom.clicks,1);
});

test('official v3 layout and curly apostrophe heading select Okta Verify once',async()=>{
 const base=factorDOM({heading:'Verify it’s you with a security method'});let clicks=0;
 const form={getAttribute:()=>'/login',closest:()=>({})};
 const button={disabled:false,getClientRects:()=>[1],closest:()=>form,querySelector:()=>({textContent:'Okta Verify'}),click(){clicks++;}};
 const original=base.document.querySelectorAll;
 base.document.querySelectorAll=s=>s==='[data-se="authenticator-verify-list"] [data-se="authenticator-button"]'?[button]:s==='.authenticator-verify-list .authenticator-row'?[]:original(s);
 const login=fresh();const first=await advanceAutofill(domPage(base),login,env,async()=>{});assert.equal(first.phase,'verify_v3');assert.equal(clicks,1);
 assert.equal((await advanceAutofill(domPage(base),login,env,async()=>{})).status,'autofill_wait');assert.equal(clicks,1);
});

test('official combined Okta push-method row selects only matching push and never resends',async()=>{
 let clicks=0;const form={getAttribute:()=>'/login',closest:()=>({})};
 const row={querySelector:()=>({textContent:'Get a push notification'})};
 const button={disabled:false,getClientRects:()=>[1],closest:s=>s==='form'?form:row,click(){clicks++;}};
 const document={querySelector:()=>({textContent:"Verify it's you with a security method"}),querySelectorAll:s=>s==='.authenticator-verify-list [data-se="okta_verify-push"] .select-factor'?[button]:[]};
 const login=fresh(),page=domPage({document});assert.equal((await advanceAutofill(page,login,env,async()=>{})).phase,'verify_push');assert.equal(clicks,1);
 assert.equal((await advanceAutofill(page,login,env,async()=>{})).status,'autofill_wait');assert.equal(clicks,1);
});
