import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateToken, hashToken, isToken, privateLink } from '../../supabase/functions/_shared/tokens.ts';

test('tokens encode 256 random bits and hashes agree with SHA-256', async () => {
  const tokens = Array.from({ length: 64 }, generateToken);
  assert.equal(new Set(tokens).size, 64);
  for (const token of tokens) {
    assert.ok(isToken(token));
    assert.equal(Buffer.from(token, 'base64url').length, 32);
    assert.equal(await hashToken(token), createHash('sha256').update(token).digest('hex'));
  }
});
test('malformed and noncanonical capabilities are rejected', async () => {
  for (const value of ['', 'sb_secret_test', 'A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + 'B', null, 'a b']) {
    assert.equal(isToken(value), false);
  }
  await assert.rejects(hashToken('invalid'));
});
test('private links keep capabilities in fragments and reject unsafe origins', () => {
  const token = generateToken();
  const url = new URL(privateLink('http://localhost:5173', token, true));
  assert.equal(url.pathname, '/organizador/acceso');
  assert.equal(url.search, '');
  assert.equal(url.hash, `#token=${token}`);
  assert.equal(new URL(privateLink('https://example.com', token)).pathname, '/acceso');
  for (const origin of ['http://example.com', 'https://u:p@example.com', 'https://example.com?a=b', 'https://example.com/path']) {
    assert.throws(() => privateLink(origin, token));
  }
});
