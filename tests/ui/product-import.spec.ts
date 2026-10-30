import { mkdir } from 'node:fs/promises';
import { test,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { editorFixture,openEditor,sampleGift,fixtureCredential } from './fixtures/gift-editor';
import { importFixture } from './fixtures/product-import';

const url='https://shop.example.com/product';
const preview=(page:import('@playwright/test').Page)=>page.getByRole('region',{name:'Revisa lo que encontramos'});

test('explicit import previews sources, applies selected fields and persists only on Save with the original currency',async({page})=>{
  const editor=await editorFixture(page),lookup=await importFixture(page);await openEditor(page);
  await page.getByLabel('Enlace del producto').fill(url);expect(lookup.requests).toHaveLength(0);
  await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect(preview(page)).toBeVisible();
  await expect(page.getByRole('heading',{name:'Revisa lo que encontramos'})).toBeFocused();
  await expect(preview(page).getByText('Fuente: Datos estructurados').first()).toBeVisible();
  await expect(page.getByLabel('Título del regalo')).toHaveValue('');expect(editor.writes).toHaveLength(0);
  await expect(preview(page).getByRole('checkbox',{name:/^Título/})).toBeChecked();
  await expect(preview(page).getByRole('checkbox',{name:/^Moneda/})).not.toBeChecked();
  await expect(preview(page).getByRole('button',{name:'Aplicar campos seleccionados'})).toBeDisabled();
  await preview(page).getByRole('checkbox',{name:/^Moneda/}).check();await preview(page).getByRole('checkbox',{name:/^Imagen/}).uncheck();
  await preview(page).getByRole('button',{name:'Aplicar campos seleccionados'}).click();
  await expect(page.getByLabel('Título del regalo')).toHaveValue('Taza de café');await expect(page.getByLabel('Moneda',{exact:true})).toHaveValue('USD');
  expect(editor.writes).toHaveLength(0);await expect(page.getByText('Campos aplicados al borrador.',{exact:false})).toBeVisible();
  await page.getByLabel('Título del regalo').fill('Mi taza favorita');await page.getByRole('button',{name:'Guardar regalo',exact:true}).click();
  await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible();
  expect(editor.writes).toHaveLength(1);expect(editor.gifts[0].title).toBe('Mi taza favorita');expect(editor.gifts[0].currency).toBe('USD');expect(editor.gifts[0].reference_price).toBe(29.9);expect(editor.gifts[0].details).toMatchObject({brand:'Casa',model:'M1'});
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);expect(page.url()).not.toContain(fixtureCredential);expect(await page.locator('body').textContent()).not.toContain(fixtureCredential);
});

test('written values and uploaded image default to unchecked; explicit replacement changes only selected fields',async({page})=>{
  const gift={...sampleGift(),reference_price:50,image_path:'own/gift/saved.webp',details:{brand:'Mi marca'}};
  const editor=await editorFixture(page,[gift]);await importFixture(page);await openEditor(page);
  await page.getByLabel('Enlace del producto').fill(url);await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect(preview(page)).toBeVisible();
  for(const label of ['Título','Descripción','Imagen','Precio referencial','Moneda','Marca'])await expect(preview(page).getByRole('checkbox',{name:new RegExp(`^${label}`)})).not.toBeChecked();
  await preview(page).getByRole('checkbox',{name:/^Título/}).check();await preview(page).getByRole('button',{name:'Aplicar campos seleccionados'}).click();
  await expect(page.getByLabel('Título del regalo')).toHaveValue('Taza de café');await expect(page.getByLabel('Descripción',{exact:true})).toHaveValue(gift.description!);await expect(page.getByLabel('Precio referencial')).toHaveValue('50');
  expect(editor.writes).toHaveLength(0);expect(editor.gifts[0].image_path).toBe(gift.image_path);
});

test('cancel stops a pending import and late data cannot replace a manual draft',async({page})=>{
  const editor=await editorFixture(page),lookup=await importFixture(page);lookup.delay=500;await openEditor(page);
  await page.getByLabel('Título del regalo').fill('Mi borrador');await page.getByLabel('Enlace del producto').fill(url);await page.getByRole('button',{name:'Importar información',exact:true}).click();
  await expect.poll(()=>lookup.requests.length).toBe(1);await expect(page.getByLabel('Título del regalo')).toBeEnabled();
  await page.getByRole('button',{name:'Cancelar importación',exact:true}).click();await expect(page.getByText('Importación cancelada. Tu borrador se conserva.')).toBeVisible();
  await page.waitForTimeout(600);await expect(preview(page)).toHaveCount(0);await expect(page.getByLabel('Título del regalo')).toHaveValue('Mi borrador');expect(editor.writes).toHaveLength(0);expect(lookup.requests).toHaveLength(1);
});

