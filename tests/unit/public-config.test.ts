import test from 'node:test';
import assert from 'node:assert/strict';
import { readPublicConfig } from '../../src/services/public-config.ts';

const valid = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_only',
  VITE_APP_URL: 'http://localhost:5173',
};
const jwt = (role: string) => `${btoa('{}').replace(/=+$/, '')}.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.test`;

test('accepts public configuration and local anon keys', () => {
  assert.equal(readPublicConfig(valid).supabaseUrl, valid.VITE_SUPABASE_URL);
  assert.equal(readPublicConfig({ ...valid, VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }).publishableKey, jwt('anon'));
});

test('rejects missing configuration without revealing values', () => {
  assert.throws(() => readPublicConfig({}), /Configura VITE_SUPABASE_URL/);
  const secret = 'sb_secret_this_must_never_appear';
  assert.throws(() => readPublicConfig({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: secret }),
    (error: unknown) => error instanceof Error && !error.message.includes(secret));
});

test('rejects privileged keys, signed-in JWTs, placeholders and malformed JWTs', () => {
  for (const key of ['sb_secret_fixture', jwt('service_role'), jwt('authenticated'),
    'REPLACE_WITH_PUBLIC_KEY', 'a.b.c', '', 'sb_publishable_']) {
    assert.throws(() => readPublicConfig({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: key }));
  }
});

test('rejects insecure remote URLs, URL credentials and non-origin URLs', () => {
  for (const url of ['http://example.com', 'https://name:password@example.com',
    'javascript:alert(1)', 'https://example.com/path', 'https://example.com?token=secret',
    'https://example.com#token=secret']) {
    assert.throws(() => readPublicConfig({ ...valid, VITE_SUPABASE_URL: url }));
    assert.throws(() => readPublicConfig({ ...valid, VITE_APP_URL: url }));
  }
});
