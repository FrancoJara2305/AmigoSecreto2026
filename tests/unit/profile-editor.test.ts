import test from 'node:test';
import assert from 'node:assert/strict';
import { profileDraft,profileRequest,profileErrors,parseEditableProfile,type EditableProfile } from '../../src/domain/profile-editor.ts';
import { sendProfileMutation,ProfileMutationError,loadEditableProfile } from '../../src/services/profile-editor.ts';
import { createPrivateSession } from '../../src/services/private-session.ts';
import type { AccessScope } from '../../src/domain/private-access.ts';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/domain/database.types.ts';
const owner='11111111-1111-4111-8111-000000000001',token='A'.repeat(43);
const profile:EditableProfile={id:owner,name:'Melyza',slug:'melyza',version:1,photo_url:null,photo_path:null,avatar_key:'star',personal_message:null,general_preferences:null};
const config={supabaseUrl:'http://127.0.0.1:54321',publishableKey:'sb_publishable_test_only',appUrl:'http://127.0.0.1:5173'};
const scope:AccessScope={tokenId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',accessType:'participant',participantId:owner,participantSlug:'melyza',expiresAt:null};

test('profile draft keeps inactive photos, normalizes empty text to null and only sends editable fields with exact version',()=>{
  const original={...profile,photo_url:'https://shop.example.com/avatar.png'};const draft=profileDraft(original);draft.photoSource='avatar';draft.personal_message='  Hola  ';draft.general_preferences='   ';
  const request=profileRequest(original,draft);assert.equal(draft.photo_url,original.photo_url);
  assert.deepEqual(request,{action:'update_profile',participant_id:owner,expected_version:1,profile:{photo_url:null,photo_path:null,avatar_key:'star',personal_message:'Hola',general_preferences:null}});
  assert.deepEqual(profileErrors(request),{});assert.equal(original.personal_message,null);
  assert.ok(profileErrors({...request,profile:{...request.profile,name:'Forbidden'}}).name);
});
test('profile validation enforces message/preferences limits, source exclusivity, HTTPS, avatar and own avatar purpose',()=>{
  const request=profileRequest(profile,profileDraft(profile));
  for(const [field,value] of [['personal_message','x'.repeat(501)],['general_preferences','x'.repeat(2001)],['avatar_key','unknown'],['photo_url','javascript:alert(1)'],['photo_path',`${owner}/gift/22222222-2222-4222-8222-000000000001.webp`]] as const)assert.ok(profileErrors({...request,profile:{...request.profile,[field]:value}})[field]);
  const path=`${owner}/avatar/22222222-2222-4222-8222-000000000001.webp`;
  assert.deepEqual(profileErrors({...request,profile:{...request.profile,photo_path:path}}),{});
  assert.ok(profileErrors({...request,profile:{...request.profile,photo_path:path,photo_url:'https://shop.example.com/avatar.png'}}).photo_path);
  assert.throws(()=>parseEditableProfile({...profile,photo_url:'https://shop.example.com/avatar.png',photo_path:path}));
});
test('profile reader requests current version by slug/UUID and excludes credentials and unrelated fields from parsed result',async()=>{
  const client=createClient<Database>(config.supabaseUrl,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url)=>{
    const query=new URL(String(url));assert.match(query.searchParams.get('select')??'',/version/);assert.ok(query.searchParams.has('slug')||query.searchParams.has('id'));
    return Response.json({...profile,token:'discard',display_order:3},{headers:{'Content-Type':'application/vnd.pgrst.object+json'}});
  }}});
  assert.deepEqual(await loadEditableProfile({slug:'melyza'},new AbortController().signal,client),profile);
  assert.deepEqual(await loadEditableProfile({id:owner},new AbortController().signal,client),profile);
  assert.equal(await loadEditableProfile({slug:'../bad'},new AbortController().signal,client),null);
});
test('profile transport keeps capability exclusively in header and returns only whitelisted owned newer receipt',async()=>{
  const request=profileRequest(profile,{...profileDraft(profile),personal_message:'Mi mensaje'});
  const result=await sendProfileMutation(token,request,new AbortController().signal,config,async(url,init)=>{
    assert.equal(String(url),`${config.supabaseUrl}/functions/v1/wishlist-api`);const headers=new Headers(init?.headers);assert.equal(headers.get('X-Edit-Token'),token);assert.equal(headers.get('Authorization'),null);assert.equal(headers.get('apikey'),config.publishableKey);
    assert.equal(init?.credentials,'omit');assert.equal(init?.cache,'no-store');assert.equal(init?.redirect,'error');assert.equal(init?.referrerPolicy,'no-referrer');assert.equal(JSON.stringify(init?.body).includes(token),false);
    assert.deepEqual(JSON.parse(String(init?.body)),request);return Response.json({participant:{...profile,version:2,personal_message:'Mi mensaje',token:'discard'}});
  });assert.equal(result.personal_message,'Mi mensaje');assert.equal('token' in result,false);
  for(const wrong of [{...profile,version:1},{...profile,id:'11111111-1111-4111-8111-000000000002',version:2},{...profile,version:2,photo_url:'http://localhost/x'}])await assert.rejects(sendProfileMutation(token,request,new AbortController().signal,config,async()=>Response.json({participant:wrong})),ProfileMutationError);
});
test('profile failures remain generic, bounded, never retry and only expose known field errors',async()=>{
  const request=profileRequest(profile,profileDraft(profile));
  for(const [status,kind] of [[401,'access'],[403,'access'],[404,'conflict'],[409,'conflict'],[429,'rate'],[503,'uncertain']] as const){let calls=0;
    await assert.rejects(sendProfileMutation(token,request,new AbortController().signal,config,async()=>{calls++;return new Response('provider-secret',{status,headers:{'Retry-After':'2400'}});}),
      (error:unknown)=>error instanceof ProfileMutationError&&error.kind===kind&&!error.message.includes('provider-secret')&&(kind!=='rate'||error.retryAfter===2400));assert.equal(calls,1);
  }
  await assert.rejects(sendProfileMutation(token,request,new AbortController().signal,config,async()=>Response.json({error:{fields:{personal_message:'Revisa tu mensaje',token:'secret'},message:'SQL private'}},{status:422})),
    (error:unknown)=>error instanceof ProfileMutationError&&assert.deepEqual(error.fields,{personal_message:'Revisa tu mensaje'})===undefined);
  await assert.rejects(sendProfileMutation(token,request,new AbortController().signal,config,async()=>new Response('x'.repeat(33000))),ProfileMutationError);
});
test('profile body cancellation terminates a stalled receipt and invalid payload never reaches transport',async()=>{
  const request=profileRequest(profile,profileDraft(profile));let count=0;
  await assert.rejects(sendProfileMutation(token,{...request,profile:{name:'Forbidden'}},new AbortController().signal,config,async()=>{count++;return Response.json({});}),ProfileMutationError);assert.equal(count,0);
  const abort=new AbortController();let cancelled=false;
  const pending=sendProfileMutation(token,request,abort.signal,config,async()=>new Response(new ReadableStream({cancel(){cancelled=true;}})));
  await new Promise((resolve)=>setTimeout(resolve,10));abort.abort();await assert.rejects(pending,ProfileMutationError);assert.equal(cancelled,true);
});
test('private profile writes reject foreign owners and duplicates; close/replacement abort and discard old receipts',async(t)=>{
  let done!:(value:EditableProfile)=>void,signal:AbortSignal|undefined,calls=0;
  const session=createPrivateSession(async()=>scope,undefined,undefined,undefined,async(secret,request,s)=>{assert.equal(secret,token);assert.equal(request.participant_id,owner);calls++;signal=s;return new Promise((resolve)=>{done=resolve;});});t.after(()=>session.close());
  const request=profileRequest(profile,profileDraft(profile)),abort=new AbortController().signal;
  await assert.rejects(session.updateProfile(request,abort),ProfileMutationError);session.begin(token,'participant');await session.verify();
  await assert.rejects(session.updateProfile({...request,participant_id:'other'},abort),ProfileMutationError);
  const pending=session.updateProfile(request,abort);await assert.rejects(session.updateProfile(request,abort),ProfileMutationError);session.close();assert.equal(signal?.aborted,true);done({...profile,version:2});await assert.rejects(pending,ProfileMutationError);assert.equal(calls,1);assert.equal(session.snapshot().status,'closed');
});
test('organizer can edit a selected profile and server denial removes the capability',async(t)=>{
  const session=createPrivateSession(async()=>({...scope,accessType:'organizer',participantId:null,participantSlug:null}),undefined,undefined,undefined,async()=>{throw new ProfileMutationError('access');});t.after(()=>session.close());session.begin(token,'organizer');await session.verify();
  await assert.rejects(session.updateProfile(profileRequest(profile,profileDraft(profile)),new AbortController().signal),ProfileMutationError);assert.equal(session.snapshot().status,'unavailable');
});
