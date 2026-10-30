import { apiOrigin as api,uiOrigin } from './fixtures/origins';
import { mkdir } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const owner = '11111111-1111-4111-8111-000000000001';
const person = { id: owner, name: 'Melyza', slug: 'melyza', avatar_key: 'star', photo_path: null, photo_url: null, personal_message: 'Un detalle para los días tranquilos.', general_preferences: 'Me gustan los tonos suaves.\nEvitar las fragancias intensas.' };
// Fixtures only. Real participants remain without invented wishes in preview and local roster.
const baseGift = { participant_id: owner, description: null, image_path: null, image_url: null, product_url: null, reference_price: null, currency: 'PEN', gift_type: 'object', details: {}, version: 1, created_at: '', updated_at: '' };
const gifts = [
  { ...baseGift, id: '22222222-2222-4222-8222-000000000001', position: 1, title: 'Un libro de relatos', description: 'Historias cortas para una pausa.\nPuede ser de un autor nuevo.', image_url: 'https://images.example.com/book.svg', reference_price: 59.90, product_url: 'https://example.com/producto', details: { category: 'Libros', specifications: 'Edición en español', notes: 'Sin sagas.' } },
  { ...baseGift, id: '22222222-2222-4222-8222-000000000003', position: 3, title: 'Zapatillas cómodas', reference_price: 19.90, currency: 'USD', gift_type: 'clothing', details: { subtype: 'footwear', size: '42', size_system: 'EU', color: 'Blanco', alternative_colors: ['Negro','Crema'] } },
];
const cors = { 'Access-Control-Allow-Origin': uiOrigin };
test('delayed profile loading remains readable at 320px and 200 percent text before data arrives',async({page})=>{
  let release!:()=>void;
  const gate=new Promise<void>((resolve)=>{release=resolve;});
  await page.route('**/*',(route)=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await page.route(`${api}/rest/v1/participants?**`,async(route)=>{await gate;return route.fulfill({json:[{...person,gifts:[]}],headers:cors});});
  try{
    await page.setViewportSize({width:320,height:900});await page.goto('/participante/melyza');
    const heading=page.getByRole('heading',{name:'Estamos preparando esta lista',exact:true});await expect(heading).toBeVisible();
    await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
    const bounds=await heading.boundingBox();expect(bounds).not.toBeNull();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }finally{release();}
  await expect(page.getByRole('heading',{name:'Melyza',exact:true})).toBeVisible();
});
async function filled(page: Page, options: Record<string, unknown> = {}) {
  await page.route(`${api}/rest/v1/participants?**`, (route) => {
    if (!new URL(route.request().url()).searchParams.has('slug')) return route.continue();
    return route.fulfill({ json: [{ ...person, gifts, ...options }], headers: cors });
  });
  await page.route('https://images.example.com/book.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect x="30" y="15" width="180" height="290" rx="6" fill="#173E32"/><rect x="42" y="28" width="156" height="264" rx="3" fill="#F6E9D5"/><path d="M70 90h100M70 100h100M70 220h100" stroke="#A82E3C" stroke-width="3"/><text x="120" y="160" text-anchor="middle" font-size="22" fill="#173E32">RELATOS</text></svg>' }));
}
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => ['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});

test('all-empty SQL profile has exactly three pending positions, no editing and direct reload works', async ({ page }, info) => {
  const reads: string[] = []; const writes: string[] = [];
  page.on('request', (request) => { if (request.url().startsWith(`${api}/rest/v1/`)) reads.push(request.url()); if (['POST','PATCH','DELETE','PUT'].includes(request.method())) writes.push(request.url()); });
  await page.goto('/participante/melyza');
  await expect(page.getByRole('heading', { name: 'Melyza', exact: true })).toBeFocused();
  await expect(page.getByRole('list', { name: 'Tres opciones de regalo' }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Regalo pendiente', exact: true })).toHaveCount(3);
  await expect(page.getByText('Opción 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Todavía no se han añadido gustos o consideraciones generales.')).toBeVisible();
  await expect(page.getByRole('button', { name: /editar|añadir|limpiar/i })).toHaveCount(0);
  expect(reads).toHaveLength(1); expect(writes).toEqual([]);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await mkdir('artifacts/ui', { recursive: true });
  await page.screenshot({ path: `artifacts/ui/profile-empty-${info.project.name}.png`, fullPage: true });
  await page.reload(); await expect(page.getByRole('heading', { name: 'Melyza', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a participantes', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Participantes', exact: true }).getByRole('listitem')).toHaveCount(11);
});

test('partial list keeps empty position two, footwear system, foreign price and separate preferences', async ({ page }) => {
  await filled(page);
  await page.goto('/participante/melyza');
  const items = page.getByRole('list', { name: 'Tres opciones de regalo' }).getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0).getByRole('heading')).toHaveText('Un libro de relatos');
  await expect(items.nth(1).getByRole('heading')).toHaveText('Regalo pendiente');
  await expect(items.nth(2).getByRole('heading')).toHaveText('Zapatillas cómodas');
  await expect(items.nth(2)).toContainText('Numeración'); await expect(items.nth(2)).toContainText('42'); await expect(items.nth(2)).toContainText('EU');
  await expect(items.nth(2)).toContainText(/USD\s*19[.,]90/);
  await expect(page.getByRole('region', { name: 'Un poquito sobre mis gustos' })).toContainText('Evitar las fragancias intensas.');
  await expect(items.nth(0)).not.toContainText('fragancias');
  const shop = page.getByRole('link', { name: /Ver en la tienda/ });
  await expect(shop).toHaveAttribute('target', '_blank'); await expect(shop).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByRole('img', { name: 'Un libro de relatos', exact: true })).toHaveCSS('object-fit','contain');
});

