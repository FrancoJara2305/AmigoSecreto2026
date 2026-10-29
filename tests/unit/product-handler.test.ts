import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductHandler } from '../../supabase/functions/_shared/product-handler.ts';
import { createFetchProxy } from '../../server/product-fetch/proxy.ts';
import { signFetch,verifyFetch,sha256Text,fetchEnvelope,encodeBytes } from '../../supabase/functions/_shared/fetch-protocol.ts';
import type { AccessRpcResult } from '../../supabase/functions/_shared/access-handler.ts';
const secret='A'.repeat(43),token='B'.repeat(42)+'A',owner='11111111-1111-4111-8111-000000000001',origin='http://localhost:5173';
const html='<script type="application/ld+json">{"@type":"Product","name":"Una taza","offers":{"@type":"Offer","price":"12.50","priceCurrency":"USD"}}</script>';
const request=(value:unknown={participant_id:owner,url:'https://shop.example.com/product'})=>new Request('http://local/product-metadata',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Edit-Token':token},body:JSON.stringify(value)});
test('signed Edge/proxy/callback protocol returns suggestions, sends no participant token/key to transport and writes no gift',async()=>{
  const records=new Map<string,{url:string;claimed:boolean}>();const calls:string[]=[];let downloads=0;let handler!:(r:Request)=>Promise<Response>;
  const proxy=createFetchProxy({secret,claim:async(_env,body,signature)=>{
    const response=await handler(new Request('http://local/product-metadata',{method:'POST',headers:{'Content-Type':'application/json','X-Transport-Claim':signature},body}));return (await response.json()).claimed===true;
  },download:async(url)=>{downloads++;return {url,contentType:'text/html',bytes:new TextEncoder().encode(html)};}});
  handler=createProductHandler({allowedOrigins:[origin],proxyUrl:'https://transport.example.com/api/fetch-product',secret,
    callRpc:async(name,args)=>{calls.push(name);assert.ok(!JSON.stringify(args).includes(token));const a=args as Record<string,string>;
      if(name==='server_prepare_import'){records.set(a.p_nonce_hash,{url:a.p_url_hash,claimed:false});return {ok:true};}
      if(name==='server_claim_import'){const row=records.get(a.p_nonce_hash);if(!row||row.claimed||row.url!==a.p_url_hash)return {ok:false};row.claimed=true;return {ok:true};}
      return {ok:true};
    },fetcher:async(url,options)=>{
      const headers=new Headers(options?.headers);for(const key of ['X-Edit-Token','Authorization','Cookie','apikey'])assert.equal(headers.get(key),null);
      assert.ok(!String(options?.body).includes(token));return proxy(new Request(url,options));
    }});
  const response=await handler(request());assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.metadata.fields.title,'Una taza');assert.equal(data.metadata.fields.currency,'USD');assert.equal(data.metadata.fields.reference_price,'12.50');
  assert.deepEqual(calls,['server_prepare_import','server_claim_import','server_access']);assert.equal(downloads,1);assert.ok(!JSON.stringify(data).includes('<script>'));
});
test('denied owner/quota prevents transport; 429 reports hour and no HTML or credential leaks',async()=>{
  for(const [status,error] of [[403,'FORBIDDEN'],[401,'ACCESS_UNAVAILABLE'],[429,'RATE_LIMITED']] as const){
    let fetches=0;const handler=createProductHandler({allowedOrigins:[origin],proxyUrl:'https://transport.example.com/',secret,
      callRpc:async()=>({ok:false,status,error,retry_after:2400}),fetcher:async()=>{fetches++;throw new Error();}});
    const response=await handler(request());assert.equal(response.status,status);assert.equal(fetches,0);if(status===429)assert.equal(response.headers.get('Retry-After'),'2400');
  }
});
test('public handler rejects overposting/unsafe URLs, method and origin; missing configuration fails closed',async()=>{
  let called=0;const handler=createProductHandler({allowedOrigins:[origin],proxyUrl:'https://transport.example.com/',secret,callRpc:async()=>{called++;return {ok:true};}});
  assert.equal((await handler(request({participant_id:owner,url:'http://127.0.0.1'}))).status,422);
  assert.equal((await handler(request({participant_id:owner,url:'https://shop.example.com/',is_admin:true}))).status,422);assert.equal(called,0);
  assert.equal((await handler(new Request('http://local/product-metadata'))).status,405);
  assert.equal((await createProductHandler({allowedOrigins:[origin],callRpc:async()=>({ok:true})})(request())).status,503);
});
test('response signature/nonce mismatch fails to manual; revocation drops a late import result',async()=>{
  for(const mode of ['signature','revoked']){
    const handler=createProductHandler({allowedOrigins:[origin],proxyUrl:'https://transport.example.com/',secret,
      callRpc:async(name):Promise<AccessRpcResult>=>name==='server_access'?{ok:false,status:401,error:'ACCESS_UNAVAILABLE'}:{ok:true},
      fetcher:async(_url,options)=>{
        const env=JSON.parse(String(options?.body));const raw=JSON.stringify({v:1,nonce:env.nonce,ok:true,url:env.url,content_type:'text/html',body:encodeBytes(new TextEncoder().encode(html))});
        return new Response(raw,{headers:{'X-Fetch-Signature':mode==='signature'?'00'.repeat(32):await signFetch('response',raw,secret)}});
      }});
    const response=await handler(request());assert.equal(response.status,mode==='revoked'?401:200);const data=await response.json();assert.equal(data.metadata,undefined);
  }
});
test('two proxy instances require durable claim before DNS; replay and tampering never fetch',async()=>{
  const seen=new Set<string>();let downloads=0;
  const deps={secret,claim:async(env:{nonce:string})=>{if(seen.has(env.nonce))return false;seen.add(env.nonce);return true;},download:async(url:string)=>{downloads++;return {url,bytes:new TextEncoder().encode(html),contentType:'text/html'};}};
  const first=createFetchProxy(deps),second=createFetchProxy(deps);
  const body=JSON.stringify({v:1,nonce:secret,url:'https://shop.example.com/',expires_at:Math.floor(Date.now()/1000)+30});
  const signature=await signFetch('request',body,secret);
  const build=(sig=signature)=>new Request('http://local/proxy',{method:'POST',headers:{'Content-Type':'application/json','X-Fetch-Signature':sig},body});
  assert.equal((await first(build('00'.repeat(32)))).status,401);assert.equal(downloads,0);
  assert.equal((await first(build())).status,200);assert.equal((await second(build())).status,409);assert.equal(downloads,1);
});
test('HMAC domains, payload binding, TTL and unknown fields cannot be replayed across protocol branches',async()=>{
  const body=JSON.stringify({v:1,nonce:secret,url:'https://shop.example.com/',expires_at:Math.floor(Date.now()/1000)+30});
  const signature=await signFetch('request',body,secret);assert.equal(await verifyFetch('claim',body,signature,secret),false);
  assert.equal(await verifyFetch('request',body+' ',signature,secret),false);assert.equal((await sha256Text(body)).length,64);
  assert.throws(()=>fetchEnvelope({...JSON.parse(body),expires_at:Math.floor(Date.now()/1000)-1}));
  assert.throws(()=>fetchEnvelope({...JSON.parse(body),participant_id:owner}));
});
