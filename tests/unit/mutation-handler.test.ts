import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessHandler } from '../../supabase/functions/_shared/access-handler.ts';
import { generateToken, hashToken } from '../../supabase/functions/_shared/tokens.ts';
import type { MutationRpcArgs } from '../../supabase/functions/_shared/mutation-validation.ts';
const token = generateToken();
const origin = 'http://localhost:5173';
const participant = '11111111-1111-4111-8111-000000000001';
const request = (body: unknown) => new Request('http://localhost/wishlist-api', { method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Edit-Token': token }, body: JSON.stringify(body) });
test('mutations call only the server mutation RPC with hashes and normalized data', async () => {
  const calls: MutationRpcArgs[] = [];
  const handler = createAccessHandler({ allowedOrigins: [origin], appBaseUrl: origin,
    async callRpc() { throw new Error('Must not separately validate outside the mutation transaction'); },
    async callMutationRpc(args) { calls.push(args); return { ok: true, gift: { id: 'new', version: 1 } }; } });
  const response = await handler(request({ action: 'create_gift', participant_id: participant, position: 1,
    gift: { title: 'Polo', gift_type: 'clothing', reference_price: '25,5' } }));
  assert.equal(response.status, 201);
  assert.equal(calls[0].p_token_hash, await hashToken(token));
  assert.equal(calls[0].p_payload.reference_price, '25.50');
  assert.ok(!JSON.stringify(calls).includes(token));
});
test('invalid mutation returns field errors before database or any save', async () => {
  let calls = 0;
  const handler = createAccessHandler({ allowedOrigins: [origin], appBaseUrl: origin,
    async callRpc() { throw new Error('Not called'); }, async callMutationRpc() { calls++; return { ok: true }; } });
  const response = await handler(request({ action: 'create_gift', participant_id: participant, position: 1,
    gift: { title: '', gift_type: 'object', reference_price: '1.123' } }));
  assert.equal(response.status, 422);
  assert.ok((await response.json()).error.fields.title);
  assert.equal(calls, 0);
});
test('version conflicts and revoked tokens propagate without automatic retries', async () => {
  for (const [error, status] of [['CONFLICT', 409], ['ACCESS_UNAVAILABLE', 401]] as const) {
    let calls = 0;
    const handler = createAccessHandler({ allowedOrigins: [origin], appBaseUrl: origin,
      async callRpc() { throw new Error('Not called'); },
      async callMutationRpc() { calls++; return { ok: false, error, status }; } });
    const response = await handler(request({ action: 'update_profile', participant_id: participant,
      expected_version: 1, profile: { personal_message: 'Hola' } }));
    assert.equal(response.status, status);
    assert.equal(calls, 1);
  }
});
