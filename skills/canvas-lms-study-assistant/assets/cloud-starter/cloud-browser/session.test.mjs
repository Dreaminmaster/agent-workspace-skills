import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionStatus,retryDeadline} from './session.mjs';
test('saved credentials do not imply verification; expiry and reauth remain distinct',()=>{
 assert.equal(sessionStatus({expires_at:5}).status,'saved_unverified');
 assert.equal(sessionStatus(null,{reason:'school_session_expired'}).authentication_state,'school_session_expired');
 assert.equal(sessionStatus({expires_at:5,verified_at:'date'}).last_verified_at,'date');
 assert.equal(sessionStatus(null,{reason:'school_session_expired',last_verified_at:'previous-success'}).last_verified_at,'previous-success');
 assert.equal(sessionStatus(null,{reason:'canvas_session_saved'}).authentication_state,'record_missing_after_save');
});
test('429 has bounded backoff even with missing/invalid headers and daily quota',()=>{
 const now=Date.UTC(2026,9,11,3);
 assert.equal(retryDeadline(null,now),now+20000);
 assert.equal(retryDeadline('broken',now),now+20000);
 assert.equal(retryDeadline('999999',now),now+999999000);
 assert.equal(retryDeadline(new Date(now+45000).toUTCString(),now),now+45000);
 assert.equal(retryDeadline(null,now,true),Date.UTC(2026,9,12));
 assert.equal(retryDeadline('120000',now,true),now+120000000);
});
