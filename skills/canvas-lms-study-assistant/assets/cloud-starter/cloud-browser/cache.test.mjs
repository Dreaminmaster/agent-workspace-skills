import test from 'node:test';
import assert from 'node:assert/strict';
import {usableCachedRead,cachedResult,CACHE_TTL_MS} from './cache.mjs';
test('cached browser content expires, keeps its original read time and never proves live authentication',()=>{
 const now=Date.now(), record={result:{status:'browser_success',source:'browser',fetched_at:new Date(now-60000).toISOString(),text:'synthetic'}};
 assert.equal(usableCachedRead(record,now),true);assert.equal(usableCachedRead(record,now+CACHE_TTL_MS),false);
 const cached=cachedResult(record,now);assert.equal(cached.fetched_at,record.result.fetched_at);assert.equal(cached.cache.authentication_verified_now,false);assert.equal(cached.cache.live_navigation,false);
 assert.equal(usableCachedRead({result:{status:'requires_login',fetched_at:record.result.fetched_at}},now),false);
});
