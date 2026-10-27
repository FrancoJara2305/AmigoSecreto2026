import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessHandler, type AccessRpcArgs, type AccessRpcResult } from '../../supabase/functions/_shared/access-handler.ts';
import { generateToken, hashToken } from '../../supabase/functions/_shared/tokens.ts';

const origin = 'http://localhost:5173';
const participant = '11111111-1111-4111-8111-000000000001';
const token = generateToken();
function request(body: unknown, options: { token?: string; origin?: string; method?: string; search?: string } = {}) {
  return new Request(`http://localhost/wishlist-api${options.search ?? ''}`, {
    method: options.method ?? 'POST',
    headers: { Origin: options.origin ?? origin, 'X-Edit-Token': options.token ?? token, 'Content-Type': 'application/json' },
    body: ['GET', 'OPTIONS'].includes(options.method ?? '') ? undefined : JSON.stringify(body),
  });
}
function setup(result: AccessRpcResult = { ok: true, access: { access_type: 'organizer' } }) {
  const calls: AccessRpcArgs[] = [];
  const handler = createAccessHandler({ allowedOrigins: [origin], appBaseUrl: origin,
    async callRpc(args) { calls.push(args); return result; } });
  return { handler, calls };
}
test('validate forwards only a hash and returns no-store response', async () => {
  const { handler, calls } = setup();
  const response = await handler(request({ action: 'validate_access' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls[0].p_token_hash, await hashToken(token));
  assert.ok(!JSON.stringify(calls).includes(token));
});
test('missing/invalid tokens, wrong origin, unexpected fields and oversized body never reach DB', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request({ action: 'validate_access' }, { token: '' }))).status, 401);
  assert.equal((await handler(request({ action: 'validate_access' }, { origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await handler(request({ action: 'bootstrap' }))).status, 422);
  assert.equal((await handler(request({ action: 'validate_access', is_admin: true }))).status, 422);
  assert.equal((await handler(request({ action: 'validate_access', extra: 'x'.repeat(5000) }))).status, 413);
  assert.equal((await handler(request({ action: 'validate_access' }, { search: '?token=hidden' }))).status, 422);
  assert.equal(calls.length, 0);
});
test('personal link issuance returns a fragment link only after server authorization', async () => {
  const { handler, calls } = setup({ ok: true, token_id: 'id', expires_at: null, token_hash: 'must-not-leak' });
  const response = await handler(request({ action: 'issue_participant_link', participant_id: participant }));
  assert.equal(response.status, 200);
  const body = await response.json();
  const issued = new URL(body.private_link).hash.substring('#token='.length);
  assert.equal(calls[0].p_new_hash, await hashToken(issued));
  assert.equal(body.token_hash, undefined);
  const denied = setup({ ok: false, error: 'FORBIDDEN', status: 403 });
  const denial = await denied.handler(request({ action: 'issue_participant_link', participant_id: participant }));
  assert.equal(denial.status, 403);
  assert.equal((await denial.json()).private_link, undefined);
});
test('rate limits, network failures and unconfigured origins fail closed without secrets', async () => {
  const { handler } = setup({ ok: false, error: 'RATE_LIMITED', status: 429, retry_after: 12 });
  const response = await handler(request({ action: 'validate_access' }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '12');
  const failed = createAccessHandler({ allowedOrigins: [origin], appBaseUrl: origin,
    async callRpc() { throw new Error(`sensitive ${token}`); } });
  const error = await failed(request({ action: 'validate_access' }));
  assert.equal(error.status, 503);
  assert.ok(!(await error.text()).includes(token));
  const closed = createAccessHandler({ allowedOrigins: [], appBaseUrl: origin, async callRpc() { throw new Error('unreachable'); } });
  assert.equal((await closed(request({ action: 'validate_access' }))).status, 503);
});
test('preflight is restricted and methods cannot bypass token authorization', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request({}, { method: 'OPTIONS' }))).status, 204);
  assert.equal((await handler(request({}, { method: 'OPTIONS', origin: 'null' }))).status, 403);
  assert.equal((await handler(request({}, { method: 'GET' }))).status, 405);
  assert.equal(calls.length, 0);
});

test('expiry accepts ISO UTC timestamps and rejects invalid calendar values before calling SQL', async () => {
  const { handler, calls } = setup({ ok: true });
  for (const expires_at of ['1', 'infinity', '2026-02-30T12:00:00Z', '2026-13-01T00:00:00Z', '2026-12-25']) {
    assert.equal((await handler(request({ action: 'issue_participant_link', participant_id: participant, expires_at }))).status, 422);
  }
  assert.equal(calls.length, 0);
  assert.equal((await handler(request({ action: 'issue_participant_link', participant_id: participant,
    expires_at: '2030-12-25T12:00:00Z' }))).status, 200);
  assert.equal(calls[0].p_expires_at, '2030-12-25T12:00:00Z');
});
