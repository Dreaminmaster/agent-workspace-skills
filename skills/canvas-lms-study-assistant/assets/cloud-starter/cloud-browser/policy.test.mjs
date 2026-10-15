import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetURL, permittedReadRequest, seal, unseal } from './policy.mjs';

test('bounded targets reject arbitrary destinations, traversal and state-changing content', () => {
  assert.equal(targetURL({ kind: 'page', course_id: 101, page: 'example-week-overview' }), 'https://canvas.sydney.edu.au/courses/101/pages/example-week-overview');
  for (const page of ['../../logout', 'https://evil.example', 'x?url=https://evil.example', '%2e%2e']) assert.throws(() => targetURL({ kind: 'page', course_id: 101, page }));
  for (const kind of ['inbox', 'quiz', 'lti', 'module', 'assignment', 'code']) assert.throws(() => targetURL({ kind, course_id: 101 }));
  assert.throws(() => targetURL({ kind: 'files', course_id: '101' }));
});
test('read requests deny writes, unsafe routes, credentials and off-domain connections', () => {
  assert.equal(permittedReadRequest('https://canvas.sydney.edu.au/courses/101/pages/example-week-overview', 'GET'), true);
  for (const url of ['https://canvas.sydney.edu.au/logout', 'https://canvas.sydney.edu.au/lo%67out', 'https://canvas.sydney.edu.au/courses/1/assignments/2', 'https://canvas.sydney.edu.au/courses/1/quizzes/2/history', 'https://canvas.sydney.edu.au/courses/1/modules/items/2', 'https://canvas.sydney.edu.au/conversations/1', 'https://canvas.sydney.edu.au/courses/1/external_tools/4', 'https://127.0.0.1', 'https://169.254.169.254', 'https://canvas.sydney.edu.au.evil.example', 'https://user:pass@canvas.sydney.edu.au/']) assert.equal(permittedReadRequest(url, 'GET'), false);
  for (const host of ['du11hjcvx0uqb.cloudfront.net', 'd1embgbpmfo5b.cloudfront.net', 'instructure-uploads-apse2.s3.ap-southeast-2.amazonaws.com']) {
    assert.equal(permittedReadRequest('https://' + host + '/static.js', 'GET'), true);
    assert.equal(permittedReadRequest('https://' + host + '/static.js', 'POST'), false);
  }
  assert.equal(permittedReadRequest('https://unrelated.cloudfront.net/static.js', 'GET'), false);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal(permittedReadRequest('https://canvas.sydney.edu.au/api/v1/courses', method), false);
});
test('encrypted records require the right key, purpose and intact ciphertext', async () => {
  const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const other = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const data = { synthetic: true, value: 'security-test-only' };
  const encrypted = await seal(data, key, 'session');
  assert.deepEqual(await unseal(encrypted, key, 'session'), data);
  await assert.rejects(unseal(encrypted, other, 'session'));
  await assert.rejects(unseal(encrypted, key, 'index'));
  await assert.rejects(unseal({ ...encrypted, ciphertext: encrypted.ciphertext.slice(4) }, key, 'session'));
  assert.equal(JSON.stringify(encrypted).includes(data.value), false);
});

test('school recovery excludes broad-domain, unrelated and expired cookies',async()=>{
 const {scopedSSOCookies}=await import('./policy.mjs');
 const now=Date.now(), sample=domain=>({domain,expires:now/1000+60,name:'synthetic',value:'synthetic'});
 const cookies=[sample('.sso.sydney.edu.au'),sample('sso.canvaslms.com'),sample('.sydney.edu.au'),sample('accounts.google.com'),{...sample('sso.sydney.edu.au'),expires:now/1000-1}];
 assert.equal(scopedSSOCookies(cookies,now).length,2);
});
