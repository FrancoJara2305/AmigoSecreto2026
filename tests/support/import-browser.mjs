import { spawn,spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium,expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { generateToken,hashToken } from '../../supabase/functions/_shared/tokens.ts';

// Called only by the isolated local Edge+TLS runner. No remote target/configuration input.
export async function runImportBrowser(sql) {
  const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
  const site='http://127.0.0.1:5176',base='http://127.0.0.1:54321';
  const owner=randomUUID(),token=generateToken(),hash=await hashToken(token);
  let vite,browser,page,phase='local configuration';const responses=[];
  try {
    if(await fetch(site,{signal:AbortSignal.timeout(600)}).then(()=>true,()=>false))throw new Error('Local UI port occupied');
    const inspect=spawnSync('docker',['--host',endpoint,'inspect','supabase_storage_AmigoSecreto2026','--format','{{json .Config.Env}}'],{encoding:'utf8',timeout:10000});
    if(inspect.error||inspect.status!==0)throw new Error('Local configuration unavailable');
    const anon=JSON.parse(inspect.stdout).find((value)=>value.startsWith('ANON_KEY='))?.slice(9);
    if(!anon)throw new Error('Local public key unavailable');
    vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5176','--strictPort'],{
      env:{...process.env,APP_LOCAL_IMPORT_TEST:'1',VITE_SUPABASE_URL:base,VITE_SUPABASE_PUBLISHABLE_KEY:anon,VITE_APP_URL:site},stdio:'ignore',windowsHide:true,
    });
    let ready=false;
    for(let attempt=0;attempt<80;attempt++) {if(await fetch(site).then((r)=>r.ok,()=>false)){ready=true;break;}await new Promise((resolve)=>setTimeout(resolve,100));}
    if(!ready)throw new Error('Local UI not ready');
    phase='worker readiness';ready=false;
    for(let attempt=0;attempt<60;attempt++) {
      const status=await fetch(`${base}/functions/v1/wishlist-api`,{method:'POST',headers:{'Content-Type':'application/json',Origin:site},body:'{}',signal:AbortSignal.timeout(1000)}).then(async(response)=>{await response.body?.cancel();return response.status;},()=>0);
      if(status===401){ready=true;break;}await new Promise((resolve)=>setTimeout(resolve,100));
    }
    if(!ready)throw new Error('Local worker not ready');
    sql(`insert into public.participants(id,name,slug) values('${owner}','Importación UI local','import-ui-${owner}');insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${owner}',decode('${hash}','hex'));`);
    browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'msedge'});
    page=await browser.newPage({viewport:{width:1280,height:900},locale:'es-PE'});
    page.on('response',(response)=>{const path=new URL(response.url()).pathname;if(path.startsWith('/functions/')||path.startsWith('/rest/'))responses.push(`${path}:${response.status()}`);});
    await page.route('**/*',(route)=>[site,base].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
    phase='private entry';await page.goto(`${site}/acceso#token=${token}`);
    await page.getByRole('link',{name:'Añadir regalo a la opción 1',exact:true}).click();
    phase='editor';await page.getByLabel('Enlace del producto').fill('https://shop.example.com/product');
    await page.getByRole('button',{name:'Importar información',exact:true}).click();
    const preview=page.getByRole('region',{name:'Revisa lo que encontramos'});
    phase='preview';await expect(preview).toBeVisible();await expect(page.getByLabel('Título del regalo')).toHaveValue('');
    assert.equal(sql(`select count(*) from public.gifts where participant_id='${owner}';`),'0');
    await preview.getByRole('checkbox',{name:/^Moneda/}).check();await preview.getByRole('checkbox',{name:/^Imagen/}).uncheck();
    phase='apply';await preview.getByRole('button',{name:'Aplicar campos seleccionados'}).click();
    await expect(page.getByLabel('Título del regalo')).toHaveValue('Taza de prueba & café');await expect(page.getByLabel('Moneda',{exact:true})).toHaveValue('USD');
    assert.equal(sql(`select count(*) from public.gifts where participant_id='${owner}';`),'0');
    await page.getByLabel('Título del regalo').fill('Mi taza revisada');
    phase='save';await page.getByRole('button',{name:'Guardar regalo',exact:true}).click();
    await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible();
    const saved=JSON.parse(sql(`select row_to_json(g) from (select title,currency,reference_price,product_url from public.gifts where participant_id='${owner}') g;`));
    assert.deepEqual(saved,{title:'Mi taza revisada',currency:'USD',reference_price:29.9,product_url:'https://shop.example.com/product'});
    assert.ok(!page.url().includes(token));assert.ok(!(await page.locator('body').textContent()).includes(token));
    await mkdir('artifacts/ui',{recursive:true});await page.screenshot({path:'artifacts/ui/import-live-local.png',fullPage:true});
    console.log('OK navegador -> Edge -> Node -> TLS -> parser: vista previa y aplicación sin persistir; solo Guardar crea el regalo en SQL con USD intacto.');
  } catch(error) {
    console.error(`UI local: ${phase}; respuestas sanitizadas: ${responses.slice(-12).join(', ')||'ninguna'}.`);
    if(page){await mkdir('artifacts/ui',{recursive:true});await page.screenshot({path:'artifacts/ui/import-live-failed.png',fullPage:true}).catch(()=>{});}
    throw new Error('Local browser test unavailable');
  } finally {
    await browser?.close();vite?.kill();
    if(vite)await Promise.race([new Promise((resolve)=>vite.once('close',resolve)),new Promise((resolve)=>setTimeout(resolve,2000))]);
    sql(`delete from public.participants where id='${owner}';delete from private.rate_limits where key_hash=decode('${hash}','hex');`);
  }
}
