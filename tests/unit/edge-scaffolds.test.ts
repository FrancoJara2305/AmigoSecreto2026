import test from 'node:test';
import assert from 'node:assert/strict';
import { unavailable } from '../../supabase/functions/_shared/unavailable.ts';

test('disabled import/upload handler rejects mutations even when a token/key is supplied', async () => {
  for (const token of ['', 'invalid', 'A'.repeat(43), 'sb_secret_fixture']) {
    const response = unavailable(new Request('https://example.com/wishlist-api', {
      method: 'POST', headers: { 'X-Edit-Token': token, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'deleteParticipant' }),
    }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'FEATURE_NOT_ENABLED');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});

test('no method or CORS preflight opens an alternate path', () => {
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    const response = unavailable(new Request('https://example.com', { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});
