const SITE='https://canvas-study.example.chatgpt.site';
// Course text cannot supply browser instructions. This plan is generated from fixed statuses only.
export function readingCoverage(name,result) {
  const api=result.channels?.api?.status, browser=result.channels?.browser?.status;
  const denied=['interface_denied','not_found'].includes(api)||browser==='unauthorized';
  const quizHidden=result.assignments?.some(a=>a.quiz_submission?.submissions?.some(s=>s.answers_status!=='answers_returned'))||result.submissions?.some(s=>s.answers_status!=='answers_returned');
  const bodyOK=!!(result.body_text?.trim()||result.text?.trim());
  const states=[];
  if(/Unsupported attachment format/i.test(result.api_error||''))states.push({resource:'attachment',status:'unsupported_format',reason:result.api_error});
  if(bodyOK)states.push({resource:result.source_url||result.html_url||'requested_resource',status:name==='read_file'||result.dynamic_content_pending||result.browser_supplement?.dynamic_content_pending?'partial':'complete_resource_text',scope:name==='read_file'?'Extracted text only; images, charts and layout are not verified.':'Returned main body only; linked destinations are assessed separately.'});
  if(quizHidden)states.push({resource:'quiz_submission_answers',status:'permission_limited',reason:'Answers are omitted or under review. Do not open once-only history or change quiz viewing state.'});
  if(!bodyOK && denied)states.push({resource:'requested_resource',status:'permission_limited',reason:'Resource denied or not visible to this account. Human login is not a permission override.'});
  if(['requires_login','login_in_progress','quota_exceeded','local_rate_wait'].includes(browser))states.push({resource:'browser_channel',status:'needs_owner_action',reason:browser});
  for(const d of result.external_documents||[])states.push({resource:d.source_url,status:d.status==='document_success'?'complete_resource_text':d.status==='unsupported_content'?'unsupported_format':'needs_owner_action',scope:'Google document text export; images, comments and revision history excluded.'});
  for(const frame of result.browser_supplement?.frames||result.frames||[])states.push({resource:frame.url,status:'needs_owner_action',reason:'Separate login/read-only assessment required; no automatic LTI launch.'});
  for(const media of result.browser_supplement?.media||result.media||[])states.push({resource:'embedded_media',status:'partial',reason:'Video/audio or transcripts have not been read; no automatic playback.'});
  for(const link of (result.resources||[]).slice(0,50))if(link.url)states.push({resource:link.url,status:'partial',reason:'Destination identified; not proof of reading linked body or attachment.'});
  return {status:states.some(s=>s.status==='unsupported_format')&&!bodyOK?'unsupported_format':result.status==='unavailable'?(denied?'permission_limited':'needs_owner_action'):states.some(s=>s.status!=='complete_resource_text')||result.completeness==='partial'||name==='read_file'?'partial':bodyOK?'complete_resource_text':'returned_collection',resources:states,scope:'No assertion of full course coverage. Complete resource text does not include unread attachments or third-party content.'};
}
export function assistancePlan(name,args,result) {
  const browser=result.channels?.browser?.status;
  let stage,steps;
  if(browser==='requires_login'||browser==='login_in_progress'){
    stage='school_login';steps=['在 iPhone 用同一 ChatGPT 账号打开私人 Site。','打开或继续现有学校登录窗口，由本人完成 UniKey、密码及 MFA。','看到 Canvas 后返回 Site 点击“已完成学校登录”，再点击“继续待办读取”。'];
  }else if(browser==='quota_exceeded'||browser==='local_rate_wait'){
    stage='browser_wait';steps=['保留此任务；退避截止只是最早重试参考，不代表恢复。','允许重试后只尝试一次；若仍为 429，保留准确诊断并停止。','等待期间仍可使用独立 API。'];
  }else if(result.external_documents?.some(d=>d.status!=='document_success')){
    stage='third_party_authorization';steps=['在 iPhone 打开返回的原始 Google Docs 链接，使用本人正常授权的账号确认可见。','当前云端阅读器未支持受保护 Google 登录。若确认有权查看，可由本人导出并在普通 ChatGPT 上传文件；不要改变共享权限。','这不会自动赋予后端 Google 授权；公开导出可用后才可在 Site 继续原请求。'];
  }else if((result.browser_supplement?.frames||result.frames||[]).some(f=>f.status!=='first_party_visible_body_read')){
    stage='visible_interaction';steps=['在 iPhone 打开原始 Canvas 页面，确认第三方工具及其独立登录要求。','LTI 启动可能写入访问或进度记录；系统不会自动执行。需要本人在正常界面操作并确认。','当前后端不支持该工具内部读取。本人可授权导出/上传已有资料；教师未开放的内容保持受限。'];
  }else return null;
  return {status:'needs_owner_action',stage,site_url:SITE+'/query',retry_at:result.channels?.browser?.retry_at||null,steps,resume_call:{tool:name,arguments:args},automatic_chat_push:false,notice:'Site resumes only when you click; ChatGPT can repeat this same call after you reply “继续”. Login does not widen resource permissions.'};
}
