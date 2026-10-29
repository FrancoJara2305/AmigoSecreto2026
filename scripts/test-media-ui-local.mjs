import { spawn,spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium,expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { generateToken,hashToken } from '../supabase/functions/_shared/tokens.ts';
if (process.argv.length!==2) throw new Error('Prueba UI exclusivamente local, sin argumentos.');
const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
const owner=randomUUID(),token=generateToken(),hash=await hashToken(token);
const inspect=spawnSync('docker',['--host',endpoint,'inspect','supabase_storage_AmigoSecreto2026','--format','{{json .Config.Env}}'],{encoding:'utf8',timeout:10000});
if (inspect.error || inspect.status!==0) throw new Error('Inicia Docker y Supabase local.');
const vars=JSON.parse(inspect.stdout),anon=vars.find((s)=>s.startsWith('ANON_KEY='))?.slice(9),key=vars.find((s)=>s.startsWith('SERVICE_KEY='))?.slice(12);
if (!anon || !key) throw new Error('Claves internas locales no disponibles.');
const base='http://127.0.0.1:54321',site='http://127.0.0.1:5175';
function sql(statement) {
  const result=spawnSync('docker',['--host',endpoint,'exec','-i','supabase_db_AmigoSecreto2026','psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:statement,encoding:'utf8',timeout:10000});
  if(result.error || result.status!==0) throw new Error('Falló consulta UI local.'); return result.stdout.trim();
}
let vite,browser;
try {
  // Never reuse a preview that could have the user's remote destination configured.
  const listening=await fetch(site,{signal:AbortSignal.timeout(600)}).then(()=>true,()=>false);
  if (listening) throw new Error('Libera el puerto 5175 antes de ejecutar esta prueba.');
  vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5175','--strictPort'],{
    env:{...process.env,APP_LOCAL_MEDIA_TEST:'1',VITE_SUPABASE_URL:base,VITE_SUPABASE_PUBLISHABLE_KEY:anon,VITE_APP_URL:site},stdio:'ignore',windowsHide:true,
  });
  let ready=false;
  for(let i=0;i<60;i++) {if(await fetch(site).then((r)=>r.ok,()=>false)) {ready=true;break;} await delay(100);}
  if(!ready) throw new Error('No se inició Vite local.');
  sql(`insert into public.participants(id,name,slug) values('${owner}','Prueba imagen local','media-ui-${owner}');
    insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${owner}',decode('${hash}','hex'));`);
  browser=await chromium.launch({channel:'msedge'}); const page=await browser.newPage({viewport:{width:1280,height:900},locale:'es-PE'});
  await page.route('**/*',(route)=>[site,new URL(base).origin].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
  await page.goto(`${site}/acceso#token=${token}`);
  await page.getByRole('link',{name:'Añadir regalo a la opción 1',exact:true}).click();
  await page.getByLabel('Título del regalo').fill('Una imagen desde el navegador');
  await page.getByLabel('Subir imagen',{exact:true}).setInputFiles(fileURLToPath(new URL('../tests/fixtures/images/small.png',import.meta.url)));
  await expect(page.getByAltText('Vista previa del regalo')).toBeVisible();
  assert.equal(sql(`select count(*) from public.gifts where participant_id='${owner}';`),'0');
  await page.getByRole('button',{name:'Guardar regalo',exact:true}).click();
  await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.')).toBeVisible();
  const path=sql(`select image_path from public.gifts where participant_id='${owner}' and position=1;`);
  assert.ok(path.startsWith(`${owner}/gift/`));
  assert.equal(sql(`select state from private.media_assets where storage_path='${path}';`),'attached');
  await page.getByLabel('Subir imagen',{exact:true}).setInputFiles(fileURLToPath(new URL('../tests/fixtures/images/small.jpg',import.meta.url)));
  await expect(page.getByRole('button',{name:'Guardar regalo',exact:true})).toBeEnabled();
  assert.equal(sql(`select image_path from public.gifts where participant_id='${owner}' and position=1;`),path);
  await page.getByRole('button',{name:'Guardar regalo',exact:true}).click();
  await expect.poll(()=>sql(`select version from public.gifts where participant_id='${owner}' and position=1;`)).toBe('2');
  assert.equal(sql(`select state from private.media_assets where storage_path='${path}';`),'pending');
  assert.ok(!page.url().includes(token));
  await page.getByRole('heading',{name:'Tu opción 1',exact:true}).focus(); await page.evaluate(()=>scrollTo(0,0));
  await mkdir('artifacts/ui',{recursive:true}); await page.screenshot({path:'artifacts/ui/media-live-local.png',fullPage:true});
  console.log('OK navegador real -> Edge -> Storage -> SQL: subir, guardar y reemplazar; anterior conservada hasta confirmar.');
} catch {
  console.error('Falló la prueba UI real local. Revisa Docker/funciones, puerto 5175 y permisos locales. No se imprimen enlaces privados.'); process.exitCode=1;
} finally {
  await browser?.close(); vite?.kill();
  const paths=JSON.parse(sql(`select coalesce(json_agg(storage_path),'[]') from private.media_assets where participant_id='${owner}';`));
  if(paths.length) {
    const response=await fetch(`${base}/storage/v1/object/wishlist-media`,{method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:paths})});
    if(!response.ok) {console.error('Pendiente limpieza de los archivos de prueba UI locales.');process.exitCode=1;} await response.body?.cancel();
  }
  sql(`delete from public.participants where id='${owner}'; delete from private.rate_limits where key_hash=decode('${hash}','hex');`);
}