test('changing URL or manual fields during download discards stale results without another request',async({page})=>{
  await editorFixture(page);const lookup=await importFixture(page);lookup.delay=400;await openEditor(page);
  await page.getByLabel('Enlace del producto').fill(url);await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect.poll(()=>lookup.requests.length).toBe(1);
  await page.getByLabel('Título del regalo').fill('Escrito mientras esperaba');
  await expect(page.getByText('El borrador cambió.',{exact:false})).toBeVisible();await page.getByLabel('Enlace del producto').fill('https://shop.example.com/other');
  await page.waitForTimeout(500);await expect(preview(page)).toHaveCount(0);await expect(page.getByLabel('Título del regalo')).toHaveValue('Escrito mientras esperaba');expect(lookup.requests).toHaveLength(1);
  await page.getByLabel('Enlace del producto').fill(url);lookup.delay=0;await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect(preview(page)).toBeVisible();await expect(preview(page).getByRole('checkbox',{name:/^Título/})).not.toBeChecked();
});

test('editing after preview invalidates suggestions, and discarding preserves the draft',async({page})=>{
  await editorFixture(page);await importFixture(page);await openEditor(page);await page.getByLabel('Enlace del producto').fill(url);await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect(preview(page)).toBeVisible();
  await page.getByLabel('Descripción',{exact:true}).fill('Mi texto nuevo');await expect(preview(page)).toHaveCount(0);await expect(page.getByText('El borrador cambió.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect(preview(page)).toBeVisible();await preview(page).getByRole('button',{name:'Descartar sugerencias'}).click();await expect(page.getByLabel('Descripción',{exact:true})).toHaveValue('Mi texto nuevo');
});

test('missing metadata, provider failure and invalid URL keep manual editing and never expose internal details',async({page})=>{
  const editor=await editorFixture(page),lookup=await importFixture(page);await openEditor(page);await page.getByLabel('Título del regalo').fill('Manual');
  await page.getByLabel('Enlace del producto').fill('http://127.0.0.1/private');await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect(page.getByText('Usa un enlace HTTPS público de un producto.')).toBeVisible();expect(lookup.requests).toHaveLength(0);
  await page.getByLabel('Enlace del producto').fill(url);lookup.manual='NO_USABLE_METADATA';await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect(page.getByText('No encontramos información utilizable.',{exact:false})).toBeVisible();
  lookup.status=503;await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect(page.getByText('La tienda no respondió o no permite esta consulta.',{exact:false})).toBeVisible();
  await expect(page.getByLabel('Título del regalo')).toHaveValue('Manual');await expect(page.getByRole('button',{name:'Guardar regalo',exact:true})).toBeEnabled();await expect(page.getByText('private provider detail')).toHaveCount(0);expect(editor.writes).toHaveLength(0);expect(lookup.requests).toHaveLength(2);
});

test('hourly rate wait disables only importing and leaves manual saving available',async({page})=>{
  const editor=await editorFixture(page),lookup=await importFixture(page);lookup.status=429;lookup.retryAfter='2400';await openEditor(page);await page.getByLabel('Enlace del producto').fill(url);await page.getByRole('button',{name:'Importar información',exact:true}).click();
  await expect(page.getByText('Espera 40 minuto(s)',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Importar información',exact:true})).toBeDisabled();
  await page.getByLabel('Título del regalo').fill('Mi idea manual');await page.getByRole('button',{name:'Guardar regalo',exact:true}).click();await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible();expect(editor.writes).toHaveLength(1);expect(lookup.requests).toHaveLength(1);
});

test('expired rate wait re-enables the button but requires another explicit click',async({page})=>{
  await editorFixture(page);const lookup=await importFixture(page);lookup.status=429;await openEditor(page);await page.getByLabel('Enlace del producto').fill(url);await page.getByRole('button',{name:'Importar información',exact:true}).click();
  await expect(page.getByRole('button',{name:'Importar información',exact:true})).toBeDisabled();lookup.status=200;await expect(page.getByRole('button',{name:'Importar información',exact:true})).toBeEnabled();expect(lookup.requests).toHaveLength(1);
  await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect(preview(page)).toBeVisible();expect(lookup.requests).toHaveLength(2);
});

test('a price with no currency requires selection and explicit currency confirmation, including zero',async({page})=>{
  await editorFixture(page);const lookup=await importFixture(page);lookup.metadata.fields={title:'Muestra gratuita',reference_price:'0.00'};lookup.metadata.warnings=['CURRENCY_MISSING'];await openEditor(page);await page.getByLabel('Enlace del producto').fill(url);await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect(preview(page)).toBeVisible();
  const price=preview(page).getByRole('checkbox',{name:/^Precio referencial/});await expect(price).not.toBeChecked();await price.check();await expect(preview(page).getByRole('button',{name:'Aplicar campos seleccionados'})).toBeDisabled();
  await preview(page).getByRole('checkbox',{name:'Confirmé en la tienda que este precio está en PEN.'}).check();await preview(page).getByRole('button',{name:'Aplicar campos seleccionados'}).click();await expect(page.getByLabel('Precio referencial')).toHaveValue('0.00');await expect(page.getByLabel('Moneda',{exact:true})).toHaveValue('PEN');
});

test('clothing never imports a size, fit or object model and keeps user details',async({page})=>{
  const editor=await editorFixture(page,[{...sampleGift(),gift_type:'clothing',details:{subtype:'footwear',size:'42',size_system:'EU',fit:'Ancho'}}]);await importFixture(page);await openEditor(page);await page.getByLabel('Enlace del producto').fill(url);await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect(preview(page)).toBeVisible();
  await expect(preview(page).getByRole('checkbox',{name:/^Modelo/})).toBeDisabled();await preview(page).getByRole('checkbox',{name:/^Precio referencial/}).uncheck();await preview(page).getByRole('checkbox',{name:/^Imagen/}).uncheck();await preview(page).getByRole('button',{name:'Aplicar campos seleccionados'}).click();
  await page.getByText('Detalles que ayudarán a elegir',{exact:false}).click();await expect(page.getByLabel('Numeración',{exact:true})).toHaveValue('42');await expect(page.getByLabel('Sistema de tallas')).toHaveValue('EU');
  await page.getByRole('button',{name:'Guardar regalo',exact:true}).click();await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible();expect(editor.gifts[0].details).toMatchObject({size:'42',fit:'Ancho',brand:'Casa'});expect(editor.gifts[0].gift_type).toBe('clothing');
});

test('denied import closes capability and cannot apply or save, with the manual draft retained',async({page})=>{
  const editor=await editorFixture(page),lookup=await importFixture(page);lookup.status=403;await openEditor(page);await page.getByLabel('Título del regalo').fill('No perder');await page.getByLabel('Enlace del producto').fill(url);await page.getByRole('button',{name:'Importar información',exact:true}).click();
  await expect(page.getByText('La edición está en pausa')).toBeVisible();await expect(page.getByLabel('Título del regalo')).toHaveValue('No perder');await expect(page.getByRole('button',{name:'Guardar regalo',exact:true})).toBeDisabled();await expect(preview(page)).toHaveCount(0);expect(editor.writes).toHaveLength(0);
});

test('closing access during import prevents late suggestions from restoring controls',async({page})=>{
  await editorFixture(page);const lookup=await importFixture(page);lookup.delay=400;await openEditor(page);await page.getByLabel('Enlace del producto').fill(url);await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect.poll(()=>lookup.requests.length).toBe(1);
  await page.getByRole('button',{name:'Cerrar acceso de edición',exact:true}).click();await page.getByRole('button',{name:'Sí, cerrar acceso',exact:true}).click();await page.waitForTimeout(500);await expect(preview(page)).toHaveCount(0);await expect(page.getByRole('button',{name:'Guardar regalo',exact:true})).toHaveCount(0);
});

test('preview is keyboard accessible, renders metadata as text and reflows at 320px and 200% text',async({page},testInfo)=>{
  await editorFixture(page);const lookup=await importFixture(page);lookup.metadata.fields.title='<img src=x onerror=alert(1)> Una taza';lookup.metadata.warnings=['PRICE_AMBIGUOUS','PARTIAL_METADATA'];delete lookup.metadata.fields.reference_price;await openEditor(page);await page.getByLabel('Enlace del producto').fill(url);
  await page.getByRole('button',{name:'Importar información',exact:true}).focus();await page.keyboard.press('Enter');await expect(preview(page)).toBeVisible();await page.keyboard.press('Tab');await expect(preview(page).getByRole('checkbox',{name:/^Título/})).toBeFocused();await page.keyboard.press('Space');await expect(preview(page).getByRole('checkbox',{name:/^Título/})).not.toBeChecked();
  await expect(preview(page).locator('img,iframe,script')).toHaveCount(0);await expect(preview(page).getByText('<img src=x onerror=alert(1)> Una taza',{exact:true})).toBeVisible();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await mkdir('artifacts/ui',{recursive:true});await page.screenshot({path:`artifacts/ui/import-${testInfo.project.name}.png`,fullPage:true});
  await page.setViewportSize({width:320,height:900});await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await expect(preview(page).getByRole('button',{name:'Aplicar campos seleccionados'})).toBeVisible();
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter((node)=>node.getBoundingClientRect().right>innerWidth+1).slice(0,8).map((node)=>({tag:node.tagName,class:node.className,right:node.getBoundingClientRect().right}))}));
  expect(layout.scroll,JSON.stringify(layout)).toBeLessThanOrEqual(layout.width+1);
});
