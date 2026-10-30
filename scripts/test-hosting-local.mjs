import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile,mkdir } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { Readable } from 'node:stream';
import { build } from 'vite';
import { hostingConfig,spaSource } from '../server/deployment-config.ts';
import transport from '../api/fetch-product.ts';

if(process.argv.length!==2)throw new Error('Ensayo de hosting exclusivamente local, sin argumentos.');
const origin='http://127.0.0.1:4203',api='https://fixture.supabase.co',directory=resolve('artifacts/hosting-local'),outDir=resolve(directory,'build');
assert.ok(outDir.startsWith(resolve('artifacts')+sep));await mkdir(directory,{recursive:true});
for(const name of Object.keys(process.env))if(name.startsWith('VITE_'))delete process.env[name];
process.env.APP_LOCAL_PERFORMANCE_TEST='1';
process.env.PLAYWRIGHT_BROWSERS_PATH??=resolve('artifacts/playwright-browsers');
const {chromium,firefox,webkit,expect}=await import('@playwright/test');
process.env.FETCH_PROXY_HMAC_SECRET='B'.repeat(42)+'A';
process.env.FETCH_PROXY_CALLBACK_URL=`${api}/functions/v1/product-metadata`;
const env={VITE_SUPABASE_URL:api,VITE_APP_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_hosting_fixture_only'};
await build({envDir:false,define:Object.fromEntries(Object.entries(env).map(([key,value])=>[`import.meta.env.${key}`,JSON.stringify(value)])),build:{outDir,emptyOutDir:true},logLevel:'silent'});
const config=hostingConfig(api),spa=new RegExp('^'+spaSource+'$');
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin),path=url.pathname;
    for(const header of config.headers[0].headers)res.setHeader(header.key,header.value);
    if(path==='/api/fetch-product'){
      const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})});
      const response=await transport.fetch(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(path==='/api'||path.startsWith('/api/')){res.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'}).end('{}');return;}
    if(req.method!=='GET'){res.writeHead(405).end();return;}
    const dest=spa.test(path)?'index.html':'.'+decodeURIComponent(path),file=resolve(outDir,dest);
    if(!file.startsWith(outDir+sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(file),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[extname(file)]??'application/octet-stream';
    res.writeHead(200,{'Content-Type':mime,'Cache-Control':path.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-store'});res.end(bytes);
  }catch{res.writeHead(404,{'Content-Type':'application/json'}).end('{}');}
});
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'apikey, authorization, content-type, x-edit-token, x-client-info'};
const owner='11111111-1111-4111-8111-000000000001',credential='A'.repeat(43);
const person={id:owner,name:'Melyza',slug:'melyza',version:1,display_order:0,avatar_key:'star',photo_path:null,photo_url:null,personal_message:'Mensaje de prueba',general_preferences:null};
let browser;
try{
  await new Promise((yes,no)=>{server.once('error',no);server.listen(4203,'127.0.0.1',yes);});
  for(const [name,engine,options] of [['edge',chromium,{channel:'msedge'}],['firefox',firefox,{}],['webkit',webkit,{}]]){
    browser=await engine.launch(options);const context=await browser.newContext({viewport:name==='webkit'?{width:390,height:844}:{width:1280,height:900}});
    const page=await context.newPage();let gifts=[],writes=0;
    await context.addInitScript(()=>{window.__csp=[];addEventListener('securitypolicyviolation',(event)=>window.__csp.push({directive:event.effectiveDirective,blocked:event.blockedURI}));});
    await context.route('**/*',async(route)=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin===origin)return route.continue();
      if(url.origin!==api)return route.abort();
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
      if(url.pathname==='/rest/v1/event_settings')return route.fulfill({json:{title:'Amigo Secreto',welcome_message:'Bienvenidos'},headers:cors});
      if(url.pathname==='/rest/v1/participants')return route.fulfill({json:[{...person,gifts:url.searchParams.has('slug')||url.searchParams.has('id')?gifts:[{count:gifts.length}]}],headers:cors});
      if(url.pathname==='/functions/v1/wishlist-api'){
        assert.equal(request.headers()['x-edit-token'],credential);const body=request.postDataJSON();
        if(body.action==='validate_access')return route.fulfill({json:{access:{token_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',access_type:'participant',participant_id:owner,participant_slug:'melyza',expires_at:null}},headers:cors});
        assert.equal(body.action,'create_gift');writes++;const gift={id:'22222222-2222-4222-8222-000000000001',participant_id:owner,position:1,...body.gift,version:1,created_at:'2026-10-30T00:00:00Z',updated_at:'2026-10-30T00:00:00Z'};gifts=[gift];return route.fulfill({status:201,json:{gift},headers:cors});
      }
      return route.fulfill({status:404,json:{},headers:cors});
    });
    for(const path of ['/','/participante/melyza','/organizador','/no-existe','/diseno']){
      const response=await page.goto(origin+path);assert.equal(response.status(),200);assert.equal(response.headers()['referrer-policy'],'no-referrer');assert.equal(response.headers()['cache-control'],'no-store');
      await expect(page.getByRole('heading',{level:1})).toBeVisible();
      if(path==='/participante/melyza'){await expect(page.getByRole('heading',{name:'Melyza',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Melyza',exact:true})).toBeVisible();}
      assert.deepEqual(await page.evaluate(()=>window.__csp),[]);
    }
    const color=await page.locator('.palette__sample').first().evaluate((node)=>getComputedStyle(node).backgroundColor);assert.notEqual(color,'rgba(0, 0, 0, 0)');
    await page.getByRole('button',{name:'Probar guardado',exact:true}).click();
    // Invalid sample form still validates under CSP; no native form navigation.
    await expect(page.getByRole('heading',{level:1})).toBeVisible();
    await page.goto(`${origin}/acceso#token=${credential}`);await expect(page.getByRole('heading',{name:'Melyza',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Añadir regalo a la opción 1',exact:true}).click();await page.getByLabel('Título del regalo').fill('Guardado bajo CSP');
    await page.getByRole('button',{name:'Guardar regalo',exact:true}).click();await expect(page.getByText('Tu opción quedó guardada. Las demás ideas se mantienen.',{exact:true})).toBeVisible();assert.equal(writes,1);
    assert.deepEqual(await page.evaluate(()=>window.__csp),[]);
    await page.screenshot({path:resolve(directory,`csp-${name}.png`),fullPage:true});
    // Deliberate attacks after the legitimate journey; Playwright evaluates through DevTools,
    // but the inserted DOM script and the page's fetch are subject to the real browser CSP.
    await page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.__unsafeScript=1';document.head.append(script);void fetch('https://unapproved.example.com/').catch(()=>{});});
    await expect.poll(()=>page.evaluate(()=>window.__csp.some((v)=>v.directive.startsWith('script-src'))&&window.__csp.some((v)=>v.directive==='connect-src'))).toBe(true);
    assert.equal(await page.evaluate(()=>Object.hasOwn(window,'__unsafeScript')),false);
    await context.close();await browser.close();browser=null;
    console.log(`OK ${name}: build/SPA, recarga profunda, estilos, guardado privado y CSP efectiva; script inline y backend no autorizado bloqueados.`);
  }
  for(const [path,method,status] of [['/api/fetch-product','GET',405],['/api/fetch-product','POST',401],['/api/missing','GET',404],['/assets/missing.js','GET',404]]){
    const response=await fetch(origin+path,{method,...(method==='POST'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});assert.equal(response.status,status);assert.ok(!response.headers.get('Content-Type')?.includes('text/html'));await response.body?.cancel();
  }
  console.log('OK API Node real: sin firma no descarga, 401/405 JSON; APIs/assets ausentes no reciben index.html. Sin conexión a Supabase remoto.');
}finally{await browser?.close();server.closeAllConnections();if(server.listening)await new Promise((done)=>server.close(done));}
