import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/domain/database.types.ts';
import { initials, publicPhoto } from '../../src/domain/catalogue.ts';
import { loadCatalogue } from '../../src/services/catalogue.ts';

const person = { id: '11111111-1111-4111-8111-000000000001', name: 'Melyza', slug: 'melyza', photo_path: null, photo_url: null, avatar_key: 'star', display_order: 1, gifts: [{ count: 0 }] };
test('catalogue uses two public GETs, ordered participants and relational counts with zero retained', async () => {
  const requests: URL[] = [];
  const client = createClient<Database>('http://127.0.0.1:54321', 'sb_publishable_test_only', { auth: { persistSession: false }, global: {
    fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push(url);
      assert.equal(init?.method, 'GET');
      return new Response(JSON.stringify(url.pathname.endsWith('participants') ? [person] : { title: 'Mi evento editable', welcome_message: 'Mi bienvenida' }), { headers: { 'Content-Type': 'application/json' } });
    },
  } });
  const data = await loadCatalogue(new AbortController().signal, client);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get('order'), 'display_order.asc,name.asc,id.asc');
  assert.match(requests[0].searchParams.get('select')!, /gifts\(count\)/);
  assert.equal(data.participants[0].giftCount, 0);
  assert.equal(data.settings.title, 'Mi evento editable');
  assert.ok(!('gifts' in data.participants[0]));
});
test('catalogue rejects provider failures and counts outside the three-position contract', async () => {
  for (const invalid of [true, false]) {
    const client = createClient<Database>('http://127.0.0.1:54321', 'sb_publishable_test_only', { auth: { persistSession: false }, global: {
      fetch: async (input) => new Response(JSON.stringify(invalid ? { message: 'provider internal detail' } : String(input).includes('/participants') ? [{ ...person, gifts: [{ count: 4 }] }] : { title: 'Evento', welcome_message: 'Hola' }), { status: invalid ? 403 : 200, headers: { 'Content-Type': 'application/json' } }),
    } });
    await assert.rejects(loadCatalogue(new AbortController().signal, client));
  }
});
test('avatar fallback initials and published image paths are deterministic and scoped', () => {
  assert.equal(initials('  Derek   Leonardo  '), 'DL');
  assert.equal(initials('Melyza'), 'M');
  assert.equal(publicPhoto(person, 'http://127.0.0.1:54321'), null);
  assert.equal(publicPhoto({ ...person, photo_url: 'javascript:alert(1)' }, 'http://127.0.0.1:54321'), null);
  assert.equal(publicPhoto({ ...person, photo_path: '../private/avatar.webp' }, 'http://127.0.0.1:54321'), null);
  const photo_path = `${person.id}/avatar/33333333-3333-4333-8333-000000000001.webp`;
  assert.equal(publicPhoto({ ...person, photo_path }, 'http://127.0.0.1:54321'), `http://127.0.0.1:54321/storage/v1/object/public/wishlist-media/${photo_path}`);
});
