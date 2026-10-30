import { apiOrigin,uiOrigin } from './fixtures/origins';
import { mkdir } from 'node:fs/promises';
import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Ephemeral test fixtures. They are not real credentials and never enter the application bundle.
const credential = 'A'.repeat(43);
const otherCredential = 'B'.repeat(42) + 'A';
const owner = '11111111-1111-4111-8111-000000000001';
const endpoint = `${apiOrigin}/functions/v1/wishlist-api`;
const cors = { 'Access-Control-Allow-Origin': uiOrigin, 'Access-Control-Expose-Headers': 'Retry-After', 'Cache-Control': 'no-store' };
const participant = { access: { token_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', access_type: 'participant', participant_id: owner, participant_slug: 'melyza', expires_at: null } };
const organizer = { access: { ...participant.access, access_type: 'organizer', participant_id: null, participant_slug: null } };
async function validate(page: Page, handler: (route: Route) => Promise<unknown> = (route) => route.fulfill({ json: participant, headers: cors })) {
  await page.route(endpoint, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type,apikey,x-edit-token' } });
    return handler(route);
  });
}
async function enter(page: Page) {
  await page.goto(`/acceso#token=${credential}`);
  await expect(page).toHaveURL('/participante/melyza');
  await expect(page.getByText('Estás editando tu lista', { exact: true })).toBeVisible();
}
async function spa(page: Page, path: string) {
  await page.evaluate((destination) => { history.pushState(null, '', destination); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
}
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => ['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});

test('private fragment is removed before verification, is sent only in a header and grants own controls', async ({ page }) => {
  const privateCalls: string[] = [];
  const leaked: string[] = [];
  page.on('request', (request) => { if (request.url().includes(credential) || request.postData()?.includes(credential)) leaked.push(request.url()); });
  await validate(page, async (route) => {
    expect(page.url()).toBe(`${uiOrigin}/acceso`);
    expect(route.request().headers()['x-edit-token']).toBe(credential);
    expect(route.request().headers()['authorization']).toBeUndefined();
    expect(route.request().postDataJSON()).toEqual({ action: 'validate_access' });
    privateCalls.push(route.request().url());
    return route.fulfill({ json: participant, headers: cors });
  });
  await enter(page);
  await expect(page.getByRole('link', { name: 'Editar mi perfil', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Añadir regalo a la opción/ })).toHaveCount(3);
  expect(privateCalls).toHaveLength(1); expect(leaked).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length,sessionStorage.length])).toEqual([0,0]);
  expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain(credential);
  await expect(page.locator('body')).not.toContainText(credential);
});

test('reload and another tab do not inherit access, public copy excludes the capability', async ({ page }) => {
  await validate(page); await enter(page);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as Window & { copied?: string }).copied = text; } } }); });
  await page.getByRole('button', { name: 'Copiar perfil público' }).click();
  await expect(page.getByText('Enlace público copiado', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { copied?: string }).copied)).toBe(`${uiOrigin}/participante/melyza`);
  const another = await page.context().newPage();
  await another.goto('/participante/melyza');
  await expect(another.getByRole('heading', { name: 'Melyza', exact: true })).toBeVisible();
  await expect(another.getByRole('link', { name: 'Editar mi perfil', exact: true })).toHaveCount(0);
  await another.close();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Melyza', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar mi perfil', exact: true })).toHaveCount(0);
});

