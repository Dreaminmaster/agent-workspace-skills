import {CANVAS,READ_DOMAINS,base64} from './policy.mjs';
const LIMIT=10*1024*1024;
const stores=new Set(['instructure-uploads-apse2.s3.ap-southeast-2.amazonaws.com','instructure-uploads-apse2.s3.amazonaws.com','instructure-uploads.s3.amazonaws.com']);
export function approvedFileHop(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(u.origin===CANVAS||stores.has(u.hostname)||/\.(?:instructure\.com|inscloudgate\.net|canvas-user-content\.com|cloudfront\.net)$/.test(u.hostname));}catch{return false;}}
export async function downloadOwnerFile(owner,data){
 if(!Number.isSafeInteger(data.course_id)||data.course_id<1||!Number.isSafeInteger(data.file_id)||data.file_id<1||Object.keys(data).some(k=>!['course_id','file_id'].includes(k)))throw Error('invalid_target');
 const source_url=`${CANVAS}/courses/${data.course_id}/files/${data.file_id}`,fail=(status,reason,extra={})=>({status,source:'browser',source_url,reason,...extra});
 const session=await owner.storedSession();if(!session)return fail('requires_login','School browser session unavailable; API remains independent');
 const backoff=await owner.ctx.storage.get('browser_backoff');if(backoff?.retry_at>Date.now())return fail('quota_exceeded','Browser backoff active',{retry_at:new Date(backoff.retry_at).toISOString()});
 if((await owner.ctx.storage.get('login'))?.expires_at>Date.now())return fail('login_in_progress','Finish the current owner login first');
 const deadline=Date.now()+30000;
 const {launch}=await import('@cloudflare/playwright');const browser=await owner.countedAcquire('owner_file_download',()=>launch(owner.browserBinding,{guardrails:{allowedDomains:READ_DOMAINS}}));
 try{
  const context=await browser.newContext({storageState:session.state,serviceWorkers:'block'}),client=context.request;
  if(!client||typeof client.get!=='function')return fail('unsupported_runtime','This Playwright runtime does not support authorised file requests');
  const profile=await client.get(CANVAS+'/api/v1/users/self/profile',{maxRedirects:0,timeout:10000});
  if(!profile.ok())return fail(profile.status()===401?'requires_login':'profile_check_failed','Browser identity request HTTP '+profile.status()+'; this alone does not prove SSO expiry',{http_status:profile.status()});
  if(String((await profile.json()).id)!==owner.env.CANVAS_USER_ID)return fail('owner_mismatch','Returned browser identity does not match the pinned owner');
  const meta=await client.get(`${CANVAS}/api/v1/courses/${data.course_id}/files/${data.file_id}`,{maxRedirects:0,timeout:10000});
  if(!meta.ok())return fail(meta.status()===403?'unauthorized':'metadata_unavailable','Browser file metadata HTTP '+meta.status(),{http_status:meta.status()});
  const file=await meta.json();if(file.id!==data.file_id||file.locked_for_user||file.hidden_for_user)return fail('unauthorized','File ID mismatch or owner is locked');
  if(!Number.isFinite(file.size)||file.size>LIMIT)return fail('file_too_large','Browser file download is capped at 10 MB');
  let binary;const errors=[];
  for(const initial of [...new Set([source_url+'/download',file.url].filter(Boolean))]){
   let url=initial;
   for(let hop=0;hop<6;hop++){
    if(Date.now()>=deadline){errors.push('download_time_budget_exceeded');break;}
    if(!approvedFileHop(url)){errors.push('unapproved_redirect');break;}
    // APIRequestContext maintains origin-scoped school cookies. No Canvas bearer or
    // manually copied Cookie header is ever supplied, especially at a storage hop.
    const response=await client.get(url,{maxRedirects:0,timeout:Math.max(1,Math.min(10000,deadline-Date.now())),headers:{Accept:'application/pdf,application/octet-stream,*/*',Referer:CANVAS+`/courses/${data.course_id}`}});
    if([301,302,303,307,308].includes(response.status())){const next=response.headers().location;if(!next){errors.push('redirect_missing');break;}url=new URL(next,url).href;continue;}
    if(!response.ok()){errors.push('HTTP '+response.status());break;}
    const mime=(response.headers()['content-type']||'').toLowerCase();if(mime.includes('text/html')&&!/\.html?$/i.test(file.filename||'')){errors.push('HTML_login_or_landing_page_not_file');break;}
    if(Number(response.headers()['content-length'])>LIMIT){errors.push('oversize');break;}
    const bytes=new Uint8Array(await response.body());if(!bytes.length||bytes.length>LIMIT){errors.push('invalid_binary_size');break;}binary=bytes;break;
   }
   if(binary)break;
  }
  if(!binary)return fail('download_denied','Both normally authorised browser download paths failed',{download_errors:errors.slice(0,4)});
  await owner.persist(context);await owner.audit('file_download','downloaded',{course_id:data.course_id,kind:'file'});
  return {status:'file_downloaded',source:'browser',source_url,fetched_at:new Date().toISOString(),file:{id:file.id,size:binary.length,filename:file.filename,display_name:file.display_name,'content-type':file['content-type']},binary_base64:base64(binary),notice:'Private service-to-Site bytes only; never forward binary or cookies to MCP'};
 }finally{let confirmed=false;try{await browser.close();confirmed=true;}finally{await owner.ctx.storage.put('last_browser_release',{at:new Date().toISOString(),kind:'file_download',confirmed});}}
}
