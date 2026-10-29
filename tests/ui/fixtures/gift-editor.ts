import { expect, type Page } from '@playwright/test';
import type { Gift } from '../../../src/domain/database.types';

export const fixtureCredential = 'A'.repeat(43);
export const fixtureOwner = '11111111-1111-4111-8111-000000000001';
export const api = 'http://127.0.0.1:4174';
const cors = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4173', 'Access-Control-Expose-Headers': 'Retry-After', 'Cache-Control': 'no-store' };
export function sampleGift(position = 1): Gift {
  return { id: `22222222-2222-4222-8222-${String(position).padStart(12,'0')}`, participant_id: fixtureOwner, position, title: 'Una idea guardada', description: 'Una descripción inicial.', image_path: null, image_url: null, product_url: null, reference_price: null, currency: 'PEN', gift_type: 'object', details: {}, version: 1, created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z' };
}
// Stateful transport fixture, isolated from SQL seeds and real Supabase data.
export async function editorFixture(page: Page, initial: Gift[] = [], organizer = false, target = fixtureOwner) {
  const slug = target === fixtureOwner ? 'melyza' : 'karina'; const name = target === fixtureOwner ? 'Melyza' : 'Karina';
  const state = { gifts: structuredClone(initial), writes: [] as Record<string, unknown>[], uploads: [] as string[], uploadFault: 0, uploadDelay: 0, uploadRetryAfter: '1', fault: '' as '' | 'fields' | 'lost' | 'access' | 'rate', field: 'title', delay: 0, counter: 10 };
  await page.route('**/*', (route) => ['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.route(`${api}/functions/v1/media-upload`,async(route)=>{
    if (route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:{...cors,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'content-type,apikey,x-edit-token,x-participant-id,x-media-purpose'}});
    expect(route.request().headers()['x-edit-token']).toBe(fixtureCredential);
    expect(route.request().headers()['x-participant-id']).toBe(target);
    expect(route.request().headers()['x-media-purpose']).toBe('gift');
    state.uploads.push(route.request().headers()['content-type']);
    if (state.uploadDelay) await new Promise((resolve)=>setTimeout(resolve,state.uploadDelay));
    if (state.uploadFault) return route.fulfill({status:state.uploadFault,json:{error:{code:'SERVER_ERROR'}},headers:{...cors,...(state.uploadFault===429?{'Retry-After':state.uploadRetryAfter}:{})}});
    return route.fulfill({status:201,json:{path:`${target}/gift/33333333-3333-4333-8333-${String(state.uploads.length).padStart(12,'0')}.webp`},headers:cors});
  });
  await page.route(`${api}/rest/v1/participants?**`, async (route) => {
    const filter = new URL(route.request().url()).searchParams.get('slug');
    if (filter === `eq.${slug}`) return route.fulfill({ json: [{ id: target, name, slug, avatar_key: 'star', photo_path: null, photo_url: null, personal_message: null, general_preferences: null, gifts: state.gifts }], headers: cors });
    if (filter) return route.continue();
    const response = await route.fetch(); const rows = await response.json();
    for (const person of rows) if (person.id === target) person.gifts = [{ count: state.gifts.length }];
    return route.fulfill({ response, json: rows });
  });
  await page.route(`${api}/functions/v1/wishlist-api`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type,apikey,x-edit-token' } });
    const body = route.request().postDataJSON();
    expect(route.request().headers()['x-edit-token']).toBe(fixtureCredential);
    expect(JSON.stringify(body)).not.toContain(fixtureCredential);
    if (body.action === 'validate_access') return route.fulfill({ json: { access: { token_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', access_type: organizer ? 'organizer' : 'participant', participant_id: organizer ? null : target, participant_slug: organizer ? null : slug, expires_at: null } }, headers: cors });
    state.writes.push(body);
    if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
    if (body.participant_id !== target) return route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN' } }, headers: cors });
    const fault = state.fault; state.fault = '';
    if (fault === 'fields') return route.fulfill({ status: 422, json: { error: { message: 'SQL private detail', fields: { [state.field]: 'Revisa este dato antes de guardar.' } } }, headers: cors });
    if (fault === 'access') return route.fulfill({ status: 401, json: { error: { code: 'ACCESS_UNAVAILABLE' } }, headers: cors });
    if (fault === 'rate') return route.fulfill({ status: 429, json: { error: { code: 'RATE_LIMITED' } }, headers: { ...cors, 'Retry-After': '1' } });
    const existing = state.gifts.find((gift) => gift.position === body.position);
    if (body.action === 'create_gift' ? !!existing : !existing || existing.id !== body.gift_id || existing.version !== body.expected_version) return route.fulfill({ status: 409, json: { error: { code: 'CONFLICT' } }, headers: cors });
    if (body.action === 'delete_gift') {
      state.gifts = state.gifts.filter((gift) => gift.id !== body.gift_id);
      return fault === 'lost' ? route.abort('failed') : route.fulfill({ json: { deleted: { id: existing!.id, position: body.position } }, headers: cors });
    }
    const current = existing ?? { ...sampleGift(body.position), id: `22222222-2222-4222-8222-${String(++state.counter).padStart(12,'0')}`, participant_id: target, version: 0, description: null };
    const gift = { ...current, ...body.gift, reference_price: body.gift.reference_price === null ? null : Number(body.gift.reference_price), version: current.version + 1 };
    state.gifts = state.gifts.filter((item) => item.position !== body.position).concat(gift);
    return fault === 'lost' ? route.abort('failed') : route.fulfill({ status: existing ? 200 : 201, json: { gift }, headers: cors });
  });
  return state;
}
export async function openEditor(page: Page, position = 1) {
  await page.goto(`/acceso#token=${fixtureCredential}`);
  await page.getByRole('link', { name: `Añadir regalo a la opción ${position}`, exact: true }).or(page.getByRole('link', { name: `Editar regalo de la opción ${position}`, exact: true })).click();
  await expect(page.getByRole('heading', { name: `Tu opción ${position}`, exact: true })).toBeFocused();
  await expect(page.getByLabel('Título del regalo')).toBeEnabled();
}