test('personal access cannot edit another participant or open the organizer route', async ({ page }) => {
  await validate(page); await enter(page);
  await page.getByRole('link', { name: 'Volver a participantes', exact: true }).click();
  await page.getByRole('list', { name: 'Participantes', exact: true }).getByRole('link').nth(1).click();
  await expect(page.getByRole('heading', { name: 'Karina', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar mi perfil', exact: true })).toHaveCount(0);
  await spa(page, '/participante/karina/editar');
  await expect(page.getByRole('heading', { name: 'Este enlace de edición no está disponible' })).toBeVisible();
  await spa(page, '/organizador');
  await expect(page.getByRole('heading', { name: 'Este enlace de edición no está disponible' })).toBeVisible();
});

test('private destination revalidates its participant, closing erases access without touching data', async ({ page }) => {
  const targets: (string | undefined)[] = [];
  await validate(page, (route) => { targets.push(route.request().postDataJSON().participant_id); return route.fulfill({ json: participant, headers: cors }); });
  await enter(page);
  await page.getByRole('link', { name: 'Añadir regalo a la opción 2' }).click();
  await expect(page.getByRole('heading', { name: 'Tu opción 2', exact: true })).toBeFocused();
  expect(targets).toContain(owner);
  await page.getByRole('button', { name: 'Cerrar acceso de edición', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Este enlace de edición no está disponible' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al catálogo' }).click();
  await page.getByRole('list', { name: 'Participantes', exact: true }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Regalo pendiente', exact: true })).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Editar mi perfil', exact: true })).toHaveCount(0);
});

test('organizer access enters the protected shell and can reach another profile edit destination', async ({ page }) => {
  await validate(page, (route) => route.fulfill({ json: organizer, headers: cors }));
  await page.goto(`/organizador/acceso#token=${credential}`);
  await expect(page).toHaveURL('/organizador');
  await expect(page.getByRole('heading', { name: 'Organizar nuestro intercambio', exact: true })).toBeFocused();
  await page.getByRole('link', { name: 'Ver participantes', exact: true }).click();
  await page.getByRole('list', { name: 'Participantes', exact: true }).getByRole('link').nth(1).click();
  await expect(page.getByText('Acceso de organizador', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Editar perfil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'El perfil de Karina', exact: true })).toBeVisible();
});

test('missing, malformed, query and wrong-role links fail closed with no token input', async ({ page }) => {
  let calls = 0;
  await validate(page, (route) => { calls++; return route.fulfill({ json: participant, headers: cors }); });
  for (const path of ['/acceso','/acceso#token=invalid',`/acceso?token=${credential}`,`/acceso#token=${credential}&extra=1`]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Este enlace de edición no está disponible' })).toBeVisible();
    await expect(page).toHaveURL('/acceso');
    await expect(page.getByRole('textbox')).toHaveCount(0);
  }
  expect(calls).toBe(0);
  await page.goto(`/organizador/acceso#token=${credential}`);
  await expect(page.getByRole('heading', { name: 'Este enlace de edición no está disponible' })).toBeVisible();
  await expect(page).toHaveURL('/organizador/acceso');
});

test('temporary failure can retry, 429 waits and denied responses never expose provider detail', async ({ page }) => {
  let status = 503;
  await validate(page, (route) => route.fulfill({ status, json: status === 200 ? participant : { error: { message: 'provider-private-detail' } }, headers: { ...cors, 'Retry-After': '1' } }));
  await page.goto(`/acceso#token=${credential}`);
  await expect(page.getByRole('heading', { name: 'No pudimos comprobar el enlace' })).toBeVisible();
  status = 429; await page.getByRole('button', { name: 'Volver a intentar' }).click();
  await expect(page.getByText('Has realizado varias solicitudes. Espera unos instantes antes de volver a intentarlo.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver a intentar' })).toBeDisabled();
  status = 200;
  await expect(page.getByRole('button', { name: 'Volver a intentar' })).toBeEnabled();
  await page.getByRole('button', { name: 'Volver a intentar' }).click();
  await expect(page.getByText('Estás editando tu lista', { exact: true })).toBeVisible();
  status = 401; await page.evaluate(() => { window.dispatchEvent(new Event('focus')); });
  await expect(page.getByText('Este enlace de edición no está disponible', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar mi perfil', exact: true })).toHaveCount(0);
  await expect(page.getByText('provider-private-detail')).toHaveCount(0);
});

test('leaving while verifying cannot resurrect permissions, stored fake tokens do not grant access', async ({ page }) => {
  await validate(page, async (route) => { await new Promise((resolve) => setTimeout(resolve, 300)); return route.fulfill({ json: participant, headers: cors }); });
  await page.goto(`/acceso#token=${credential}`);
  await page.getByRole('link', { name: 'Volver al catálogo' }).click();
  await page.getByRole('list', { name: 'Participantes', exact: true }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Melyza', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar mi perfil', exact: true })).toHaveCount(0);
  await page.addInitScript((secret) => { localStorage.setItem('editToken', secret); sessionStorage.setItem('access_type', 'organizer'); }, credential);
  await page.goto('/organizador');
  await expect(page.getByRole('heading', { name: 'Este enlace de edición no está disponible' })).toBeVisible();
});

