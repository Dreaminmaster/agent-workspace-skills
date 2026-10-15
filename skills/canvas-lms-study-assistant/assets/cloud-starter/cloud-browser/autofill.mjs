// Fixed SSO actions only. No password/OTP/cookie reads, logging, screenshots or arbitrary browser tools.
export const SSO_ORIGIN='https://sso.sydney.edu.au';
const hasSecret=value=>typeof value==='string'?!!value:typeof value?.get==='function';
async function secretValue(value){const result=typeof value==='string'?value:await value?.get?.();return typeof result==='string'?result:undefined;}
export async function configuredAutofill(env){try{return (await secretValue(env.SSO_AUTOFILL_ENABLED))?.trim()==='1'&&hasSecret(env.SSO_USERNAME)&&hasSecret(env.SSO_PASSWORD);}catch{return false;}}
export async function eligibleAutofill(login,env){return (await configuredAutofill(env))&&login?.autofill_enabled===true&&login.expires_at>Date.now()&&!login.autofill_stopped;}
export async function advanceAutofill(page,login,env,checkpoint){
 if(!await eligibleAutofill(login,env))return {status:'manual_login',reason:'Autofill disabled or Secrets missing. Use the existing manual login.'};
 if(new URL(page.url()).origin!==SSO_ORIGIN)return {status:'manual_login',reason:'No credential action outside the exact school SSO origin.'};
 // Inspection/action share one synchronous DOM execution, avoiding a navigation between origin check and fill.
 // Only fixed known widget fields and controls are eligible; never take instructions from webpage text.
 const action=await page.evaluate(({origin,counts})=>{
  if(location.origin!==origin||/recovery|reset|enroll|settings|unlock|register|activate|change.password/i.test(location.pathname))return {phase:'manual'};
  const heading=document.querySelector('[data-se="o-form-head"],.o-form-head')?.textContent?.trim().replace(/[’‘]/g,"'").replace(/\s+/g,' ')||'';
  const signIn=/^(Sign In|Sign in|登录)$/.test(heading),passwordCheck=/^(Verify with your password|Enter your password|使用密码验证|输入密码)$/.test(heading);
  const visible=e=>!!e&&e.getClientRects().length>0&&!e.disabled;
  const unique=selector=>{const es=[...document.querySelectorAll(selector)].filter(visible);return es.length===1?es[0]:null;};
  const goodForm=e=>{const f=e?.closest('form');if(!f)return false;const u=new URL(f.getAttribute('action')||location.href,location.href);return u.origin===origin&&!!f.closest('#okta-sign-in, [data-se="o-form"], .okta-sign-in');};
  const user=unique('#okta-signin-username, input[name="identifier"]');
  const pass=unique('#okta-signin-password, input[name="credentials.passcode"][type="password"]');
  const submitFor=e=>{const controls=[...e.closest('form').querySelectorAll('input[type="submit"],button[type="submit"]')].filter(visible);return controls.length===1?controls[0]:null;};
  if(user){if(!signIn||!goodForm(user)||!['text','email'].includes(user.type))return {phase:'manual'};if(counts.username)return {phase:'wait'};const submit=submitFor(user);if(!submit)return {phase:'manual'};
   if(pass){if(!goodForm(pass)||pass.closest('form')!==user.closest('form'))return {phase:'manual'};if(counts.password)return {phase:'wait'};return {phase:'credentials',selectors:{user:user.id?'#okta-signin-username':'input[name="identifier"]',pass:pass.id?'#okta-signin-password':'input[name="credentials.passcode"][type="password"]'}};}
   return {phase:'username'};
  }
  if(pass){if(!(signIn||passwordCheck)||!goodForm(pass)||!submitFor(pass))return {phase:'manual'};if(counts.password)return {phase:'wait'};return {phase:'password'};}
  if(!/^(Verify with Okta Verify|Okta Verify|Verify it’s you|Verify it's you|Verify it's you with a security method|Select an authenticator|Select verification method|Get a push notification|Push notification sent)$/.test(heading))return {phase:'manual'};
  const method=unique('.authenticator-verify-list [data-se="okta_verify-push"] .select-factor');
  if(method){const row=method.closest('.authenticator-row');if(goodForm(method)&&row?.querySelector('.authenticator-label')?.textContent?.trim()==='Get a push notification')return {phase:counts.select?'wait':'verify_push'};return {phase:'manual'};}
  const choices=[...document.querySelectorAll('.authenticator-verify-list .authenticator-row')].filter(visible).filter(row=>row.querySelector('.authenticator-label')?.textContent?.trim()==='Okta Verify');
  if(choices.length>1)return {phase:'manual'};
  if(choices.length===1){const buttons=[...choices[0].querySelectorAll('.select-factor')].filter(visible).filter(goodForm);return {phase:buttons.length===1?(counts.verify?'wait':'verify'):'manual'};}
  const v3=[...document.querySelectorAll('[data-se="authenticator-verify-list"] [data-se="authenticator-button"]')].filter(visible).filter(b=>b.querySelector('[data-se="authenticator-button-label"]')?.textContent?.trim()==='Okta Verify');
  if(v3.length>1)return {phase:'manual'};
  if(v3.length===1)return {phase:goodForm(v3[0])?(counts.verify?'wait':'verify_v3'):'manual'};
  const number=unique('[data-se="challenge-number"], [data-se="number-challenge"], .number-challenge, [data-se="numberchallenge-instr-value"]');
  if(number&&/^\d{1,3}$/.test(number.textContent.trim()))return {phase:'mfa_wait',confirmation_number:number.textContent.trim()};
  const forms=[...document.querySelectorAll('form')].filter(visible).filter(f=>{const u=new URL(f.getAttribute('action')||location.href,location.href);return u.origin===origin&&!!f.closest('#okta-sign-in, [data-se="o-form"], .okta-sign-in');});
  const buttons=forms.flatMap(f=>[...f.querySelectorAll('button,input[type="submit"],a')].filter(visible));
  const label=b=>(b.tagName==='INPUT'?b.getAttribute('value'):b.textContent||'').trim();
  const push=buttons.filter(b=>/^(Send push|Send Push|Send push notification|发送推送|发送推送通知)$/.test(label(b)));
  if(push.length===1&&!counts.push)return {phase:'push'};
  const select=buttons.filter(b=>/^(Get a push notification|Receive a push notification|获取推送通知)$/.test(label(b)));
  if(select.length===1&&!counts.select)return {phase:'select_push'};
  if(counts.push||heading==='Push notification sent')return {phase:'mfa_wait'};
  if((select.length===1&&counts.select)||(push.length===1&&counts.push))return {phase:'wait'};
  return {phase:'manual'};
 },{origin:SSO_ORIGIN,counts:login.autofill_counts||{}});
 if(action.phase==='wait')return {status:'autofill_wait',reason:'Waiting for the previous school step; no repeated credential or push submission.'};
 if(action.phase==='mfa_wait')return {status:'mfa_required',confirmation_number:action.confirmation_number,reason:'Approve only your own school challenge in Okta Verify. No automatic approval.'};
 if(action.phase==='manual'){login.autofill_stopped=true;await checkpoint(login);return {status:'manual_login',reason:'Form not recognized or already attempted; use manual login. No repeated password or push attempt.'};}
 const counts=login.autofill_counts||{};
 const fields=action.phase==='credentials'?['username','password']:['select_push','verify_push'].includes(action.phase)?['select']:action.phase==='verify_v3'?['verify']: [action.phase];
 // Reserve before any credential or push action; crashes cannot cause an automatic resubmission.
 login.autofill_counts={...counts};for(const f of fields)login.autofill_counts[f]=1;await checkpoint(login);
 let accepted=false;
 try {const username=fields.includes('username')?await secretValue(env.SSO_USERNAME):undefined,password=fields.includes('password')?await secretValue(env.SSO_PASSWORD):undefined;
 if((fields.includes('username')&&!username)||(fields.includes('password')&&!password))throw Error('Credential binding unavailable');
 accepted=await page.evaluate(({origin,phase,username,password})=>{
  if(location.origin!==origin||/recovery|reset|enroll|settings|unlock|register|activate|change.password/i.test(location.pathname))return false;
  const heading=document.querySelector('[data-se="o-form-head"],.o-form-head')?.textContent?.trim().replace(/[’‘]/g,"'").replace(/\s+/g,' ')||'';
  const signIn=/^(Sign In|Sign in|登录)$/.test(heading),passwordCheck=/^(Verify with your password|Enter your password|使用密码验证|输入密码)$/.test(heading);
  const visible=e=>!!e&&e.getClientRects().length>0&&!e.disabled;
  const unique=s=>{const a=[...document.querySelectorAll(s)].filter(visible);return a.length===1?a[0]:null;};
  const user=unique('#okta-signin-username, input[name="identifier"]'),pass=unique('#okta-signin-password, input[name="credentials.passcode"][type="password"]');
  const set=(e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
  const valid=e=>{const f=e?.closest('form');if(!f)return null;const u=new URL(f.getAttribute('action')||location.href,location.href);if(u.origin!==origin||!f.closest('#okta-sign-in, [data-se="o-form"], .okta-sign-in'))return null;return f;};
  if(['username','password','credentials'].includes(phase)){
   const e=phase==='password'?pass:user,f=valid(e);if((phase==='password'?!(signIn||passwordCheck):!signIn)||!f||(['username','credentials'].includes(phase)&&!['text','email'].includes(user.type))||(['password','credentials'].includes(phase)&&(!pass||pass.type!=='password'||valid(pass)!==f)))return false;
   const submits=[...f.querySelectorAll('input[type="submit"],button[type="submit"]')].filter(visible);if(submits.length!==1)return false;
   if(phase!=='password')set(user,username);if(phase!=='username')set(pass,password);submits[0].click();return true;
  }
  if(!/^(Verify with Okta Verify|Okta Verify|Verify it’s you|Verify it's you|Verify it's you with a security method|Select an authenticator|Select verification method|Get a push notification|Push notification sent)$/.test(heading))return false;
  if(phase==='verify_push'){
   const method=unique('.authenticator-verify-list [data-se="okta_verify-push"] .select-factor');
   if(!method||!valid(method)||method.closest('.authenticator-row')?.querySelector('.authenticator-label')?.textContent?.trim()!=='Get a push notification')return false;
   method.click();return true;
  }
  if(phase==='verify_v3'){
   const choices=[...document.querySelectorAll('[data-se="authenticator-verify-list"] [data-se="authenticator-button"]')].filter(visible).filter(b=>valid(b)&&b.querySelector('[data-se="authenticator-button-label"]')?.textContent?.trim()==='Okta Verify');
   if(choices.length!==1)return false;choices[0].click();return true;
  }
  if(phase==='verify'){
   const rows=[...document.querySelectorAll('.authenticator-verify-list .authenticator-row')].filter(visible).filter(row=>row.querySelector('.authenticator-label')?.textContent?.trim()==='Okta Verify');
   if(rows.length!==1)return false;const choices=[...rows[0].querySelectorAll('.select-factor')].filter(visible).filter(valid);
   if(choices.length!==1)return false;choices[0].click();return true;
  }
  const pattern=phase==='push'?/^(Send push|Send Push|Send push notification|发送推送|发送推送通知)$/:/^(Get a push notification|Receive a push notification|获取推送通知)$/;
  const buttons=[...document.querySelectorAll('form button,form input[type="submit"],form a')].filter(visible).filter(b=>valid(b)&&pattern.test((b.tagName==='INPUT'?b.getAttribute('value'):b.textContent||'').trim()));
  if(buttons.length!==1)return false;buttons[0].click();return true;
 },{origin:SSO_ORIGIN,phase:action.phase,username,password});}catch{/* Deliberately discard provider/DOM exceptions that could contain credentials. */}
 if(!accepted){login.autofill_stopped=true;await checkpoint(login);return {status:'manual_login',reason:'Autofill was not confirmed; use manual login. No retry.'};}
 return {status:'autofill_progress',phase:action.phase,reason:'One fixed school action sent. MFA approval remains manual.'};
}

// Fixed structural metadata only: no DOM export, field values, number text or arbitrary headings.
export async function schoolFormProfile(page){
 if(new URL(page.url()).origin!==SSO_ORIGIN)return {origin_allowed:false};
 return page.evaluate(()=>{
  if(location.origin!=='https://sso.sydney.edu.au')return {origin_allowed:false};
  const visible=e=>e.getClientRects().length>0&&!e.disabled;
  const count=s=>[...document.querySelectorAll(s)].filter(visible).length;
  const known=["Sign In","Verify with your password","Verify it's you","Verify it's you with a security method","Select an authenticator","Select verification method","Get a push notification","Push notification sent"];
  const h=document.querySelector('[data-se="o-form-head"],.o-form-head')?.textContent?.trim().replace(/[’‘]/g,"'").replace(/\s+/g,' ')||'';
  return {origin_allowed:true,heading_type:known.includes(h)?h:'unrecognized',v2_rows:count('.authenticator-verify-list .authenticator-row'),v3_choices:count('[data-se="authenticator-verify-list"] [data-se="authenticator-button"]'),push_method:count('.authenticator-verify-list [data-se="okta_verify-push"] .select-factor'),forms:count('form'),widget:count('#okta-sign-in,[data-se="o-form"],.okta-sign-in'),challenge_present:count('[data-se="challenge-number"],[data-se="numberchallenge-instr-value"]')>0};
 });
}
