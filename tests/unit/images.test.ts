import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectImage } from '../../supabase/functions/_shared/image-inspection.ts';
import { createImageNormalizer } from '../../supabase/functions/media-upload/codec.ts';
import { createMediaHandler } from '../../supabase/functions/_shared/media-handler.ts';
const owner='11111111-1111-4111-8111-000000000001';
const path=`${owner}/gift/22222222-2222-4222-8222-000000000001.webp`;
const credential='A'.repeat(43);
const fixture=(name:string)=>readFile(new URL(`../fixtures/images/${name}`,import.meta.url));
test('static JPEG, PNG, WebP dimensions; reject MIME spoofing, truncation, oversize and unsupported formats',async()=>{
  for (const [ext,mime] of [['jpg','image/jpeg'],['png','image/png'],['webp','image/webp']]) {
    const bytes=await fixture(`small.${ext}`);
    assert.deepEqual(inspectImage(bytes,mime),{mime,width:96,height:64});
    assert.throws(()=>inspectImage(bytes,'image/gif'));
    assert.throws(()=>inspectImage(bytes.subarray(0,bytes.length-5),mime));
  }
  for (const input of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),Buffer.from('GIF89a000000000000'),new Uint8Array(3145729)]) assert.throws(()=>inspectImage(input));
});
test('reject APNG, animated WebP and oversized dimensions before decoding',async()=>{
  const png=await fixture('small.png'); const apng=Buffer.from(png); apng.write('acTL',37); assert.throws(()=>inspectImage(apng));
  const huge=Buffer.from(png); huge.writeUInt32BE(16000001,16); assert.throws(()=>inspectImage(huge));
  const webp=await fixture('small.webp'); const animated=Buffer.from(webp); animated.write('ANIM',12); assert.throws(()=>inspectImage(animated));
});
test('full decoding and metadata-free WebP recode for each codec, with gift/avatar dimensions',async()=>{
  const normalize=createImageNormalizer(readFile);
  for (const [ext,mime] of [['jpg','image/jpeg'],['png','image/png'],['webp','image/webp']]) {
    const output=await normalize(await fixture(`small.${ext}`),mime,'gift');
    assert.equal(inspectImage(output).mime,'image/webp');
    assert.ok(!Buffer.from(output).includes(Buffer.from('EXIF')) && !Buffer.from(output).includes(Buffer.from('XMP ')));
    const large=await normalize(await fixture(`large.${ext}`),mime,'avatar');
    assert.equal(inspectImage(large).width,512); assert.ok(large.length<=150000);
  }
});
test('capability checked before binary body, no decoder or upload on denial',async()=>{
  let decoded=false; let uploaded=false; let args:unknown;
  const handler=createMediaHandler({allowedOrigins:['http://localhost:5173'],rpc:async(a)=>{args=a; return {ok:false,status:403,error:'FORBIDDEN'};},
    normalize:async()=>{decoded=true; throw new Error();},upload:async()=>{uploaded=true;}});
  const response=await handler(new Request('http://local/media-upload',{method:'POST',headers:{'Content-Type':'image/png','X-Edit-Token':credential,'X-Participant-Id':owner,'X-Media-Purpose':'gift'},body:await fixture('small.png')}));
  assert.equal(response.status,403); assert.equal(decoded,false); assert.equal(uploaded,false); assert.ok(!JSON.stringify(args).includes(credential));
});
test('EXIF orientation is applied before stripping metadata, corrupt PNG pixel stream rejected',async()=>{
  const normalize=createImageNormalizer(readFile);
  const jpg=await fixture('small.jpg');
  const exif=Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex');
  const oriented=Buffer.concat([jpg.subarray(0,2),exif,jpg.subarray(2)]);
  const output=await normalize(oriented,'image/jpeg','gift');
  assert.deepEqual(inspectImage(output),{mime:'image/webp',width:64,height:96});
  assert.ok(!Buffer.from(output).includes(Buffer.from('Exif')));
  const png=Buffer.from(await fixture('small.png'));
  const idat=png.indexOf(Buffer.from('IDAT')); png.fill(0,idat+4,idat+20);
  await assert.rejects(normalize(png,'image/png','gift'));
});
test('normalize before Storage, reauthorize after upload; no attachment/deletion on failed completion',async()=>{
  const calls:string[]=[];
  const handler=createMediaHandler({allowedOrigins:['http://localhost:5173'],rpc:async(a)=>{calls.push(a.p_action); return a.p_action==='reserve'?{ok:true,path}:{ok:false,status:401,error:'ACCESS_UNAVAILABLE'};},
    normalize:async()=>{calls.push('decode'); return fixture('small.webp');},upload:async(p)=>{assert.equal(p,path); calls.push('upload');}});
  const response=await handler(new Request('http://local/media-upload',{method:'POST',headers:{'Content-Type':'image/png','X-Edit-Token':credential,'X-Participant-Id':owner,'X-Media-Purpose':'gift'},body:await fixture('small.png')}));
  assert.equal(response.status,401); assert.deepEqual(calls,['reserve','decode','upload','complete']); assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('request defenses deny missing capabilities, disallowed origins, query tokens, methods and oversized input',async()=>{
  let calls=0;
  const handler=createMediaHandler({allowedOrigins:['http://localhost:5173'],rpc:async()=>{calls++; return {ok:true,path};},normalize:async()=>fixture('small.webp'),upload:async()=>{}});
  const headers={'Content-Type':'image/png','X-Edit-Token':credential,'X-Participant-Id':owner,'X-Media-Purpose':'gift'};
  for (const [url,overrides,expected] of [
    ['http://local/upload',{'X-Edit-Token':''},401],['http://local/upload',{Origin:'https://evil.example'},403],
    ['http://local/upload?token=secret',{},422],['http://local/upload',{'Content-Length':'3145729'},413],
    ['http://local/upload',{'X-Media-Purpose':'arbitrary'},422],
  ] as const) {
    const request=new Request(url,{method:'POST',headers:{...headers,...overrides},body:await fixture('small.png')});
    assert.equal((await handler(request)).status,expected); assert.equal(request.bodyUsed,false);
  }
  assert.equal((await handler(new Request('http://local/upload'))).status,405); assert.equal(calls,0);
  const preflight=await handler(new Request('http://local/upload',{method:'OPTIONS',headers:{Origin:'http://localhost:5173'}}));
  assert.equal(preflight.status,204); assert.ok(preflight.headers.get('Access-Control-Allow-Headers')?.includes('x-participant-id'));
});
