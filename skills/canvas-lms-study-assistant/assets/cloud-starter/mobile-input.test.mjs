import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {liveConnectionURL,mobileInputScript} from './mobile-input.mjs';
test('phone input accepts only the official signed page connection',()=>{
 const ws='live.browser.run/api/devtools/browser/test-session/page/test-page?jwt=synthetic';
 assert.equal(liveConnectionURL('https://live.browser.run/ui/view?wss='+encodeURIComponent(ws)),'wss://'+ws);
 for(const link of ['https://evil.example/ui/view?wss='+encodeURIComponent(ws),'https://live.browser.run/ui/view?wss='+encodeURIComponent('evil.example/path?jwt=synthetic'),'https://live.browser.run/ui/view?wss='+encodeURIComponent('live.browser.run/api/devtools/browser/test/page/test?jwt=x&token=y')])assert.throws(()=>liveConnectionURL(link));
});
test('phone keyboard sends only fixed CDP input commands, clears text and never uses Site fetch or persistence',async()=>{
 const nodes=Object.fromEntries(['schoolframe','phoneinput','phonevalue','phoneoutput','phonesend','phonetab','phoneenter'].map(id=>[id,{value:'',hidden:true,textContent:''}]));let socket,sent=[];
 class OfflineSocket {constructor(url){this.url=url;this.readyState=1;socket=this;}close(){this.readyState=3;}send(raw){const d=JSON.parse(raw);sent.push(d);this.onmessage({data:JSON.stringify({id:d.id,result:{}})});}}
 const window={addEventListener(){}};
 const context={window,document:{getElementById:id=>nodes[id]},WebSocket:OfflineSocket,URL,Error,setTimeout,clearTimeout,Map,JSON,fetch:()=>{throw Error('Site transmission forbidden');}};
 Object.defineProperty(context,'localStorage',{get(){throw Error('Storage forbidden');}});Object.defineProperty(context,'sessionStorage',{get(){throw Error('Storage forbidden');}});
 vm.runInNewContext(mobileInputScript,context);
 window.CanvasPhoneInput.connect('https://live.browser.run/ui/view?wss='+encodeURIComponent('live.browser.run/api/devtools/browser/test/page/test?jwt=synthetic'));
 nodes.phonevalue.value='synthetic-only-not-a-school-password';await nodes.phonesend.onclick();assert.equal(nodes.phonevalue.value,'');assert.equal(sent[0].method,'Input.insertText');
 await nodes.phonetab.onclick();await nodes.phoneenter.onclick();assert.deepEqual(sent.map(x=>x.method),['Input.insertText','Input.dispatchKeyEvent','Input.dispatchKeyEvent','Input.dispatchKeyEvent','Input.dispatchKeyEvent']);
 assert.ok(sent.every(x=>!x.method.includes('Runtime')&&!x.method.includes('Network')));
 window.CanvasPhoneInput.disconnect();assert.equal(socket.readyState,3);assert.equal(nodes.schoolframe.src,'about:blank');
});
