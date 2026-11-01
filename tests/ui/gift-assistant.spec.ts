import { apiOrigin as api,uiOrigin } from './fixtures/origins';
import { mkdir } from 'node:fs/promises';
import { test,expect,type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Synthetic profiles only. The helper prepares text to copy; it never calls an AI service or an Edge Function.
const owner='11111111-1111-4111-8111-000000000001',other='11111111-1111-4111-8111-000000000002';
const cors={'Access-Control-Allow-Origin':uiOrigin,'Cache-Control':'no-store'};
const baseGift={description:null,image_path:null,image_url:null,product_url:null,reference_price:null,currency:'PEN',gift_type:'object',details:{},version:1,created_at:'',updated_at:''};
const people:Record<string,unknown>={
  melyza:{id:owner,name:'Melyza',slug:'melyza',avatar_key:'star',photo_path:null,photo_url:null,personal_message:null,general_preferences:'Me gustan los tonos suaves.',gifts:[
    {...baseGift,participant_id:owner,id:'22222222-2222-4222-8222-000000000001',position:1,title:'Un libro de relatos'},
    {...baseGift,participant_id:owner,id:'22222222-2222-4222-8222-000000000003',position:3,title:'Zapatillas cómodas',gift_type:'clothing',
      details:{subtype:'footwear',size:'42',size_system:'EU'},reference_price:249.9,product_url:'https://shop.example.com/zapatillas'}]},
  'derek-leonardo':{id:other,name:'Derek Leonardo',slug:'derek-leonardo',avatar_key:'gift',photo_path:null,photo_url:null,personal_message:null,general_preferences:null,gifts:[]},
};
async function profiles(page:Page) {
  await page.route(`${api}/rest/v1/participants?**`,(route)=>{
    const slug=new URL(route.request().url()).searchParams.get('slug')?.slice(3);
    return slug&&people[slug]?route.fulfill({json:[people[slug]],headers:cors}):route.continue();
  });
}
async function clipboard(page:Page,works=true) {
  await page.addInitScript((ok)=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{
    if(!ok)throw new Error('denied');(window as Window&{copied?:string}).copied=text;}}});},works);
}
const launcher=(page:Page)=>page.getByRole('button',{name:'Ayuda para encontrar este regalo'});
const panel=(page:Page)=>page.getByRole('dialog',{name:'Prepara tu consulta'});
const output=(page:Page)=>panel(page).getByLabel('Texto para tu asistente de IA');
const axe=(page:Page)=>new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
test.beforeEach(async({page})=>{
  await page.route('**/*',(route)=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
});

test('explicit gift choice builds a public-only prompt that is copied without any network call',async({page},info)=>{
  await profiles(page);await clipboard(page);
  const calls:string[]=[];
  page.on('request',(request)=>{if(request.url().includes('/functions/v1/')||!['127.0.0.1','localhost'].includes(new URL(request.url()).hostname))calls.push(request.url());});
  await page.goto('/participante/melyza');
  await expect(page.getByRole('heading',{name:'Melyza',exact:true})).toBeVisible();
  await launcher(page).click();
  const actions=page.getByRole('group',{name:'Ayuda para encontrar este regalo'});
  await expect(actions.getByRole('button')).toHaveText(['Mostrar opciones similares para este regalo','Mostrar tiendas físicas con este producto','Otra consulta…']);
  await expect(actions.getByRole('button').first()).toBeFocused();
  await actions.getByRole('button',{name:'Mostrar opciones similares para este regalo'}).click();
  // Two saved gifts: the person must choose; nothing is preselected.
  const choice=panel(page).getByRole('group',{name:'¿Sobre qué quieres consultar?'});
  await expect(choice.getByRole('radio')).toHaveCount(2);
  await expect(choice.getByRole('radio',{checked:true})).toHaveCount(0);
  await expect(output(page)).toHaveCount(0);
  await expect(panel(page).getByRole('button',{name:'Copiar texto'})).toBeDisabled();
  await choice.getByLabel('Opción 3 · Zapatillas cómodas').check();
  await expect(panel(page).getByText('Melyza · Opción 3 · Zapatillas cómodas',{exact:true})).toBeVisible();
  await panel(page).getByLabel('Distrito (opcional)').fill('Miraflores');
  await panel(page).getByLabel('Detalles adicionales (opcional)').fill('Hasta 250 soles');
  const text=await output(page).inputValue();
  expect(text).toContain('Ubicación: Miraflores, Lima Metropolitana, Perú.');
  expect(text).toContain('Detalle adicional: Hasta 250 soles');
  expect(text).toContain('Numeración: 42');
  expect(text).toContain('Enlace de referencia: https://shop.example.com/zapatillas');
  expect(text).not.toMatch(/Melyza|melyza|Un libro de relatos|tonos suaves|11111111|22222222/);
  await panel(page).getByRole('radio',{name:'Tiendas físicas'}).check();
  await expect(output(page)).toHaveValue(/Busca tiendas físicas en Lima Metropolitana/);
  await panel(page).getByRole('button',{name:'Copiar texto'}).click();
  await expect(page.getByText('Texto copiado',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as Window&{copied?:string}).copied)).toBe(await output(page).inputValue());
  await page.emulateMedia({reducedMotion:'reduce'});
  expect((await axe(page)).violations).toEqual([]);
  await mkdir('artifacts/ui',{recursive:true});
  await page.screenshot({path:`artifacts/ui/prompt-helper-${info.project.name}.png`});
  expect(calls).toEqual([]);
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
});

