import { test,expect,type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import { editorFixture,openEditor,fixtureCredential,sampleGift } from './fixtures/gift-editor';
import { profileEditorFixture,openProfileEditor } from './fixtures/profile-editor';
import { organizerFixture,openOrganizer } from './fixtures/organizer';
import { importFixture } from './fixtures/product-import';

async function fits(page:Page){
  expect(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))).toEqual(expect.objectContaining({scroll:expect.any(Number)}));
  const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll<HTMLElement>('main h1,main h2,main h3,main p,main button,main input,main textarea,main select,main a,main label,dialog[open]')).filter((el)=>{
    const r=el.getBoundingClientRect(),style=getComputedStyle(el);return r.width>0&&r.height>0&&style.position!=='absolute'&&(r.left<-.5||r.right>innerWidth+.5);
  }).map((el)=>({tag:el.tagName,id:el.id,class:el.className,text:(el.textContent??'').slice(0,60)})));
  expect(overflow).toEqual([]);
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((el)=>{const r=el.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||el.scrollWidth>el.clientWidth+1&&getComputedStyle(el).overflowX==='visible');}).slice(0,18).map((el)=>({tag:el.tagName,id:el.id,cls:el.className,width:el.getBoundingClientRect().width,client:el.clientWidth,scroll:el.scrollWidth,text:(el.textContent??'').slice(0,75)}))}));
  expect(layout.scroll,JSON.stringify(layout.overflow)).toBeLessThanOrEqual(layout.width+1);
}
async function scan(page:Page){expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);}
async function keyTo(page:Page,role:'button'|'link'|'textbox',name:string){
  const target=role==='link'&&name==='Participantes'?page.getByRole('navigation',{name:'Administración',exact:true}).getByRole('link',{name,exact:true}):page.getByRole(role,{name,exact:true});
  const trail:string[]=[];
  for(let i=0;i<100;i++){
    if(await target.evaluate((el)=>el===document.activeElement))return;
    trail.push(await page.evaluate(()=>`${document.activeElement?.tagName}#${document.activeElement?.id}:${document.activeElement?.getAttribute('aria-label')??document.activeElement?.textContent?.slice(0,35)}`));
    // Traverse towards the target instead of relying on cycling through headless browser chrome.
    const reverse=await target.evaluate((el)=>!!(el.compareDocumentPosition(document.activeElement!)&Node.DOCUMENT_POSITION_FOLLOWING));
    const key=reverse?'Shift+Tab':'Tab';await page.keyboard.press(key);
  }
  throw new Error(`Keyboard could not reach ${role}: ${name}; last focus targets: ${JSON.stringify(trail.slice(-14))}`);
}
test.beforeEach(async({page})=>{await page.route('**/*',(route)=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());});

