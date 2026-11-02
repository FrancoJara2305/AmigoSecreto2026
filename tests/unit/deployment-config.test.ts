import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deploymentOrigin,deploymentEnvironmentTemplates,hostingConfig,spaSource } from '../../server/deployment-config.ts';

test('SPA fallback excludes APIs, assets and missing file paths, including nested routes',()=>{
  const pattern=new RegExp('^'+spaSource+'$');
  for(const path of ['/','/acceso','/organizador/acceso','/organizador/participantes','/participante/melyza','/organizador/evento','/participante/melyza/regalo/1/editar','/no-existe'])assert.ok(pattern.test(path),path);
  for(const path of ['/api','/api/fetch-product','/api/no-existe','/assets','/assets/main.js','/archivo.js','/index.html'])assert.equal(pattern.test(path),false,path);
});
test('Git deployments retain the reviewed production SPA routes and security headers at repository root',async()=>{
  const config=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(config,hostingConfig('https://jtuhcilcnuydsbcbsazo.supabase.co'));
  for(const path of ['/acceso','/organizador/acceso','/organizador/evento']){
    assert.equal(config.rewrites.find((rule:{source:string})=>new RegExp('^'+rule.source+'$').test(path))?.destination,'/index.html');
  }
  for(const path of ['/api/fetch-product','/api/missing','/assets/missing.js']){
    assert.equal(config.rewrites.some((rule:{source:string})=>new RegExp('^'+rule.source+'$').test(path)),false);
  }
});
test('hosting config uses exact HTTPS backend, protected documents and immutable hashed assets',()=>{
  const config=hostingConfig('https://fixture.supabase.co');
  const security=Object.fromEntries(config.headers[0].headers.map((h)=>[h.key,h.value]));
  assert.ok(security['Content-Security-Policy'].includes("connect-src 'self' https://fixture.supabase.co"));
  assert.ok(security['Content-Security-Policy'].includes("script-src 'self'"));
  assert.ok(!security['Content-Security-Policy'].includes('unsafe-eval'));
  assert.ok(!security['Content-Security-Policy'].includes('*.supabase.co'));
  assert.equal(security['Referrer-Policy'],'no-referrer');assert.equal(security['X-Frame-Options'],'DENY');
  assert.equal(config.functions['api/fetch-product.ts'].maxDuration,15);
  assert.ok(config.headers.some((h)=>h.source==='/index.html'&&h.headers.some((v)=>v.key==='Cache-Control'&&v.value==='no-store')));
});
test('deployment destinations reject URL credentials, local/IP targets, query, path and header injection',()=>{
  for(const value of ['http://example.com','https://localhost','https://127.0.0.1','https://[::1]','https://user:pass@example.com','https://example.com:444','https://example.com/path','https://example.com?q=x','https://example.com/#token=x','https://*.supabase.co','https://example.com\r\nX-Test: yes'])assert.throws(()=>deploymentOrigin(value));
  assert.equal(deploymentOrigin('https://fixture.supabase.co/'),'https://fixture.supabase.co');
});

test('environment templates bind frontend, Edge and signed callback to the same destinations',()=>{
  const templates=deploymentEnvironmentTemplates('https://staging-fixture.supabase.co/','https://staging.example.com/');
  const env=(name:keyof typeof templates)=>Object.fromEntries(templates[name].trim().split('\n').map((line)=>line.split('=')));
  assert.deepEqual(env('frontend.env.example'),{
    VITE_SUPABASE_URL:'https://staging-fixture.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY:'REPLACE_PUBLIC_KEY_FROM_THIS_ENVIRONMENT',
    VITE_APP_URL:'https://staging.example.com',
  });
  assert.deepEqual(env('edge.env.example'),{
    APP_ALLOWED_ORIGINS:'https://staging.example.com',APP_BASE_URL:'https://staging.example.com',
    RATE_LIMIT_IP_SOURCE:'off',RATE_LIMIT_HMAC_SECRET:'REPLACE_UNUSED_WHILE_IP_SOURCE_OFF',
    FETCH_PROXY_URL:'https://staging.example.com/api/fetch-product',
    FETCH_PROXY_HMAC_SECRET:'REPLACE_UNIQUE_32_BYTE_BASE64URL_SHARED_WITH_PROXY',APP_LOCAL_FETCH_PROXY:'0',
    GIFT_ASSISTANT_ENABLED:'0',GIFT_ASSISTANT_PROVIDER:'gemini',
    GEMINI_API_KEY:'REPLACE_UNIQUE_SERVER_ONLY_KEY_FOR_THIS_ENVIRONMENT',GEMINI_MODEL:'gemini-3.5-flash-lite',
  });
  assert.deepEqual(env('fetch-proxy.env.example'),{
    FETCH_PROXY_HMAC_SECRET:env('edge.env.example').FETCH_PROXY_HMAC_SECRET,
    FETCH_PROXY_CALLBACK_URL:'https://staging-fixture.supabase.co/functions/v1/product-metadata',
  });
});

test('environment templates reject mixed URL configuration and keep private variables out of frontend',()=>{
  assert.throws(()=>deploymentEnvironmentTemplates('https://same.example.com','https://same.example.com'));
  assert.throws(()=>deploymentEnvironmentTemplates('http://127.0.0.1:54321','https://staging.example.com'));
  assert.throws(()=>deploymentEnvironmentTemplates('https://fixture.supabase.co','https://staging.example.com/#secret'));
  const templates=deploymentEnvironmentTemplates('https://fixture.supabase.co','https://staging.example.com');
  assert.doesNotMatch(templates['frontend.env.example'],/SECRET|SERVICE_ROLE|PASSWORD|CALLBACK/);
  for(const content of Object.values(templates))assert.doesNotMatch(content,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD/);
});