test('general preferences need a written question and clipboard denial selects the text for manual copy',async({page})=>{
  await profiles(page);await clipboard(page,false);
  await page.goto('/participante/melyza');
  await launcher(page).click();await page.getByRole('button',{name:'Otra consulta…'}).click();
  await panel(page).getByLabel('Gustos generales de esta persona').check();
  await expect(panel(page).getByText('Melyza · Gustos generales',{exact:true})).toBeVisible();
  await expect(panel(page).getByText('Escribe tu consulta para preparar el texto.')).toBeVisible();
  await expect(panel(page).getByRole('button',{name:'Copiar texto'})).toBeDisabled();
  await panel(page).getByLabel('Tu consulta').fill('¿Qué regalo pequeño le gustaría?');
  await expect(output(page)).toHaveValue(/Gustos publicados: Me gustan los tonos suaves\.\nDATOS>>>$/);
  await panel(page).getByRole('button',{name:'Copiar texto'}).click();
  await expect(panel(page).getByText('Puedes copiarlo desde aquí')).toBeVisible();
  await expect(output(page)).toBeFocused();
  expect(await page.evaluate(()=>{const field=document.activeElement as HTMLTextAreaElement;return field.selectionEnd-field.selectionStart===field.value.length;})).toBe(true);
});

test('without saved gifts only the general question is offered; Escape closes and returns focus',async({page})=>{
  await profiles(page);
  await page.goto('/participante/derek-leonardo');
  await launcher(page).click();await page.getByRole('button',{name:'Mostrar tiendas físicas con este producto'}).click();
  await expect(panel(page).getByText('Todavía no hay ideas guardadas')).toBeVisible();
  await panel(page).getByRole('button',{name:'Hacer otra consulta'}).click();
  await expect(panel(page).getByRole('radio')).toHaveCount(1);
  await expect(panel(page).getByLabel('Gustos generales de esta persona')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(launcher(page)).toBeFocused();
  // The helper is part of profiles only.
  await page.goto('/');await expect(launcher(page)).toHaveCount(0);
});

test('a single saved gift is selected automatically and the panel fits narrow screens above notifications',async({page})=>{
  await clipboard(page);
  const single={...(people.melyza as {gifts:unknown[]}),gifts:[(people.melyza as {gifts:unknown[]}).gifts[1]]};
  await page.route(`${api}/rest/v1/participants?**`,(route)=>route.fulfill({json:[single],headers:cors}));
  await page.setViewportSize({width:320,height:700});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/participante/melyza');
  await page.getByRole('button',{name:'Copiar perfil público'}).click();
  const toast=page.getByRole('list',{name:'Notificaciones'}).getByRole('listitem');
  await expect(toast).toHaveCount(1);
  await expect.poll(async()=>(await launcher(page).boundingBox())!.y+(await launcher(page).boundingBox())!.height<=(await toast.boundingBox())!.y).toBe(true);
  await launcher(page).click();await page.getByRole('button',{name:'Mostrar opciones similares para este regalo'}).click();
  await expect(panel(page).getByLabel('Opción 3 · Zapatillas cómodas')).toBeChecked();
  await expect(output(page)).toHaveValue(/Producto: Zapatillas cómodas/);
  const box=(await panel(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);expect(box.y).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const button of await panel(page).getByRole('button').all()){const b=(await button.boundingBox())!;expect(b.height).toBeGreaterThanOrEqual(44);}
  expect((await axe(page)).violations).toEqual([]);
});
