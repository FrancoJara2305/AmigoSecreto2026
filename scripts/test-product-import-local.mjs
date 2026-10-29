import { spawn,spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile,writeFile,mkdir,rm } from 'node:fs/promises';
import https from 'node:https';
import assert from 'node:assert/strict';
import { tlsFixture } from '../tests/support/tls-fixture.mjs';
import { webServer } from '../tests/support/web-server.mjs';
import { createFetchProxy,callbackClaim } from '../server/product-fetch/proxy.ts';
import { createProductDownloader,pinnedExchange } from '../server/product-fetch/transport.ts';
import { generateToken,hashToken } from '../supabase/functions/_shared/tokens.ts';
import { signFetch } from '../supabase/functions/_shared/fetch-protocol.ts';
if(process.argv.length!==2)throw new Error('Prueba de importación solo local, sin argumentos.');
const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
const base='http://127.0.0.1:54321',functionUrl=`${base}/functions/v1/product-metadata`;
const owner=randomUUID(),other=randomUUID(),token=generateToken(),hash=await hashToken(token),secret=generateToken();
const envPath=new URL(`../artifacts/product-${randomUUID()}.env.local`,import.meta.url);
let phase='startup',cli,proxy,shop,log='',sourceHits=0,proxyHits=0,captured;
function sql(statement){const r=spawnSync('docker',['--host',endpoint,'exec','-i','supabase_db_AmigoSecreto2026','psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:statement,encoding:'utf8',timeout:10000});if(r.error||r.status!==0)throw new Error('Local SQL failed');return r.stdout.trim();}
async function call(url,participant=owner){const response=await fetch(functionUrl,{method:'POST',headers:{Origin:'http://localhost:5173','Content-Type':'application/json','X-Edit-Token':token},body:JSON.stringify({participant_id:participant,url}),signal:AbortSignal.timeout(18000)});return {status:response.status,data:await response.json()};}
try{
  const active=(await Promise.all(['wishlist-api','product-metadata'].map((name)=>fetch(`${base}/functions/v1/${name}`,{method:'OPTIONS',signal:AbortSignal.timeout(700)}).then((r)=>r.status===204,()=>false)))).some(Boolean);
  if(active)throw new Error('Close existing local functions before running this isolated test');
  const fixture=await tlsFixture(),html=await readFile(new URL('../tests/fixtures/products/product.html',import.meta.url),'utf8');
  shop=https.createServer({key:fixture.key,cert:fixture.cert},(req,res)=>{sourceHits++;res.setHeader('Content-Type','text/html; charset=utf-8');if(req.url==='/forbidden'){res.writeHead(403).end();return;}res.end(req.url==='/captcha'?'<title>Just a moment...</title>':html);});
  await new Promise((resolve)=>shop.listen(0,'127.0.0.1',resolve));const port=shop.address().port;
  // Test-only connector maps a validated synthetic public address to the loopback TLS fixture.
  // The production transport has NO override/configuration that disables IP validation.
  const download=createProductDownloader({resolve:async(host)=>host==='blocked.example.com'?[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]:[{address:'8.8.8.8',family:4}],
    exchange:(url,_pin,signal)=>pinnedExchange(url,{address:'127.0.0.1',family:4},signal,{port,ca:fixture.ca})});
  const handler=createFetchProxy({secret,claim:callbackClaim(functionUrl,fetch,true),download});
  proxy=webServer(async(request)=>{proxyHits++;assert.equal(request.headers.get('X-Edit-Token'),null);assert.equal(request.headers.get('Authorization'),null);assert.equal(request.headers.get('apikey'),null);
    const clone=request.clone();captured=await clone.text();return handler(request);});
  // Docker Desktop reaches Windows through host.docker.internal. HMAC+SQL claim remain mandatory.
  await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(54801,'0.0.0.0',resolve);});
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
  await writeFile(envPath,`APP_ALLOWED_ORIGINS=http://localhost:5173\nAPP_BASE_URL=http://localhost:5173\nRATE_LIMIT_IP_SOURCE=off\nFETCH_PROXY_URL=http://host.docker.internal:54801/fetch-product\nFETCH_PROXY_HMAC_SECRET=${secret}\nAPP_LOCAL_FETCH_PROXY=1\n`);
  const require=createRequire(import.meta.url);const suffix=process.platform==='win32'?'windows-x64':`${process.platform}-${process.arch}`;
  const binary=join(dirname(require.resolve(`@supabase/cli-${suffix}/package.json`)),'bin',`supabase${process.platform==='win32'?'.exe':''}`);
  cli=spawn(binary,['functions','serve','--env-file',fileURLToPath(envPath)],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  cli.stdout.on('data',(s)=>{log+=s;});cli.stderr.on('data',(s)=>{log+=s;});
  let ready=false;for(let i=0;i<80;i++){if(log.includes('Serving functions on')){ready=true;break;}await new Promise((r)=>setTimeout(r,100));}if(!ready)throw new Error('Local function runtime not ready');
  ready=false;for(let i=0;i<80;i++){
    if(await fetch(functionUrl,{method:'OPTIONS',signal:AbortSignal.timeout(1000)}).then((r)=>r.status===204,()=>false)){ready=true;break;}
    await new Promise((r)=>setTimeout(r,100));
  }
  if(!ready)throw new Error('Local Edge HTTP ingress not ready');
  ready=false;const readyDeadline=Date.now()+8000;
  while(Date.now()<readyDeadline){
    // Readiness probe has no capability and cannot mint a nonce or start a download.
    if(await fetch(functionUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(1000)}).then((r)=>r.status===401,()=>false)){ready=true;break;}
    await new Promise((r)=>setTimeout(r,100));
  }
  if(!ready)throw new Error('Local Edge quota/RPC path not ready');
  sql(`insert into public.participants(id,name,slug) values('${owner}','Import local','product-${owner}'),('${other}','Import other','product-${other}');insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${owner}',decode('${hash}','hex'));`);
  phase='foreign authorization';const foreign=await call('https://shop.example.com/product',other);phase=`foreign authorization status ${foreign.status}`;assert.equal(foreign.status,403);assert.equal(proxyHits,0);
  phase='real import';const result=await call('https://shop.example.com/product');
  assert.equal(result.status,200);assert.equal(result.data.metadata?.fields?.title,'Taza de prueba & café');assert.equal(result.data.metadata.fields.reference_price,'29.90');assert.equal(result.data.metadata.fields.currency,'USD');assert.equal(result.data.metadata.sources.title,'json-ld');
  assert.equal(sourceHits,1);assert.ok(captured&&!captured.includes(token));
  phase='replay';const replay=await fetch('http://127.0.0.1:54801/fetch-product',{method:'POST',headers:{'Content-Type':'application/json','X-Fetch-Signature':await signFetch('request',captured,secret)},body:captured});assert.equal(replay.status,409);await replay.body?.cancel();assert.equal(sourceHits,1);
  phase='blocked DNS';const blocked=await call('https://blocked.example.com/product');assert.equal(blocked.data.status,'manual');assert.equal(blocked.data.reason,'BLOCKED_DESTINATION');assert.equal(sourceHits,1);
  phase='store fallback';assert.equal((await call('https://shop.example.com/forbidden')).data.status,'manual');assert.equal((await call('https://shop.example.com/captcha')).data.status,'manual');
  phase='quota';
  // Position only this ephemeral token at its boundary; a clock-minute change must not make the test flaky.
  sql(`insert into private.rate_limits(key_hash,operation,scope,window_seconds,window_start,expires_at,request_count)
    values(decode('${hash}','hex'),'import','token',60,date_trunc('minute',clock_timestamp()),date_trunc('minute',clock_timestamp())+interval '1 minute',5)
    on conflict(key_hash,operation,scope,window_seconds,window_start) do update set request_count=5;`);
  const before=proxyHits;assert.equal((await call('https://shop.example.com/product')).status,429);assert.equal(proxyHits,before);
  assert.equal(sql(`select count(*) from public.gifts where participant_id='${owner}';`),'0');
  console.log('OK Edge real -> Node -> TLS sintético -> callback SQL -> parser: datos sugeridos, moneda intacta, ningún regalo guardado.');
  console.log('OK pertenencia, replay, DNS mixto sin conexión, 403/captcha manuales y cuota antes de transporte.');
}catch{console.error(`Falló el ensayo local de importación (${phase}). No se imprimen secretos ni enlaces privados.`);if(/boot error|not found|Cannot resolve/.test(log))console.error('Revisa la resolución de dependencias del runtime local.');process.exitCode=1;}
finally{
  cli?.kill();if(cli)await Promise.race([new Promise((r)=>cli.once('close',r)),new Promise((r)=>setTimeout(r,2000))]);
  if(cli)spawnSync('docker',['--host',endpoint,'stop','supabase_edge_runtime_AmigoSecreto2026'],{encoding:'utf8',timeout:20000});
  for(const server of [proxy,shop])if(server){server.closeAllConnections();await new Promise((r)=>server.close(()=>r()));}
  sql(`delete from public.participants where id in ('${owner}','${other}');delete from private.rate_limits where key_hash=decode('${hash}','hex');`);
  await rm(envPath,{force:true});
}
