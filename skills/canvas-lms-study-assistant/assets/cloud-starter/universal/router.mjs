import { combine, failure } from './results.mjs';
// Single-owner deployments still namespace results; bindings/credentials stay request-scoped.
export class UniversalReader {
 constructor({ttlMs=300000,maxConcurrent=2,maxEntries=64}={}){
  if(!Number.isFinite(ttlMs)||ttlMs<0||!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>128)throw Error('Invalid registry limits');
  Object.assign(this,{ttlMs,maxConcurrent,maxEntries,active:0,waiters:[],adapters:new Map(),cache:new Map(),inFlight:new Map()});
 }
 register({id,capabilities,read}){if(!id||!Array.isArray(capabilities)||typeof read!=='function'||this.adapters.has(id))throw Error('Invalid/duplicate adapter');this.adapters.set(id,{id,capabilities:new Set(capabilities),read});return this;}
 discover(capability){return [...this.adapters.values()].filter(a=>a.capabilities.has(capability)).map(a=>a.id);}
 async run(work){if(this.active>=this.maxConcurrent)await new Promise(r=>this.waiters.push(r));else this.active++;try{return await work();}finally{const next=this.waiters.shift();if(next)next();else this.active--;}}
 async query({provider,capability,params={},fresh=false,scope='owner'},context){
  const a=this.adapters.get(provider);if(!a)return failure(provider,'unsupported','Provider not installed');if(!a.capabilities.has(capability))return failure(provider,'unsupported','Capability not offered');
  const key=JSON.stringify([scope,provider,capability,Object.fromEntries(Object.entries(params).sort(([a],[b])=>a.localeCompare(b)))]),saved=this.cache.get(key);
  if(!fresh&&saved&&Date.now()-saved.at<this.ttlMs)return {...structuredClone(saved.value),cache_hit:true,cache_age_ms:Date.now()-saved.at};
  if(this.inFlight.has(key))return structuredClone(await this.inFlight.get(key));
  const work=this.run(async()=>{try{const value=await a.read(capability,params,context);if(value.status==='ok'){this.cache.delete(key);this.cache.set(key,{value:structuredClone(value),at:Date.now()});while(this.cache.size>this.maxEntries)this.cache.delete(this.cache.keys().next().value);}return value;}catch{return failure(provider,'error','Source read failed; no raw provider exception or credential was returned');}});
  this.inFlight.set(key,work);try{return structuredClone(await work);}finally{this.inFlight.delete(key);}
 }
 async batch(requests,context){if(!Array.isArray(requests)||requests.length>8)throw Error('At most 8 source requests');return combine(await Promise.all(requests.map(r=>this.query(r,context))));}
}
