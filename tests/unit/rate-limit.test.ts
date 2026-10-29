import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalIp,networkHash,withRateLimit,retrySeconds,type RateLimitArgs,type RequestLog } from '../../supabase/functions/_shared/rate-limit.ts';
import { retryAfterSeconds } from '../../src/domain/retry-after.ts';
import { sendMediaUpload,MediaUploadError } from '../../src/services/media-upload.ts';
import { readFile } from 'node:fs/promises';
const origin='http://localhost:5173',secret='A'.repeat(43),token='B'.repeat(42)+'A';
const request=(headers: Record<string,string>={},method='POST')=>new Request('http://local/wishlist-api',{method,headers:{Origin:origin,...headers},...(method==='POST'?{body:'private body '+token}:{})});
test('canonicalizes IPv4/IPv6 and mapped forms; rejects ambiguity, ports, duplicate lists and hostnames',()=>{
  assert.equal(canonicalIp('203.0.113.9'),'203.0.113.9');
  assert.equal(canonicalIp('2001:0DB8:0000:0:0:0:0:1'),'2001:db8::1');
  assert.equal(canonicalIp('::ffff:203.0.113.9'),'203.0.113.9');
  for (const ip of ['203.000.113.9','127.1','[::1]','::1%eth0','1.2.3.4:80','example.com','1.2.3.4, 8.8.8.8',' 1.2.3.4','256.1.2.3']) assert.equal(canonicalIp(ip),null);
});
test('unverified environment ignores every spoofed header even with a configured HMAC key',async()=>{
  assert.equal(await networkHash(request({'x-forwarded-for':'8.8.8.8','x-real-ip':'1.1.1.1','cf-connecting-ip':'203.0.113.9'}),'off',secret),null);
  assert.equal(await networkHash(request({'cf-connecting-ip':'203.0.113.9'})),null);
});
test('verified provider mode HMACs canonical identity with domain separation and server secret',async()=>{
  const a=await networkHash(request({'cf-connecting-ip':'203.0.113.9'}),'verified-cloudflare',secret);
  const b=await networkHash(request({'cf-connecting-ip':'::ffff:203.0.113.9','x-forwarded-for':'attacker'}),'verified-cloudflare',secret);
  assert.match(a!,/^[a-f0-9]{64}$/); assert.equal(a,b); assert.ok(!a!.includes('203.0.113.9'));
  assert.notEqual(a,await networkHash(request({'cf-connecting-ip':'203.0.113.9'}),'verified-cloudflare',token));
  assert.equal(await networkHash(request({'x-forwarded-for':'203.0.113.9'}),'verified-cloudflare',secret),null);
  assert.equal(await networkHash(request({'cf-connecting-ip':'203.0.113.9, 8.8.8.8'}),'verified-cloudflare',secret),null);
  await assert.rejects(networkHash(request(),'unknown',secret));
  await assert.rejects(networkHash(request(),'verified-cloudflare','placeholder'));
});
test('ingress denial happens before body/business logic; retry header visible and metadata contains no private input',async()=>{
  let calls=0; const logs:RequestLog[]=[]; const body=request({'X-Edit-Token':token});
  const handler=withRateLimit(async()=>{calls++;return Response.json({ok:true});},{allowedOrigins:[origin],endpoint:'wishlist-api',
    callRpc:async(args)=>{assert.deepEqual(args,{p_action:'request',p_network_hash:null});return {ok:false,status:429,retry_after:17};},log:(entry)=>logs.push(entry)});
  const response=await handler(body); assert.equal(response.status,429); assert.equal(calls,0); assert.equal(body.bodyUsed,false);
  assert.equal(response.headers.get('Retry-After'),'17'); assert.ok(response.headers.get('Access-Control-Expose-Headers')?.includes('Retry-After'));
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin); assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(logs.length,1); assert.deepEqual(Object.keys(logs[0]).sort(),['action','duration_ms','request_id','status']);
  assert.ok(!JSON.stringify(logs).includes(token)); assert.match(response.headers.get('X-Request-Id')!,/^[a-f0-9-]{36}$/);
});
test('invalid credentials are recorded once and failure quota overrides denial without sending the body to quota RPC',async()=>{
  const calls:RateLimitArgs[]=[];
  const handler=withRateLimit(async()=>Response.json({error:{code:'ACCESS_UNAVAILABLE'}},{status:401}),{allowedOrigins:[origin],endpoint:'media-upload',
    callRpc:async(args)=>{calls.push(args);return args.p_action==='request'?{ok:true}:{ok:false,status:429,retry_after:32};}});
  assert.equal((await handler(request({'X-Edit-Token':token}))).status,429);
  assert.deepEqual(calls.map((a)=>a.p_action),['request','failure']); assert.ok(!JSON.stringify(calls).includes(token));
});
test('preflight/rejected origins skip quota; successful writes are admitted once without recording a failure',async()=>{
  let count=0;
  const handler=withRateLimit(async()=>Response.json({ok:true}),{allowedOrigins:[origin],endpoint:'wishlist-api',callRpc:async()=>{count++;return {ok:true};}});
  await handler(request({},'OPTIONS')); await handler(request({Origin:'https://evil.example'})); assert.equal(count,0);
  assert.equal((await handler(request())).status,200); assert.equal(count,1);
});
test('quota database failures or invalid secret configuration fail closed; log failure does not turn success into retry',async()=>{
  let business=0;
  const handler=withRateLimit(async()=>{business++;return Response.json({ok:true});},{allowedOrigins:[origin],endpoint:'wishlist-api',callRpc:async()=>{throw new Error('private provider detail');}});
  const response=await handler(request()); assert.equal(response.status,503); assert.equal(business,0); assert.ok(!(await response.text()).includes('private provider detail'));
  const misconfigured=withRateLimit(async()=>{business++;return Response.json({ok:true});},{allowedOrigins:[origin],endpoint:'wishlist-api',ipSource:'verified-cloudflare',hmacSecret:'bad',callRpc:async()=>({ok:true})});
  assert.equal((await misconfigured(request())).status,503); assert.equal(business,0);
  const logger=withRateLimit(async()=>Response.json({ok:true}),{allowedOrigins:[origin],endpoint:'wishlist-api',callRpc:async()=>({ok:true}),log:()=>{throw new Error();}});
  assert.equal((await logger(request())).status,200);
});
test('hourly Retry-After remains bounded at 3600 on server and browser',async()=>{
  for (const value of [null,'NaN','-1','1.1','Infinity']) assert.equal(retryAfterSeconds(value),60);
  assert.equal(retryAfterSeconds('2400'),2400); assert.equal(retryAfterSeconds('99999'),3600);
  assert.equal(retrySeconds(2400),2400); assert.equal(retrySeconds(Infinity),60);
  const config={supabaseUrl:'http://127.0.0.1:54321',publishableKey:'sb_publishable_test_only',appUrl:origin};
  const file=new Blob([await readFile(new URL('../fixtures/images/small.png',import.meta.url))],{type:'image/png'});
  await assert.rejects(sendMediaUpload(token,'11111111-1111-4111-8111-000000000001','gift',file,new AbortController().signal,config,
    async()=>new Response(null,{status:429,headers:{'Retry-After':'2400'}})),(error:unknown)=>error instanceof MediaUploadError && error.kind==='rate' && error.retryAfter===2400);
});
