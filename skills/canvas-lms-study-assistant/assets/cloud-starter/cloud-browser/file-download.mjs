import {VISUAL_HOSTS,visualPages} from './visual-policy.mjs';
import {CANVAS,READ_DOMAINS,base64} from './policy.mjs';
const LIMIT=10*1024*1024;
const stores=new Set(['instructure-uploads-apse2.s3.ap-southeast-2.amazonaws.com','instructure-uploads-apse2.s3-ap-southeast-2.amazonaws.com','instructure-uploads-apse2.s3.amazonaws.com','instructure-uploads.s3.amazonaws.com']);
export function approvedFileHop(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(u.origin===CANVAS||stores.has(u.hostname)||/\.(?:instructure\.com|inscloudgate\.net|canvas-user-content\.com|cloudfront\.net)$/.test(u.hostname));}catch{return false;}}
export async function browserFileGet(context,raw,options={}){
 if(!approvedFileHop(raw))throw Error('unapproved_file_request');
 const target=new URL(raw);if(target.origin===CANVAS&&/\/files\/\d+\/download$/.test(target.pathname))target.searchParams.set('preview','1');
 raw=target.href;
 const page=await context.newPage(),cdp=await context.newCDPSession(page);let stream;
 try{
  const {frameTree}=await cdp.send('Page.getFrameTree');
  const {resource}=await cdp.send('Network.loadNetworkResource',{frameId:frameTree.frame.id,url:raw,options:{disableCache:false,includeCredentials:true}});
  const headers=Object.fromEntries(Object.entries(resource.headers||{}).map(([k,v])=>[k.toLowerCase(),String(v)]));
  if(!resource.success||resource.httpStatusCode<200||resource.httpStatusCode>=300)return {ok:()=>false,status:()=>resource.httpStatusCode||0,headers:()=>headers};
  stream=resource.stream;if(!stream)throw Error('browser_file_stream_missing');
  if(Number(headers['content-length'])>LIMIT)throw Error('file_too_large');
  let size=0;const chunks=[],deadline=Date.now()+Math.min(options.timeout||10000,15000);
  for(;;){if(Date.now()>deadline)throw Error('file_download_timeout');const part=await cdp.send('IO.read',{handle:stream,size:65536});const bytes=part.base64Encoded?Uint8Array.from(atob(part.data),c=>c.charCodeAt(0)):new TextEncoder().encode(part.data);size+=bytes.length;if(size>LIMIT)throw Error('file_too_large');chunks.push(bytes);if(part.eof)break;}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return {ok:()=>true,status:()=>resource.httpStatusCode,headers:()=>headers,body:async()=>bytes};
 }finally{if(stream)await cdp.send('IO.close',{handle:stream}).catch(()=>{});await cdp.detach().catch(()=>{});await page.close().catch(()=>{});}
}
export function inspectFileAccess(file,requested){
 if(!file||!/^\d+$/.test(String(file.id))||String(file.id)!==String(requested))return {status:'file_id_mismatch',reason:'File metadata ID does not match the requested resource'};
 if(file.locked_for_user===true)return {status:'file_locked',reason:'Canvas explicitly reports this file locked for the authenticated reader'};
 return {status:'allowed_metadata',hidden_from_listing:file.hidden_for_user===true};
}
export async function downloadOwnerFile(owner,data){
 if(!Number.isSafeInteger(data.course_id)||data.course_id<1||!Number.isSafeInteger(data.file_id)||data.file_id<1||Object.keys(data).some(k=>!['course_id','file_id','visual','pages','ocr','ocr_language'].includes(k)))throw Error('invalid_target');
 visualPages(data.pages);if(data.visual!==undefined&&typeof data.visual!=='boolean'||data.ocr!==undefined&&typeof data.ocr!=='boolean'||data.ocr_language!==undefined&&!['eng','eng+chi_sim'].includes(data.ocr_language))throw Error('invalid_visual_options');
 const source_url=`${CANVAS}/courses/${data.course_id}/files/${data.file_id}`,fail=(status,reason,extra={})=>({status,source:'browser',source_url,reason,...extra});
 const session=await owner.storedSession();if(!session)return fail('requires_login','School browser session unavailable; API remains independent');
 const backoff=await owner.ctx.storage.get('browser_backoff');if(backoff?.retry_at>Date.now())return fail('quota_exceeded','Browser backoff active',{retry_at:new Date(backoff.retry_at).toISOString()});
 if((await owner.ctx.storage.get('login'))?.expires_at>Date.now())return fail('login_in_progress','Finish the current owner login first');
 const deadline=Date.now()+30000;
 const {launch}=await import('@cloudflare/playwright');const browser=await owner.countedAcquire('owner_file_download',()=>launch(owner.browserBinding,{guardrails:{allowedDomains:[...READ_DOMAINS,...VISUAL_HOSTS]}}));
 try{
  const context=await browser.newContext({storageState:session.state,serviceWorkers:'block'}),client=context.request;
  if(!client||typeof client.get!=='function')return fail('unsupported_runtime','This Playwright runtime does not support authorised file requests');
  const profile=await client.get(CANVAS+'/api/v1/users/self/profile',{maxRedirects:0,timeout:10000,headers:{Accept:'application/json'}});
  if(!profile.ok())return fail(profile.status()===401?'requires_login':'profile_check_failed','Browser identity request HTTP '+profile.status()+'; this alone does not prove SSO expiry',{http_status:profile.status()});
  if(String((await profile.json()).id)!==owner.env.CANVAS_USER_ID)return fail('owner_mismatch','Returned browser identity does not match the pinned owner');
  const meta=await client.get(`${CANVAS}/api/v1/courses/${data.course_id}/files/${data.file_id}`,{maxRedirects:0,timeout:10000,headers:{Accept:'application/json'}});
  if(!meta.ok())return fail(meta.status()===403?'unauthorized':'metadata_unavailable','Browser file metadata HTTP '+meta.status(),{http_status:meta.status()});
  const file=await meta.json(),access=inspectFileAccess(file,data.file_id);if(access.status!=='allowed_metadata')return fail(access.status,access.reason,{metadata_id_type:typeof file.id,locked_for_user:file.locked_for_user===true});
  if(!Number.isFinite(Number(file.size))||Number(file.size)>LIMIT)return fail('file_too_large','Browser file download is capped at 10 MB');
  await context.route('**/*',route=>approvedFileHop(route.request().url())&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
  let binary;const errors=[];let previewUrl;
  const preview=await client.get(`${CANVAS}/api/v1/files/${data.file_id}/public_url`,{maxRedirects:0,timeout:10000,headers:{Accept:'application/json'}});
  if(preview.ok()){const value=await preview.json();if(typeof value.public_url==='string'&&approvedFileHop(value.public_url))previewUrl=value.public_url;}else errors.push('preview_metadata_HTTP '+preview.status());
  for(const initial of [...new Set([previewUrl,file.url,source_url+'/download'].filter(Boolean))]){
   let url=initial;
   for(let hop=0;hop<6;hop++){
    if(Date.now()>=deadline){errors.push('download_time_budget_exceeded');break;}
    if(!approvedFileHop(url)){errors.push('unapproved_redirect');break;}
    // Chromium reads the authorised resource using its normal cookie jar.
    // Browser Run guardrails constrain redirects; no Cookie/Bearer header is copied.
    const response=await browserFileGet(context,url,{timeout:Math.max(1,Math.min(10000,deadline-Date.now())),headers:{Accept:new URL(url).origin===CANVAS?'text/html,application/xhtml+xml,*/*;q=0.8':'*/*',Referer:CANVAS+`/courses/${data.course_id}`}});
    if([301,302,303,307,308].includes(response.status())){const next=response.headers().location;if(!next){errors.push('redirect_missing');break;}url=new URL(next,url).href;continue;}
    if(!response.ok()){errors.push('HTTP '+response.status());break;}
    const mime=(response.headers()['content-type']||'').toLowerCase();if(mime.includes('text/html')&&!/\.html?$/i.test(file.filename||'')){errors.push('HTML_login_or_landing_page_not_file');break;}
    if(Number(response.headers()['content-length'])>LIMIT){errors.push('oversize');break;}
    const bytes=new Uint8Array(await response.body());if(!bytes.length||bytes.length>LIMIT){errors.push('invalid_binary_size');break;}binary=bytes;break;
   }
   if(binary)break;
  }
  if(!binary)return fail('download_denied','Authorised preview and file download paths failed',{download_errors:errors.slice(0,4),metadata_flags:{id_type:typeof file.id,hidden_from_listing:access.hidden_from_listing,locked_for_user:false}});
  let visual_result;
  if(/\.(?:pdf|png|jpe?g|webp)$/i.test(file.filename||'')||/^(?:application\/pdf|image\/(?:png|jpeg|webp))$/.test(file['content-type']||'')){const {readVisualAttachment}=await import('./visual.mjs');visual_result=await readVisualAttachment(browser,file,binary,data);}
  await owner.persist(context);await owner.audit('file_download','downloaded',{course_id:data.course_id,kind:'file'});
  return {status:'file_downloaded',source:'browser',source_url,fetched_at:new Date().toISOString(),visual_result,file:{id:data.file_id,size:binary.length,filename:file.filename,display_name:file.display_name,'content-type':file['content-type']},binary_base64:base64(binary),notice:'Private service-to-Site bytes only; never forward binary or cookies to MCP'};
 }finally{let confirmed=false;try{await browser.close();confirmed=true;}finally{await owner.ctx.storage.put('last_browser_release',{at:new Date().toISOString(),kind:'file_download',confirmed});}}
}

export async function analyseAuthorisedBytes(owner,data){
 if(Object.keys(data).some(k=>!['file','binary_base64','visual','pages','ocr','ocr_language'].includes(k))||!Number.isSafeInteger(data.file?.id)||typeof data.file?.filename!=='string'||data.file.filename.length>500||typeof data.binary_base64!=='string'||data.binary_base64.length>14000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.binary_base64))throw Error('invalid_visual_payload');
 visualPages(data.pages);if(data.visual!==undefined&&typeof data.visual!=='boolean'||data.ocr!==undefined&&typeof data.ocr!=='boolean'||data.ocr_language!==undefined&&!['eng','eng+chi_sim'].includes(data.ocr_language))throw Error('invalid_visual_options');
 const bytes=Uint8Array.from(atob(data.binary_base64),c=>c.charCodeAt(0));if(bytes.length>LIMIT)throw Error('file_too_large');
 const {launch}=await import('@cloudflare/playwright'),browser=await owner.countedAcquire('file_visual_ocr',()=>launch(owner.browserBinding,{guardrails:{allowedDomains:VISUAL_HOSTS}}));
 try{const {readVisualAttachment}=await import('./visual.mjs');return await readVisualAttachment(browser,data.file,bytes,data);}
 finally{let confirmed=false;try{await browser.close();confirmed=true;}finally{await owner.ctx.storage.put('last_browser_release',{at:new Date().toISOString(),kind:'file_visual_ocr',confirmed});}}
}
