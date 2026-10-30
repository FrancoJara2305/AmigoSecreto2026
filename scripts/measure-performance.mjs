import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile,writeFile,mkdir,readdir,stat } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { createImageNormalizer } from '../supabase/functions/media-upload/codec.ts';
import { inspectImage } from '../supabase/functions/_shared/image-inspection.ts';

const args=process.argv.slice(2),label=args.length===0?'final':args.length===2&&args[0]==='--label'&&['baseline','final'].includes(args[1])?args[1]:null;
if(!label)throw new Error('Usa measure:performance [--label baseline|final].');
const app='http://127.0.0.1:4193',api='http://127.0.0.1:4194';
const directory=resolve('artifacts/performance',label),outDir=resolve(directory,'build');
assert.ok(outDir.startsWith(resolve('artifacts')+sep));
await mkdir(directory,{recursive:true});
// Keep both env files and inherited public env values out of this synthetic build.
for(const name of Object.keys(process.env))if(name.startsWith('VITE_'))delete process.env[name];
process.env.APP_LOCAL_PERFORMANCE_TEST='1';
const hash=createHash('sha256');
async function sources(directory){for(const entry of (await readdir(directory)).sort()){const file=resolve(directory,entry);if((await stat(file)).isDirectory())await sources(file);else hash.update(file.replace(process.cwd(),'')).update(await readFile(file));}}
await sources('src');hash.update(await readFile('vite.config.ts'));const sourceHash=hash.digest('hex');
const output=await build({build:{outDir,emptyOutDir:true,manifest:true},logLevel:'silent'});
const chunks=(Array.isArray(output)?output:[output]).flatMap((item)=>item.output).filter((item)=>item.type==='chunk');
const bundle=chunks.map((chunk)=>({file:chunk.fileName,entry:chunk.isEntry,imports:chunk.imports,dynamicImports:chunk.dynamicImports,bytes:Buffer.byteLength(chunk.code),gzipBytes:gzipSync(chunk.code).length,
  modules:Object.entries(chunk.modules).map(([name,value])=>({name:name.replaceAll('\\','/').replace(process.cwd().replaceAll('\\','/')+'/',''),bytes:value.renderedLength??0})).sort((a,b)=>b.bytes-a.bytes)}));
await writeFile(resolve(directory,'bundle.json'),JSON.stringify(bundle,null,2));

