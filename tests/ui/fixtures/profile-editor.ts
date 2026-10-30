import { uiOrigin } from './origins';
import { readFile } from 'node:fs/promises';
import { expect,type Page } from '@playwright/test';
import type { EditableProfile } from '../../../src/domain/profile-editor';
import { editorFixture,fixtureOwner,fixtureCredential,api,sampleGift } from './gift-editor';
export function sampleProfile():EditableProfile{return {id:fixtureOwner,name:'Melyza',slug:'melyza',version:1,photo_url:null,photo_path:null,avatar_key:'star',personal_message:null,general_preferences:null};}
const cors={'Access-Control-Allow-Origin':uiOrigin,'Access-Control-Expose-Headers':'Retry-After','Cache-Control':'no-store'};
export async function profileEditorFixture(page:Page,initial=sampleProfile(),organizer=false){
  const gifts=await editorFixture(page,[{...sampleGift(),participant_id:initial.id}],organizer,initial.id);
  const state={profile:structuredClone(initial),writes:[] as Record<string,unknown>[],uploads:[] as string[],fault:'' as ''|'fields'|'lost'|'access'|'rate',field:'personal_message',retryAfter:'2',delay:0,uploadDelay:0,uploadFault:0,uploadRetryAfter:'2400',loadError:false,deniedAccess:false};
  await page.route(`${api}/rest/v1/participants?**`,async(route)=>{
    const query=new URL(route.request().url()).searchParams;
    if(query.get('slug')!==`eq.${initial.slug}`&&query.get('id')!==`eq.${initial.id}`)return route.fallback();
    // 500 exercises the explicit retry UI without the SDK's automatic 503 backoff.
    if(state.loadError)return route.fulfill({status:500,json:{message:'private query detail'},headers:cors});
    return route.fulfill({json:[{...state.profile,gifts:gifts.gifts}],headers:cors});
  });
  await page.route(`${api}/functions/v1/wishlist-api`,async(route)=>{
    if(route.request().method()==='OPTIONS')return route.fallback();
    const body=route.request().postDataJSON();
    if(body.action==='validate_access')return state.deniedAccess?route.fulfill({status:401,json:{error:{code:'ACCESS_UNAVAILABLE'}},headers:cors}):route.fallback();
    if(body.action!=='update_profile')return route.fallback();
    expect(route.request().headers()['x-edit-token']).toBe(fixtureCredential);expect(route.request().headers().authorization).toBeUndefined();expect(JSON.stringify(body)).not.toContain(fixtureCredential);
    expect(Object.keys(body).sort()).toEqual(['action','expected_version','participant_id','profile']);expect(body.profile).not.toHaveProperty('name');expect(body.profile).not.toHaveProperty('slug');
    state.writes.push(body);const fault=state.fault;state.fault='';
    if(state.delay)await new Promise((resolve)=>setTimeout(resolve,state.delay));
    if(body.participant_id!==initial.id||fault==='access')return route.fulfill({status:403,json:{error:{code:'FORBIDDEN'}},headers:cors});
    if(fault==='rate')return route.fulfill({status:429,json:{error:{code:'RATE_LIMITED'}},headers:{...cors,'Retry-After':state.retryAfter}});
    if(fault==='fields')return route.fulfill({status:422,json:{error:{message:'SQL private detail',fields:{[state.field]:'Revisa este dato antes de guardar.'}}},headers:cors});
    if(body.expected_version!==state.profile.version)return route.fulfill({status:409,json:{error:{code:'CONFLICT'}},headers:cors});
    state.profile={...state.profile,...body.profile,version:state.profile.version+1};
    return fault==='lost'?route.abort('failed'):route.fulfill({json:{participant:state.profile},headers:cors});
  });
  await page.route(`${api}/functions/v1/media-upload`,async(route)=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{...cors,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'content-type,apikey,x-edit-token,x-participant-id,x-media-purpose'}});
    expect(route.request().headers()['x-edit-token']).toBe(fixtureCredential);expect(route.request().headers()['x-participant-id']).toBe(initial.id);expect(route.request().headers()['x-media-purpose']).toBe('avatar');state.uploads.push('avatar');
    if(state.uploadDelay)await new Promise((resolve)=>setTimeout(resolve,state.uploadDelay));
    if(state.uploadFault)return route.fulfill({status:state.uploadFault,json:{error:{code:'UPLOAD_UNAVAILABLE'}},headers:{...cors,'Retry-After':state.uploadRetryAfter}});
    return route.fulfill({status:201,json:{path:`${initial.id}/avatar/33333333-3333-4333-8333-${String(state.uploads.length).padStart(12,'0')}.webp`},headers:cors});
  });
  const png=await readFile(new URL('../../fixtures/images/small.png',import.meta.url));
  await page.route(`${api}/storage/v1/object/public/wishlist-media/**`,(route)=>route.fulfill({body:png,contentType:'image/png'}));
  return {state,gifts};
}
export async function openProfileEditor(page:Page){await page.goto(`/acceso#token=${fixtureCredential}`);await page.getByRole('link',{name:'Editar mi perfil',exact:true}).click();await expect(page.getByRole('heading',{name:'El perfil de Melyza',exact:true})).toBeFocused();await expect(page.getByLabel('Mensaje personal',{exact:true})).toBeEnabled();}
