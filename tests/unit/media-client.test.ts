import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sendMediaUpload,MediaUploadError } from '../../src/services/media-upload.ts';
import { createPrivateSession } from '../../src/services/private-session.ts';
import type { AccessScope } from '../../src/domain/private-access.ts';
const owner='11111111-1111-4111-8111-000000000001',token='A'.repeat(43);
const path=`${owner}/gift/22222222-2222-4222-8222-000000000001.webp`;
const config={supabaseUrl:'http://127.0.0.1:54321',publishableKey:'sb_publishable_test_only',appUrl:'http://127.0.0.1:5173'};
const file=async()=>new Blob([await readFile(new URL('../fixtures/images/small.png',import.meta.url))],{type:'image/png'});
const scope: AccessScope={tokenId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',accessType:'participant',participantId:owner,participantSlug:'melyza',expiresAt:null};
test('binary transport keeps capability exclusively in header and rejects foreign or oversized receipts',async()=>{
  assert.equal(await sendMediaUpload(token,owner,'gift',await file(),new AbortController().signal,config,async(url,init)=>{
    assert.equal(String(url),`${config.supabaseUrl}/functions/v1/media-upload`);
    const headers=new Headers(init?.headers); assert.equal(headers.get('X-Edit-Token'),token); assert.equal(headers.get('Authorization'),null);
    assert.equal(headers.get('X-Participant-Id'),owner); assert.equal(init?.credentials,'omit'); assert.equal(init?.cache,'no-store'); assert.equal(init?.redirect,'error');
    assert.ok(init?.body instanceof Blob); assert.ok(!(await init.body.text()).includes(token)); return Response.json({path,secret:'discard'});
  }),path);
  await assert.rejects(sendMediaUpload(token,owner,'gift',await file(),new AbortController().signal,config,async()=>Response.json({path:'another/gift/file.webp'})),MediaUploadError);
  await assert.rejects(sendMediaUpload(token,owner,'gift',await file(),new AbortController().signal,config,async()=>new Response('x'.repeat(3000))),MediaUploadError);
});
test('failed uploads do not retry or expose server detail; invalid files never reach transport',async()=>{
  for (const [status,kind] of [[401,'access'],[403,'access'],[413,'invalid'],[415,'invalid'],[422,'invalid'],[429,'rate'],[503,'unavailable']] as const) {
    let count=0;
    await assert.rejects(sendMediaUpload(token,owner,'gift',await file(),new AbortController().signal,config,async()=>{count++;return new Response('private detail',{status});}),
      (error:unknown)=>error instanceof MediaUploadError && error.kind===kind && !error.message.includes('private detail'));
    assert.equal(count,1);
  }
  let count=0;
  await assert.rejects(sendMediaUpload(token,owner,'gift',new Blob(['<svg/>'],{type:'image/png'}),new AbortController().signal,config,async()=>{count++;return Response.json({path});}),MediaUploadError);
  assert.equal(count,0);
});
test('scope and closure protect uploads, prevent duplicates, abort on close and discard late responses',async(t)=>{
  let done!:(path:string)=>void; let signal:AbortSignal|undefined; let calls=0;
  const session=createPrivateSession(async()=>scope,undefined,async(secret,id,purpose,_file,s)=>{
    assert.equal(secret,token); assert.equal(id,owner); assert.equal(purpose,'gift'); signal=s; calls++; return new Promise((resolve)=>{done=resolve;});
  });
  t.after(()=>session.close());
  const blob=await file(),abort=new AbortController().signal;
  await assert.rejects(session.upload(owner,'gift',blob,abort),MediaUploadError);
  session.begin(token,'participant'); await session.verify();
  await assert.rejects(session.upload('other','gift',blob,abort),MediaUploadError);
  const pending=session.upload(owner,'gift',blob,abort);
  await assert.rejects(session.upload(owner,'gift',blob,abort),MediaUploadError);
  assert.ok(!JSON.stringify(session.snapshot()).includes(token)); session.close(); assert.equal(signal?.aborted,true);
  done(path); await assert.rejects(pending,MediaUploadError); assert.equal(session.snapshot().status,'closed'); assert.equal(calls,1);
});
