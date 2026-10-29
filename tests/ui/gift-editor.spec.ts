import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { editorFixture, openEditor, sampleGift, fixtureCredential, fixtureOwner } from './fixtures/gift-editor';

test('title and default type create one independent option, save a new version and refresh public views', async ({ page }) => {
  const state = await editorFixture(page); await openEditor(page, 2);
  await page.getByLabel('Título del regalo').fill('Un libro para las tardes');
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible();
  expect(state.writes).toHaveLength(1); expect(state.writes[0].action).toBe('create_gift'); expect(state.writes[0].position).toBe(2);
  await page.getByLabel('Título del regalo').fill('Un libro de relatos');
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible();
  expect(state.writes[1].action).toBe('update_gift'); expect(state.writes[1].expected_version).toBe(1);
  await page.getByRole('link', { name: 'Volver a la lista', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Un libro de relatos', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Regalo pendiente', exact: true })).toHaveCount(2);
  await page.reload(); await expect(page.getByRole('heading', { name: 'Un libro de relatos', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar mi perfil', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Volver a participantes', exact: true }).click();
  await expect(page.locator('.participant-card').first()).toContainText('1 de 3 ideas');
});

test('validation keeps typed input, supports zero and USD and rejects excess decimals without a request', async ({ page }) => {
  const state = await editorFixture(page); await openEditor(page);
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByLabel('Título del regalo')).toBeFocused(); expect(state.writes).toHaveLength(0);
  await page.getByLabel('Título del regalo').fill('Una idea exacta');
  await page.getByLabel('Precio referencial').fill('1.999');
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByLabel('Precio referencial')).toBeFocused(); expect(state.writes).toHaveLength(0);
  await expect(page.getByLabel('Título del regalo')).toHaveValue('Una idea exacta');
  await page.getByLabel('Precio referencial').fill('0'); await page.getByLabel('Moneda', { exact: true }).selectOption('USD');
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible();
  expect((state.writes[0].gift as Record<string,unknown>).reference_price).toBe('0.00'); expect(state.gifts[0].currency).toBe('USD');
});

test('switching types retains separate drafts and sends only active footwear details', async ({ page }) => {
  const state = await editorFixture(page); await openEditor(page);
  await page.getByLabel('Título del regalo').fill('Para caminar');
  await page.getByRole('radio', { name: 'Prenda de vestir' }).check();
  await page.getByText('Detalles que ayudarán a elegir', { exact: false }).click();
  await page.getByLabel('Tipo de prenda').selectOption('footwear');
  await page.getByLabel('Numeración', { exact: true }).fill('42'); await page.getByLabel('Sistema de tallas').fill('EU');
  await page.getByLabel('Colores alternativos').fill('Blanco, Negro');
  await page.getByRole('radio', { name: 'Objeto', exact: true }).check(); await page.getByLabel('Categoría', { exact: true }).fill('Tecnología');
  await page.getByRole('radio', { name: 'Prenda de vestir' }).check();
  await expect(page.getByLabel('Numeración', { exact: true })).toHaveValue('42'); await expect(page.getByLabel('Sistema de tallas')).toHaveValue('EU');
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible();
  expect((state.writes[0].gift as Record<string,unknown>).details).toEqual({ subtype: 'footwear', size: '42', size_system: 'EU', alternative_colors: ['Blanco','Negro'] });
});

test('server field errors open nested details and keep the draft without showing internal error text', async ({ page }) => {
  const state = await editorFixture(page); await openEditor(page); state.fault = 'fields'; state.field = 'details.notes';
  await page.getByLabel('Título del regalo').fill('Mi idea intacta');
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByLabel('Notas para elegir')).toBeFocused();
  await expect(page.getByLabel('Título del regalo')).toHaveValue('Mi idea intacta');
  await expect(page.getByText('SQL private detail')).toHaveCount(0);
  await expect(page.getByText('Revisa este dato antes de guardar.').first()).toBeVisible();
});

test('dirty navigation and browser Back require discard, cancelling preserves the form', async ({ page }) => {
  await editorFixture(page); await openEditor(page);
  await page.getByLabel('Título del regalo').fill('Mi borrador');
  await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '¿Salir sin guardar?' });
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('Título del regalo')).toHaveValue('Mi borrador');
  await page.goBack(); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Sí, salir sin guardar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Melyza', exact: true })).toBeVisible();
});

