import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrice, normalizeHttpsUrl, validateMutation } from '../../supabase/functions/_shared/mutation-validation.ts';
const participant = '11111111-1111-4111-8111-000000000001';
const gift = '22222222-2222-4222-8222-000000000001';
test('prices normalize local decimal strings without silently rounding precision', () => {
  assert.equal(normalizePrice('25,90'), '25.90');
  assert.equal(normalizePrice(0), '0.00');
  assert.equal(normalizePrice(0.29), '0.29');
  assert.equal(normalizePrice('9999999999.99'), '9999999999.99');
  for (const value of [-1, Infinity, NaN, '1.999', '1,000.50', true, {}, '10000000000']) assert.throws(() => normalizePrice(value));
});
test('only public HTTPS reference links are accepted without fetching them', () => {
  assert.equal(normalizeHttpsUrl('https://example.com'), 'https://example.com/');
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://u:p@example.com',
    'https://127.0.0.1', 'https://[::1]', 'https://host.internal/p', 'https://host:4000/p', 'https://example.com\\x']) {
    assert.throws(() => normalizeHttpsUrl(url));
  }
});
test('create normalizes required fields, defaults PEN and does not require three gifts', () => {
  const result = validateMutation({ action: 'create_gift', participant_id: participant, position: 2,
    gift: { title: '  Un libro  ', gift_type: 'object', reference_price: '30,5' } });
  assert.ok(result.ok);
  assert.equal(result.args.p_payload.title, 'Un libro');
  assert.equal(result.args.p_payload.reference_price, '30.50');
  assert.equal(result.args.p_payload.currency, 'PEN');
  assert.equal(result.args.p_gift_id, null);
});
test('ids, versions, owner fields and unknown actions cannot be overposted', () => {
  for (const value of [
    { action: 'update_profile', participant_id: participant, profile: { personal_message: 'Hola' } },
    { action: 'update_profile', participant_id: participant, expected_version: 1, profile: { slug: 'new-owner' } },
    { action: 'create_gift', participant_id: participant, position: 4, gift: { title: 'x', gift_type: 'object' } },
    { action: 'update_gift', participant_id: participant, position: 1, expected_version: 1, gift_id: gift, gift: { participant_id: gift } },
    { action: 'delete_gift', participant_id: participant, position: 1, expected_version: 1 },
    { action: 'update_profile', participant_id: participant, expected_version: 1, profile: { personal_message: {} } },
    { action: 'delete_participant', participant_id: participant },
  ]) assert.equal(validateMutation(value).ok, false);
});
test('details are bounded and specific to the active gift type', () => {
  const base = { action: 'create_gift', participant_id: participant, position: 1 };
  assert.equal(validateMutation({ ...base, gift: { title: 'Zapatos', gift_type: 'clothing', details: { subtype: 'footwear', size: '39', size_system: 'EU' } } }).ok, true);
  for (const details of [{ size: 'M' }, { color: {} }, { extra: 'unknown' }]) {
    assert.equal(validateMutation({ ...base, gift: { title: 'Objeto', gift_type: 'object', details } }).ok, false);
  }
  assert.equal(validateMutation({ ...base, gift: { title: 'Prenda', gift_type: 'clothing', details: { alternative_colors: Array(9).fill('azul') } } }).ok, false);
});
test('image sources are exclusive and changing to URL clears the file reference', () => {
  const base = { action: 'update_profile', participant_id: participant, expected_version: 1 };
  const result = validateMutation({ ...base, profile: { photo_url: 'https://example.com/avatar.webp' } });
  assert.ok(result.ok);
  assert.equal(result.args.p_payload.photo_path, null);
  assert.equal(validateMutation({ ...base, profile: { photo_url: 'https://example.com/avatar.webp', photo_path: 'file' } }).ok, false);
});

test('prototype-like overposted keys are rejected rather than silently dropped', () => {
  const gift = JSON.parse('{"title":"Libro","gift_type":"object","__proto__":{"admin":true}}');
  const result = validateMutation({ action: 'create_gift', participant_id: participant, position: 1, gift });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(Object.hasOwn(result.fields, '__proto__'));
});
