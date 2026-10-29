import {retryDeadline} from './cloud-browser/session.mjs';
import {loginFlowScript} from './login-feedback.mjs';
import {mobileInputMarkup,mobileInputScript} from './mobile-input.mjs';
const ORIGIN = 'https://canvas-study.example.chatgpt.site';
export async function browserService(env, path, data = {}) {
  if (!env.BROWSER_SERVICE_KEY || !env.BROWSER_SERVICE_URL) return { status: 'not_configured' };
  if (env.BROWSER_SERVICE_URL !== 'https://canvas-browser.example.workers.dev') return { status: 'invalid_service' };
  try {
    const response = await fetch(env.BROWSER_SERVICE_URL + path, { method: 'POST', headers: { Authorization: 'Bearer ' + env.BROWSER_SERVICE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(/^\/v1\/(?:index|tasks)\//.test(path)?5000:40000) });
    let result;try{result=await response.json();}catch{result={status:'browser_error',reason:'Cloud browser returned an unreadable response; no automatic retry.'};}
    if(!result||typeof result!=='object'||Array.isArray(result))result={status:'browser_error',reason:'Invalid cloud browser response.'};
    if(!response.ok)result.service_http_status=response.status;
    const retry=response.headers.get('Retry-After');
    if(retry&&!result.rate_limit)result.rate_limit={retry_after:retry};
    if(response.status===429){result.status='quota_exceeded';if(!result.retry_at)result.retry_at=new Date(retryDeadline(retry,Date.now())).toISOString();}
    return result;
  } catch { return { status: 'browser_error', reason: 'Cloud browser unavailable. No browser content was read.' }; }
}
export async function browserRoute(request, env, query) {
  const path = new URL(request.url).pathname;
  if(path==='/query/task'||path==='/query/resume'){
    if(request.method!=='POST')return new Response(null,{status:405});
    if(request.headers.get('Origin')!==ORIGIN||request.headers.get('X-Canvas-UI')!=='1')return new Response('Same-origin UI required',{status:403});
    let input;try{input=await request.json();}catch{return Response.json({status:'invalid_task'},{status:400});}
    if(!/^[a-f0-9-]{36}$/.test(input?.id||''))return Response.json({status:'invalid_task'},{status:400});
    const found=await browserService(env,'/v1/tasks/get',{id:input.id});
    if(path==='/query/task'||!found.task)return Response.json(found,{headers:{'Cache-Control':'no-store'}});
    // Owner deliberately clicks once; no background retries or automatic LTI/browser actions.
    try{
      const result=await query(found.task.tool,found.task.arguments,env);
      const status=result.human_assistance?'needs_owner_action':result.reading_coverage?.status==='permission_limited'?'permission_limited':result.completeness==='partial'?'partial_resource':result.status==='unavailable'?'needs_owner_action':'completed_resource';
      await browserService(env,'/v1/tasks/update',{id:input.id,status});
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }catch{return Response.json({status:'invalid_query',reason:'Saved task could not be resumed; no browser code or external action executed.'},{status:400});}
  }
  if (path === '/' || path === '/browser' || path === '/query') {
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    return new Response(loginPage, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' wss://live.browser.run; frame-src https://live.browser.run; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" } });
  }
  if (path === '/query/read' || path === '/query/status') {
    if (request.method !== 'POST') return new Response(null,{status:405});
    if(request.headers.get('Origin')!==ORIGIN || request.headers.get('X-Canvas-UI')!=='1') return new Response('Same-origin UI required',{status:403});
    try {
      const data=await request.json();
      const result=await query(path==='/query/status'?'auth_status':data.tool,path==='/query/status'?{verify_browser:!!data.verify_browser,diagnostics:!!data.diagnostics}:data.arguments,env);
      return Response.json(result,{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    } catch { return Response.json({status:'invalid_query'},{status:400}); }
  }
  const actions = { '/browser/status': '/v1/status', '/browser/start': '/v1/login/start', '/browser/complete': '/v1/login/complete', '/browser/progress':'/v1/login/progress', '/browser/manual':'/v1/login/manual', '/browser/cancel':'/v1/login/cancel', '/browser/revoke': '/v1/revoke', '/browser/read': '/v1/read', '/browser/evidence': '/v1/read' };
  if (!actions[path]) return new Response('Not found', { status: 404 });
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (request.headers.get('Origin') !== ORIGIN || request.headers.get('X-Canvas-UI') !== '1') return new Response('Same-origin UI required', { status: 403 });
  let data = {};
  if(path==='/browser/start'){try{const input=await request.json();data={autofill:input?.autofill===true,fresh_auth:input?.fresh_auth===true&&input?.autofill===true};}catch{data={autofill:false};}}
  if (path === '/browser/read' || path === '/browser/evidence') {
    try { data = await request.json(); } catch { return Response.json({ status: 'invalid_target' }, { status: 400 }); }
    if (!Number.isSafeInteger(data.course_id) || data.course_id <= 0 || typeof data.page !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(data.page)) return Response.json({ status: 'invalid_target' }, { status: 400 });
    data = { course_id: data.course_id, kind: 'page', page: data.page, capture:path==='/browser/evidence' };
  }
  const result = await browserService(env, actions[path], data);
  if (path === '/browser/read' && result.status === 'browser_success') {
    const indexed = await indexRead(env, 'get_course_content', data, result);
    if (indexed?.status !== 'indexed') result.index_status = indexed?.status || 'unavailable';
  }
  // Live View credentials go only to this authenticated private UI, never MCP.
  const status=result.status==='quota_exceeded'?429:result.service_http_status>=400?result.service_http_status:200;
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
  if(status===429&&result.retry_at)headers['Retry-After']=String(Math.max(1,Math.ceil((Date.parse(result.retry_at)-Date.now())/1000)));
  return Response.json(result,{status,headers});
}
export function fallbackTarget(name, args) {
  if (name === 'list_courses') return {kind:'courses'};
  if (name === 'get_course_content' && ['page', 'files', 'grades', 'pages', 'modules', 'module', 'group_page', 'group_pages'].includes(args.kind)) {
    const target={course_id:args.course_id,kind:args.kind,page:args.page,module_id:args.module_id,group_id:args.group_id};
    if(args.url) {
      const u=new URL(args.url);
      if(args.kind!=='page'||u.origin!=='https://canvas.sydney.edu.au'||u.username||u.password||u.pathname!==`/courses/${args.course_id}/pages/${args.page}`||[...u.searchParams.keys()].some(k=>k!=='module_item_id')) throw Error('Unsupported Canvas page URL.');
      const item=u.searchParams.get('module_item_id');if(item){if(!/^[1-9][0-9]*$/.test(item))throw Error('Unsupported Canvas module context.');target.module_item_id=Number(item);}
    }
    return target;
  }
  // Canvas assignment HTML performs context_module_action(:read), so keep its Token/API reads and forbid this browser navigation under the user's read-only constraint.
  if (name === 'read_file' && (args.conversation_id||args.group_id)) return null;
  if (name === 'read_file') return { course_id: args.course_id, kind: 'file', file_id: args.file_id };
  return null;
}
export async function indexRead(env, name, args, data) {
  if (!args.course_id) return;
  const base = `https://canvas.sydney.edu.au/courses/${args.course_id}/`;
  const fetched_at = data.fetched_at || new Date().toISOString();
  let records = [];
  const record = (title, source_url, text = '', context = '') => ({ title, source_url, text, context, fetched_at, source: data.source || 'api' });
  if (data.body_text && ['page','group_page'].includes(args.kind)) records.push(record(data.title || args.page, data.html_url || base + 'pages/' + encodeURIComponent(args.page), data.body_text));
  if (data.source === 'browser' && data.text) records.push(record(data.title, data.source_url, data.text));
  if (data.assignments) records.push(...data.assignments.map(a => {const week=a.name?.match(/\bW(?:eek\s*)?(\d+)/i)?.[1];return record(a.name,a.html_url||base+'assignments/'+a.id,a.body_text||'','assignment'+(week?' Week '+week:''));}));
  if(data.announcements) records.push(...data.announcements.map(a=>record(a.title,a.html_url||base+'discussion_topics/'+a.id,a.body_text||'','announcement')));
  if(name==='read_file'&&data.text) {if(data.text.length>250000)return {status:'not_indexed_text_limit'};records.push(record(data.filename,data.source_url||base+'files/'+args.file_id,data.text,'attachment'));}
  if (data.items) records.push(...data.items.filter(i => i.html_url?.startsWith(base)).map(i => {const url=i.type==='Page'&&i.page_url?base+'pages/'+encodeURIComponent(i.page_url):i.type==='File'&&i.content_id?base+'files/'+i.content_id:i.html_url;return record(i.title,url,'',args.index_context||'module');}));
  if (records.length) return browserService(env, '/v1/index/update', { course_id: args.course_id, records });
}
const loginPage = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Canvas Study · 私人云端会话</title><style>body{font:17px system-ui;background:#f4f6f8;color:#17252b;margin:auto;max-width:700px;padding:36px 22px}main{background:white;padding:28px;border-radius:16px}h1{font-size:27px}button,a{font:inherit}button{padding:12px;margin:6px 5px 6px 0;cursor:pointer}a{color:#064b87}pre{white-space:pre-wrap;overflow-wrap:anywhere}input,select,textarea{box-sizing:border-box;max-width:100%;font:inherit}button{min-height:44px}@media(max-width:520px){body{padding:14px 10px}main{padding:18px}input,select,textarea,button{width:100%}label{display:block}}#live{display:none;padding:14px;background:#e3f2ff;border-radius:8px}</style><main><h1>Canvas Study</h1><p>私人云端浏览器会话。由你本人登录学校账户并完成 MFA；不读取 Mac 浏览器的 Cookie 或密码。</p><p>学校会话加密保存，最长 24 小时，可随时撤销。会话记录仅保存 Canvas 与指定学校 SSO 域的 Cookie，不含密码或 MFA 密钥。可选自动填写使用你本人配置的独立受保护 Secrets，默认不启用。有效 SSO 会话可在登录窗口中正常恢复；学校仍可要求验证。登录窗口最多保留 4 分钟，链接须在 60 秒内打开。</p><pre id="result" role="status" aria-live="polite"></pre><p><label><input id="autofill" type="checkbox" disabled> <span id="autofilllabel">本次使用受保护 Secrets 自动填写学校账号和密码（默认手动）</span></label></p><details><summary>自动填写验收选项</summary><label><input id="freshlogin" type="checkbox" disabled> 本次验证账号密码登录：使用空白窗口，原已保存会话保留</label></details><button id="autostart" disabled>自动登录并继续 · 本人确认 Okta</button><button id="start">打开学校登录（手动／选项）</button><p id="loginclock" role="status" hidden></p><a id="live" target="_blank" rel="noopener noreferrer">单独打开学校窗口（备用）</a><p>下方学校画面与手机输入控件在同一页。完成 MFA 后点击「已完成学校登录」保存会话并释放窗口。默认手动。“自动登录并继续”会使用已配置 Secrets 填写账号密码、选择一次 Okta 推送；本人确认后保存会话。有待办 ID 时继续原读取一次，最终 MFA 仍由本人确认。不要在聊天中发送密码、验证码或链接。</p>${mobileInputMarkup}<p><label><input id="autoverify" type="checkbox" disabled> 自动检测登录并保存会话（自动填写时启用）</label></p><button id="manual">切换人工登录</button><button id="complete">已完成学校登录</button><button id="cancel">取消当前登录窗口</button><button id="status">检查状态</button><button id="revoke">撤销云端会话</button><hr><h2>读取课程页面</h2><p>使用云端学校会话读取指定页面的可见正文。仅接受课程 ID 和页面标识，遵守原有课程权限。</p><label>课程 ID <input id="course" type="number" min="1" value="101"></label><p><label>页面标识 <input id="page" value="example-week-overview" maxlength="200"></label></p><button id="read">读取云端页面</button><button id="evidence">截图与正文证据</button><img id="proof" alt="云端 Canvas 实际页面截图" style="display:none;max-width:100%"><img id="proofbottom" alt="云端 Canvas 页面下半部分截图" style="display:none;max-width:100%"><pre id="reading" role="status"></pre><p>登录后仍遵守课程权限。浏览器正文不包含尚未授权读取的第三方嵌入内容、视频或附件全文。</p><hr><h2>继续待办读取</h2><p>完成学校认证后可继续原资源。完成认证后点击「继续待办读取」，每次最多一次；不会自动启动 LTI、播放视频或查看受限测验答案。</p><label>待办 ID <input id="taskid" maxlength="36" autocomplete="off"></label><p><label><input id="autoresume" type="checkbox" disabled> 登录成功后自动继续选定待办一次（可选，默认关闭）</label></p><button id="loadtask">查看待办</button><button id="resumetask">继续待办读取</button><pre id="taskresult" role="status"></pre><hr><h2>私人备用查询</h2><p>此入口直接查询后端，不调用 MCP。API 与学校浏览器凭据独立；此页面和 MCP 仍共享 Site 服务。</p><label>操作 <select id="tool"><option>get_course_content</option><option>list_courses</option><option>get_assignments</option><option>read_file</option><option>get_messages</option><option>get_source_capabilities</option><option>read_student_portal</option><option>read_connected_source</option></select></label><p><label>参数 JSON <textarea id="arguments" rows="5" style="width:100%">{"course_id":101,"kind":"page","page":"example-week-overview","channel":"auto"}</textarea></label></p><button id="query">查询</button><button id="health">两通道状态</button><button id="verify">实时验证浏览器</button><button id="diagnostics">运行环境与浏览器额度</button><pre id="queryresult" role="status"></pre></main><script>${mobileInputScript}${loginFlowScript} let queryBusy=false;async function direct(action){if(queryBusy)return;queryBusy=true;const out=document.getElementById('queryresult');out.textContent='正在读取…';try{const body=action==='status'?{verify_browser:false}:action==='diagnostics'?{verify_browser:false,diagnostics:true}:action==='verify'?{verify_browser:true}:{tool:document.getElementById('tool').value,arguments:JSON.parse(document.getElementById('arguments').value)};const r=await fetch('/query/'+(['verify','diagnostics'].includes(action)?'status':action),{method:'POST',headers:{'X-Canvas-UI':'1','Content-Type':'application/json'},body:JSON.stringify(body)});out.textContent=JSON.stringify(await r.json(),null,2)}catch{out.textContent='参数或连接错误，未修改账户。'}finally{queryBusy=false}}document.getElementById('query').onclick=()=>direct('read');document.getElementById('health').onclick=()=>direct('status');document.getElementById('verify').onclick=()=>direct('verify');document.getElementById('diagnostics').onclick=()=>direct('diagnostics');let taskBusy=false;async function taskAction(resume){if(taskBusy)return;const id=document.getElementById('taskid').value.trim(),out=document.getElementById('taskresult');if(!/^[a-f0-9-]{36}$/.test(id)){out.textContent='请输入有效待办 ID';return}taskBusy=true;document.getElementById('resumetask').disabled=true;out.textContent=resume?'正在继续原读取…':'正在读取待办元数据…';try{const r=await fetch(resume?'/query/resume':'/query/task',{method:'POST',headers:{'X-Canvas-UI':'1','Content-Type':'application/json'},body:JSON.stringify({id})});const value=await r.json();out.textContent=JSON.stringify(value,null,2);if(value.task){document.getElementById('tool').value=value.task.tool;document.getElementById('arguments').value=JSON.stringify(value.task.arguments,null,2);}}catch{out.textContent='待办服务暂时不可用；原读取参数仍保留在 ChatGPT 对话中。'}finally{taskBusy=false;document.getElementById('resumetask').disabled=false}}window.CanvasResumeTask=()=>taskAction(true);document.getElementById('loadtask').onclick=()=>taskAction(false);document.getElementById('resumetask').onclick=()=>taskAction(true);const initialTask=new URL(location.href).searchParams.get('task');if(initialTask&&/^[a-f0-9-]{36}$/.test(initialTask)){document.getElementById('taskid').value=initialTask;taskAction(false);}</script></html>`;
