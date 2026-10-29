import { mkdir } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const names = ['Melyza','Karina','Norma','Magaly','Cesar','Fabrizio','Brandon','Pamela','Franco','Derek Leonardo','Alice'];
const api = 'http://127.0.0.1:4174';
test.beforeEach(async ({ page }) => {
  // Tests must never reach a real project, even if the developer has .env.local configured.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['127.0.0.1','localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
});
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('list', { name: 'Participantes', exact: true }).getByRole('listitem')).toHaveCount(11);
}

test('SQL-backed preview loads exactly the requested names, empty lists and two public requests', async ({ page }) => {
  const requests: string[] = [];
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(`${api}/rest/v1/`)) requests.push(request.url());
    if (['POST','PATCH','PUT','DELETE'].includes(request.method())) writes.push(request.url());
  });
  await ready(page);
  const list = page.getByRole('list', { name: 'Participantes', exact: true });
  await expect(list.getByRole('heading', { level: 3 })).toHaveText(names);
  await expect(list.getByText('0 de 3 ideas', { exact: true })).toHaveCount(11);
  await expect(page.getByText('11 participantes', { exact: true })).toBeVisible();
  await expect(list.getByRole('link').first()).toHaveAttribute('href', '/participante/melyza');
  await expect(list.getByRole('link').nth(9)).toHaveAttribute('href', '/participante/derek-leonardo');
  expect(requests).toHaveLength(2);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length,sessionStorage.length])).toEqual([0,0]);
  await expect(page.getByRole('button', { name: /editar|login|administrar/i })).toHaveCount(0);
});

test('grid is 3/2/1 columns, leaves two final desktop cards and reflows at 320px and 200% text', async ({ page }, info) => {
  await ready(page);
  const expected = info.project.name === 'desktop' ? 3 : info.project.name === 'tablet' ? 2 : 1;
  const grid = page.locator('.participants-grid');
  expect(await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(expected);
  expect(await grid.locator(':scope > li').count()).toBe(11);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('hero and header catalogue anchors move focus, cards are native links and back refetches data', async ({ page }) => {
  let requests = 0;
  page.on('request', (request) => { if (request.url().startsWith(`${api}/rest/v1/participants`) && !new URL(request.url()).searchParams.has('slug')) requests++; });
  await ready(page);
  await page.getByRole('link', { name: 'Ver participantes', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Pequeñas pistas para un gran regalo' })).toBeFocused();
  const card = page.getByRole('list', { name: 'Participantes', exact: true }).getByRole('link').first();
  await card.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/participante\/melyza$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.goBack();
  await expect(page.getByRole('list', { name: 'Participantes', exact: true }).getByRole('listitem')).toHaveCount(11);
  expect(requests).toBe(2);
  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toBeFocused();
});

test('hover and keyboard reveal the same avatar, touch uses one tap', async ({ page }, info) => {
  await ready(page);
  const card = page.locator('.participant-card').first();
  const avatar = card.locator('.participant-card__avatar');
  if (info.project.name === 'desktop') {
    await expect(avatar).toHaveCSS('opacity','0');
    await card.hover(); await expect(avatar).toHaveCSS('opacity','1');
    await page.mouse.move(0,0);
    await card.focus(); await expect(avatar).toHaveCSS('opacity','1');
    expect(await card.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  } else {
    await expect(avatar).toHaveCSS('opacity','1');
    await card.tap();
    await expect(page).toHaveURL(/\/participante\/melyza$/);
  }
});

test('loading state and failed request offer retry without provider detail or fake participants', async ({ page }) => {
  let fail = true;
  await page.route(`${api}/rest/v1/participants?**`, async (route) => {
    if (!fail) return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 300));
    return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'SQL provider detail secret' }), headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4173' } });
  });
  await page.goto('/');
  await expect(page.getByText('Preparando a los participantes…')).toBeAttached();
  await expect(page.getByRole('alert').filter({ hasText: 'No pudimos preparar el encuentro' })).toBeVisible();
  await expect(page.getByText('SQL provider detail secret')).toHaveCount(0);
  await expect(page.locator('.participant-card')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Volver a intentar' }).click();
  await expect(page.locator('.participant-card')).toHaveCount(11);
});

test('empty catalogue has zero count and settings remain editable data', async ({ page }) => {
  await page.route(`${api}/rest/v1/participants?**`, (route) => route.fulfill({ json: [], headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4173' } }));
  await page.route(`${api}/rest/v1/event_settings?**`, (route) => route.fulfill({ json: { title: 'Nuestra Navidad', welcome_message: 'Una bienvenida que cambié desde los datos.' }, headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4173' } }));
  await page.goto('/');
  await expect(page.getByText('0 participantes', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'El encuentro está por comenzar' })).toBeVisible();
  await expect(page.getByText('Una bienvenida que cambié desde los datos.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nuestra Navidad, inicio' })).toBeVisible();
  await expect(page).toHaveTitle('Nuestra Navidad');
});

test('edited participant name and count render from data and broken photos fall back stably', async ({ page }) => {
  await page.route(`${api}/rest/v1/participants?**`, async (route) => {
    const response = await route.fetch();
    const people = await response.json();
    people[0].name = 'Melyza actualizada'; people[0].gifts = [{ count: 2 }];
    people[0].photo_url = 'https://images.example.invalid/broken.jpg';
    people[1].avatar_key = 'unknown'; people[1].name = 'Nombre muy largo que sigue siendo legible en la tarjeta';
    await route.fulfill({ response, json: people });
  });
  await ready(page);
  const first = page.locator('.participant-card').first();
  await first.scrollIntoViewIfNeeded();
  await expect(first.getByRole('heading')).toHaveText('Melyza actualizada');
  await expect(first.getByText('2 de 3 ideas')).toBeVisible();
  await expect(first.locator('.participant-avatar > svg')).toHaveCount(1);
  await expect(first.locator('img')).toHaveCount(0);
  await expect(page.locator('.participant-avatar__initials').first()).toHaveText('NM');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('catalogue has no detected WCAG AA violations and reduced motion removes card translation', async ({ page }) => {
  await ready(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.participant-card').first().hover();
  expect(await page.locator('.participant-card').first().evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
});

test('catalogue screenshots preserve all eleven cards and the focused reveal', async ({ page }, info) => {
  await ready(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mkdir('artifacts/ui', { recursive: true });
  await page.screenshot({ path: `artifacts/ui/catalogue-${info.project.name}.png`, fullPage: true });
  if (info.project.name !== 'desktop') await expect(page.locator('.participant-card__avatar').first()).toHaveCSS('opacity','1');
  await page.locator('.participant-card').first().focus();
  await page.screenshot({ path: `artifacts/ui/catalogue-focus-${info.project.name}.png` });
});
