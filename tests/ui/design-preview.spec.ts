import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/diseno');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeAttached();
});
test('preview renders without remote data calls or horizontal overflow', async ({ page }) => {
  const remote: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !['127.0.0.1','localhost'].includes(new URL(request.url()).hostname)) remote.push(request.url());
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/La ilusión vive/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(remote).toEqual([]);
});

test('keyboard skip link, field errors and descriptions are actionable', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.getByRole('button', { name: 'Probar guardado', exact: true }).click();
  const title = page.getByLabel('Tu idea de regalo');
  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await expect(title).toHaveAttribute('aria-describedby', /example-title-error/);
  await title.fill('Una taza');
  await page.getByLabel('Precio referencial').fill('1.999');
  await page.getByRole('button', { name: 'Probar guardado', exact: true }).click();
  await expect(page.getByLabel('Precio referencial')).toBeFocused();
  await expect(page.getByRole('alert').filter({ hasText: 'Revisemos un pequeño detalle' })).toBeVisible();
  expect(await page.getByLabel('Precio referencial').evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
});

test('save preview prevents double submission, announces success and stores nothing', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (request) => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.getByLabel('Tu idea de regalo').fill('Un libro');
  await page.getByLabel('Precio referencial').fill('39,90');
  await page.getByLabel('Estoy abierto a opciones parecidas.').check();
  await page.getByRole('button', { name: 'Probar guardado', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guardando…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Guardando…', exact: true })).toHaveAttribute('aria-busy','true');
  await expect(page.getByText('Tu ejemplo está listo', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Notificaciones' }).getByRole('listitem')).toHaveCount(1);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0,0]);
  expect(posts).toEqual([]);
});

test('destructive dialog keeps focus inside, cancels on Escape and restores trigger', async ({ page }, info) => {
  await page.getByLabel('Tu idea de regalo').fill('Mi idea intacta');
  const trigger = page.getByRole('button', { name: 'Limpiar ejemplo', exact: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '¿Limpiamos esta idea?' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1);
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  for (let step=0; step<5; step++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await mkdir('artifacts/ui', { recursive: true });
  await page.screenshot({ path: `artifacts/ui/dialog-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel('Tu idea de regalo')).toHaveValue('Mi idea intacta');
});

test('confirm clears only the local example and notifications can be dismissed', async ({ page }) => {
  await page.getByLabel('Tu idea de regalo').fill('Una idea de prueba');
  await page.getByRole('button', { name: 'Limpiar ejemplo', exact: true }).click();
  await page.getByRole('button', { name: 'Sí, limpiar idea', exact: true }).click();
  await expect(page.getByLabel('Tu idea de regalo')).toHaveValue('');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Cerrar notificación: Empezamos de nuevo', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Ver notificación', exact: true });
  await trigger.click();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('status')).toContainText('Un pequeño paso, mucha ilusión');
  await page.getByRole('button', { name: 'Cerrar notificación: Un pequeño paso, mucha ilusión', exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('list', { name: 'Notificaciones' }).getByRole('listitem')).toHaveCount(0);
});

test('empty, loading and failure states work with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Preparando', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preparando', exact: true })).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('Preparando las sorpresas…')).toBeVisible();
  expect(await page.locator('.skeleton').first().evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await page.getByRole('button', { name: 'Sin conexión', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Nos falta una pequeña conexión' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a intentar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'La sorpresa está por llegar' })).toBeVisible();
});

test('page, errors and dialog have no automatically detectable WCAG AA violations', async ({ page }) => {
  const scan = () => new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  expect((await scan()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Probar guardado', exact: true }).click();
  expect((await scan()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Limpiar ejemplo', exact: true }).click();
  expect((await scan()).violations).toEqual([]);
});

test('visual preview fits its viewport and reflows at 320px', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mkdir('artifacts/ui', { recursive: true });
  await page.screenshot({ path: `artifacts/ui/${info.project.name}.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Probar guardado', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel('Tu idea de regalo')).toBeVisible();
});