test('all principal routes reflow at narrow, landscape, desktop and doubled text without losing actions',async({page})=>{
  const {state}=await organizerFixture(page);state.people[0].name='Nombre largo con dos apellidos y una consideración especial para Navidad';
  await openOrganizer(page);
  const destinations=[{link:'Evento',form:'Título del evento'},{link:'Participantes',form:''},{link:'Añadir participante',form:'Nombre'}];
  for(const target of destinations){
    if(target.link==='Participantes')await page.getByRole('navigation',{name:'Administración',exact:true}).getByRole('link',{name:'Participantes',exact:true}).click();else await page.getByRole('link',{name:target.link,exact:true}).click();
    if(target.form)await expect(page.getByRole('textbox',{name:`${target.form} (obligatorio)`,exact:true})).toBeEnabled();else await expect(page.getByRole('list',{name:'Participantes del intercambio'})).toBeVisible();
    for(const width of [320,390,640,768,1024,1280]){await page.setViewportSize({width,height:width===768?390:900});await fits(page);}
    await page.setViewportSize({width:320,height:900});await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await fits(page);await page.evaluate(()=>{document.documentElement.style.fontSize='';});
  }
  await page.getByRole('link',{name:'Cancelar',exact:true}).click();await page.getByRole('link',{name:'Ver y editar lista de '+state.people[0].name,exact:true}).click();await expect(page.getByRole('heading',{level:1})).toBeVisible();await page.setViewportSize({width:320,height:900});await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await fits(page);
});
test('gift and profile forms, import suggestions and long values remain readable at 200 percent text',async({page},info)=>{
  await editorFixture(page,[sampleGift()]);await openEditor(page);await importFixture(page);
  await page.getByLabel('Enlace del producto',{exact:true}).fill('https://shop.example.com/product');await page.getByRole('button',{name:'Importar información',exact:true}).click();await expect(page.getByRole('heading',{name:'Revisa lo que encontramos'})).toBeFocused();
  await page.setViewportSize({width:320,height:900});await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await fits(page);await scan(page);
  await mkdir('artifacts/a11y',{recursive:true});await page.screenshot({path:`artifacts/a11y/import-200-${info.project.name}.png`,fullPage:true});
  // New document deliberately clears the first session/draft before testing a different editor.
  await profileEditorFixture(page);await openProfileEditor(page);await page.setViewportSize({width:320,height:900});await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await fits(page);await scan(page);
});
test('keyboard alone reaches participant, edits a gift, cancels a destructive dialog and restores focus',async({page})=>{
  await editorFixture(page,[sampleGift()]);await page.goto(`/acceso#token=${fixtureCredential}`);await expect(page.getByRole('heading',{name:'Melyza',exact:true})).toBeFocused();
  await keyTo(page,'link','Editar regalo de la opción 1');await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Tu opción 1',exact:true})).toBeFocused();
  await keyTo(page,'button','Limpiar opción');await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:'¿Limpiar la opción 1?'});await expect(dialog.getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();
  for(let i=0;i<7;i++){await page.keyboard.press(i%2?'Shift+Tab':'Tab');expect(await dialog.evaluate((el)=>el.contains(document.activeElement))).toBe(true);}
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Limpiar opción',exact:true})).toBeFocused();
  await keyTo(page,'textbox','Título del regalo (obligatorio)');await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('Una idea con teclado');await keyTo(page,'button','Guardar regalo');await page.keyboard.press('Enter');await expect(page.getByText('Tu opción quedó guardada.',{exact:false})).toBeVisible();
});
test('keyboard alone creates and orders participants and confirms a named deletion',async({page})=>{
  const {state}=await organizerFixture(page);await openOrganizer(page);await keyTo(page,'link','Añadir participante');await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Añadir participante',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await keyTo(page,'textbox','Nombre (obligatorio)');await page.keyboard.type('Alice con teclado');await keyTo(page,'button','Crear participante');await page.keyboard.press('Enter');await expect(page.getByText('Participante añadido',{exact:true})).toBeVisible();
  await keyTo(page,'link','Participantes');await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Organizar nuestro intercambio',exact:true})).toBeFocused();
  await keyTo(page,'button','Subir a Alice con teclado');await page.keyboard.press('Enter');await expect(page.getByText('Orden actualizado.',{exact:true})).toBeVisible();
  await keyTo(page,'button','Eliminar a Alice con teclado');await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Eliminar a Alice con teclado',exact:true})).toBeFocused();
  await keyTo(page,'textbox','Escribe Alice con teclado para confirmar');await page.keyboard.type('Alice con teclado');await keyTo(page,'button','Confirmar eliminación');await page.keyboard.press('Enter');await expect(page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();await keyTo(page,'button','Sí, eliminar participante');await page.keyboard.press('Enter');await expect(page.getByText('Alice con teclado y su lista fueron retirados.')).toBeVisible();expect(state.people).toHaveLength(2);
});
test('accessible names and descriptions associate upload and avatar errors with the exact controls',async({page})=>{
  const {state}=await profileEditorFixture(page);await openProfileEditor(page);state.fault='fields';state.field='photo_path';await page.getByRole('button',{name:'Guardar perfil',exact:true}).click();const upload=page.getByLabel('Subir foto',{exact:true});await expect(upload).toHaveAttribute('aria-invalid','true');await expect(upload).toHaveAccessibleDescription(/Revisa este dato antes de guardar/);await scan(page);
  state.fault='fields';state.field='avatar_key';await page.getByRole('button',{name:'Guardar perfil',exact:true}).click();await expect(page.getByRole('group',{name:'Ilustración local',exact:true})).toHaveAccessibleDescription(/Revisa este dato antes de guardar/);await expect(page.getByRole('radio',{name:'Estrella',exact:true})).toHaveAccessibleDescription(/Revisa este dato antes de guardar/);
  const gift=await editorFixture(page,[sampleGift()]);await openEditor(page);gift.fault='fields';gift.field='image_path';await page.getByRole('button',{name:'Guardar regalo',exact:true}).click();await expect(page.getByLabel('Subir imagen',{exact:true})).toHaveAccessibleDescription(/Revisa este dato antes de guardar/);
});
test('dialog remains scrollable and actionable at 200 percent with long names and a short viewport',async({page},info)=>{
  const {state}=await organizerFixture(page);state.people[0].name='N'.repeat(80);await openOrganizer(page);await page.getByRole('button',{name:`Eliminar a ${state.people[0].name}`,exact:true}).click();await page.getByLabel(`Escribe ${state.people[0].name} para confirmar`).fill(state.people[0].name);await page.getByRole('button',{name:'Confirmar eliminación'}).click();await page.setViewportSize({width:320,height:256});await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await fits(page);const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Sí, eliminar participante'}).focus();await expect(dialog.getByRole('button',{name:'Sí, eliminar participante'})).toBeInViewport();await scan(page);await mkdir('artifacts/a11y',{recursive:true});await page.screenshot({path:`artifacts/a11y/dialog-200-${info.project.name}.png`});await page.keyboard.press('Escape');
});
test('reduced motion and failed images preserve meaning, focus and touch target sizes',async({page},info)=>{
  const {state}=await organizerFixture(page);state.people[0].photo_url='https://example.com/broken.png';await page.emulateMedia({reducedMotion:'reduce'});await openOrganizer(page);await expect(page.locator('.admin-person').first().locator('.participant-avatar svg')).toBeVisible();await page.getByRole('button',{name:'Gestionar enlace privado de Melyza',exact:true}).focus();
  expect(await page.getByRole('button',{name:'Gestionar enlace privado de Melyza',exact:true}).evaluate((el)=>getComputedStyle(el).outlineStyle)).toBe('solid');
  const small=await page.locator('main a,main button').evaluateAll((els)=>els.filter((el)=>{const b=el.getBoundingClientRect();return b.width>0&&b.height>0&&(b.width<44||b.height<44);}).map((el)=>({text:el.textContent?.trim(),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
  expect(small).toEqual([]);expect(await page.locator('.button').first().evaluate((el)=>getComputedStyle(el).transitionDuration)).toBe('0s');await scan(page);await mkdir('artifacts/a11y',{recursive:true});await page.screenshot({path:`artifacts/a11y/roster-${info.project.name}.png`,fullPage:true});
});
test('landmarks, heading order and live feedback expose a coherent accessibility tree',async({page},info)=>{
  await organizerFixture(page);await openOrganizer(page);await expect(page.getByRole('main')).toHaveCount(1);await expect(page.getByRole('heading',{level:1})).toHaveCount(1);await expect(page.locator('html')).toHaveAttribute('lang','es');
  await page.getByRole('link',{name:'Añadir participante',exact:true}).click();await page.getByRole('button',{name:'Crear participante',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Revisemos un pequeño detalle'})).toBeVisible();
  const tree=await page.getByRole('main').ariaSnapshot();expect(tree).toContain('Nombre');expect(tree).toContain('obligatorio');expect(tree).not.toContain(fixtureCredential);await mkdir('artifacts/a11y',{recursive:true});await writeFile(`artifacts/a11y/tree-${info.project.name}.yml`,tree);await scan(page);
});
test('computed text, focus and input borders meet measured contrast including the one-time link',async({page},info)=>{
  await organizerFixture(page);await openOrganizer(page);await page.getByRole('button',{name:'Gestionar enlace privado de Melyza',exact:true}).click();await page.getByRole('button',{name:'Emitir nuevo enlace',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Sí, emitir enlace'}).click();await expect(page.getByLabel('Enlace privado nuevo')).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:'Actualizar listado',exact:true})).toBeEnabled();await page.getByLabel('Enlace privado nuevo').focus();await keyTo(page,'button','Copiar enlace');await expect(page.getByRole('button',{name:'Copiar enlace',exact:true})).toBeFocused();
  const input=await page.getByLabel('Enlace privado nuevo').evaluate((el)=>{const c=getComputedStyle(el);return {text:c.color,border:c.borderTopColor,background:c.backgroundColor};});
  const button=await page.getByRole('button',{name:'Copiar enlace',exact:true}).evaluate((el)=>{const c=getComputedStyle(el);return {text:c.color,background:c.backgroundColor,focus:c.outlineColor};});
  function contrast(a:string,b:string){const light=(s:string)=>{const values=s.match(/[\d.]+/g)!.slice(0,3).map((v)=>{const c=Number(v)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;};const x=light(a),y=light(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  const ratios={linkText:contrast(input.text,input.background),linkBorder:contrast(input.border,input.background),primaryText:contrast(button.text,button.background),focusOnSurface:contrast(button.focus,input.background)};
  expect(ratios.linkText).toBeGreaterThanOrEqual(4.5);expect(ratios.primaryText).toBeGreaterThanOrEqual(4.5);expect(ratios.linkBorder).toBeGreaterThanOrEqual(3);expect(ratios.focusOnSurface).toBeGreaterThanOrEqual(3);
  await mkdir('artifacts/a11y',{recursive:true});await writeFile(`artifacts/a11y/contrast-${info.project.name}.json`,JSON.stringify(ratios,null,2));await scan(page);
});
