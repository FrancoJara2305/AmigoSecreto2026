import { uiOrigin } from './origins';
import type { AdminRow } from '../../../src/services/organizer';
import { expect,type Page } from '@playwright/test';
import { profileEditorFixture,sampleProfile } from './profile-editor';
import { api,fixtureCredential,fixtureOwner } from './gift-editor';
import { suggestParticipantSlug } from '../../../supabase/functions/_shared/admin-validation';
export const replacement='B'.repeat(42)+'A';
const cors={'Access-Control-Allow-Origin':uiOrigin,'Access-Control-Expose-Headers':'Retry-After','Cache-Control':'no-store'};
export async function organizerFixture(page:Page){
  const profile=await profileEditorFixture(page,sampleProfile(),true);
  const state={people:[{...sampleProfile(),display_order:0,gift_count:1,link:{status:'none',expires_at:null}},{...sampleProfile(),id:'11111111-1111-4111-8111-000000000002',name:'Karina',slug:'karina',display_order:1,gift_count:0,link:{status:'active',expires_at:null}}] as AdminRow[],event:{id:1,title:'Nuestro intercambio',welcome_message:'Una pequeña ilusión para todos',exchange_date:null as string|null,version:1},writes:[] as Record<string,any>[],credential:fixtureCredential,denied:false,personal:false,fault:0,lost:false,delay:0,readFault:0};
  await page.route(`${api}/rest/v1/participants?**`,async(route)=>{
    const q=new URL(route.request().url()).searchParams,filter=q.get('id')??q.get('slug');
    if(!filter)return route.fallback();const person=state.people.find((p)=>filter===`eq.${p.id}`||filter===`eq.${p.slug}`);return route.fulfill({json:person?[{...person,gifts:person.id===fixtureOwner?profile.gifts.gifts:[]}]:[],headers:cors});
  });
  await page.route(`${api}/functions/v1/wishlist-api`,async(route)=>{
    if(route.request().method()==='OPTIONS')return route.fallback();const body=route.request().postDataJSON(),action=body.action;
    if(action==='update_profile'||['create_gift','update_gift','delete_gift'].includes(action))return route.fallback();
    expect(route.request().headers()['x-edit-token']).toBe(state.credential);expect(route.request().headers().authorization).toBeUndefined();expect(JSON.stringify(body)).not.toContain(state.credential);
    if(state.denied)return route.fulfill({status:401,json:{error:{}},headers:cors});
    if(action==='validate_access')return route.fulfill({json:{access:{token_id:state.credential===replacement?'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',access_type:state.personal?'participant':'organizer',participant_id:state.personal?fixtureOwner:null,participant_slug:state.personal?'melyza':null,expires_at:null}},headers:cors});
    if(action==='admin_list'){if(state.readFault)return route.fulfill({status:state.readFault,json:{error:{}},headers:{...cors,'Retry-After':'1'}});const offset=body.offset??0,limit=body.limit??100;return route.fulfill({json:{participants:state.people.slice().sort((a,b)=>a.display_order-b.display_order).slice(offset,offset+limit),total:state.people.length,offset,limit,event:state.event},headers:cors});}
    state.writes.push(body);if(state.delay)await new Promise((r)=>setTimeout(r,state.delay));
    if(state.fault){const status=state.fault;state.fault=0;return route.fulfill({status,json:{error:{fields:{'participant.name':'Revisa el nombre'},message:'SQL secret'}},headers:{...cors,'Retry-After':'2'}});}
    const person=state.people.find((p)=>p.id===body.participant_id);
    const finish=async(json:unknown,status=200)=>{if(state.lost){state.lost=false;return route.abort('failed');}return route.fulfill({json,status,headers:cors});};
    if(action==='create_participant'){
      if(person)return route.fulfill({status:409,json:{error:{}},headers:cors});let slug=body.participant.slug??suggestParticipantSlug(body.participant.name),n=2;const base=slug;while(state.people.some((p)=>p.slug===slug))slug=`${base}-${n++}`;
      const created={...sampleProfile(),...body.participant,id:body.participant_id,slug,version:1,display_order:body.participant.display_order??state.people.length,gift_count:0,link:{status:'none',expires_at:null}};state.people.push(created);return finish({participant:created},201);
    }
    if(action==='update_event'){if(body.expected_version!==state.event.version)return route.fulfill({status:409,json:{error:{}},headers:cors});state.event={...state.event,...body.event,version:state.event.version+1};return finish({event:state.event});}
    if(action==='rotate_organizer_link'){state.credential=replacement;return finish({private_link:`${uiOrigin}/organizador/acceso#token=${replacement}`,token_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',expires_at:null});}
    if(!person)return route.fulfill({status:404,json:{error:{}},headers:cors});
    if(action==='issue_participant_link'){person.link.status='active';return finish({private_link:`${uiOrigin}/acceso#token=${replacement}`,token_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',expires_at:null});}
    if(action==='revoke_participant_link'){person.link.status='revoked';return finish({revoked:1});}
    if(body.expected_version!==person.version)return route.fulfill({status:409,json:{error:{}},headers:cors});
    if(action==='update_participant'){Object.assign(person,body.participant,{version:person.version+1});return finish({participant:person});}
    if(action==='delete_participant'){state.people=state.people.filter((p)=>p.id!==person.id);return finish({deleted:{id:person.id,slug:person.slug,gifts_removed:person.gift_count,links_removed:1,media_queued:0}});}
    if(action==='move_participant'){const neighbor=state.people.find((p)=>p.id===body.neighbor_id)!;[neighbor.display_order,person.display_order]=[person.display_order,neighbor.display_order];neighbor.version++;person.version++;return finish({participants:[person,neighbor],reload_required:true});}
    return route.fulfill({status:422,json:{error:{}},headers:cors});
  });
  return {state,profile};
}
export async function openOrganizer(page:Page){await page.goto(`/organizador/acceso#token=${fixtureCredential}`);await expect(page.getByRole('heading',{name:'Organizar nuestro intercambio',exact:true})).toBeFocused();await expect(page.getByRole('list',{name:'Participantes del intercambio'})).toBeVisible();}
