import { seal, unseal } from './policy.mjs';
export const TASK_TTL_MS = 7 * 86400000;
const toolNames = ['list_courses','get_course_content','get_assignments','read_file','get_messages'];
const keys = ['course_id','kind','page','module_id','group_id','file_id','assignment_id','conversation_id','channel','include_linked_documents','include_past','include_feedback','include_submission','include_quiz_submission','quiz_id','discussion_id','query','week','url','scope'];
export function taskInput(input) {
  if (!toolNames.includes(input?.tool) || !input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments)) throw Error('invalid_task');
  const args = {};
  for (const [k,v] of Object.entries(input.arguments)) {
    if (!keys.includes(k) || !['string','number','boolean'].includes(typeof v)) throw Error('invalid_task');
    if (typeof v === 'string' && (v.length > (k==='url'?2048:300) || /[\u0000-\u001f]/.test(v))) throw Error('invalid_task');
    if (k.endsWith('_id') && (!Number.isSafeInteger(v) || v<1)) throw Error('invalid_task');
    if (k==='url') {
      const u=new URL(v);
      if(u.origin!=='https://canvas.sydney.edu.au'||u.username||u.password||[...u.searchParams.keys()].some(k=>k!=='module_item_id')||u.hash)throw Error('invalid_task');
    }
    args[k]=v;
  }
  const stage = ['school_login','browser_wait','third_party_authorization','visible_interaction','authorised_import'].includes(input.stage) ? input.stage : 'visible_interaction';
  const base=args.course_id?'https://canvas.sydney.edu.au/courses/'+args.course_id:'https://canvas.sydney.edu.au';
  const resource_url=args.url || (args.group_id&&args.page?'https://canvas.sydney.edu.au/groups/'+args.group_id+'/pages/'+encodeURIComponent(args.page):args.page?base+'/pages/'+encodeURIComponent(args.page):args.file_id?base+'/files/'+args.file_id:args.assignment_id?base+'/assignments/'+args.assignment_id:args.kind==='module'?base+'/modules':args.conversation_id?'https://canvas.sydney.edu.au/conversations':base);
  return { tool:input.tool, arguments:args, resource_url, stage };
}
export function validTaskId(id) { return typeof id==='string' && /^[a-f0-9-]{36}$/.test(id); }
// Separate encrypted namespace: does not change or reuse the private course index.
export async function saveTask(storage, key, input) {
  const data=taskInput(input), id=crypto.randomUUID(), now=Date.now();
  const old=await storage.list({prefix:'pending-task:'});
  for(const [name,encrypted] of old){const value=await unseal(encrypted,key,name);if(value.expires_at<=now)await storage.delete(name);
    else if(value.status==='needs_owner_action'&&value.tool===data.tool&&value.stage===data.stage&&JSON.stringify(value.arguments)===JSON.stringify(data.arguments))return {status:'task_saved',persisted:true,reused:true,task:value};}
  if((await storage.list({prefix:'pending-task:'})).size>=20)return {status:'task_capacity_reached',persisted:false};
  const name='pending-task:'+id, task={id,...data,created_at:new Date(now).toISOString(),expires_at:now+TASK_TTL_MS,status:'needs_owner_action'};
  await storage.put(name,await seal(task,key,name));
  return {status:'task_saved',persisted:true,task};
}
export async function getTask(storage,key,id) {
  if(!validTaskId(id))throw Error('invalid_task');
  const name='pending-task:'+id, encrypted=await storage.get(name);
  if(!encrypted)return {status:'task_not_found'};
  const task=await unseal(encrypted,key,name);
  if(task.expires_at<=Date.now()){await storage.delete(name);return {status:'task_expired'};}
  return {status:'task_found',task};
}
export async function updateTask(storage,key,id,status) {
  const found=await getTask(storage,key,id);if(!found.task)return found;
  if(!['needs_owner_action','completed_resource','partial_resource','permission_limited'].includes(status))throw Error('invalid_task');
  const name='pending-task:'+id, task={...found.task,status,updated_at:new Date().toISOString()};
  await storage.put(name,await seal(task,key,name));return {status:'task_updated',task};
}
