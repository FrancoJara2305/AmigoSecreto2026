import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAdmin,suggestParticipantSlug,validEventDate } from '../../supabase/functions/_shared/admin-validation.ts';
import { createAccessHandler } from '../../supabase/functions/_shared/access-handler.ts';
import { generateToken,hashToken } from '../../supabase/functions/_shared/tokens.ts';
const id='11111111-1111-4111-8111-000000000001',neighbor='11111111-1111-4111-8111-000000000002',token=generateToken(),origin='http://localhost:5173';
const participant={id,name:'Melyza',slug:'melyza',version:1,display_order:0,avatar_key:'star',photo_path:null,photo_url:null,personal_message:null,general_preferences:null};
const request=(body:unknown)=>new Request('http://localhost/wishlist-api',{method:'POST',headers:{Origin:origin,'X-Edit-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('admin request shapes are closed, versioned and exact-target delete confirmations are mandatory',()=>{
  for(const body of [{action:'admin_list'},{action:'create_participant',participant_id:id,participant:{name:' Melyza '}},{action:'update_participant',participant_id:id,expected_version:1,participant:{name:'Mel'}},{action:'move_participant',participant_id:id,expected_version:1,direction:'up',neighbor_id:neighbor,neighbor_version:2},{action:'delete_participant',participant_id:id,expected_version:1,confirm_participant_id:id},{action:'update_event',expected_version:1,event:{title:'Intercambio',exchange_date:null}}])assert.equal(validateAdmin(body).ok,true);
  for(const body of [{action:'admin_list',limit:101},{action:'admin_list',offset:-1},{action:'create_participant',participant_id:id,participant:{name:'Melyza',token_hash:'secret'}},{action:'update_participant',participant_id:id,expected_version:0,participant:{name:'Melyza'}},{action:'delete_participant',participant_id:id,expected_version:1,confirm_participant_id:neighbor},{action:'move_participant',participant_id:id,expected_version:1,direction:'up',neighbor_id:id,neighbor_version:1},{action:'update_event',expected_version:1,event:{suggested_budget:100}},{action:'admin_list',is_admin:true}])assert.equal(validateAdmin(body).ok,false);
});
test('admin photo fields enforce owner/purpose, exclude mixed sources and defer initial file uploads until creation',()=>{
  const path=`${id}/avatar/${neighbor}.webp`,base={action:'update_participant',participant_id:id,expected_version:1};
  assert.equal(validateAdmin({...base,participant:{photo_path:path}}).ok,true);
  for(const p of [{photo_path:path.replace('/avatar/','/gift/')},{photo_path:`${neighbor}/avatar/${neighbor}.webp`},{photo_url:'http://localhost/x'},{photo_path:path,photo_url:'https://shop.example.com/x'}])assert.equal(validateAdmin({...base,participant:p}).ok,false);
  assert.equal(validateAdmin({action:'create_participant',participant_id:id,participant:{name:'A',photo_path:path}}).ok,false);
});
test('date-only calendar validation rejects rollovers offsets infinity and accepts clear/leap dates',()=>{
  for(const date of [null,'2028-02-29','2026-12-25','0001-01-01'])assert.equal(validEventDate(date),true);
  for(const date of ['2026-02-29','2026-04-31','2026-12-25T00:00:00Z','infinity','0000-01-01',42])assert.equal(validEventDate(date),false);
  assert.equal(suggestParticipantSlug('  Álice Peña  '),'alice-pena');assert.equal(suggestParticipantSlug('***'),'participante');assert.ok(suggestParticipantSlug('a'.repeat(200)).length<=90);
});
test('event and participant validation enforce text/order boundaries without touching reserved fields',()=>{
  const base={action:'update_participant',participant_id:id,expected_version:1};
  for(const p of [{name:'x'.repeat(81)},{slug:'Bad Slug'},{display_order:1.5},{display_order:2147483648},{personal_message:'x'.repeat(501)},{general_preferences:'x'.repeat(2001)}])assert.equal(validateAdmin({...base,participant:p}).ok,false);
  const v=validateAdmin({...base,participant:{name:' Melyza ',display_order:2147483647,photo_url:'https://shop.example.com/a'}});assert.equal(v.ok,true);if(v.ok){assert.equal(v.args.p_payload.name,'Melyza');assert.equal(v.args.p_payload.photo_path,null);}
  assert.equal(validateAdmin({action:'update_event',expected_version:1,event:{welcome_message:''}}).ok,false);
});
test('admin dispatch uses only a hash and whitelists nested participants, link metadata and event response',async()=>{
  const handler=createAccessHandler({allowedOrigins:[origin],appBaseUrl:origin,callRpc:async()=>({ok:false}),callAdminRpc:async(args)=>{
    assert.equal(args.p_token_hash,await hashToken(token));assert.ok(!JSON.stringify(args).includes(token));assert.equal(args.p_participant_id,null);
    return {ok:true,participants:[{...participant,token_hash:'secret',gift_count:2,link:{status:'active',expires_at:null,token_hash:'secret',private_link:'secret'}}],total:1,limit:100,offset:0,event:{id:1,title:'Evento',welcome_message:'Hola',exchange_date:'2026-12-25',version:1,suggested_budget:100},token_hash:'secret'};
  }});
  const response=await handler(request({action:'admin_list'}));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  const body=await response.json();assert.equal(body.participants[0].gift_count,2);assert.deepEqual(body.participants[0].link,{status:'active',expires_at:null});assert.ok(!JSON.stringify(body).includes('secret'));assert.equal(body.event.suggested_budget,undefined);
});
test('new write dispatch preserves denial/quota status and never generates links or retries',async()=>{
  for(const status of [401,403,404,409,422,429]){let calls=0;
    const handler=createAccessHandler({allowedOrigins:[origin],appBaseUrl:origin,callRpc:async()=>({ok:false}),callAdminRpc:async()=>{calls++;return {ok:false,status,error:status===429?'RATE_LIMITED':'FORBIDDEN',retry_after:2400,private_link:'secret'};}});
    const response=await handler(request({action:'update_participant',participant_id:id,expected_version:1,participant:{name:'Mel'}}));assert.equal(response.status,status);assert.equal(calls,1);assert.ok(!(await response.text()).includes('secret'));if(status===429)assert.equal(response.headers.get('Retry-After'),'2400');
  }
});
test('bad admin bodies and missing adapter never reach SQL or fall through to legacy write actions',async()=>{
  let calls=0;const handler=createAccessHandler({allowedOrigins:[origin],appBaseUrl:origin,callRpc:async()=>{calls++;return {ok:false};},callAdminRpc:async()=>{calls++;return {ok:true};}});
  assert.equal((await handler(request({action:'delete_participant',participant_id:id,expected_version:1,confirm_participant_id:neighbor}))).status,422);assert.equal(calls,0);
  const missing=createAccessHandler({allowedOrigins:[origin],appBaseUrl:origin,callRpc:async()=>{calls++;return {ok:false};}});assert.equal((await missing(request({action:'admin_list'}))).status,503);assert.equal(calls,0);
});
test('create/event/move/delete receipts expose only their contract',async()=>{
  const examples=[{body:{action:'create_participant',participant_id:id,participant:{name:'Melyza'}},result:{participant:{...participant,token_hash:'secret'}},expected:201},
    {body:{action:'update_event',expected_version:1,event:{title:'Evento'}},result:{event:{id:1,title:'Evento',welcome_message:'Hola',exchange_date:null,version:2,suggested_budget:123}},expected:200},
    {body:{action:'move_participant',participant_id:id,expected_version:1,direction:'up',neighbor_id:neighbor,neighbor_version:1},result:{participants:[{...participant,token_hash:'secret'}]},expected:200},
    {body:{action:'delete_participant',participant_id:id,expected_version:1,confirm_participant_id:id},result:{deleted:{id,slug:'melyza',gifts_removed:1,links_removed:1,media_queued:1,token_hash:'secret'}},expected:200}];
  for(const example of examples){const handler=createAccessHandler({allowedOrigins:[origin],appBaseUrl:origin,callRpc:async()=>({ok:false}),callAdminRpc:async()=>({ok:true,...example.result})});const response=await handler(request(example.body));assert.equal(response.status,example.expected);const text=await response.text();assert.ok(!/token_hash|secret|suggested_budget/.test(text));}
});
