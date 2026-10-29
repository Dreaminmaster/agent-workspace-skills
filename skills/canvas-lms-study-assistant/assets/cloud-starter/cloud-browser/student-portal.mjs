import {CANVAS,READ_DOMAINS,permittedReadRequest,seal,unseal} from './policy.mjs';
import {SRES_ORIGIN,safeReportLocation,boundedReport} from './source-policy.mjs';
export function validPortalRequest(data){return data?.consent===true&&Number.isSafeInteger(data.course_id)&&data.course_id>0&&Object.keys(data).every(k=>['consent','course_id','report_label','fresh'].includes(k))&&(data.fresh===undefined||typeof data.fresh==='boolean')&&(data.report_label===undefined||typeof data.report_label==='string'&&data.report_label.trim().length>0&&data.report_label.length<=120&&!/\b(?:submit|delete|remove|logout|sign out|edit|save|create|settings|admin)\b/i.test(data.report_label));}
export function portalEntry(raw,course){try{const u=new URL(raw);if(u.origin!==CANVAS||u.username||u.password||u.pathname!==`/courses/${course}/external_tools/retrieve`)return false;const target=new URL(u.searchParams.get('url'));return target.origin===SRES_ORIGIN&&!target.username&&!target.password&&target.pathname==='/lti/launch'&&!!target.searchParams.get('custom_launch_uuid');}catch{return false;}}
export function permittedPortalRequest(raw,method,navigation,course){
 let u;try{u=new URL(raw);}catch{return false;}if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))return false;
 if(u.origin===CANVAS&&u.pathname.includes('/external_tools/'))return method==='GET'&&navigation&&portalEntry(raw,course);
 if(u.origin===SRES_ORIGIN){let path;try{path=decodeURIComponent(u.pathname);}catch{return false;}if(/\/(?:logout|signout|delete|remove|submit|update|settings|admin|edit|create|save)(?:\/|$)/i.test(path))return false;return ['GET','HEAD'].includes(method)||method==='POST'&&navigation&&/^\/lti\/(?:launch|login|oidc\/login)\/?$/.test(path);}
 // Fixed first-party OIDC navigation only; never accept app POSTs or a generic POST proxy.
 if(navigation&&method==='GET'&&[CANVAS,'https://sso.canvaslms.com'].includes(u.origin)&&u.pathname==='/api/lti/authorize_redirect')return true;
 return permittedReadRequest(raw,method);
}
export async function readStudentPortal(owner,data){
 if(!validPortalRequest(data))throw Error('invalid_target');
 const course=data.course_id,portal=`${CANVAS}/courses/${course}/pages/dec-student-portal`,key=`source:sres:${course}:${encodeURIComponent(data.report_label||'portal')}`;
 if(!data.fresh){const cached=await owner.ctx.storage.get(key);if(cached?.expires_at>Date.now())return {...await unseal(cached.encrypted,owner.env.STATE_KEY,key),cache_hit:true,cache_age_ms:Date.now()-cached.saved_at};}
 const session=await owner.storedSession();if(!session)return {status:'requires_login',source:'sres',source_url:portal,reason:'School session unavailable; use the owner login UI. API remains independent.'};
 const backoff=await owner.ctx.storage.get('browser_backoff');if(backoff?.retry_at>Date.now())return {status:'quota_exceeded',source:'sres',retry_at:new Date(backoff.retry_at).toISOString()};
 if((await owner.ctx.storage.get('login'))?.expires_at>Date.now())return {status:'login_in_progress',source:'sres'};
 const {launch}=await import('@cloudflare/playwright');
 owner.readStage='student_portal_start';const browser=await owner.countedAcquire('owner_consented_student_portal',()=>launch(owner.browserBinding,{guardrails:{allowedDomains:[...READ_DOMAINS,'sres.sydney.edu.au','sso.canvaslms.com']}}));
 try{
  const context=await browser.newContext({storageState:session.state,serviceWorkers:'block'}),blocked=new Set();let separateLogin=false;
  await context.route('**/*',async route=>{const request=route.request(),raw=request.url();if(request.resourceType()==='media')return route.abort();try{if(request.isNavigationRequest()&&['sso.sydney.edu.au','sso.canvaslms.com'].includes(new URL(raw).hostname))separateLogin=true;}catch{}
   if(!permittedPortalRequest(raw,request.method(),request.isNavigationRequest(),course)){blocked.add(`${request.method()} ${safeReportLocation(raw)||'unapproved destination'}`);return route.abort();}return route.continue();});
  const page=await context.newPage();owner.readStage='student_portal';const response=await page.goto(portal,{waitUntil:'domcontentloaded',timeout:25000});
  if(!response?.ok())return {status:'portal_unavailable',source:'sres',http_status:response?.status(),source_url:portal,fetched_at:new Date().toISOString(),completeness:'unavailable',reason:'Canvas refused the requested portal navigation. No SRES content was obtained; API authentication remains independent.'};
  const identity=await page.evaluate(async()=>{const r=await fetch('/api/v1/users/self/profile',{method:'GET',credentials:'same-origin',signal:AbortSignal.timeout(5000)});return r.ok?String((await r.json()).id):null;}).catch(()=>null);
  if(identity!==owner.env.CANVAS_USER_ID)return {status:'requires_login',source:'sres',source_url:portal,reason:'Canvas profile did not match the pinned owner'};
  await page.locator('iframe[src*="external_tools/retrieve"]').first().waitFor({timeout:8000}).catch(()=>{});
  let frames=[];for(let i=0;i<7;i++){frames=page.frames().filter(f=>safeReportLocation(f.url())?.startsWith(SRES_ORIGIN));if(frames.length)break;await page.waitForTimeout(700);}
  if(!frames.length)return {status:separateLogin?'separate_login_required':'sres_not_loaded',source:'sres',source_url:portal,blocked_requests:[...blocked].slice(0,20),reason:'No owner-authorised SRES frame loaded; no score or exam information inferred'};
  if(data.report_label){let selected=null;for(const frame of frames){const links=frame.getByRole('link',{name:data.report_label,exact:true}),buttons=frame.getByRole('button',{name:data.report_label,exact:true});const control=await links.count()===1?links:await buttons.count()===1?buttons:null;if(!control||!await control.isVisible())continue;if(control===links){const href=await links.getAttribute('href');if(href&&!permittedPortalRequest(new URL(href,frame.url()).href,'GET',true,course))continue;}selected=control;break;}
   if(!selected)return {status:'report_link_not_found',source:'sres',source_url:portal,reason:'Requested exact visible report control was not found; no unrelated control clicked'};
   await selected.click({timeout:6000});await page.waitForTimeout(900);
  }
  const documents=[...new Set(context.pages().flatMap(p=>[p,...p.frames()]))].filter(f=>safeReportLocation(f.url())?.startsWith(SRES_ORIGIN)),parts=[];let size=0,partial=false;
  for(const frame of documents.slice(0,8)){const text=await frame.locator('body').innerText({timeout:3500}).catch(()=>null);if(!text||parts.some(p=>p.text===text))continue;const tables=await frame.locator('table').evaluateAll(all=>all.map(t=>[...t.rows].map(r=>[...r.cells].map(c=>c.innerText)))).catch(()=>[]);if(!boundedReport(text,tables)||size+text.length>100000){partial=true;continue;}size+=text.length;const links=await frame.locator('a[href]').evaluateAll(all=>all.slice(0,100).map(a=>({title:a.innerText,url:a.href}))).catch(()=>[]);parts.push({source_url:safeReportLocation(frame.url()),text,tables,links:links.map(l=>({title:l.title,source_url:safeReportLocation(l.url)})).filter(l=>l.source_url)});}
  if(!parts.length)return {status:'report_not_extractable',source:'sres',source_url:portal};
  partial ||= documents.length>8||parts.some(p=>/loading(?:\s+activities)?[.…]+/i.test(p.text));
  const result={status:'portal_visible',source:'sres',course_id:course,title:data.report_label||'Student Portal',source_url:portal,fetched_at:new Date().toISOString(),text:parts.map(p=>p.text).join('\n\n'),documents:parts,completeness:partial?'partial':'visible_documents_only',limitations:'Visible authorised text/tables/links only. Other reports, attachments and nested systems are separate resources; LTI may record access.',blocked_requests:[...blocked].slice(0,20)};
  await owner.persist(context);const saved_at=Date.now();await owner.ctx.storage.put(key,{saved_at,expires_at:saved_at+600000,encrypted:await seal(result,owner.env.STATE_KEY,key)});await owner.audit('student_portal','captured',{course_id:course});return result;
 }finally{let confirmed=false;try{await browser.close();confirmed=true;}finally{await owner.ctx.storage.put('last_browser_release',{at:new Date().toISOString(),kind:'student_portal',confirmed});}}
}
