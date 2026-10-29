import test from 'node:test';
import assert from 'node:assert/strict';
import { consumePrivateEntry, fragmentCredential, parseAccessScope } from '../../src/domain/private-access.ts';
import type { AccessScope } from '../../src/domain/private-access.ts';
import { PrivateAccessError, validatePrivateAccess } from '../../src/services/access-validation.ts';
import { createPrivateSession } from '../../src/services/private-session.ts';

// Ephemeral fixture strings only, never accepted by a real project or included in src.
const token = 'A'.repeat(43);
const another = 'B'.repeat(42) + 'A';
const owner = '11111111-1111-4111-8111-000000000001';
const scope: AccessScope = { tokenId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', accessType: 'participant', participantId: owner, participantSlug: 'melyza', expiresAt: null };
const wire = { access: { token_id: scope.tokenId, access_type: 'participant', participant_id: owner, participant_slug: 'melyza', expires_at: null } };
test('entry cleans query/hash and history state before handing off canonical credential, never accepts query credentials', () => {
  const calls: unknown[] = [];
  const history = { replaceState: (...args: unknown[]) => { calls.push(args); } };
  const result = consumePrivateEntry({ pathname: '/acceso', search: '', hash: `#token=${token}` }, history);
  assert.deepEqual(calls, [[null, '', '/acceso']]);
  assert.deepEqual(result, { type: 'participant', token });
  assert.equal(consumePrivateEntry({ pathname: '/organizador/acceso', search: '?token=hidden', hash: `#token=${token}` }, history)?.token, null);
  assert.equal(fragmentCredential(`#token=${token}&token=${token}`), null);
  assert.equal(fragmentCredential('#token=invalid'), null);
  assert.equal(consumePrivateEntry({ pathname: '/participante/melyza', search: '', hash: `#token=${token}` }, history), null);
  assert.deepEqual(calls.at(-1), [null, '', '/participante/melyza']);
});
test('validation uses only capability header, never URL/body/cookies/Authorization, and validates response shape', async () => {
  const config = { supabaseUrl: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_test_only', appUrl: 'http://127.0.0.1:5173' };
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'http://127.0.0.1:54321/functions/v1/wishlist-api');
    assert.equal(init?.method, 'POST'); assert.equal(init?.credentials, 'omit'); assert.equal(init?.cache, 'no-store'); assert.equal(init?.redirect, 'error');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-edit-token'), token); assert.equal(headers.get('apikey'), config.publishableKey);
    assert.equal(headers.get('authorization'), null);
    assert.deepEqual(JSON.parse(String(init?.body)), { action: 'validate_access', participant_id: owner });
    assert.ok(!String(init?.body).includes(token));
    return Response.json(wire);
  };
  assert.deepEqual(await validatePrivateAccess(token, owner, new AbortController().signal, config, fetcher), scope);
  assert.throws(() => parseAccessScope({ access: { ...wire.access, participant_id: 'foreign', token: 'do not expose' } }));
  assert.throws(() => parseAccessScope({ access: { ...wire.access, expires_at: new Date(Date.now() - 1000).toISOString() } }));
});
test('HTTP denials, bounded responses, network failures and 429 remain generic and do not leak provider detail', async () => {
  const config = { supabaseUrl: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_test_only', appUrl: 'http://127.0.0.1:5173' };
  for (const status of [401,403,429,503]) {
    await assert.rejects(validatePrivateAccess(token, undefined, new AbortController().signal, config, async () => new Response('provider-secret-detail', { status, headers: { 'Retry-After': '3' } })), (error: unknown) => {
      assert.ok(error instanceof PrivateAccessError);
      assert.equal(error.kind, status === 429 ? 'rate-limited' : status === 503 ? 'temporary' : 'denied');
      assert.equal(error.message.includes('provider-secret'), false);
      if (status === 429) assert.equal(error.retryAfter, 3);
      return true;
    });
  }
  await assert.rejects(validatePrivateAccess(token, undefined, new AbortController().signal, config, async () => new Response('x'.repeat(9000))), PrivateAccessError);
});
test('session deduplicates validation, keeps only metadata in snapshots, scopes owner and erases on close', async (t) => {
  let requests = 0;
  const session = createPrivateSession(async (secret) => { requests++; assert.equal(secret, token); return scope; });
  t.after(() => session.close());
  session.begin(token, 'participant');
  assert.equal(session.snapshot().status, 'pending');
  const one = session.verify(); const two = session.verify();
  assert.equal(one, two);
  await one; assert.equal(requests, 1); assert.equal(session.snapshot().status, 'ready');
  assert.equal(JSON.stringify(session.snapshot()).includes(token), false);
  assert.equal(await session.verify('11111111-1111-4111-8111-000000000002'), null);
  assert.equal(requests, 1);
  session.close(); assert.deepEqual(session.snapshot(), { status: 'closed' });
  assert.equal(await session.verify(), null); assert.equal(requests, 1);
});
test('closed or replaced credentials cannot be resurrected by an old response', async (t) => {
  let resolve!: (value: AccessScope) => void;
  const session = createPrivateSession(() => new Promise((done) => { resolve = done; }));
  t.after(() => session.close());
  session.begin(token, 'participant'); const old = session.verify(); await Promise.resolve();
  session.close(); resolve(scope); await old;
  assert.equal(session.snapshot().status, 'closed');
  session.begin(token, 'participant'); const replaced = session.verify(); await Promise.resolve();
  session.begin(another, 'participant'); resolve(scope); await replaced;
  assert.equal(session.snapshot().status, 'pending');
});
test('wrong role, revocation and expiration clear permissions, temporary errors withhold them and allow explicit retry', async (t) => {
  let result: AccessScope | PrivateAccessError = scope;
  const session = createPrivateSession(async () => { if (result instanceof Error) throw result; return result; });
  t.after(() => session.close());
  session.begin(token, 'organizer'); await session.verify(); assert.equal(session.snapshot().status, 'unavailable');
  session.begin(token, 'participant'); await session.verify();
  result = new PrivateAccessError('temporary'); await session.verify(); assert.equal(session.snapshot().status, 'temporary');
  result = scope; await session.verify(); assert.equal(session.snapshot().status, 'ready');
  result = new PrivateAccessError('denied'); await session.verify(); assert.equal(session.snapshot().status, 'unavailable');
  result = { ...scope, expiresAt: new Date(Date.now() + 40).toISOString() };
  session.begin(token, 'participant'); await session.verify();
  await new Promise((resolve) => setTimeout(resolve, 65));
  assert.equal(session.snapshot().status, 'unavailable');
});
test('rate limit disables premature retries without issuing another request', async (t) => {
  let requests = 0;
  const session = createPrivateSession(async () => { requests++; throw new PrivateAccessError('rate-limited', 60); });
  t.after(() => session.close());
  session.begin(token, 'participant'); await session.verify();
  const state = session.snapshot(); assert.equal(state.status, 'temporary');
  if (state.status === 'temporary') { assert.equal(state.rateLimited, true); assert.ok(state.retryAt > Date.now()); }
  await session.verify(); assert.equal(requests, 1);
});
