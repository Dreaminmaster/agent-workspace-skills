// No credentials or provider links are stored by this controller.
export function loginFeedback(data, httpStatus = 200, now = Date.now()) {
  const failure = data.last_browser_failure || {};
  const rate = data.rate_limit || failure.rate_limit || {};
  const deadline = Date.parse(data.browser_retry_at || data.retry_at || '');
  const blocked = Number.isFinite(deadline) && deadline > now;
  const limited = httpStatus === 429 || data.status === 'quota_exceeded' || (blocked && data.status!=='local_rate_wait');
  const when = value => new Date(value).toLocaleString('zh-CN', {timeZone:'Australia/Sydney',hour12:false});
  let text;
  if (limited) {
    text = 'Cloudflare 浏览器限流（HTTP 429 / 服务退避），不是学校账号或密码错误。Canvas API 可继续使用。';
    const provider = rate.provider_error;
    if (provider) text += '\n提供商错误：' + provider;
    if (rate.retry_after) text += '\n原始 Retry-After：' + rate.retry_after;
    if (Number.isFinite(deadline)) text += '\n服务器建议重试（悉尼时间）：' + when(deadline) + '；不保证届时恢复。';
    text += '\n等待期间不会自动启动或重试浏览器。';
  } else {
    const labels = {authenticated:data.verification?'学校会话已保存（最近验证状态）；当前有效性须实际读取核验。':'学校登录验证成功，会话已加密保存；登录画面已正常关闭，可继续读取。若备用学校窗口显示 Disconnected，这是成功后释放资源。',saved_unverified:'学校会话已保存，仍需实际验证。',requires_login:'需要本人完成学校 SSO/MFA；默认不在服务器保存学校密码。',login_cancelled:'登录窗口已关闭，待办和已保存会话保留。',revoked:'学校会话已撤销。',local_rate_wait:'本地启动间隔限制，尚未请求 Cloudflare。',browser_error:'云端浏览器连接失败，未取得内容。'};
    text = labels[data.status] || '请求结果：' + (data.status || httpStatus);
    if (data.authentication_state === 'login_window_expired'||(!limited&&data.status==='requires_login'&&data.login_diagnostic?.authentication_state==='login_window_expired')) text = '学校登录窗口已超时并释放；待办保留。请在额度允许时重新打开登录。';
    if (data.reason) text += '\n' + data.reason;
    if(data.status==='local_rate_wait'&&Number.isFinite(deadline))text+='\n本地启动间隔截止（悉尼时间）：'+when(deadline);
    if (data.expires_at) text += '\n窗口或会话截止（悉尼时间）：' + when(data.expires_at);
  }
  if(typeof data.credentials_saved==='boolean')text+='\n已保存学校会话：'+(data.credentials_saved?'是':'否');
  if(data.authentication_state&&data.authentication_state!=='login_window_expired')text+='\n认证状态：'+data.authentication_state;
  return {text, blocked:blocked || (limited && !Number.isFinite(deadline)), retryAt:Number.isFinite(deadline)?deadline:null};
}
export function installLoginFlow(feedback) {
  const output=document.getElementById('result'),live=document.getElementById('live'),start=document.getElementById('start'),clock=document.getElementById('loginclock'),autofill=document.getElementById('autofill'),autostart=document.getElementById('autostart');
  let autofillReady=false,busy=false,retryAt=0,unknownLimit=false,watchTimer,windowDeadline=0,resumed=false,checks=0,linkTimer,nextDelay=2500,discoverTimer,discoverChecks=0;
  function stopDiscovery(){clearTimeout(discoverTimer);discoverTimer=null;}
  function discover(){
    if(discoverTimer||windowDeadline||!autofillReady||unknownLimit||retryAt>Date.now()||discoverChecks>=8)return;
    discoverTimer=setTimeout(async()=>{discoverTimer=null;discoverChecks++;if(!document.hidden&&!busy)await act('status',true);else discover();},15000);
  }
  function controls(){autostart.disabled=!autofillReady||busy||unknownLimit||retryAt>Date.now();start.disabled=busy || unknownLimit || retryAt>Date.now();start.textContent=retryAt>Date.now()?'浏览器限流，等待建议重试时间':'打开学校登录';}
  function stopWatch(){clearTimeout(watchTimer);clearTimeout(linkTimer);windowDeadline=0;clock.hidden=true;clock.textContent='';}
  function expireWindow(){stopWatch();window.CanvasPhoneInput.disconnect();live.removeAttribute('href');live.style.display='none';output.textContent='学校登录窗口已到期，输入连接已关闭；不是密码错误或新的 429。待办保留，不会自动重启浏览器。'}
  function tick(){controls();if(!windowDeadline)return;if(Date.now()>=windowDeadline){expireWindow();return;}clock.hidden=false;clock.textContent='登录窗口剩余 '+Math.ceil((windowDeadline-Date.now())/1000)+' 秒。请完成本人 MFA 后立即点击「已完成学校登录」；切换 App 不会延长窗口。';}
  function watch(){clearTimeout(watchTimer);const enabled=document.getElementById('autoverify');if(!windowDeadline||enabled.disabled||!enabled.checked)return;if(Date.now()>=windowDeadline||checks>=96){expireWindow();return;}watchTimer=setTimeout(async()=>{if(!document.hidden&&!busy){checks++;await act(autofill.checked?'progress':'complete',true);}watch();},autofill.checked?nextDelay:10000);}
  async function act(action,automatic=false){
    if(busy || (action==='start' && (unknownLimit || retryAt>Date.now())))return;
    if(action==='start')stopDiscovery();
    busy=true;controls();if(!automatic)output.textContent='正在连接云端…';
    try {
      const response=await fetch('/browser/'+action,{method:'POST',headers:{'X-Canvas-UI':'1','Content-Type':'application/json'},body:action==='start'?JSON.stringify({autofill:!autofill.disabled&&autofill.checked,fresh_auth:autofill.checked&&!document.getElementById("freshlogin").disabled&&document.getElementById("freshlogin").checked}):['read','evidence'].includes(action)?JSON.stringify({course_id:Number(document.getElementById('course').value),page:document.getElementById('page').value.trim()}):undefined,signal:AbortSignal.timeout(45000)});
      let data;try{data=await response.json();}catch{throw Error('私人 Site 返回 HTTP '+response.status+'，没有可解析的结果；未自动重试。');}
      const message=feedback(data,response.status);
      if(typeof data.autofill_configured==='boolean'){autofillReady=data.autofill_configured;autofill.disabled=!data.autofill_configured;document.getElementById('freshlogin').disabled=!data.autofill_configured;document.getElementById('autofilllabel').textContent=data.autofill_configured?'本次使用受保护 Secrets 自动填写学校账号和密码（已配置，默认手动）':'自动填写尚未配置；继续使用手动登录';if(!data.autofill_configured)autofill.checked=false;document.getElementById('autoresume').disabled=!data.autofill_configured;}
      if(action==='status'&&!message.blocked&&data.login_pending?.autofill_enabled&&!data.login_pending.manual_selected&&Number(data.login_pending.expires_at)>Date.now()){
        // Attach this owner's phone to the already-authorised window, never start a browser.
        stopDiscovery();autofill.checked=true;const auto=document.getElementById('autoverify');auto.disabled=false;auto.checked=true;
        windowDeadline=Number(data.login_pending.expires_at);checks=0;tick();watch();
        output.textContent='已接入现有学校登录窗口；正在同步本人 MFA 状态，不会新建浏览器或重新发送密码/推送。';
      }
      if(action==='status'&&!data.login_pending&&!message.blocked)discover();
      if(message.blocked)stopDiscovery();
      if(['manual','cancel','revoke'].includes(action))stopDiscovery();
      if(action==='manual'){autofill.checked=false;document.getElementById('autoverify').checked=false;clearTimeout(watchTimer);}
      if(action==='start'&&autofill.checked){nextDelay=2500;const auto=document.getElementById('autoverify');auto.disabled=false;auto.checked=true;}
      retryAt=message.retryAt||(retryAt>Date.now()?retryAt:0);unknownLimit=message.blocked&&!message.retryAt;
      if(data.live_url){window.CanvasPhoneInput.connect(data.live_url);live.href=data.live_url;live.style.display='inline-block';windowDeadline=Number(data.expires_at)||Date.parse(data.expires_at);resumed=false;checks=0;tick();watch();clearTimeout(linkTimer);linkTimer=setTimeout(()=>{live.removeAttribute('href');live.style.display='none';},60000);delete data.live_url;}
      if(['cancel','revoke'].includes(action)||(data.status==='authenticated'&&!data.login_pending)||data.authentication_state==='login_window_expired'){
        stopWatch();window.CanvasPhoneInput.disconnect();live.removeAttribute('href');live.style.display='none';
      }
      if(['read','evidence'].includes(action)){
        for(const [field,id] of [['screenshot','proof'],['screenshot_bottom','proofbottom']])if(data[field]){const img=document.getElementById(id);img.src='data:image/png;base64,'+data[field].base64;img.style.display='block';delete data[field];}
        document.getElementById('reading').textContent=JSON.stringify(data,null,2);
      }
      if((!automatic || data.status!=='requires_login')&&!(action==='status'&&windowDeadline&&data.login_pending))output.textContent=message.text;
      if(data.status==='mfa_required'){nextDelay=5000;output.textContent='请在本人 Okta Verify 中确认学校验证。'+(data.confirmation_number?'\n学校要求确认的数字：'+data.confirmation_number:'\n请查看学校画面上的数字。')+'\n请打开手机 Okta Verify 检查学校请求；此状态不证明通知已送达。若没有请求，切换人工登录，不会自动重复推送。系统不会代为批准 MFA。';}
      if(data.status==='autofill_progress'){const phases={username:'已填写账号',password:'已填写密码',credentials:'已填写账号和密码',verify:'已选择 Okta Verify',verify_v3:'已选择 Okta Verify',verify_push:'已选择 Okta Verify 推送验证',select_push:'已选择推送验证',push:'已点击一次学校推送按钮（手机是否收到仍需本人确认）'};output.textContent=(phases[data.phase]||'已执行一次学校登录步骤')+'；请准备在手机 Okta Verify 确认。密码未输出或记录。';}
      if(data.status==='manual_login'){nextDelay=10000;output.textContent='需要你操作：在学校画面选择 Okta Verify，再选择 Get a push notification／Send push；在手机 Okta Verify 本人确认。若学校显示其他要求，按学校提示人工完成。系统不会重复发送密码或推送。'+(data.reason||'');}
      if(['progress','complete'].includes(action)&&data.status==='authenticated'&&!data.login_pending&&!resumed&&!document.getElementById('autoresume').disabled&&document.getElementById('autoresume').checked){
        const id=document.getElementById('taskid').value.trim();
        if(/^[a-f0-9-]{36}$/.test(id)){resumed=true;await window.CanvasResumeTask();}
      }
      if(!automatic&&message.blocked)output.scrollIntoView?.({block:'nearest'});
    }catch(error){output.textContent=error.name==='TimeoutError'?'云端请求超时；未自动重启浏览器，待办仍保留。':error.message;if(automatic)stopWatch();}
    finally{busy=false;controls();}
  }
  for(const action of ['start','complete','cancel','status','revoke','read','evidence','manual'])document.getElementById(action).onclick=()=>act(action);
  autostart.onclick=()=>{if(!autofillReady||autostart.disabled)return;autofill.checked=true;document.getElementById('freshlogin').checked=false;const resume=document.getElementById('autoresume');if(!resume.disabled&&/^[a-f0-9-]{36}$/.test(document.getElementById('taskid').value.trim()))resume.checked=true;return act('start');};
  document.getElementById('autoverify').onchange=watch;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();watch();}});
  window.addEventListener('pagehide',()=>{stopWatch();stopDiscovery();});
  // Local display deadlines only: no network, acquisition or heartbeat.
  setInterval(tick,1000);act('status');
}
export const loginFlowScript='('+installLoginFlow.toString()+')('+loginFeedback.toString()+');';
