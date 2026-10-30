import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicDataClient } from '../../src/services/supabase.ts';
import { loadCatalogue } from '../../src/services/catalogue.ts';
import { loadPublicProfile } from '../../src/services/profile.ts';

const config={supabaseUrl:'http://127.0.0.1:54321',appUrl:'http://localhost:5173',publishableKey:'sb_publishable_fixture_only'};
test('public REST client uses the same two aggregate reads without session, cookies or private headers',async()=>{
  const calls:URL[]=[];
  const client=createPublicDataClient(config,async(input,init)=>{
    const url=new URL(String(input));calls.push(url);
    const headers=new Headers(init?.headers);
    assert.equal(init?.method,'GET');assert.equal(init?.credentials,'omit');assert.equal(init?.referrerPolicy,'no-referrer');
    assert.equal(headers.get('apikey'),config.publishableKey);assert.equal(headers.get('Authorization'),`Bearer ${config.publishableKey}`);
    assert.equal(headers.get('X-Edit-Token'),null);assert.equal(headers.get('Cookie'),null);assert.ok(init?.signal);
    return Response.json(url.pathname.endsWith('/participants')?[]:{title:'Evento',welcome_message:'Bienvenidos'});
  });
  const result=await loadCatalogue(new AbortController().signal,client);
  assert.equal(result.participants.length,0);assert.deepEqual(calls.map((url)=>url.pathname),['/rest/v1/participants','/rest/v1/event_settings']);
  assert.equal(calls[0].searchParams.get('select'),'id,name,slug,photo_path,photo_url,avatar_key,display_order,gifts(count)');
});

test('public REST profile keeps one nested query and propagates provider rejection',async()=>{
  let count=0;
  const client=createPublicDataClient(config,async(input)=>{
    count++;const url=new URL(String(input));assert.equal(url.searchParams.get('slug'),'eq.melyza');assert.match(url.searchParams.get('select')!,/gifts\(\*\)/);
    return Response.json({message:'Rejected by permissions'},{status:403});
  });
  await assert.rejects(loadPublicProfile('melyza',new AbortController().signal,client));assert.equal(count,1);
});

test('public REST factory rejects privileged/malformed configuration before making a request',()=>{
  for(const publishableKey of ['sb_secret_fixture','invalid'])assert.throws(()=>createPublicDataClient({...config,publishableKey}));
  assert.throws(()=>createPublicDataClient({...config,supabaseUrl:'http://remote.example.com'}));
});
