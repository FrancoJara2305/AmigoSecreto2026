import { spawn,spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname,join } from 'node:path';
import { mkdir,writeFile,rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium,expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { generateToken,hashToken } from '../supabase/functions/_shared/tokens.ts';
import { inspectImage } from '../supabase/functions/_shared/image-inspection.ts';
if(process.argv.length!==2)throw new Error('Ensayo de perfil exclusivamente local, sin argumentos.');
const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
const base='http://127.0.0.1:54321',site='http://127.0.0.1:5177',owner=randomUUID(),other=randomUUID(),giftId=randomUUID(),token=generateToken(),hash=await hashToken(token);
const envPath=new URL(`../artifacts/profile-${randomUUID()}.env.local`,import.meta.url);
let cli,vite,browser,page,anon,key,phase='startup',log='',rowsCreated=false;
const sql=(statement)=>{const result=spawnSync('docker',['--host',endpoint,'exec','-i','supabase_db_AmigoSecreto2026','psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:statement,encoding:'utf8',timeout:10000});if(result.error||result.status!==0)throw new Error('Local SQL unavailable');return result.stdout.trim();};
async function waitFor(check,attempts=80){for(let attempt=0;attempt<attempts;attempt++){if(await check())return;await new Promise((resolve)=>setTimeout(resolve,100));}throw new Error('Local readiness unavailable');}
async function update(id,version,message){const response=await fetch(`${base}/functions/v1/wishlist-api`,{method:'POST',headers:{Origin:site,'Content-Type':'application/json',apikey:anon,'X-Edit-Token':token},body:JSON.stringify({action:'update_profile',participant_id:id,expected_version:version,profile:{personal_message:message}}),signal:AbortSignal.timeout(12000)});await response.body?.cancel();return response.status;}
try {
  if((await Promise.all(['wishlist-api','media-upload'].map((name)=>fetch(`${base}/functions/v1/${name}`,{method:'OPTIONS',signal:AbortSignal.timeout(700)}).then((r)=>r.status===204,()=>false)))).some(Boolean))throw new Error('Existing local functions active');
  if(await fetch(site,{signal:AbortSignal.timeout(600)}).then(()=>true,()=>false))throw new Error('Local UI port occupied');
  sql('select 1;');
  const inspect=spawnSync('docker',['--host',endpoint,'inspect','supabase_storage_AmigoSecreto2026','--format','{{json .Config.Env}}'],{encoding:'utf8',timeout:10000});if(inspect.error||inspect.status!==0)throw new Error('Local configuration unavailable');
  const vars=JSON.parse(inspect.stdout);anon=vars.find((value)=>value.startsWith('ANON_KEY='))?.slice(9);key=vars.find((value)=>value.startsWith('SERVICE_KEY='))?.slice(12);if(!anon||!key)throw new Error('Local configuration unavailable');
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});await writeFile(envPath,`APP_ALLOWED_ORIGINS=${site}\nAPP_BASE_URL=${site}\nRATE_LIMIT_IP_SOURCE=off\n`);
  const require=createRequire(import.meta.url),suffix=process.platform==='win32'?'windows-x64':`${process.platform}-${process.arch}`;
  const binary=join(dirname(require.resolve(`@supabase/cli-${suffix}/package.json`)),'bin',`supabase${process.platform==='win32'?'.exe':''}`);
  cli=spawn(binary,['functions','serve','--env-file',fileURLToPath(envPath)],{stdio:['ignore','pipe','pipe'],windowsHide:true});cli.stdout.on('data',(data)=>{log+=data;});cli.stderr.on('data',(data)=>{log+=data;});
  await waitFor(()=>log.includes('Serving functions on'));
  phase='worker readiness';
  for(const name of ['wishlist-api','media-upload'])await waitFor(()=>fetch(`${base}/functions/v1/${name}`,{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(1000)}).then(async(response)=>{await response.body?.cancel();return response.status===401;},()=>false));
  vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5177','--strictPort'],{env:{...process.env,APP_LOCAL_PROFILE_TEST:'1',VITE_SUPABASE_URL:base,VITE_SUPABASE_PUBLISHABLE_KEY:anon,VITE_APP_URL:site},stdio:'ignore',windowsHide:true});
  await waitFor(()=>fetch(site).then((response)=>response.ok,()=>false));
  phase='fixture';
  sql(`begin;insert into public.participants(id,name,slug) values('${owner}','Perfil UI local','profile-live-${owner}'),('${other}','Otro UI local','profile-live-${other}');insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${owner}',decode('${hash}','hex'));insert into public.gifts(id,participant_id,position,title,gift_type) values('${giftId}','${owner}',1,'Idea de prueba conservada','object');commit;`);rowsCreated=true;
  const before=sql(`select row_to_json(g) from (select id,title,version,details from public.gifts where id='${giftId}')g;`);
  phase='foreign authorization';assert.equal(await update(other,1,'Forbidden'),403);assert.equal(sql(`select version from public.participants where id='${other}';`),'1');
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'msedge'});page=await browser.newPage({viewport:{width:1280,height:900},locale:'es-PE'});
  await page.route('**/*',(route)=>[site,base].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
  phase='private entry';await page.goto(`${site}/acceso#token=${token}`);await page.getByRole('link',{name:'Editar mi perfil',exact:true}).click();
  await expect(page.getByLabel('Mensaje personal',{exact:true})).toBeEnabled();await page.getByLabel('Mensaje personal',{exact:true}).fill('Un mensaje desde el perfil');await page.getByLabel('Gustos y consideraciones generales',{exact:true}).fill('Verde y azul. Evitar lana.');
  phase='avatar preparation';await page.getByLabel('Subir foto',{exact:true}).setInputFiles(fileURLToPath(new URL('../tests/fixtures/images/large.jpg',import.meta.url)));
  await expect(page.getByRole('img',{name:'Vista previa de foto o ilustración'}).locator('img')).toBeVisible({timeout:20000});
  const path=sql(`select storage_path from private.media_assets where participant_id='${owner}' order by created_at desc limit 1;`);assert.ok(path.startsWith(`${owner}/avatar/`));assert.equal(sql(`select state from private.media_assets where storage_path='${path}';`),'pending');
  assert.equal(sql(`select photo_path is null and personal_message is null from public.participants where id='${owner}';`),'t');
  const object=await fetch(`${base}/storage/v1/object/public/wishlist-media/${path}`);assert.equal(object.status,200);const dimensions=inspectImage(new Uint8Array(await object.arrayBuffer()),'image/webp');assert.ok(Math.max(dimensions.width,dimensions.height)<=512);
  phase='save';await page.getByRole('button',{name:'Guardar perfil',exact:true}).click();await expect(page.getByText('Tu perfil quedó guardado. Tus regalos se mantienen.')).toBeVisible();assert.equal(sql(`select photo_path from public.participants where id='${owner}';`),path);assert.equal(sql(`select state from private.media_assets where storage_path='${path}';`),'attached');
  phase='replace';await page.getByLabel('Subir foto',{exact:true}).setInputFiles(fileURLToPath(new URL('../tests/fixtures/images/small.png',import.meta.url)));await expect(page.getByRole('button',{name:'Guardar perfil',exact:true})).toBeEnabled();assert.equal(sql(`select photo_path from public.participants where id='${owner}';`),path);
  await page.getByRole('button',{name:'Guardar perfil',exact:true}).click();await expect(page.getByText('Tu perfil quedó guardado. Tus regalos se mantienen.')).toBeVisible();const replacement=sql(`select photo_path from public.participants where id='${owner}';`);assert.notEqual(replacement,path);assert.equal(sql(`select state from private.media_assets where storage_path='${path}';`),'pending');
  phase='illustration';await page.getByRole('radio',{name:'Árbol',exact:true}).check();assert.equal(sql(`select photo_path from public.participants where id='${owner}';`),replacement);await page.getByRole('button',{name:'Guardar perfil',exact:true}).click();await expect(page.getByText('Tu perfil quedó guardado. Tus regalos se mantienen.')).toBeVisible();
  assert.equal(sql(`select photo_path is null and avatar_key='tree' and personal_message='Un mensaje desde el perfil' and general_preferences='Verde y azul. Evitar lana.' from public.participants where id='${owner}';`),'t');assert.equal(sql(`select state from private.media_assets where storage_path='${replacement}';`),'pending');assert.equal(sql(`select row_to_json(g) from (select id,title,version,details from public.gifts where id='${giftId}')g;`),before);
  phase='conflict';assert.equal(await update(owner,1,'Stale'),409);
  phase='public read';await page.getByRole('link',{name:'Volver a la lista',exact:true}).click();await expect(page.getByText('Un mensaje desde el perfil',{exact:true})).toBeVisible();await expect(page.getByText('Verde y azul. Evitar lana.',{exact:true})).toBeVisible();await expect(page.getByText('Idea de prueba conservada',{exact:true})).toBeVisible();await page.reload();await expect(page.getByText('Verde y azul. Evitar lana.',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Editar mi perfil',exact:true})).toHaveCount(0);
  assert.ok(!page.url().includes(token));assert.ok(!(await page.locator('body').textContent()).includes(token));await mkdir('artifacts/ui',{recursive:true});await page.screenshot({path:'artifacts/ui/profile-live-local.png',fullPage:true});
  console.log('OK navegador -> Edge -> Storage -> SQL: avatar <=512px pendiente hasta guardar, reemplazo, ilustración, mensaje y gustos públicos; regalos intactos.');
  console.log('OK acceso ajeno 403, versión antigua 409 y recarga pública sin permisos.');
} catch {
  console.error(`Falló el ensayo local de perfil (${phase}). No se imprimen credenciales ni enlaces privados.`);
  if(page){await mkdir('artifacts/ui',{recursive:true});await page.screenshot({path:'artifacts/ui/profile-live-failed.png',fullPage:true}).catch(()=>{});}process.exitCode=1;
} finally {
  await browser?.close();vite?.kill();cli?.kill();
  if(vite)await Promise.race([new Promise((resolve)=>vite.once('close',resolve)),new Promise((resolve)=>setTimeout(resolve,2000))]);
  if(cli){await Promise.race([new Promise((resolve)=>cli.once('close',resolve)),new Promise((resolve)=>setTimeout(resolve,2000))]);spawnSync('docker',['--host',endpoint,'stop','supabase_edge_runtime_AmigoSecreto2026'],{encoding:'utf8',timeout:20000});}
  try {
    if(rowsCreated){const paths=JSON.parse(sql(`select coalesce(json_agg(storage_path),'[]') from private.media_assets where participant_id='${owner}';`));if(paths.some((path)=>!path.startsWith(`${owner}/avatar/`)))throw new Error('Unexpected local path');
      if(paths.length){const response=await fetch(`${base}/storage/v1/object/wishlist-media`,{method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:paths}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Local object cleanup unavailable');await response.body?.cancel();}
      sql(`delete from public.participants where id in ('${owner}','${other}');delete from private.rate_limits where key_hash=decode('${hash}','hex');`);
    }
  }catch{console.error('No se pudo completar la limpieza local del ensayo. Revisa Docker/Storage local; no se imprimen secretos.');process.exitCode=1;}
  finally{await rm(envPath,{force:true});}
}
