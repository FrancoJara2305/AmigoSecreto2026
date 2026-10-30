import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentOrigin,hostingConfig,spaSource } from '../../server/deployment-config.ts';

test('SPA fallback excludes APIs, assets and missing file paths, including nested routes',()=>{
  const pattern=new RegExp('^'+spaSource+'$');
  for(const path of ['/','/participante/melyza','/organizador/evento','/participante/melyza/regalo/1/editar','/no-existe'])assert.ok(pattern.test(path),path);
  for(const path of ['/api','/api/fetch-product','/api/no-existe','/assets','/assets/main.js','/archivo.js','/index.html'])assert.equal(pattern.test(path),false,path);
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
