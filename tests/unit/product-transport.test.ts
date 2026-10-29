import { test } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { gzipSync } from 'node:zlib';
import { productUrl,ProductImportError } from '../../supabase/functions/_shared/product-url.ts';
import { publicAddress } from '../../server/product-fetch/ip-policy.ts';
import { createProductDownloader,pinnedExchange,type PinnedAddress } from '../../server/product-fetch/transport.ts';
// @ts-expect-error The test-only OpenSSL fixture is a small JavaScript helper.
import { tlsFixture } from '../support/tls-fixture.mjs';
test('reject literal/encoded IPs, local hosts, credentials, ports and alternate schemes before DNS',()=>{
  for(const url of ['http://example.com','https://user:pass@example.com','https://example.com:444/a','https://127.0.0.1','https://0x7f000001','https://2130706433','https://[::1]','https://a.local','https://localhost','https://a.internal','https://example.com./','file:///etc/passwd','https://example.com\\@127.0.0.1'])assert.throws(()=>productUrl(url));
  assert.equal(productUrl('https://shop.example.com:443/a#private').href,'https://shop.example.com/a');
});
test('classify non-global IPv4/IPv6, mapped IPv4, cloud metadata, multicast, reserved and transition ranges',()=>{
  for(const ip of ['0.0.0.0','10.1.2.3','100.64.1.1','127.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','192.0.0.9','192.0.2.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::','::1','fc00::1','fe80::1','ff02::1','::ffff:127.0.0.1','64:ff9b::a00:1','2001:db8::1','2002:7f00:1::','3fff::1'])assert.equal(publicAddress(ip),false,ip);
  for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111','::ffff:8.8.8.8'])assert.equal(publicAddress(ip),true,ip);
});
test('mixed DNS answers block all connections, and redirects are validated before connecting',async()=>{
  let connections=0;
  const mixed=createProductDownloader({resolve:async()=>[{address:'8.8.8.8',family:4},{address:'::ffff:127.0.0.1',family:6}],exchange:async()=>{connections++;throw new Error();}});
  await assert.rejects(mixed('https://shop.example.com/'),(e:unknown)=>e instanceof ProductImportError&&e.code==='BLOCKED_DESTINATION');assert.equal(connections,0);
  const redirect=createProductDownloader({resolve:async()=>[{address:'8.8.8.8',family:4}],exchange:async()=>{connections++;return {status:302,location:'http://169.254.169.254/latest/meta-data',bytes:new Uint8Array(),contentType:''};}});
  await assert.rejects(redirect('https://shop.example.com/'));assert.equal(connections,1);
});
test('obsolete IPv6 and provider virtual metadata IPs are blocked; DNS timeout consumes the shared deadline',async()=>{
  assert.equal(publicAddress('3ffe::1'),false);assert.equal(publicAddress('168.63.129.16'),false);
  let connected=false;
  const stalled=createProductDownloader({resolve:()=>new Promise(()=>{}),exchange:async()=>{connected=true;throw new Error();}});
  await assert.rejects(stalled('https://shop.example.com/',AbortSignal.timeout(20)),(e:unknown)=>e instanceof ProductImportError&&e.code==='TIMEOUT');
  assert.equal(connected,false);
});
test('rebind cannot replace the pinned address; every redirect gets fresh full DNS validation; fourth redirect blocked',async()=>{
  let resolves=0;const pins:PinnedAddress[]=[];
  const rebind=createProductDownloader({resolve:async()=>{resolves++;return [{address:resolves===1?'8.8.8.8':'127.0.0.1',family:4}];},exchange:async(_url,pin)=>{pins.push(pin);return {status:302,location:'/again',bytes:new Uint8Array(),contentType:''};}});
  await assert.rejects(rebind('https://shop.example.com/'));assert.equal(resolves,2);assert.deepEqual(pins,[{address:'8.8.8.8',family:4}]);
  let count=0;const loop=createProductDownloader({resolve:async()=>[{address:'8.8.8.8',family:4}],exchange:async()=>{count++;return {status:302,location:'/loop',bytes:new Uint8Array(),contentType:''};}});
  await assert.rejects(loop('https://shop.example.com/'),(e:unknown)=>e instanceof ProductImportError&&e.code==='REDIRECT_LIMIT');assert.equal(count,4);
});
test('real Node TLS keeps original Host/SNI, validates certificate name, bounds compressed/chunked output and aborts',async(t)=>{
  const fixture=await tlsFixture();const seen:{host:string|undefined;servername:unknown;headers:Record<string,unknown>}[]=[];
  const server=https.createServer({key:fixture.key,cert:fixture.cert},(req,res)=>{
    seen.push({host:req.headers.host,servername:(req.socket as import('node:tls').TLSSocket).servername,headers:req.headers});
    if(req.url==='/blocked'){res.writeHead(403).end();return;}
    if(req.url==='/slow'){const timer=setTimeout(()=>res.end('<title>Late</title>'),250);timer.unref();return;}
    res.setHeader('Content-Type',req.url==='/json'?'application/json':'text/html; charset=utf-8');
    if(req.url==='/bomb'||req.url==='/gzip'){res.setHeader('Content-Encoding','gzip');res.end(gzipSync(req.url==='/bomb'?'x'.repeat(1048577):'<title>Compressed</title>'));return;}
    if(req.url==='/large'){res.write('x'.repeat(1048576));res.end('x');return;}
    res.end('<title>Fixture</title>');
  });
  await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as import('node:net').AddressInfo).port;
  t.after(async()=>{server.closeAllConnections();await new Promise<void>((resolve)=>server.close(()=>resolve()));});
  const call=(path:string,host='shop.example.com',signal=AbortSignal.timeout(2000))=>pinnedExchange(new URL(`https://${host}${path}`),{address:'127.0.0.1',family:4},signal,{port,ca:fixture.ca});
  assert.equal(new TextDecoder().decode((await call('/')).bytes),'<title>Fixture</title>');
  assert.equal(seen[0].servername,'shop.example.com');assert.equal(seen[0].host,`shop.example.com:${port}`);
  for(const header of ['authorization','cookie','x-edit-token','x-fetch-signature'])assert.equal(seen[0].headers[header],undefined);
  await assert.rejects(call('/','wrong.example.com'));
  assert.equal(new TextDecoder().decode((await call('/gzip')).bytes),'<title>Compressed</title>');
  for(const path of ['/bomb','/large'])await assert.rejects(call(path),(e:unknown)=>e instanceof ProductImportError&&e.code==='TOO_LARGE');
  for(const path of ['/blocked','/json'])await assert.rejects(call(path));
  await assert.rejects(call('/slow','shop.example.com',AbortSignal.timeout(20)));
});
