import { test,expect } from '@playwright/test';
import { editorFixture,fixtureCredential,sampleGift,openEditor } from './fixtures/gift-editor';

test('untrusted gift text is rendered literally and unsafe URLs never become links',async({page})=>{
  const attack='<img src=x onerror="window.__injected=true">';
  const gift={...sampleGift(),title:attack,description:'<script>window.__injected=true</script>',product_url:'javascript:window.__injected=true'};
  await editorFixture(page,[gift]);
  await page.goto('/participante/melyza');
  await expect(page.getByRole('heading',{name:attack,exact:true})).toBeVisible();
  await expect(page.getByText(gift.description,{exact:true})).toBeVisible();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(()=>Object.hasOwn(window,'__injected'))).toBe(false);
});

test('private editor never sends credentials to public reads, referer, logs or DOM',async({page})=>{
  await editorFixture(page);
  const leaks:string[]=[];
  page.on('console',(message)=>{if(message.text().includes(fixtureCredential))leaks.push('console');});
  page.on('request',(request)=>{
    const headers=request.headers(),url=new URL(request.url());
    if(request.url().includes(fixtureCredential)||request.postData()?.includes(fixtureCredential)||headers.referer?.includes(fixtureCredential))leaks.push('request');
    if(!url.pathname.startsWith('/functions/v1/')&&headers['x-edit-token'])leaks.push('public header');
  });
  await openEditor(page);
  await page.getByLabel('Título del regalo').fill('Texto sin credenciales');
  await page.getByRole('button',{name:'Guardar regalo',exact:true}).click();
  await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.',{exact:true})).toBeVisible();
  expect(leaks).toEqual([]);
  expect(await page.evaluate(()=>[localStorage.length,sessionStorage.length])).toEqual([0,0]);
  expect(await page.content()).not.toContain(fixtureCredential);
  expect(await page.evaluate(()=>JSON.stringify(history.state))).not.toContain(fixtureCredential);
});
