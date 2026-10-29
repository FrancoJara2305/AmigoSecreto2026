import test from 'node:test';
import assert from 'node:assert/strict';
import type { Gift } from '../../src/domain/database.types.ts';
import { draftFromGift, draftPayload, draftErrors, giftSaveRequest, mergeSavedDraft } from '../../src/domain/gift-editor.ts';
import { GiftMutationError, sendGiftMutation } from '../../src/services/gift-mutations.ts';
import { createPrivateSession } from '../../src/services/private-session.ts';

const owner = '11111111-1111-4111-8111-000000000001';
const token = 'A'.repeat(43);
const scope = { tokenId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', accessType: 'participant' as const, participantId: owner, participantSlug: 'melyza', expiresAt: null };
const gift: Gift = { id: '22222222-2222-4222-8222-000000000001', participant_id: owner, position: 2, title: 'Un deseo', description: null, image_path: null, image_url: null, product_url: null, reference_price: null, currency: 'PEN', gift_type: 'object', details: {}, version: 4, created_at: '', updated_at: '' };
const config = { supabaseUrl: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_test_only', appUrl: 'http://127.0.0.1:5173' };
test('drafts preserve both types locally, emit only active details and keep exact identity/version on updates', () => {
  const draft = draftFromGift(gift); draft.title = 'Mis zapatillas'; draft.gift_type = 'clothing';
  draft.clothing = { subtype: 'footwear', size: '42', size_system: 'EU', alternative_colors: 'Blanco, Negro' }; draft.object = { category: 'Libros' };
  assert.deepEqual(draftPayload(draft).details, { subtype: 'footwear', size: '42', size_system: 'EU', alternative_colors: ['Blanco','Negro'] });
  const request = giftSaveRequest(owner, 2, gift, draft);
  assert.equal(request.action, 'update_gift');
  if (request.action === 'update_gift') { assert.equal(request.expected_version, 4); assert.equal(request.gift_id, gift.id); }
  const saved = mergeSavedDraft(draft, { ...gift, gift_type: 'clothing', details: { subtype: 'footwear' }, version: 5 });
  assert.deepEqual(saved.object, { category: 'Libros' });
  draft.gift_type = 'object'; assert.deepEqual(draftPayload(draft).details, { category: 'Libros' }); assert.equal(draft.clothing.size_system, 'EU');
});
test('title and type suffice, price precision is not rounded and image source is exclusive', () => {
  const draft = draftFromGift(null); draft.title = 'Una idea';
  assert.deepEqual(draftErrors(giftSaveRequest(owner, 1, null, draft)), {});
  draft.reference_price = '1.999'; assert.ok(draftErrors(giftSaveRequest(owner, 1, null, draft)).reference_price);
  draft.reference_price = '0'; draft.currency = 'USD'; assert.deepEqual(draftErrors(giftSaveRequest(owner, 1, null, draft)), {});
  draft.existingPath = `${owner}/gift/33333333-3333-4333-8333-000000000001.webp`; draft.imageSource = 'existing'; draft.image_url = 'https://example.com/image.webp';
  assert.equal(draftPayload(draft).image_url, null); assert.equal(draftPayload(draft).image_path, draft.existingPath);
  draft.imageSource = 'url'; assert.equal(draftPayload(draft).image_path, null); assert.equal(draftPayload(draft).image_url, draft.image_url);
});
test('mutation transport normalizes wire data, never leaks credentials in payload and verifies receipts', async () => {
  const draft = draftFromGift(gift); draft.reference_price = '39,90';
  const result = await sendGiftMutation(token, giftSaveRequest(owner, 2, gift, draft), new AbortController().signal, config, async (url, init) => {
    assert.equal(String(url), `${config.supabaseUrl}/functions/v1/wishlist-api`);
    assert.equal(new Headers(init?.headers).get('x-edit-token'), token); assert.equal(new Headers(init?.headers).get('authorization'), null);
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'error');
    const payload = JSON.parse(String(init?.body)); assert.equal(payload.gift.reference_price, '39.90'); assert.equal(payload.expected_version, 4); assert.equal(payload.gift_id, gift.id);
    assert.equal(String(init?.body).includes(token), false);
    return Response.json({ gift: { ...gift, version: 5, reference_price: 39.90, unexpected: 'not retained' } });
  });
  assert.ok('gift' in result); if ('gift' in result) { assert.equal(result.gift.version, 5); assert.ok(!('unexpected' in result.gift)); }
  await assert.rejects(sendGiftMutation(token, giftSaveRequest(owner, 2, gift, draft), new AbortController().signal, config, async () => Response.json({ gift: { ...gift, participant_id: 'other', version: 5 } })), (error: unknown) => error instanceof GiftMutationError && error.kind === 'uncertain');
});
test('conflicts, field errors, rate limits and lost responses never auto-retry or claim success', async () => {
  const request = giftSaveRequest(owner, 2, gift, draftFromGift(gift));
  for (const [status, kind] of [[409,'conflict'],[422,'fields'],[429,'rate'],[401,'access'],[503,'uncertain']] as const) {
    let calls = 0;
    await assert.rejects(sendGiftMutation(token, request, new AbortController().signal, config, async () => { calls++; return Response.json({ error: { message: 'private SQL detail', fields: { title: 'Revisa el título', secret: 'hidden' } } }, { status, headers: { 'Retry-After': '2' } }); }), (error: unknown) => {
      assert.ok(error instanceof GiftMutationError); assert.equal(error.kind, kind); assert.ok(!error.message.includes('SQL'));
      if (status === 422) assert.deepEqual(error.fields, { title: 'Revisa el título' }); return true;
    });
    assert.equal(calls, 1);
  }
});
test('session mutation requires a live matching scope, prevents duplicate requests and survives same-credential revalidation', async (t) => {
  let calls = 0; let done!: (value: { gift: Gift }) => void;
  const session = createPrivateSession(async () => scope, async (secret) => { assert.equal(secret, token); calls++; return new Promise((resolve) => { done = resolve; }); });
  t.after(() => session.close());
  const request = giftSaveRequest(owner, 2, gift, draftFromGift(gift)); const signal = new AbortController().signal;
  await assert.rejects(session.mutate(request, signal), GiftMutationError);
  session.begin(token, 'participant'); await session.verify();
  await assert.rejects(session.mutate({ ...request, participant_id: '11111111-1111-4111-8111-000000000002' }, signal), GiftMutationError);
  const pending = session.mutate(request, signal);
  await assert.rejects(session.mutate(request, signal), (error: unknown) => error instanceof GiftMutationError && error.kind === 'busy');
  await session.verify(); done({ gift: { ...gift, version: 5 } });
  assert.ok('gift' in await pending); assert.equal(calls, 1);
});
test('revocation or closing cannot turn a late mutation response into a successful authorized session', async (t) => {
  let done!: (value: { gift: Gift }) => void;
  const session = createPrivateSession(async () => scope, async () => new Promise((resolve) => { done = resolve; }));
  t.after(() => session.close()); session.begin(token,'participant'); await session.verify();
  const pending = session.mutate(giftSaveRequest(owner, 2, gift, draftFromGift(gift)), new AbortController().signal);
  session.close(); done({ gift: { ...gift, version: 5 } }); await assert.rejects(pending, GiftMutationError);
  assert.equal(session.snapshot().status, 'closed');
  const revoked = createPrivateSession(async () => scope, async () => { throw new GiftMutationError('access'); });
  t.after(() => revoked.close()); revoked.begin(token,'participant'); await revoked.verify();
  await assert.rejects(revoked.mutate(giftSaveRequest(owner, 2, gift, draftFromGift(gift)), new AbortController().signal));
  assert.equal(revoked.snapshot().status, 'unavailable');
});