test('a new fragment in the same SPA is consumed and replaces the in-memory credential', async ({ page }) => {
  let seen = '';
  await validate(page, (route) => { seen = route.request().headers()['x-edit-token']; return route.fulfill({ json: participant, headers: cors }); });
  await page.goto('/acceso');
  await expect(page.getByRole('heading', { name: 'Este enlace de edición no está disponible' })).toBeVisible();
  await page.evaluate((secret) => { window.location.hash = `token=${secret}`; }, otherCredential);
  await expect(page).toHaveURL('/participante/melyza');
  await expect(page.getByText('Estás editando tu lista', { exact: true })).toBeVisible();
  expect(seen).toBe(otherCredential);
  expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain(otherCredential);
  await spa(page, `/participante/karina#token=${credential}`);
  await expect(page).toHaveURL('/participante/karina');
  await expect(page.getByRole('heading', { name: 'Karina', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar mi perfil', exact: true })).toHaveCount(0);
  expect(seen).toBe(otherCredential);
});

test('private deep links and invalid gift positions cannot bypass the navigation gate', async ({ page }) => {
  await validate(page); await enter(page);
  await spa(page, '/participante/melyza/regalo/4/editar');
  await expect(page.getByRole('heading', { name: 'Este enlace de edición no está disponible' })).toBeVisible();
  await page.goto('/participante/melyza/editar');
  await expect(page.getByRole('heading', { name: 'Este enlace de edición no está disponible' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.goto('/organizador');
  await expect(page.getByRole('heading', { name: 'Este enlace de edición no está disponible' })).toBeVisible();
});

test('protected destination reports missing data and can retry a public profile fetch before authorization', async ({ page }) => {
  await validate(page); await enter(page);
  await spa(page, '/participante/no-existe/editar');
  await expect(page.getByRole('heading', { name: 'No encontramos este participante' })).toBeFocused();
  let fail = true;
  await page.route(`${apiOrigin}/rest/v1/participants?**`, (route) => {
    if (fail && new URL(route.request().url()).searchParams.get('slug') === 'eq.melyza') return route.fulfill({ status: 403, json: { message: 'provider-detail' }, headers: cors });
    return route.continue();
  });
  await spa(page, '/participante/melyza/editar');
  await expect(page.getByRole('heading', { name: 'No pudimos cargar el perfil' })).toBeFocused();
  fail = false; await page.getByRole('button', { name: 'Volver a intentar' }).click();
  await expect(page.getByRole('heading', { name: 'El perfil de Melyza' })).toBeFocused();
});

test('private controls and denied page have no detected WCAG AA issues and fit small viewports', async ({ page }, info) => {
  await validate(page); await enter(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await mkdir('artifacts/ui', { recursive: true });
  await page.screenshot({ path: `artifacts/ui/private-profile-${info.project.name}.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Cerrar acceso de edición', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Melyza', exact: true })).toBeFocused();
  await spa(page, '/organizador');
  await expect(page.getByRole('heading', { name: 'Este enlace de edición no está disponible' })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `artifacts/ui/private-unavailable-${info.project.name}.png`, fullPage: true });
});
