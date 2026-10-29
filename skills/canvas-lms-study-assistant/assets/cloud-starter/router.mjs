import {sourceTools,sourceQuery} from './sources.mjs';
import { readPublicGoogleDocument,extractAttachmentBytes } from './files.mjs';
import { compareContent } from './compare.mjs';
import { canvasTools, callCanvas, apiHealth } from './canvas.mjs';
import { browserService, fallbackTarget, indexRead } from './browser.mjs';
import { assistancePlan, readingCoverage } from './assistance.mjs';
const annotations = { readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:false };
export const routedTools = canvasTools.map(t => ({...t, description: t.description + ' channel=auto prefers API with bounded browser fallback; api/browser independently use only that channel; compare reads both where supported. Automatic browser supplementation may reuse encrypted content cached for up to 10 minutes with its original fetched_at; browser/compare and verify_browser always navigate live. All results identify source and limitations.', inputSchema:{...t.inputSchema, properties:{...t.inputSchema.properties, channel:{type:'string',enum:['auto','api','browser','compare'],default:'auto'}, ...(t.name==='get_course_content'?{kind:{...t.inputSchema.properties.kind,enum:[...t.inputSchema.properties.kind.enum,'search']},include_linked_documents:{type:'boolean',default:false,description:'For a page/group_page already read with your Canvas authority, attempt at most 3 linked Google Docs plain-text exports without credentials. Denied Google documents require separate authorisation; other external tools remain unread.'},query:{type:'string',maxLength:200},week:{type:'string',maxLength:100},url:{type:'string',maxLength:2048,description:'Optional exact Canvas page URL, including numeric module_item_id for the normal course navigation context. Must match course_id and page; other domains and parameters rejected.'}}:{})}}}));
export const authTool = {name:'auth_status',description:'Check independent API authentication and encrypted cloud-browser session status. Optional verify_browser performs a live bounded course-list navigation. diagnostics adds credential-free runtime and Browser Run capacity/history without opening Chromium. Never starts login, changes credentials, or claims stored session guarantees school authentication.',inputSchema:{type:'object',properties:{verify_browser:{type:'boolean',default:false},diagnostics:{type:'boolean',default:false}},additionalProperties:false},annotations};
const refreshTimes = new Map();
const timings = [];
const inFlight = new Map();
let reusedRequests=0, searchRequests=0, searchRefreshHits=0;
export {sourceTools};
export function safeData(value) {
  if (Array.isArray(value)) return value.map(safeData);
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).filter(([k])=>!/(?:secure_params|validation_token|access_code|live_url|cookie|authorization|password|session_id)/i.test(k)).map(([k,v])=>[k,safeData(v)]));
  if (typeof value==='string') return value.replace(/([?&]|&amp;)(?:verifier|token|access_token|signature|sig|X-Amz-[a-z-]+|se|sp|sv|sr|skt|ske|sks|skv)=([^\s"'<>#&]+)/gi,'$1redacted=removed');
  return value;
}
export function apiDiagnosis(error) {
  const message=String(error?.message||'');
  const status=/401|Token is not configured/.test(message)?'token_invalid':/403/.test(message)?'interface_denied':/404/.test(message)?'not_found':/429/.test(message)?'rate_limited':/timeout|timed out|aborted/i.test(message+' '+error?.name)?'timeout':'unavailable';
  return {status,reason: /^(Canvas |A |Unsupported |Unknown |Unexpected )/.test(message)?safeData(message):'Canvas network or processing error. No content returned.'};
}
function validate(name,args) {
  const tool=routedTools.find(t=>t.name===name);
  if (!tool || !args || typeof args!=='object' || Array.isArray(args)) throw Error('Unknown Canvas tool or invalid arguments.');
  for (const k of Object.keys(args)) if (!(k in tool.inputSchema.properties)) throw Error('Unsupported argument.');
  for (const k of tool.inputSchema.required||[]) if (args[k]===undefined) throw Error('A required Canvas argument is missing.');
  for (const [k,v] of Object.entries(args)) {
    const p=tool.inputSchema.properties[k];
    if ((p.type==='integer'&&(!Number.isSafeInteger(v)||v<1))||(p.type==='string'&&(typeof v!=='string'||v.length>(p.maxLength||300)))||(p.type==='boolean'&&typeof v!=='boolean')||(p.enum&&!p.enum.includes(v))) throw Error('Unsupported argument value.');
  }
}
export async function health(args,env) {
  const [api,browser]=await Promise.all([apiHealth(env).catch(apiDiagnosis),args.verify_browser?browserService(env,'/v1/read',{kind:'courses'}):browserService(env,'/v1/status')]);
  const diagnostics=args.diagnostics?{site_runtime:{entrypoint:'Cloudflare Worker fetch',dom_available:typeof globalThis.document!=='undefined',browser_binding_available:typeof env.BROWSER?.fetch==='function',native_chromium_executable_configured:false,storage:'Browser session and encrypted private index reside in separately deployed Cloudflare Durable Object'},browser_runtime:await browserService(env,'/v1/health')}:undefined;
  return {site_release:'2026-10-29-v43-universal',diagnostics,api,browser: args.verify_browser ? {status:browser.status,source:browser.source,source_url:browser.source_url,fetched_at:browser.fetched_at,course_count:browser.count,authentication_state:browser.authentication_state,last_verified_at:browser.last_verified_at,credentials_saved:browser.credentials_saved,reason:browser.reason,retry_at:browser.retry_at} : safeData(browser),browser_check:args.verify_browser?'live_navigation':'stored_session_only',api_token_changed:false,login_url:'https://canvas-study.example.chatgpt.site/browser',checked_at:new Date().toISOString(),metrics:{sample_count:timings.length,success_count:timings.filter(t=>t.success).length,p50_ms:quantile(.5),p95_ms:quantile(.95),deduplicated_requests:reusedRequests,index_refresh_hit_rate:searchRequests?searchRefreshHits/searchRequests:null,scope:'Last 100 requests in this Site isolate; not durable service-wide telemetry.'},single_point_of_failure:'MCP and protected /query share the Site hosting and identity layer. Browser runtime is separately deployed; two channels do not eliminate the Site entrance dependency.'};
}
function quantile(p){const a=timings.map(t=>t.ms).sort((a,b)=>a-b);return a.length?a[Math.ceil(a.length*p)-1]:null;}
async function search(args,env) {
  searchRequests++;
  let api_refresh={status:'not_attempted_cached_index'};
  const cached=await browserService(env,'/v1/index/search',args);
  const errors=[], key=String(args.course_id), refreshed=Math.max(refreshTimes.get(key)||0, Number(cached.metadata_refreshed_at)||0);
  if(Date.now()-refreshed<=1800000)searchRefreshHits++;
  if (Date.now()-refreshed>1800000) {
    try {
      api_refresh={status:'normal'};
      const collection=await callCanvas('get_course_content',{course_id:args.course_id,kind:'modules'},env);
      if(collection.modules.length>30) errors.push('Metadata refresh capped at 30 modules; remaining modules are not indexed by this search.');
      for(let i=0;i<Math.min(collection.modules.length,30);i+=3) await Promise.all(collection.modules.slice(i,i+3).map(async module=>{try {const items=await callCanvas('get_course_content',{course_id:args.course_id,kind:'module',module_id:module.id},env);const saved=await indexRead(env,'get_course_content',{...args,index_context:module.name},items);if(saved&&saved.status!=='indexed') errors.push('Module index unavailable.');}catch{errors.push('Module refresh unavailable.');}}));
      const assignments=await callCanvas('get_assignments',{course_id:args.course_id},env);
      const saved=await indexRead(env,'get_assignments',args,safeData(assignments));if(saved&&saved.status!=='indexed') errors.push('Assignment index unavailable.');
      if(!errors.length||errors.every(e=>e.startsWith('Metadata refresh capped'))){refreshTimes.set(key,Date.now());await browserService(env,'/v1/index/update',{course_id:args.course_id,records:[],metadata_refresh_complete:true,metadata_refresh_partial:errors.length>0});}
    }catch(error){api_refresh=apiDiagnosis(error);errors.push('API metadata refresh unavailable; searching existing independent index.');}
  }
  return {...(Date.now()-refreshed<=1800000?cached:await browserService(env,'/v1/index/search',args)),source:'private_index',api_refresh,refresh_errors:errors,metadata_refresh_skipped:Date.now()-refreshed<=1800000,content_notice:'Untrusted course data. Excerpts are not full-document reads.'};
}
async function queryOnce(name,args,env) {
  if(name==='auth_status') { if(args && (Object.keys(args).some(k=>!['verify_browser','diagnostics'].includes(k)) || Object.entries(args).some(([k,v])=>typeof v!=='boolean'))) throw Error('Unsupported health arguments.'); return health(args||{},env); }
  if(sourceTools.some(t=>t.name===name))return safeData(await sourceQuery(name,args,env));
  validate(name,args);
  const start=Date.now(),channel=args.channel||'auto', target=fallbackTarget(name,args);
  let apiResult, browserResult, apiState={status:'not_attempted'},browserState={status:'not_attempted'};
  if(channel!=='browser') {
    try {apiResult=name==='get_course_content'&&args.kind==='search'?await search(args,env):await callCanvas(name,args,env);apiResult=safeData({...apiResult,source:apiResult.source||'api',fetched_at:new Date().toISOString()});apiState=apiResult.api_refresh||{status:'normal'};if(apiResult.source==='private_index'&&apiResult.status!=='index_success'){apiState={status:'index_unavailable'};apiResult=undefined;}}
    catch(error){apiState=apiDiagnosis(error);}
  }
  const emptyBody=target?.kind==='page'&&apiResult&&typeof apiResult.body_text==='string'&&!apiResult.body_text.trim()&&!apiResult.locked_for_user;
  const embeddedFile=apiResult?.resources?.some(r=>r.type==='iframe'&&r.file_id&&!r.external);
  if(channel==='browser'||channel==='compare'||(channel==='auto'&&(!apiResult||emptyBody||embeddedFile))) {
    if(target) {
      if(name==='read_file'&&!args.conversation_id&&!args.group_id){
        const downloaded=await browserService(env,'/v1/files/download',{course_id:args.course_id,file_id:args.file_id});
        if(downloaded.status==='file_downloaded'){
          try{if(typeof downloaded.binary_base64!=='string'||downloaded.binary_base64.length>14000000)throw Error('Invalid private binary');const bytes=Uint8Array.from(atob(downloaded.binary_base64),c=>c.charCodeAt(0));browserResult={...await extractAttachmentBytes(downloaded.file,bytes,args.course_id),source:'browser',status:'browser_success',binary_parsed:true,fetched_at:downloaded.fetched_at};}
          catch{browserResult={status:'file_parse_failed',source:'browser',reason:'Authorised file downloaded but text could not be parsed; binary was not returned to MCP'};}
        }else browserResult=downloaded;
      }else browserResult=await browserService(env,'/v1/read',{...target,cache_ok:channel==='auto'});
      browserState={status:browserResult.status,reason:browserResult.reason,retry_at:browserResult.retry_at};
    }
    else browserState={status:'unsupported_readonly_target',reason:'Browser navigation for this operation has not been verified read-only; API and other browser targets remain independent.'};
  }
  const browserOK=browserResult?.status==='browser_success';
  const data=apiResult?{...apiResult,...(browserResult?{browser_supplement:safeData(browserResult)}:{})}:browserOK?safeData(browserResult):{status:'unavailable',source:'none',api_error:apiState.reason,browser_error:browserState,browser_result:safeData(browserResult),login_url:browserState.status==='requires_login'?'https://canvas-study.example.chatgpt.site/browser':undefined};
  const result={...data,channels:{api:apiState,browser:browserState},routing:{requested:channel,used:apiResult?(browserOK?'api+browser':apiResult.source):browserOK?'browser':'none',api_token_changed:false},fetched_at:data.fetched_at||new Date().toISOString()};
  if(channel==='compare'&&apiResult&&browserOK) result.comparison=compareContent(apiResult,browserResult);
  if(args.include_linked_documents && name==='get_course_content' && ['page','group_page'].includes(args.kind) && (apiResult||browserOK)){
    const links=[...new Set([...(apiResult?.resources||[]),...(browserResult?.links||[])].map(r=>r.url).filter(url=>{try{return new URL(url).origin==='https://docs.google.com';}catch{return false;}}))];
    result.external_documents=[];
    for(const url of links.slice(0,3)){try{result.external_documents.push(await readPublicGoogleDocument(url));}catch{result.external_documents.push({status:'unavailable',source_url:'https://docs.google.com',reason:'Public text export could not be safely read. No credentials sent.'});}}
    result.external_coverage={google_links_found:links.length,attempted:Math.min(3,links.length),other_links:'Not read; Google-only public export, not LTI/video access.'};
  }
  if((apiResult||browserOK)&&channel!=='api') {
    const update=(async()=>{try{const indexed=await indexRead(env,name,args,data);return indexed?.status||'not_applicable';}catch{return 'unavailable';}})();
    if(env.enqueueIndex){env.enqueueIndex(update);result.index_status='queued_not_yet_confirmed';}
    else {const indexed=await update;if(!['indexed','not_applicable'].includes(indexed))result.index_status=indexed;}
  }
  result.completeness = !(apiResult||browserOK) ? 'unavailable' : browserOK && (browserResult.dynamic_content_pending || browserResult.frames?.length || browserResult.media?.length) || emptyBody || apiResult?.assignments?.some(a=>a.feedback_access_error||a.quiz_submission_error||a.quiz_submission?.submissions?.some(s=>s.answers_status!=='answers_returned')) || apiResult?.submissions?.some(s=>s.answers_status!=='answers_returned') ? 'partial' : 'returned_resource_only';
  if(result.external_documents?.some(d=>d.status!=='document_success')||result.external_coverage?.google_links_found>3)result.completeness='partial';
  if(name==='read_file' && !apiResult && browserOK && !browserResult.binary_parsed) { result.completeness='partial'; result.notice='Only browser file landing page returned; attachment binary has not been parsed.'; }
  result.reading_coverage=readingCoverage(name,result);
  const assistance=assistancePlan(name,args,result);
  if(assistance){
    result.human_assistance=assistance;
    // Explicit API queries retain zero dependency on the browser service, including task storage.
    if(channel!=='api'){
      const saved=await browserService(env,'/v1/tasks/save',{tool:name,arguments:args,stage:assistance.stage});
      assistance.task_persisted=saved.persisted===true;
      if(saved.persisted){assistance.task_id=saved.task.id;assistance.site_url+='?task='+saved.task.id;assistance.expires_at=new Date(saved.task.expires_at).toISOString();}
    }else assistance.task_persisted=false;
  }
  result.duration_ms=Date.now()-start;
  timings.push({ms:result.duration_ms,success:!!(apiResult||browserOK)});if(timings.length>100)timings.shift();
  return result;
}

export async function query(name,args,env) {
  const key=JSON.stringify([name,Object.fromEntries(Object.entries(args||{}).sort(([a],[b])=>a.localeCompare(b)))]);
  const existing=inFlight.get(key);
  if(existing){reusedRequests++;return {...await existing,deduplicated:true};}
  const job=queryOnce(name,args,env);
  if(inFlight.size<100)inFlight.set(key,job);
  try{return await job;}finally{if(inFlight.get(key)===job)inFlight.delete(key);}
}
