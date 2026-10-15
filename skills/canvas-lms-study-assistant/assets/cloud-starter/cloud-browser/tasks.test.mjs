import test from 'node:test';
import assert from 'node:assert/strict';
import {saveTask,getTask,updateTask,taskInput} from './tasks.mjs';
function storage(map=new Map()) {return {get:async k=>map.get(k),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),list:async({prefix})=>new Map([...map].filter(([k])=>k.startsWith(prefix))),map};}
test('non-sensitive pending task survives a new service instance, is encrypted and bounded',async()=>{
 const key=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),s=storage();
 const input={tool:'get_course_content',arguments:{course_id:101,kind:'page',page:'example-week-overview'},stage:'school_login'};
 const a=await saveTask(s,key,input),b=await saveTask(s,key,input);assert.equal(a.task.id,b.task.id);assert.equal(b.reused,true);
 assert.equal(JSON.stringify([...s.map.values()]).includes('example-week-overview'),false);
 const restarted=storage(s.map),found=await getTask(restarted,key,a.task.id);assert.equal(found.task.arguments.course_id,101);assert.ok(found.task.resource_url.endsWith('/pages/example-week-overview'));
 await updateTask(restarted,key,a.task.id,'partial_resource');assert.equal((await getTask(s,key,a.task.id)).task.status,'partial_resource');
 for(const args of [{token:'secret'},{url:'https://evil.example'},{url:'https://canvas.sydney.edu.au/files/1?verifier=secret'}])assert.throws(()=>taskInput({...input,arguments:args}));
 assert.throws(()=>taskInput({...input,tool:'execute_browser_code'}));
});
