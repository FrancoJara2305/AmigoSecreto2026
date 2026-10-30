import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import https from 'node:https';
import { gzipSync } from 'node:zlib';
import { tlsFixture } from './tls-fixture.mjs';
import { webServer } from './web-server.mjs';
import { createFetchProxy,callbackClaim } from '../../server/product-fetch/proxy.ts';
import { createProductDownloader,pinnedExchange } from '../../server/product-fetch/transport.ts';
import { generateToken,hashToken } from '../../supabase/functions/_shared/tokens.ts';
import { signFetch,sha256Text } from '../../supabase/functions/_shared/fetch-protocol.ts';
import { inspectImage } from '../../supabase/functions/_shared/image-inspection.ts';

// This helper is invoked only by the runner owning the disposable AdminTest stack.
// Neither the database destination nor the proxy listener can come from user env/arguments.
export async function securityFixture({base}){
  assert.equal(base,'http://127.0.0.1:54421');
  const secret=generateToken(),secrets=[secret];
  const tls=await tlsFixture(),html=await readFile(new URL('../fixtures/products/product.html',import.meta.url),'utf8');
  let sourceHits=0,captured='',proxy,shop;
  const close=async()=>{for(const server of [proxy,shop])if(server?.listening){server.closeAllConnections();await new Promise((resolve)=>server.close(resolve));}};
  try{
    shop=https.createServer({key:tls.key,cert:tls.cert},(req,res)=>{
      sourceHits++;
      for(const name of ['x-edit-token','authorization','apikey','cookie','x-fetch-signature'])assert.equal(req.headers[name],undefined);
      res.setHeader('Content-Type','text/html; charset=utf-8');
      if(req.url==='/forbidden'){res.writeHead(403).end();return;}
      if(req.url==='/redirect'){res.writeHead(302,{Location:'https://blocked.example.com/private'}).end();return;}
      if(req.url==='/bomb'){res.setHeader('Content-Encoding','gzip');res.end(gzipSync('x'.repeat(1048577)));return;}
      res.end(req.url==='/captcha'?'<title>Just a moment...</title>':html);
    });
    await new Promise((resolve,reject)=>{shop.once('error',reject);shop.listen(0,'127.0.0.1',resolve);});
    const port=shop.address().port;
    const download=createProductDownloader({resolve:async(host)=>host==='blocked.example.com'?[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]:[{address:'8.8.8.8',family:4}],
      exchange:(url,_pin,signal)=>pinnedExchange(url,{address:'127.0.0.1',family:4},signal,{port,ca:tls.ca})});
    const handler=createFetchProxy({secret,claim:callbackClaim(`${base}/functions/v1/product-metadata`,fetch,true),download});
    proxy=webServer(async(request)=>{
      for(const name of ['x-edit-token','authorization','apikey','cookie'])assert.equal(request.headers.get(name),null);
      captured=await request.clone().text();return handler(request);
    });
    // Docker Desktop requires this host listener. All requests still require HMAC + SQL claim.
    await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(54802,'0.0.0.0',resolve);});
  }catch(error){await close();throw error;}
  function clean(value){const text=typeof value==='string'?value:JSON.stringify(value);for(const value of secrets)assert.ok(!text.includes(value),'Private material in a public response/log');assert.doesNotMatch(text,/token_hash|sb_secret_/);}
  return {
    env:`FETCH_PROXY_URL=http://host.docker.internal:54802/fetch-product\nFETCH_PROXY_HMAC_SECRET=${secret}\nAPP_LOCAL_FETCH_PROXY=1\n`,close,
    trackToken:(value)=>{secrets.push(value);},
    checkLogs:async(log)=>{for(const value of [...secrets])if(/^[A-Za-z0-9_-]{43}$/.test(value))secrets.push(await hashToken(value));clean(log);console.log('OK logs Edge capturados: sin tokens de ensayo, hashes ni HMAC.');},
    async run({base,origin,sql,anon,key,token}){
      secrets.push(token,await hashToken(token),key);
      const client={apikey:anon,Authorization:`Bearer ${anon}`,'Content-Type':'application/json'};
      const server={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
      const request=async(path,options={})=>fetch(`${base}${path}`,{...options,signal:AbortSignal.timeout(30000)});
      const json=async(response)=>{const text=await response.text();clean(text);return text?JSON.parse(text):null;};
      const api=async(body,credential=token,extra={})=>{
        const response=await request('/functions/v1/wishlist-api',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...client,'X-Edit-Token':credential,...extra},body:JSON.stringify(body)});
        assert.equal(response.headers.get('Cache-Control'),'no-store');return {status:response.status,data:await json(response)};
      };
      const rpc=async(name,body)=>{const response=await request(`/rest/v1/rpc/${name}`,{method:'POST',headers:server,body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();};
      const tests=new URL('../../supabase/tests/database/',import.meta.url);
      let assertions=0;
      for(const file of (await readdir(tests)).filter((name)=>name.endsWith('.sql')).sort()){
        const output=sql(await readFile(new URL(file,tests),'utf8'));assertions+=output.split('\n').filter((line)=>line.startsWith('ok - ')).length;
      }
      assert.ok(assertions>=303);console.log(`OK PostgreSQL real: ${assertions} aserciones SQL transaccionales; fixtures revertidos.`);
      assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity;"),'0');
      assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'server_%' and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'));"),'0');
      assert.equal(sql("select has_schema_privilege('anon','private','usage') or has_schema_privilege('authenticated','private','usage');"),'f');
      const owner=randomUUID(),other=randomUUID(),personal=generateToken(),hash=await hashToken(personal);
      secrets.push(personal,hash);
      for(const [id,name] of [[owner,'Security owner'],[other,'Security other']])assert.equal((await api({action:'create_participant',participant_id:id,participant:{name}})).status,201);
      sql(`insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${owner}',decode('${hash}','hex'));`);
      const fingerprint=()=>sql("select md5(jsonb_build_array((select jsonb_agg(to_jsonb(p) order by id) from public.participants p),(select jsonb_agg(to_jsonb(g) order by id) from public.gifts g),(select jsonb_agg(to_jsonb(e)) from public.event_settings e))::text);");
      const before=fingerprint();
      for(const table of ['participants','gifts','event_settings']){
        const read=await request(`/rest/v1/${table}?select=*`,{headers:client});assert.equal(read.status,200);clean(await read.text());
        for(const method of ['POST','PATCH','DELETE']){
          const body=table==='participants'?{name:'Public intruder',slug:'public-intruder'}:table==='gifts'?{participant_id:owner,position:1,title:'Intruder',gift_type:'object'}:{title:'Public intrusion'};
          const denied=await request(`/rest/v1/${table}${method==='POST'?'':'?id=eq.'+(table==='event_settings'?'1':owner)}`,{method,headers:client,...(method!=='DELETE'?{body:JSON.stringify(body)}:{})});
          assert.ok([401,403].includes(denied.status));await json(denied);
        }
      }
      for(const table of ['access_tokens','media_assets','media_deletions','rate_limits','import_requests']){
        const denied=await request(`/rest/v1/${table}?select=*`,{headers:client});assert.ok([403,404].includes(denied.status));await json(denied);
      }
      assert.equal(fingerprint(),before);
      console.log('OK Data API: lectura pública acotada, tablas privadas ocultas, todas las escrituras directas denegadas.');
      for(const name of ['wishlist-api','media-upload','product-metadata']){
        const path=`/functions/v1/${name}`;
        let preflight;
        for(let attempt=0;attempt<80;attempt++){
          preflight=await request(path,{method:'OPTIONS',headers:{Origin:origin}});
          if(preflight.status===204)break;
          await preflight.body?.cancel();await new Promise((resolve)=>setTimeout(resolve,100));
        }
        console.log(`Comprobación CORS ${name}: HTTP ${preflight.status}.`);
        // CLI Kong supplies its own wildcard CORS plugin, including OPTIONS before Edge.
        // Test the authorization result behind that gateway; exact handler headers have unit tests.
        assert.equal(preflight.status,204);assert.ok([origin,'*'].includes(preflight.headers.get('Access-Control-Allow-Origin')));
        const hostile=await request(path,{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:'{}'});assert.equal(hostile.status,403);await json(hostile);
        const missing=await request(path,{method:'POST',headers:{...client,Origin:origin},body:'{}'});assert.equal(missing.status,401);await json(missing);
        const get=await request(path,{headers:{Origin:origin}});assert.equal(get.status,405);await json(get);
        // A query may never carry a capability. Use only inert synthetic data in the URL.
        const query=await request(`${path}?token=invalid-fixture`,{method:'POST',headers:{...client,Origin:origin,'X-Edit-Token':personal},body:'{}'});assert.equal(query.status,422);await json(query);
      }
      assert.equal((await api({action:'validate_access'},anon)).status,401);
      assert.equal((await api({action:'update_profile',participant_id:other,expected_version:1,profile:{personal_message:'Intruder'}},personal)).status,403);
      assert.equal((await api({action:'admin_list'},personal)).status,403);
      const raw=await request('/functions/v1/wishlist-api',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Edit-Token':personal},body:'{"action":'});assert.equal(raw.status,422);await json(raw);
      const huge=await request('/functions/v1/wishlist-api',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Edit-Token':personal},body:JSON.stringify({action:'validate_access',padding:'x'.repeat(32768)})});assert.equal(huge.status,413);await json(huge);
      assert.equal(fingerprint(),before);
      console.log('OK Edge: autorización propia, origen ajeno rechazado detrás de Kong, sin confundir apikey con token, métodos/cuerpos/query y límites.');
      const created=await api({action:'create_gift',participant_id:owner,position:1,gift:{title:'Security gift',gift_type:'object'}},personal);assert.equal(created.status,201);
      const gift=created.data.gift;
      for(const action of ['update_gift','delete_gift'])assert.equal((await api({action,participant_id:other,gift_id:gift.id,position:1,expected_version:gift.version,...(action==='update_gift'?{gift:{title:'Foreign'}}:{})},personal)).status,403);
      const writes=await Promise.all(['Winner A','Winner B'].map((title)=>api({action:'update_gift',participant_id:owner,gift_id:gift.id,position:1,expected_version:1,gift:{title}},personal)));
      assert.deepEqual(writes.map((r)=>r.status).sort(),[200,409]);assert.equal(sql(`select version from public.gifts where id='${gift.id}';`),'2');
      console.log('OK HTTP concurrente: un guardado gana, otro recibe 409; ID ajeno no permite mutar.');
      const png=await readFile(new URL('../fixtures/images/small.png',import.meta.url));
      const upload=async(bytes,mime='image/png',participant=owner,extra={})=>{
        const response=await request('/functions/v1/media-upload',{method:'POST',headers:{Origin:origin,...client,'Content-Type':mime,'X-Edit-Token':personal,'X-Participant-Id':participant,'X-Media-Purpose':'gift',...extra},body:bytes});
        return {status:response.status,retry:response.headers.get('Retry-After'),data:await json(response)};
      };
      assert.equal((await upload(png,'image/png',other)).status,403);
      assert.equal((await upload(png,'image/svg+xml')).status,415);
      assert.equal((await upload(png,'image/jpeg')).status,422);
      const image=await upload(png);assert.equal(image.status,201);const path=image.data.path;
      const stored=await request(`/storage/v1/object/public/wishlist-media/${path}`);assert.equal(stored.status,200);const storedBytes=Buffer.from(await stored.arrayBuffer());inspectImage(storedBytes,'image/webp');
      assert.equal((await api({action:'create_gift',participant_id:other,position:1,gift:{title:'Foreign media',gift_type:'object',image_path:path}})).status,422);
      assert.equal((await api({action:'update_gift',participant_id:owner,gift_id:gift.id,position:1,expected_version:2,gift:{image_path:path}},personal)).status,200);
      const claim=await rpc('server_media_cleanup',{p_action:'claim',p_path:path});assert.equal(claim.ok,false);
      for(const [method,url,body] of [
        ['POST',`/storage/v1/object/wishlist-media/${owner}/gift/${randomUUID()}.webp`,png],
        ['PUT',`/storage/v1/object/wishlist-media/${path}`,png],
        ['DELETE','/storage/v1/object/wishlist-media',JSON.stringify({prefixes:[path]})],
      ]){
        const denied=await request(url,{method,headers:{...client,...(method==='DELETE'?{}:{'Content-Type':'image/webp'})},body});const data=await json(denied);
        // Storage DELETE can acknowledge an empty filtered set with HTTP 200.
        if(method==='DELETE'&&denied.ok)assert.deepEqual(data,[]);else assert.ok(!denied.ok||Number(data?.statusCode)>=400);
      }
      const preserved=await request(`/storage/v1/object/public/wishlist-media/${path}`);assert.equal(preserved.status,200);assert.deepEqual(Buffer.from(await preserved.arrayBuffer()),storedBytes);
      assert.equal(sql(`select image_path='${path}' from public.gifts where id='${gift.id}';`),'t');
      // Set only this disposable credential at its hour boundary; two workers share SQL quota.
      sql(`delete from private.rate_limits where key_hash=decode('${hash}','hex') and operation='upload';insert into private.rate_limits(key_hash,operation,scope,window_seconds,window_start,expires_at,request_count) values(decode('${hash}','hex'),'upload','token',3600,date_trunc('hour',clock_timestamp()),date_trunc('hour',clock_timestamp())+interval '1 hour',9);`);
      const uploads=await Promise.all([upload(png),upload(png)]);assert.deepEqual(uploads.map((r)=>r.status).sort(),[201,429]);assert.ok(Number(uploads.find((r)=>r.status===429).retry)>0);
      assert.equal((await upload(png,'image/png',owner,{'X-Forwarded-For':'203.0.113.1','X-Real-IP':'198.51.100.2'})).status,429);
      assert.equal((await api({action:'validate_access'},personal)).status,200);
      console.log('OK Storage real: WebP, aislamiento y asociación; escrituras públicas denegadas, referencia protegida y cuota concurrente 201/429.');
      const importCall=async(url,participant=owner)=>{
        const response=await request('/functions/v1/product-metadata',{method:'POST',headers:{Origin:origin,...client,'X-Edit-Token':personal},body:JSON.stringify({url,participant_id:participant})});return {status:response.status,data:await json(response)};
      };
      const hits=sourceHits;assert.equal((await importCall('https://shop.example.com/product',other)).status,403);assert.equal(sourceHits,hits);
      for(const url of ['https://127.0.0.1','https://[::1]','https://user:pass@example.com','https://169.254.169.254'])assert.equal((await importCall(url)).status,422);
      const imported=await importCall('https://shop.example.com/product');assert.equal(imported.status,200);assert.equal(imported.data.metadata.fields.title,'Taza de prueba & café');assert.equal(imported.data.metadata.fields.currency,'USD');
      clean(captured);
      const replay=await fetch('http://127.0.0.1:54802/fetch-product',{method:'POST',headers:{'Content-Type':'application/json','X-Fetch-Signature':await signFetch('request',captured,secret)},body:captured});assert.equal(replay.status,409);await replay.body?.cancel();assert.equal(sourceHits,hits+1);
      const envelope={v:1,nonce:generateToken(),url:'https://shop.example.com/product',expires_at:Math.floor(Date.now()/1000)+25};
      const admitted=await rpc('server_prepare_import',{p_token_hash:hash,p_participant_id:owner,p_url_hash:await sha256Text(envelope.url),p_nonce_hash:await sha256Text(envelope.nonce),p_expires_at:new Date(envelope.expires_at*1000).toISOString()});assert.equal(admitted.ok,true);
      const body=JSON.stringify(envelope),signature=await signFetch('request',body,secret);
      const claims=await Promise.all([0,1].map(()=>fetch('http://127.0.0.1:54802/fetch-product',{method:'POST',headers:{'Content-Type':'application/json','X-Fetch-Signature':signature},body})));
      assert.deepEqual(claims.map((r)=>r.status).sort(),[200,409]);for(const response of claims)await response.body?.cancel();assert.equal(sourceHits,hits+2);
      sql(`delete from private.rate_limits where key_hash=decode('${hash}','hex') and operation='import';`);
      const blocked=await importCall('https://blocked.example.com/product');assert.equal(blocked.data.reason,'BLOCKED_DESTINATION');assert.equal(sourceHits,hits+2);
      assert.equal((await importCall('https://shop.example.com/redirect')).data.reason,'BLOCKED_DESTINATION');
      assert.equal((await importCall('https://shop.example.com/bomb')).data.reason,'TOO_LARGE');
      // Separate deterministic fallback cases from the five-per-minute import quota.
      sql(`delete from private.rate_limits where key_hash=decode('${hash}','hex') and operation='import';`);
      assert.equal((await importCall('https://shop.example.com/forbidden')).data.status,'manual');assert.equal((await importCall('https://shop.example.com/captcha')).data.status,'manual');
      assert.equal(sql(`select count(*) from public.gifts where participant_id='${owner}';`),'1');
      console.log('OK importación Edge/Node/TLS/SQL: firma, replay, DNS mixto, redirección privada, bomba gzip y fallback sin guardar.');
      // An exhausted operation quota intentionally fails before authorization. Reset only
      // this fixture's quotas so the following cases specifically observe revocation (401).
      sql(`delete from private.rate_limits where key_hash=decode('${hash}','hex') and operation in ('upload','import');`);
      assert.equal((await api({action:'revoke_participant_link',participant_id:owner})).status,200);
      assert.equal((await api({action:'update_gift',participant_id:owner,gift_id:gift.id,position:1,expected_version:3,gift:{title:'Revoked'}},personal)).status,401);
      assert.equal((await upload(png)).status,401);
      assert.equal((await importCall('https://shop.example.com/product')).status,401);
      const publicRows=await request('/rest/v1/participants?select=*,gifts(*)',{headers:client});assert.equal(publicRows.status,200);await json(publicRows);
      console.log('OK revocación en los tres endpoints; lecturas públicas y logs sin material privado.');
      // Remaining admin/concurrency tests run against their own participants, starting with no quota noise.
      sql(`delete from public.participants where id in ('${owner}','${other}');delete from private.rate_limits where key_hash in (decode('${hash}','hex'),decode('${await hashToken(token)}','hex'));`);
    },
  };
}