const names=['Melyza','Karina','Norma','Magaly','Cesar','Fabrizio','Brandon','Pamela','Franco','Derek Leonardo','Alice'];
const personId=(index)=>`11111111-1111-4111-8111-${String(index+1).padStart(12,'0')}`;
const people=names.map((name,index)=>({id:personId(index),name,slug:name.toLowerCase().replaceAll(' ','-'),photo_path:`${personId(index)}/avatar/33333333-3333-4333-8333-000000000001.webp`,photo_url:null,avatar_key:'star',display_order:index,personal_message:'Un detalle para compartir esta Navidad.',general_preferences:'Me gustan los libros, los colores cálidos y compartir momentos en familia.',version:1,gifts:[{count:3}]}));
const gifts=(person)=>[1,2,3].map((position)=>({id:`22222222-2222-4222-8222-${String(position).padStart(12,'0')}`,participant_id:person.id,position,title:['Un libro para las tardes','Una taza para el café','Una bufanda suave'][position-1],description:'Una idea para acompañar los días de diciembre.',image_path:`${person.id}/gift/33333333-3333-4333-8333-${String(position).padStart(12,'0')}.webp`,image_url:null,product_url:null,reference_price:position*25,currency:'PEN',gift_type:'object',details:{},version:1,created_at:'2026-10-30T00:00:00Z',updated_at:'2026-10-30T00:00:00Z'}));
const event={title:'Amigo Secreto 2026',welcome_message:'Ya se acerca la Navidad. Comparte tus deseos y encuentra una idea especial para sorprender a quien te tocó.'};
// Serve the actual normalization outputs required by stored media, not the 4000px source.
const original=await readFile(new URL('../tests/fixtures/images/large.webp',import.meta.url)),normalize=createImageNormalizer(readFile);
const avatar=await normalize(original,'image/webp','avatar'),giftImage=await normalize(original,'image/webp','gift');
const imageInfo={avatar:{...inspectImage(avatar),bytes:avatar.length},gift:{...inspectImage(giftImage),bytes:giftImage.length}};
const imagePaths=new Set(people.flatMap((p)=>[p.photo_path,...gifts(p).map((g)=>g.image_path)]).map((path)=>'/storage/v1/object/public/wishlist-media/'+path));
const calls=[];
function reply(res,status,bytes,type='application/json',extra={}){
  const raw=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes),gzip=raw.length>1024&&!type.startsWith('image/'),body=gzip?gzipSync(raw):raw;
  res.writeHead(status,{'Content-Type':type,'Content-Length':body.length,'Cache-Control':'no-store',...(gzip?{'Content-Encoding':'gzip','Vary':'Accept-Encoding'}:{}),...extra});res.end(body);
}
const backend=createServer((req,res)=>{
  const headers={'Access-Control-Allow-Origin':app,'Access-Control-Allow-Headers':'apikey, authorization, content-type, x-client-info','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Expose-Headers':'Content-Range'};
  if(req.headers.origin&&req.headers.origin!==app){reply(res,403,'{}');return;}
  if(req.method==='OPTIONS'){res.writeHead(204,headers).end();return;}
  if(req.method!=='GET'){reply(res,405,'{}','application/json',headers);return;}
  const url=new URL(req.url,api);calls.push(url.pathname);
  if(url.pathname==='/rest/v1/participants'){
    const slug=url.searchParams.get('slug');const person=people.find((p)=>`eq.${p.slug}`===slug);
    reply(res,200,JSON.stringify(slug?person?[{...person,gifts:gifts(person)}]:[]:people),'application/json',headers);
  }else if(url.pathname==='/rest/v1/event_settings')reply(res,200,JSON.stringify(event),'application/json',headers);
  else if(imagePaths.has(url.pathname))reply(res,200,url.pathname.includes('/avatar/')?Buffer.from(avatar):Buffer.from(giftImage),'image/webp',headers);
  else reply(res,404,'{}','application/json',headers);
});
const frontend=createServer(async(req,res)=>{
  if(req.method!=='GET'){reply(res,405,'{}');return;}
  try{
    const path=decodeURIComponent(new URL(req.url,app).pathname);
    const file=resolve(outDir,'.'+path);if(file!==outDir&&!file.startsWith(outDir+sep)){reply(res,403,'{}');return;}
    const asset=extname(path)?file:resolve(outDir,'index.html');
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}[extname(asset)]??'application/octet-stream';
    reply(res,200,await readFile(asset),mime);
  }catch{reply(res,404,'{}');}
});
let browser;
const observations=[];
const stop=async()=>{await browser?.close();for(const server of [frontend,backend])if(server.listening){server.closeAllConnections();await new Promise((resolve)=>server.close(resolve));}};
try{
  for(const [server,port] of [[backend,4194],[frontend,4193]])await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  browser=await chromium.launch({channel:'msedge'});
  for(const device of ['mobile','desktop'])for(const path of ['/','/participante/melyza'])for(let run=1;run<=(device==='mobile'?5:3);run++){
    const context=await browser.newContext({viewport:device==='mobile'?{width:390,height:844}:{width:1280,height:900},isMobile:device==='mobile',hasTouch:device==='mobile',deviceScaleFactor:device==='mobile'?3:1,locale:'es-PE',serviceWorkers:'block'});
    // Never intercept successful requests: real CDP throttling must include API and gzip assets.
    await context.route('**/*',(route)=>[app,api].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
    await context.addInitScript(()=>{
      window.__perf={lcp:[],shifts:[]};
      new PerformanceObserver((list)=>{for(const entry of list.getEntries())window.__perf.lcp.push({time:entry.startTime,tag:entry.element?.tagName,id:entry.element?.id,size:entry.size});}).observe({type:'largest-contentful-paint',buffered:true});
      new PerformanceObserver((list)=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.__perf.shifts.push({time:entry.startTime,value:entry.value,sources:entry.sources?.map((source)=>({tag:source.node?.tagName,id:source.node?.id,className:typeof source.node?.className==='string'?source.node.className:''}))});}).observe({type:'layout-shift',buffered:true});
    });
    const page=await context.newPage(),cdp=await context.newCDPSession(page),network=[],errors=[];
    const startCalls=calls.length;
    page.on('pageerror',(error)=>errors.push(error.message));
    cdp.on('Network.responseReceived',(event)=>{network.push({id:event.requestId,url:event.response.url,type:event.type,status:event.response.status});});
    cdp.on('Network.loadingFinished',(event)=>{const item=network.find((r)=>r.id===event.requestId);if(item)item.encodedBytes=event.encodedDataLength;});
    await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:device==='mobile'?150:20,downloadThroughput:(device==='mobile'?1_600_000:10_000_000)/8,uploadThroughput:750_000/8});
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:device==='mobile'?4:1});
    await page.goto(app+path,{waitUntil:'load'});
    await page.getByRole('heading',{name:path==='/'?'Pequeñas pistas para un gran regalo':'Melyza',exact:true}).waitFor();
    if(path==='/')await page.getByRole('list',{name:'Participantes',exact:true}).waitFor();
    else await page.getByRole('heading',{name:'Un libro para las tardes',exact:true}).waitFor();
    const contentReadyMs=await page.evaluate(()=>performance.now());
    await page.waitForTimeout(2500);
    await page.waitForLoadState('networkidle',{timeout:20000});
    const metrics=await page.evaluate(()=>{
      const data=window.__perf;let windowValue=0,windowStart=0,previous=0,cls=0;
      for(const shift of data.shifts){if(windowValue===0||shift.time-previous>1000||shift.time-windowStart>5000){windowValue=0;windowStart=shift.time;}windowValue+=shift.value;previous=shift.time;cls=Math.max(cls,windowValue);}
      return {lcpMs:data.lcp.at(-1)?.time??null,lcpElement:data.lcp.at(-1),cls,shifts:data.shifts,requests:performance.getEntriesByType('resource').map((r)=>({url:r.name,type:r.initiatorType,transferBytes:r.transferSize,encodedBytes:r.encodedBodySize,duration:r.duration})),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    const js=[...new Set(network.filter((r)=>r.type==='Script').map((r)=>new URL(r.url).pathname.slice(1)))];
    const jsGzipBytes=js.reduce((sum,file)=>sum+(bundle.find((chunk)=>chunk.file===file)?.gzipBytes??0),0);
    if(label==='final')for(const chunk of bundle.filter((chunk)=>js.includes(chunk.file)))assert.ok(!chunk.modules.some((module)=>/node_modules\/@supabase\/(auth-js|realtime-js|storage-js)\//.test(module.name)),'Unused Supabase products must not return to the public bundle');
    const apiRequests=calls.slice(startCalls).filter((url)=>url.startsWith('/rest/v1/'));
    assert.equal(apiRequests.length,path==='/'?2:1);assert.equal(errors.length,0);assert.equal(metrics.overflow,false);assert.ok(metrics.lcpMs>0);
    assert.ok(!js.some((file)=>/OrganizerPage|GiftEditorPage|ProfileEditorPage|DesignPreview/.test(file)),'Private/editor routes must remain deferred');
    observations.push({device,path,run,contentReadyMs,...metrics,js,jsGzipBytes,apiRequests,network:structuredClone(network)});
    console.log(`${label} ${device} ${path} #${run}: LCP ${Math.round(metrics.lcpMs)} ms; CLS ${metrics.cls.toFixed(4)}; JS ${Math.round(jsGzipBytes/1000)} KB gzip; API ${apiRequests.length}.`);
    if(run===1)await page.screenshot({path:resolve(directory,`${device}-${path==='/'?'catalogue':'profile'}.png`),fullPage:true});
    // No timer/polling/focus refresh may add public reads after the ready state.
    assert.equal(calls.slice(startCalls).filter((url)=>url.startsWith('/rest/v1/')).length,path==='/'?2:1);
    await context.close();
  }
  const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
  const summaries=[];
  for(const device of ['mobile','desktop'])for(const path of ['/','/participante/melyza']){
    const rows=observations.filter((row)=>row.device===device&&row.path===path);
    summaries.push({device,path,runs:rows.length,lcpMedianMs:percentile(rows.map((r)=>r.lcpMs),.5),lcpP75Ms:percentile(rows.map((r)=>r.lcpMs),.75),lcpMaxMs:Math.max(...rows.map((r)=>r.lcpMs)),contentReadyP75Ms:percentile(rows.map((r)=>r.contentReadyMs),.75),clsP75:percentile(rows.map((r)=>r.cls),.75),jsGzipBytes:rows[0].jsGzipBytes,requests:rows.map((r)=>r.network.length),apiRequests:rows[0].apiRequests.length});
  }
  const report={label,sourceHash,browser:browser.version(),node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,memoryGB:Math.round(os.totalmem()/2**30),conditions:{mobile:{viewport:'390x844',dpr:3,latencyMs:150,downloadMbps:1.6,uploadMbps:.75,cpuSlowdown:4,runs:5},desktop:{viewport:'1280x900',dpr:1,latencyMs:20,downloadMbps:10,cpuSlowdown:1,runs:3},cache:'cold/disabled, fresh browser context per navigation',server:'loopback HTTP/gzip, synthetic read-only PostgREST-shaped data: 11 people/33 gifts',images:imageInfo,measurement:'no interaction; at least 2.5s after public content ready and network idle; CLS maximum session window (gap <=1s, window <=5s)'},largeChunks:bundle.filter((c)=>c.bytes>500000).map((c)=>c.file),summaries,observations};
  await writeFile(resolve(directory,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(summaries,null,2));
  if(label==='final')for(const row of summaries){assert.ok(row.lcpP75Ms<=2500,`${row.device} ${row.path}: LCP budget exceeded`);assert.ok(row.clsP75<=.1,`${row.device} ${row.path}: CLS budget exceeded`);assert.ok(row.jsGzipBytes<=200_000,`${row.device} ${row.path}: JS budget exceeded`);}
}finally{await stop();}