test('cleaning confirms exact UUID/version, cancellation preserves data and only that position is cleared', async ({ page }) => {
  const state = await editorFixture(page, [sampleGift(1), { ...sampleGift(3), title: 'La otra opción' }]); await openEditor(page);
  await page.getByRole('button', { name: 'Limpiar opción', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '¿Limpiar la opción 1?' });
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click(); expect(state.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Limpiar opción', exact: true }).click();
  await dialog.getByRole('button', { name: 'Sí, limpiar opción', exact: true }).click();
  await expect(page.getByText('Esta opción volvió a quedar pendiente. Las demás ideas se mantienen.')).toBeVisible();
  await expect(page.getByLabel('Título del regalo')).toHaveValue('');
  expect(state.writes[0]).toEqual({ action: 'delete_gift', participant_id: fixtureOwner, position: 1, gift_id: sampleGift(1).id, expected_version: 1 });
  expect(state.gifts.map((gift) => gift.position)).toEqual([3]);
});

test('409 keeps draft and requires reviewing the latest version before an explicit overwrite', async ({ page }) => {
  const state = await editorFixture(page, [sampleGift()]); await openEditor(page);
  await page.getByLabel('Título del regalo').fill('Mi propuesta'); state.gifts[0].title = 'Cambió desde otro lugar'; state.gifts[0].version = 2;
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByText('La opción cambió desde que la abriste.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Título del regalo')).toHaveValue('Mi propuesta');
  await expect(page.getByRole('button', { name: 'Guardar regalo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Revisar versión actual', exact: true }).click();
  await expect(page.getByText('Cambió desde otro lugar', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir con mi borrador', exact: true }).click(); expect(state.writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible();
  expect(state.writes[1].expected_version).toBe(2); expect(state.gifts[0].title).toBe('Mi propuesta');
});

test('a lost create response is not retried and reconciliation loads the committed option', async ({ page }) => {
  const state = await editorFixture(page); await openEditor(page); state.fault = 'lost';
  await page.getByLabel('Título del regalo').fill('Puede haberse guardado'); await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByText('No pudimos confirmar el resultado.', { exact: false })).toBeVisible();
  expect(state.writes).toHaveLength(1); expect(state.gifts).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Guardar regalo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Revisar versión actual', exact: true }).click();
  await page.getByRole('button', { name: 'Cargar datos guardados', exact: true }).click();
  await page.getByRole('dialog', { name: '¿Cargar los datos guardados?' }).getByRole('button', { name: 'Sí, cargar datos guardados', exact: true }).click();
  await expect(page.getByText('Cargamos los datos guardados actualmente.')).toBeVisible();
  expect(state.writes).toHaveLength(1);
  await page.getByRole('link', { name: 'Volver a la lista', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Puede haberse guardado', exact: true })).toBeVisible();
});

test('pending saves prevent duplicates; denied writes retain the form without permission to resend', async ({ page }) => {
  const state = await editorFixture(page); await openEditor(page); state.delay = 300;
  await page.getByLabel('Título del regalo').fill('Una sola petición'); await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guardando…', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Título del regalo')).toBeDisabled();
  await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible(); expect(state.writes).toHaveLength(1);
  await page.getByLabel('Título del regalo').fill('Un cambio sin acceso'); state.fault = 'access';
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByText('El acceso ya no permite guardar.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Título del regalo')).toHaveValue('Un cambio sin acceso'); await expect(page.getByRole('button', { name: 'Guardar regalo', exact: true })).toBeDisabled();
});

test('URL images replace a saved path only on save, invalid image URL does not mutate', async ({ page }) => {
  const initial = { ...sampleGift(), image_path: `${fixtureOwner}/gift/33333333-3333-4333-8333-000000000001.webp` };
  const state = await editorFixture(page, [initial]); await openEditor(page);
  await page.getByRole('button', { name: 'Usar URL de imagen', exact: true }).click();
  await page.getByLabel('URL de la imagen').fill('http://example.com/insegura.jpg');
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByLabel('URL de la imagen')).toBeFocused(); expect(state.writes).toHaveLength(0); expect(state.gifts[0].image_path).toBe(initial.image_path);
  await page.getByLabel('URL de la imagen').fill('https://example.com/imagen.webp');
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible();
  expect((state.writes[0].gift as Record<string,unknown>).image_path).toBeNull(); expect(state.gifts[0].image_url).toBe('https://example.com/imagen.webp');
});

test('mutation 429 waits before explicit retry and retains the draft without sending again automatically', async ({ page }) => {
  const state = await editorFixture(page); await openEditor(page); state.fault = 'rate';
  await page.getByLabel('Título del regalo').fill('Con calma'); await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click();
  await expect(page.getByText('Has realizado varias solicitudes. Espera unos instantes antes de intentarlo de nuevo.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar regalo', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Guardar regalo', exact: true })).toBeEnabled(); expect(state.writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click(); await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible(); expect(state.writes).toHaveLength(2);
});

test('revalidation while typing preserves draft and organizer can create for the selected person', async ({ page }) => {
  const state = await editorFixture(page, [], true, '11111111-1111-4111-8111-000000000002');
  await page.goto(`/organizador/acceso#token=${fixtureCredential}`); await page.getByRole('link', { name: 'Ver participantes', exact: true }).click();
  await page.getByRole('list', { name: 'Participantes', exact: true }).getByRole('link').nth(1).click(); await page.getByRole('link', { name: 'Añadir regalo a la opción 1', exact: true }).click();
  await expect(page.getByLabel('Título del regalo')).toBeEnabled(); await page.getByLabel('Título del regalo').fill('Para Karina');
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await expect(page.getByLabel('Título del regalo')).toBeEnabled(); await expect(page.getByLabel('Título del regalo')).toHaveValue('Para Karina');
  await page.getByRole('button', { name: 'Guardar regalo', exact: true }).click(); await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible();
  expect(state.writes[0].participant_id).toBe('11111111-1111-4111-8111-000000000002');
});

test('editor keyboard, disclosure, reduced motion, reflow and accessible screenshot', async ({ page }, info) => {
  await editorFixture(page); await openEditor(page); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('radio', { name: 'Prenda de vestir' }).check(); await page.getByText('Detalles que ayudarán a elegir', { exact: false }).click();
  await page.getByLabel('Tipo de prenda').selectOption('footwear');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.getByRole('heading', { name: 'Tu opción 1', exact: true }).focus();
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).not.toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await mkdir('artifacts/ui', { recursive: true }); await page.screenshot({ path: `artifacts/ui/gift-editor-${info.project.name}.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 }); await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
