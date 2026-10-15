// Owner-only UI helper. Input goes directly to the existing Cloudflare page connection,
// never to a Site endpoint, storage, analytics, course index or MCP tool.
export function liveConnectionURL(link) {
  const outer=new URL(link);
  if(outer.origin!=='https://live.browser.run'||outer.pathname!=='/ui/view'||outer.username||outer.password)throw Error('Invalid live connection');
  let raw=outer.searchParams.get('wss');if(!raw)throw Error('Missing live connection');
  if(!raw.startsWith('wss://'))raw='wss://'+raw;
  const u=new URL(raw);
  if(u.protocol!=='wss:'||u.hostname!=='live.browser.run'||u.port||u.username||u.password||u.hash||!/^\/api\/devtools\/browser\/[a-z0-9-]+\/page\/[a-z0-9-]+$/i.test(u.pathname)||!u.searchParams.get('jwt')||[...u.searchParams.keys()].some(k=>k!=='jwt'))throw Error('Invalid live connection');
  return u.href;
}
function installMobileInput(validate) {
  const frame=document.getElementById('schoolframe');const box=document.getElementById('phoneinput'),field=document.getElementById('phonevalue'),out=document.getElementById('phoneoutput');
  let socket=null,requestId=0,pending=new Map(),busy=false;
  function disconnect(){field.value='';frame.src='about:blank';socket?.close();socket=null;for(const value of pending.values()){clearTimeout(value.timer);value.reject(Error('Connection closed'));}pending.clear();box.hidden=true;}
  function connect(link){disconnect();try{socket=new WebSocket(validate(link));frame.src=link;box.hidden=false;out.textContent='手机输入连接中…';socket.onopen=()=>{out.textContent='手机输入已连接；在本页学校画面点选目标输入框，再在下方输入。';};socket.onclose=()=>{out.textContent='输入连接已关闭；窗口仍有效时可点“打开学校登录”刷新连接。';};socket.onmessage=e=>{let data;try{data=JSON.parse(e.data);}catch{return}const job=pending.get(data.id);if(!job)return;clearTimeout(job.timer);pending.delete(data.id);data.error?job.reject(Error('Input rejected')):job.resolve();};socket.onerror=()=>{out.textContent='手机输入连接失败，未保存输入。';};}catch{out.textContent='官方连接地址不匹配；未发送任何文字。';}}
  function send(method,params){if(!socket||socket.readyState!==1)return Promise.reject(Error('Not connected'));return new Promise((resolve,reject)=>{const id=++requestId,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timed out'));},8000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
  async function action(kind){if(busy)return;busy=true;const value=field.value;field.value='';try{if(kind==='text'){if(!value||value.length>200)throw Error('Invalid input');await send('Input.insertText',{text:value});}else{const key=kind==='tab'?'Tab':'Enter',code=key==='Tab'?9:13;await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});}out.textContent='已发送到当前学校输入框；请查看上方学校画面确认。';}catch{out.textContent='未确认发送成功；请检查学校窗口，勿连续重复发送。';}finally{busy=false;}}
  document.getElementById('phonesend').onclick=()=>action('text');document.getElementById('phonetab').onclick=()=>action('tab');document.getElementById('phoneenter').onclick=()=>action('enter');
  window.addEventListener('pagehide',disconnect);
  window.CanvasPhoneInput={connect,disconnect};
}
export const mobileInputScript=`(${installMobileInput.toString()})(${liveConnectionURL.toString()});`;
export const mobileInputMarkup=`<section id="phoneinput" hidden><h2>学校登录（同页操作）</h2><iframe id="schoolframe" title="本人学校登录画面" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" style="width:100%;height:480px;border:1px solid #ccd4db;border-radius:8px"></iframe><p>无需切换页面：点上方学校画面的 UniKey、密码或验证码输入框，再在下方输入并发送。文字从手机直发 Cloudflare 学校窗口，Site 后端不接收或保存。每次发送后清空；未收到确认时先查看学校窗口。</p><label>本人输入 <input id="phonevalue" type="password" maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false"></label><button id="phonesend">发送到学校输入框</button><button id="phonetab">下一输入框（Tab）</button><button id="phoneenter">学校确认（Enter）</button><p id="phoneoutput" role="status"></p></section>`;
