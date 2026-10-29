import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import type { Database, Gift } from '../../src/domain/database.types.ts';
import { displayPrice, giftDetails, giftImage, giftSlots, publicProfileUrl, safeExternalUrl } from '../../src/domain/profile.ts';
import { loadPublicProfile } from '../../src/services/profile.ts';

const owner = '11111111-1111-4111-8111-000000000001';
const gift: Gift = { id: '22222222-2222-4222-8222-000000000001', participant_id: owner, position: 2, title: 'Una pista', description: null, image_path: null, image_url: null, product_url: null, reference_price: null, currency: 'PEN', gift_type: 'object', details: {}, version: 1, created_at: '', updated_at: '' };
test('three positions preserve gaps, ignore incoming order and reject ambiguous or foreign gifts', () => {
  assert.deepEqual(giftSlots(owner, []).map((slot) => slot.gift), [null,null,null]);
  const slots = giftSlots(owner, [{ ...gift, position: 3 }, { ...gift, id: 'second', position: 1 }]);
  assert.deepEqual(slots.map((slot) => slot.position), [1,2,3]);
  assert.equal(slots[1].gift, null);
  assert.equal(slots[2].gift?.position, 3);
  assert.throws(() => giftSlots(owner, [gift, gift]));
  assert.throws(() => giftSlots(owner, [{ ...gift, participant_id: 'other' }]));
  assert.throws(() => giftSlots(owner, [{ ...gift, position: 4 }]));
});
test('prices retain zero, distinguish missing and show foreign currency without conversion', () => {
  assert.equal(displayPrice(null, 'PEN'), null);
  assert.match(displayPrice(0, 'PEN')!, /S\/.*0[.,]00/);
  assert.match(displayPrice(19.90, 'USD')!, /USD.*19[.,]90/);
  assert.equal(displayPrice(NaN, 'PEN'), null);
  assert.equal(displayPrice(-1, 'PEN'), null);
  assert.equal(displayPrice(50, null), null);
});
test('contextual detail labels preserve footwear size and system, omit blanks and unsupported keys', () => {
  const details = giftDetails({ gift_type: 'clothing', details: { subtype: 'footwear', size: '42', size_system: 'EU', color: '', alternative_colors: ['Blanco','Negro'], category: 'Do not show' } });
  assert.deepEqual(details, [{ label: 'Prenda', value: 'Calzado' },{ label: 'Numeración', value: '42' },{ label: 'Sistema de tallas', value: 'EU' },{ label: 'Colores alternativos', value: 'Blanco, Negro' }]);
  assert.deepEqual(giftDetails({ gift_type: 'object', details: { size: 'No', specifications: 'USB-C', brand: 'Marca' } }), [{ label: 'Marca', value: 'Marca' },{ label: 'Características', value: 'USB-C' }]);
  assert.deepEqual(giftDetails({ gift_type: 'object', details: null }), []);
});
test('public links strip all private query and fragment and images remain owner-scoped', () => {
  assert.equal(publicProfileUrl('derek-leonardo', 'https://example.com/organizador?token=private#token=secret'), 'https://example.com/participante/derek-leonardo');
  for (const value of ['javascript:alert(1)','http://example.com/','https://user:pass@example.com/','https://127.0.0.1/']) assert.equal(safeExternalUrl(value), null);
  assert.equal(safeExternalUrl('https://example.com/producto'), 'https://example.com/producto');
  assert.equal(giftImage(gift, 'http://127.0.0.1:54321'), null);
  assert.equal(giftImage({ ...gift, image_path: 'other/gift/a.webp' }, 'http://127.0.0.1:54321'), null);
  const path = `${owner}/gift/33333333-3333-4333-8333-000000000001.webp`;
  assert.equal(giftImage({ ...gift, image_path: path }, 'http://127.0.0.1:54321'), `http://127.0.0.1:54321/storage/v1/object/public/wishlist-media/${path}`);
});
test('public profile filters by slug in one read, builds gaps and distinguishes missing from provider errors', async () => {
  const requests: URL[] = [];
  let response: unknown = [{ id: owner, name: 'Melyza', slug: 'melyza', avatar_key: 'star', photo_path: null, photo_url: null, personal_message: null, general_preferences: null, gifts: [gift] }];
  let status = 200;
  const client = createClient<Database>('http://127.0.0.1:54321', 'sb_publishable_test_only', { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    requests.push(new URL(String(input))); assert.equal(init?.method, 'GET');
    return new Response(JSON.stringify(response), { status, headers: { 'Content-Type': 'application/json' } });
  } } });
  const signal = new AbortController().signal;
  const result = await loadPublicProfile('melyza', signal, client);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get('slug'), 'eq.melyza');
  assert.match(requests[0].searchParams.get('select')!, /gifts\(\*\)/);
  assert.equal(result?.slots[1].gift?.id, gift.id);
  response = [];
  assert.equal(await loadPublicProfile('missing', signal, client), null);
  const before = requests.length;
  assert.equal(await loadPublicProfile('../private', signal, client), null);
  assert.equal(requests.length, before);
  response = { message: 'Provider detail' }; status = 403;
  await assert.rejects(loadPublicProfile('melyza', signal, client));
});
