import { test,expect,type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { crc32,deflateSync } from 'node:zlib';
import { apiOrigin,uiOrigin } from './fixtures/origins';
import { profileEditorFixture,openProfileEditor,sampleProfile } from './fixtures/profile-editor';
import { organizerFixture,openOrganizer } from './fixtures/organizer';
import { fixtureOwner } from './fixtures/gift-editor';

// Minimal RGB PNG encoder, so tests can serve photos of any shape.
function png(width:number,height:number,pixel:(x:number,y:number)=>[number,number,number]) {
  const row=width*3+1,raw=Buffer.alloc(row*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)raw.set(pixel(x,y),y*row+1+x*3);
  const chunk=(type:string,data:Buffer)=>{const body=Buffer.concat([Buffer.from(type,'ascii'),data]),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(body));return Buffer.concat([size,body,crc]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
// Portrait photo: red top half, blue bottom half (100×300).
const tall=png(100,300,(_x,y)=>y<150?[255,0,0]:[0,0,255]);
const storedPath=`${fixtureOwner}/avatar/22222222-2222-4222-8222-000000000001.webp`;
async function expectSquareCircle(image:import('@playwright/test').Locator) {
  await expect(image).toBeVisible();
  const box=(await image.boundingBox())!,frame=(await image.locator('..').boundingBox())!;
  expect(Math.abs(box.width-box.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height-frame.height)).toBeLessThanOrEqual(1);expect(Math.abs(box.y-frame.y)).toBeLessThanOrEqual(1);
  expect(await image.evaluate((element)=>getComputedStyle(element).objectFit)).toBe('cover');
}

// A 200×100 PNG drawn in the page: red left half, blue right half. Focus sits on the input, as after the picker closes.
async function chooseTwoColourPhoto(page:Page) {
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=200;canvas.height=100;const context=canvas.getContext('2d')!;
    context.fillStyle='#ff0000';context.fillRect(0,0,100,100);context.fillStyle='#0000ff';context.fillRect(100,0,100,100);
    const blob=await new Promise<Blob>((resolve)=>canvas.toBlob((value)=>resolve(value!),'image/png'));
    const input=document.getElementById('profile-photo_path') as HTMLInputElement;input.focus();const files=new DataTransfer();
    files.items.add(new File([blob],'colores.png',{type:'image/png'}));input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
}
// Average colour of the uploaded JPEG, decoded in the page.
const averageColour=(page:Page,body:Buffer)=>page.evaluate(async(base64)=>{
  const bytes=Uint8Array.from(atob(base64),(c)=>c.charCodeAt(0));const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d')!;context.drawImage(bitmap,0,0);
  const data=context.getImageData(0,0,bitmap.width,bitmap.height).data;let r=0,b=0;for(let i=0;i<data.length;i+=4){r+=data[i];b+=data[i+2];}
  return {width:bitmap.width,height:bitmap.height,red:r/(data.length/4),blue:b/(data.length/4)};
},body.toString('base64'));
const dialog=(page:Page)=>page.getByRole('dialog',{name:'Ajusta tu foto'});

test('the chosen frame is what gets uploaded, followed by a visible confirmation check',async({page},info)=>{
  const {state}=await profileEditorFixture(page);state.uploadDelay=400;
  const bodies:{type:string;body:Buffer}[]=[];
  await page.route(`${apiOrigin}/functions/v1/media-upload`,(route)=>{if(route.request().method()==='POST')bodies.push({type:route.request().headers()['content-type'],body:route.request().postDataBuffer()!});return route.fallback();});
  await openProfileEditor(page);
  await chooseTwoColourPhoto(page);
  await expect(dialog(page)).toBeVisible();
  const stage=dialog(page).getByRole('group',{name:'Encuadre de la foto'});
  await expect(stage).toBeFocused();expect(state.uploads).toHaveLength(0);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await mkdir('artifacts/ui',{recursive:true});await page.screenshot({path:`artifacts/ui/photo-crop-${info.project.name}.png`});
  // Keyboard framing: move to the right edge, so only the blue half is inside the circle.
  for(let i=0;i<6;i++)await page.keyboard.press('Shift+ArrowRight');
  await dialog(page).getByRole('button',{name:'Usar esta foto',exact:true}).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({hasText:'Preparando y subiendo tu foto…'})).toBeAttached();
  await expect(page.locator('.progress-overlay__ring')).toBeVisible();
  await expect(page.locator('.progress-overlay').getByText('Foto lista',{exact:true})).toBeVisible();
  await expect(page.locator('.progress-overlay__check')).toBeVisible();
  await page.waitForTimeout(600);await page.screenshot({path:`artifacts/ui/photo-confirm-${info.project.name}.png`});
  await expect(page.locator('.progress-overlay')).toHaveCount(0,{timeout:4000});
  expect(state.uploads).toEqual(['avatar']);expect(state.writes).toHaveLength(0);
  expect(bodies).toHaveLength(1);expect(bodies[0].type).toBe('image/jpeg');
  const colour=await averageColour(page,bodies[0].body);
  expect(colour).toMatchObject({width:100,height:100});expect(colour.blue).toBeGreaterThan(200);expect(colour.red).toBeLessThan(40);
  await expect(page.getByRole('img',{name:'Vista previa de foto o ilustración'}).locator('img')).toBeVisible();
  // Saving shows the same confirmation.
  await page.getByRole('button',{name:'Guardar perfil',exact:true}).click();
  await expect(page.locator('.progress-overlay').getByText('Perfil guardado',{exact:true})).toBeVisible();
  await expect(page.getByText('Tu perfil quedó guardado. Tus regalos se mantienen.')).toBeVisible();
});

test('dragging and zoom move the frame; Escape and Cancel never upload and return focus',async({page})=>{
  const {state}=await profileEditorFixture(page);
  await openProfileEditor(page);
  await chooseTwoColourPhoto(page);
  const stage=dialog(page).getByRole('group',{name:'Encuadre de la foto'}),image=stage.locator('img');
  await expect(image).toHaveAttribute('style',/left: -50%/);
  await expect(dialog(page).getByRole('button',{name:'Alejar',exact:true})).toBeDisabled();
  const box=(await stage.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width,box.y+box.height/2,{steps:4});await page.mouse.up();
  await expect(image).toHaveAttribute('style',/left: 0%/);
  await dialog(page).getByRole('button',{name:'Acercar',exact:true}).click();
  await expect(dialog(page).getByRole('slider',{name:'Acercar o alejar la foto'})).toHaveValue('1.25');
  await dialog(page).getByRole('button',{name:'Centrar',exact:true}).click();
  await expect(image).toHaveAttribute('style',/left: -50%/);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByLabel('Subir foto',{exact:true})).toBeFocused();
  await chooseTwoColourPhoto(page);
  await dialog(page).getByRole('button',{name:'Cancelar',exact:true}).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(state.uploads).toHaveLength(0);
  await expect(page.locator('.progress-overlay')).toHaveCount(0);
});

test('the upload area and buttons react to hover',async({page,hasTouch})=>{
  test.skip(hasTouch,'Hover styles only apply to devices with a hovering pointer');
  await profileEditorFixture(page);await openProfileEditor(page);
  const zone=page.locator('.file-drop').first();
  const before=await zone.evaluate((element)=>getComputedStyle(element).backgroundColor);
  await zone.hover();
  await expect.poll(()=>zone.evaluate((element)=>getComputedStyle(element).backgroundColor)).not.toBe(before);
  await mkdir('artifacts/ui',{recursive:true});await zone.screenshot({path:'artifacts/ui/photo-drop-hover.png'});
  const button=page.getByRole('button',{name:'Usar URL de foto',exact:true});
  const border=await button.evaluate((element)=>getComputedStyle(element).borderColor);
  await button.hover();
  await expect.poll(()=>button.evaluate((element)=>getComputedStyle(element).borderColor)).not.toBe(border);
});

test('saved non-square photos show a 1:1 circle everywhere and can be reframed from storage',async({page})=>{
  const {state}=await profileEditorFixture(page,{...sampleProfile(),photo_path:storedPath});
  const fetched:string[]=[];
  await page.route(`${apiOrigin}/storage/v1/object/public/wishlist-media/**`,(route)=>{fetched.push(route.request().headers().cookie??'');return route.fulfill({body:tall,contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'}});});
  const bodies:Buffer[]=[];
  await page.route(`${apiOrigin}/functions/v1/media-upload`,(route)=>{if(route.request().method()==='POST')bodies.push(route.request().postDataBuffer()!);return route.fallback();});
  await page.goto('/participante/melyza');
  await expectSquareCircle(page.locator('.profile-header__avatar img'));
  await openProfileEditor(page);
  await expectSquareCircle(page.getByRole('img',{name:'Vista previa de foto o ilustración'}).locator('img'));
  await page.getByRole('button',{name:'Ajustar encuadre',exact:true}).click();
  await expect(dialog(page)).toBeVisible();
  const image=dialog(page).getByRole('group',{name:'Encuadre de la foto'}).locator('img');
  // Default frame: the centred square of the portrait.
  await expect(image).toHaveAttribute('style',/top: -100%/);
  for(let i=0;i<10;i++)await page.keyboard.press('Shift+ArrowDown');
  await expect(image).toHaveAttribute('style',/top: -200%/);
  await dialog(page).getByRole('button',{name:'Usar esta foto',exact:true}).click();
  await expect(page.locator('.progress-overlay').getByText('Foto lista',{exact:true})).toBeVisible();
  expect(state.uploads).toEqual(['avatar']);expect(bodies).toHaveLength(1);expect(fetched.every((cookie)=>cookie==='')).toBe(true);
  const colour=await averageColour(page,bodies[0]);
  expect(colour).toMatchObject({width:100,height:100});expect(colour.blue).toBeGreaterThan(200);expect(colour.red).toBeLessThan(40);
  await page.getByRole('button',{name:'Guardar perfil',exact:true}).click();
  await expect(page.getByText('Tu perfil quedó guardado. Tus regalos se mantienen.')).toBeVisible();
  expect(state.profile.photo_path).not.toBe(storedPath);
  // Reframing again starts from the full original kept in memory, without reading storage again.
  const reads=fetched.length;
  await page.getByRole('button',{name:'Ajustar encuadre',exact:true}).click();
  await expect(dialog(page).getByRole('group',{name:'Encuadre de la foto'}).locator('img')).toHaveAttribute('style',/top: -100%/);
  await dialog(page).getByRole('button',{name:'Cancelar',exact:true}).click();
  expect(fetched).toHaveLength(reads);expect(state.uploads).toHaveLength(1);
});

test('a stored photo that cannot be read shows a message and changes nothing',async({page})=>{
  const {state}=await profileEditorFixture(page,{...sampleProfile(),photo_path:storedPath});
  await page.route(`${apiOrigin}/storage/v1/object/public/wishlist-media/**`,(route)=>route.fulfill({status:404,headers:{'Access-Control-Allow-Origin':'*'}}));
  await openProfileEditor(page);
  await page.getByRole('button',{name:'Ajustar encuadre',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'No pudimos abrir la foto guardada'})).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  expect(state.uploads).toHaveLength(0);expect(state.writes).toHaveLength(0);
});

test('portrait photos in the catalogue and organizer roster stay inside a 1:1 circle',async({page,hasTouch})=>{
  const url='https://photos.example.com/tall.png';
  await page.route(url,(route)=>route.fulfill({body:tall,contentType:'image/png'}));
  await page.route(`${apiOrigin}/rest/v1/participants?**`,(route)=>new URL(route.request().url()).searchParams.has('slug')?route.fallback():route.fulfill({
    json:[{id:fixtureOwner,name:'Alice',slug:'alice',photo_path:null,photo_url:url,avatar_key:'star',display_order:0,gifts:[{count:0}]}],headers:{'Access-Control-Allow-Origin':uiOrigin}}));
  await page.goto('/');
  const card=page.getByRole('list',{name:'Participantes',exact:true}).getByRole('listitem').first();
  if(!hasTouch)await card.getByRole('link').hover();
  await expectSquareCircle(card.locator('.participant-avatar img'));
  await page.unroute(`${apiOrigin}/rest/v1/participants?**`);
  const {state}=await organizerFixture(page);state.people[0].photo_url=url;
  // Registered after the fixture so it wins over the fixture's catch-all routes.
  await page.route(url,(route)=>route.fulfill({body:tall,contentType:'image/png'}));
  await openOrganizer(page);
  await expectSquareCircle(page.locator('.admin-person__identity .participant-avatar img').first());
});
