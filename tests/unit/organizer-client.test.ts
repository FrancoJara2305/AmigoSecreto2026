import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminError,parseAdminResult,sendAdmin,type AdminRequest } from '../../src/services/organizer.ts';
import { createPrivateSession } from '../../src/services/private-session.ts';
import type { AccessScope } from '../../src/domain/private-access.ts';
const token='A'.repeat(43),replacement='B'.repeat(42)+'A',id='11111111-1111-4111-8111-000000000001',origin='http://localhost:5179';
const config={supabaseUrl:'http://127.0.0.1:54421',publishableKey:'sb_publishable_fixture',appUrl:origin};
const person={id,name:'Melyza',slug:'melyza',version:2,display_order:1,photo_url:null,photo_path:null,avatar_key:'star',personal_message:null,general_preferences:null};
const event={id:1,title:'Nuestro intercambio',welcome_message:'Bienvenidos',exchange_date:null,version:2};
const row={...person,gift_count:0,link:{status:'none',expires_at:null}};
const scope:AccessScope={tokenId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',accessType:'organizer',participantId:null,participantSlug:null,expiresAt:null};
const signal=()=>new AbortController().signal;
test('administrative transport uses a public key and capability header only, accepts bounded snapshots and strips extra fields',async()=>{
  const result=await sendAdmin(token,{action:'admin_list'},signal(),config,async(url,init)=>{
    assert.equal(String(url),`${config.supabaseUrl}/functions/v1/wishlist-api`);const headers=new Headers(init?.headers);assert.equal(headers.get('x-edit-token'),token);assert.equal(headers.get('authorization'),null);assert.equal(headers.get('apikey'),config.publishableKey);assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');assert.deepEqual(JSON.parse(String(init?.body)),{action:'admin_list'});
    return Response.json({participants:[{...row,token_hash:'secret',link:{...row.link,private_link:'secret'}}],event:{...event,suggested_budget:100},total:1,limit:100,offset:0,private_link:'secret'});
  },origin);
  assert.deepEqual(result.snapshot?.participants,[row]);assert.deepEqual(result.snapshot?.event,event);assert.ok(!JSON.stringify(result).includes('secret'));
  for(const raw of [{participants:[row,row],total:2,limit:100,offset:0,event},{participants:[{...row,gift_count:4}],total:1,limit:100,offset:0,event},{participants:[],total:0,limit:100,offset:0,event:{...event,exchange_date:'2026-02-30'}}])assert.throws(()=>parseAdminResult({action:'admin_list'},raw,origin));
});
test('administrative invalid fields never reach the network and response identities/versions must match',async()=>{
  let calls=0;const fetcher:typeof fetch=async()=>{calls++;return Response.json({participant:person});};
  for(const request of [{action:'create_participant',participant_id:id,participant:{name:'Melyza',token:'secret'}},{action:'update_event',expected_version:1,event:{suggested_budget:100}},{action:'issue_participant_link',participant_id:'other'},{action:'rotate_organizer_link',participant_id:id}])await assert.rejects(sendAdmin(token,request,signal(),config,fetcher,origin),AdminError);assert.equal(calls,0);
  const request={action:'update_participant',participant_id:id,expected_version:2,participant:{name:'Melyza'}};
  assert.throws(()=>parseAdminResult(request,{participant:person},origin),AdminError);assert.throws(()=>parseAdminResult({...request,expected_version:1},{participant:{...person,id:'other'}},origin),AdminError);
  assert.deepEqual(parseAdminResult({...request,expected_version:1},{participant:{...person,secret:'removed'}},origin),{participant:person});
});
test('new private links must use the exact application origin, entry route, token encoding and no query',()=>{
  const request={action:'rotate_organizer_link'},good={private_link:`${origin}/organizador/acceso#token=${replacement}`,token_id:scope.tokenId,expires_at:null};
  assert.equal(parseAdminResult(request,good,origin).private_link,good.private_link);
  for(const link of [`https://evil.test/organizador/acceso#token=${replacement}`,`${origin}/acceso#token=${replacement}`,`${origin}/organizador/acceso?token=x#token=${replacement}`,`${origin}/organizador/acceso#token=wrong`,`${origin}/organizador/acceso#token=${replacement}&x=1`])assert.throws(()=>parseAdminResult(request,{...good,private_link:link},origin));
  assert.throws(()=>parseAdminResult(request,{...good,token_id:'other'},origin));
});
test('move receipt accepts a tied-rank normalization with one unchanged version and enforces the resulting direction',()=>{
  const neighbor={...person,id:'11111111-1111-4111-8111-000000000002',display_order:1,version:3},moving={...person,display_order:0};
  const request={action:'move_participant',participant_id:id,expected_version:2,neighbor_id:neighbor.id,neighbor_version:2,direction:'up'};
  assert.deepEqual(parseAdminResult(request,{participants:[moving,neighbor],reload_required:true},origin),{});
  assert.throws(()=>parseAdminResult(request,{participants:[person,{...neighbor,display_order:0}],reload_required:true},origin));
});
test('errors remain generic, honor Retry-After, whitelist fields and never retry mutations',async()=>{
  for(const [status,kind] of [[401,'access'],[403,'access'],[404,'conflict'],[409,'conflict'],[429,'rate'],[503,'uncertain']] as const){let calls=0;
    await assert.rejects(sendAdmin(token,{action:'admin_list'},signal(),config,async()=>{calls++;return new Response('database secret',{status,headers:{'Retry-After':'2400'}});},origin),(e:unknown)=>e instanceof AdminError&&e.kind===kind&&!e.message.includes('secret')&&(kind!=='rate'||e.retryAfter===2400));assert.equal(calls,1);}
  await assert.rejects(sendAdmin(token,{action:'admin_list'},signal(),config,async()=>Response.json({error:{fields:{'participant.name':'Revisa este nombre',token:'secret'},message:'SQL'}},{status:422}),origin),(e:unknown)=>e instanceof AdminError&&assert.deepEqual(e.fields,{'participant.name':'Revisa este nombre'})===undefined);
});
test('oversized and stalled receipts fail safely and cancellation stops reading',async()=>{
  await assert.rejects(sendAdmin(token,{action:'admin_list'},signal(),config,async()=>new Response('x'.repeat(1024*1024+1)),origin),AdminError);
  let cancelled=false;const abort=new AbortController();const pending=sendAdmin(token,{action:'admin_list'},abort.signal,config,async()=>new Response(new ReadableStream({cancel(){cancelled=true;}})),origin);await new Promise((r)=>setTimeout(r,10));abort.abort();await assert.rejects(pending,AdminError);assert.equal(cancelled,true);
});
test('session requires organizer, blocks duplicates, aborts on close and discards late administrative replies',async(t)=>{
  let done!:(value:{})=>void,captured:AbortSignal|undefined,calls=0;
  const session=createPrivateSession(async()=>scope,undefined,undefined,undefined,undefined,async(secret,_request,s)=>{assert.equal(secret,token);captured=s;calls++;return new Promise((resolve)=>{done=resolve;});});t.after(()=>session.close());
  await assert.rejects(session.admin({action:'admin_list'},signal()),AdminError);session.begin(token,'organizer');await session.verify();const pending=session.admin({action:'admin_list'},signal());await assert.rejects(session.admin({action:'admin_list'},signal()),AdminError);session.close();assert.equal(captured?.aborted,true);done({});await assert.rejects(pending,AdminError);assert.equal(session.snapshot().status,'closed');assert.equal(calls,1);
  const personal=createPrivateSession(async()=>({...scope,accessType:'participant',participantId:id,participantSlug:'melyza'}));t.after(()=>personal.close());personal.begin(token,'participant');await personal.verify();await assert.rejects(personal.admin({action:'admin_list'},signal()),AdminError);
});
test('rotation replaces the credential in memory, validates it and later operations use only the replacement',async(t)=>{
  const seen:string[]=[],validated:string[]=[];
  const session=createPrivateSession(async(secret)=>{validated.push(secret);return {...scope,tokenId:secret===replacement?'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb':scope.tokenId};},undefined,undefined,undefined,undefined,async(secret,request)=>{seen.push(secret);return request.action==='rotate_organizer_link'?{private_link:`${origin}/organizador/acceso#token=${replacement}`}:{snapshot:{participants:[],event,total:0,limit:100,offset:0}};});t.after(()=>session.close());
  session.begin(token,'organizer');await session.verify();await session.admin({action:'rotate_organizer_link'},signal());await session.admin({action:'admin_list'},signal());assert.deepEqual(seen,[token,replacement]);assert.deepEqual(validated,[token,replacement]);assert.ok(!JSON.stringify(session.snapshot()).includes(replacement));
});
test('uncertain rotation removes access; rate limit preserves it; denied administration removes it',async(t)=>{
  for(const kind of ['uncertain','rate','access'] as const){const session=createPrivateSession(async()=>scope,undefined,undefined,undefined,undefined,async()=>{throw new AdminError(kind);});t.after(()=>session.close());session.begin(token,'organizer');await session.verify();await assert.rejects(session.admin({action:'rotate_organizer_link'} as AdminRequest,signal()),AdminError);assert.equal(session.snapshot().status,kind==='rate'?'ready':'unavailable');}
});
test('cancelling a rotation with unknown result also discards the old credential',async(t)=>{
  const session=createPrivateSession(async()=>scope,undefined,undefined,undefined,undefined,async(_token,_request,signal)=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new AdminError('uncertain')),{once:true});}));t.after(()=>session.close());
  session.begin(token,'organizer');await session.verify();const abort=new AbortController(),pending=session.admin({action:'rotate_organizer_link'},abort.signal);abort.abort();await assert.rejects(pending,AdminError);assert.equal(session.snapshot().status,'unavailable');
});