test('complete and one-gift lists preserve zero price and omit absent fields', async ({ page }) => {
  await filled(page, { gifts: [gifts[0], { ...baseGift, id: 'second', position: 2, title: 'Una taza', reference_price: 0 }, gifts[1]] });
  await page.goto('/participante/melyza');
  await expect(page.getByRole('heading', { name: 'Regalo pendiente', exact: true })).toHaveCount(0);
  await expect(page.getByText(/S\/.*0[.,]00/)).toBeVisible();
  await page.unroute(`${api}/rest/v1/participants?**`);
  await filled(page, { gifts: [{ ...baseGift, id: 'only', position: 2, title: 'Una sola idea' }], personal_message: null, general_preferences: null });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Una sola idea' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Regalo pendiente', exact: true })).toHaveCount(2);
  await expect(page.getByText('Precio referencial', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Ver en la tienda/ })).toHaveCount(0);
});

test('missing and malformed slugs are distinguished from network errors and retry preserves route', async ({ page }) => {
  await page.goto('/participante/no-existe');
  await expect(page.getByRole('heading', { name: 'No encontramos este perfil' })).toBeFocused();
  await expect(page.locator('.wishlist-grid')).toHaveCount(0);
  await page.goto('/participante/INVALIDO');
  await expect(page.getByRole('heading', { name: 'No encontramos este perfil' })).toBeVisible();
  let fail = true;
  await page.route(`${api}/rest/v1/participants?**`, async (route) => {
    if (!fail) return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 250));
    return route.fulfill({ status: 403, json: { message: 'SQL internal detail' }, headers: cors });
  });
  await page.goto('/participante/melyza');
  await expect(page.getByText('Buscando sus pequeñas pistas…')).toBeAttached();
  await expect(page.getByRole('alert').filter({ hasText: 'No pudimos cargar los deseos' })).toBeVisible();
  await expect(page.getByText('SQL internal detail')).toHaveCount(0);
  fail = false; await page.getByRole('button', { name: 'Volver a intentar' }).click();
  await expect(page.getByRole('heading', { name: 'Melyza', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/participante\/melyza$/);
});

test('copy shares only the public path and clipboard denial provides a selectable manual link', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as Window & { copied?: string }).copied = text; } } }); });
  await page.goto('/participante/melyza?private=do-not-copy#token=secret');
  await page.getByRole('button', { name: 'Copiar perfil público' }).click();
  await expect(page.getByText('Enlace público copiado', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { copied?: string }).copied)).toBe(`${uiOrigin}/participante/melyza`);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } }); });
  await page.getByRole('button', { name: 'Copiar perfil público' }).click();
  const input = page.getByLabel('Enlace público', { exact: true });
  await expect(input).toHaveValue(`${uiOrigin}/participante/melyza`); await expect(input).toBeFocused();
});

test('broken gift and avatar photos fall back and unsafe store links are not rendered', async ({ page }) => {
  await filled(page, { photo_url: 'https://images.example.com/missing.jpg', gifts: [{ ...gifts[0], image_url: 'https://images.example.com/missing.jpg', product_url: 'javascript:alert(1)' }] });
  await page.goto('/participante/melyza');
  await page.locator('.gift-image').first().scrollIntoViewIfNeeded();
  await expect(page.getByText('Imagen no disponible')).toBeVisible();
  await expect(page.locator('.profile-header__avatar img')).toHaveCount(0);
  await expect(page.locator('.profile-header__avatar svg')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Ver en la tienda/ })).toHaveCount(0);
});

test('profile remains readable at narrow width and 200 percent text, has no detected WCAG AA issues', async ({ page }, info) => {
  await filled(page, { name: 'Derek Leonardo con un nombre más largo', general_preferences: 'Una consideración con un enlace de texto muy largo: ' + 'a'.repeat(100) });
  await page.goto('/participante/melyza');
  await expect(page.getByRole('list', { name: 'Tres opciones de regalo' }).getByRole('listitem')).toHaveCount(3);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await mkdir('artifacts/ui', { recursive: true });
  await page.screenshot({ path: `artifacts/ui/profile-${info.project.name}.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.gift-details dt').evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth + 1))).toBe(true);
});

test('changing slug while a request is delayed never shows the previous participant data', async ({ page }) => {
  await page.route(`${api}/rest/v1/participants?**`, async (route) => {
    const slug = new URL(route.request().url()).searchParams.get('slug');
    if (slug === 'eq.melyza') { await new Promise((resolve) => setTimeout(resolve, 650)); return route.fulfill({ json: [{ ...person, gifts }], headers: cors }); }
    return route.continue();
  });
  await page.goto('/participante/melyza');
  await page.getByRole('link', { name: 'Volver a participantes', exact: true }).click();
  await page.getByRole('list', { name: 'Participantes', exact: true }).getByRole('link').nth(1).click();
  await expect(page.getByRole('heading', { name: 'Karina', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Un libro de relatos', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Regalo pendiente', exact: true })).toHaveCount(3);
});
