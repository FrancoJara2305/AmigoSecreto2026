import { validateAdmin } from '../../supabase/functions/_shared/admin-validation.ts';
import { isToken } from '../../supabase/functions/_shared/tokens.ts';
import { parseEditableProfile,type EditableProfile } from '../domain/profile-editor.ts';
import { validEventDate } from '../../supabase/functions/_shared/admin-validation.ts';
import { readPublicConfig,type PublicConfig } from './public-config.ts';
import { getPublicSupabase } from './supabase.ts';
import { retryAfterSeconds } from '../domain/retry-after.ts';

export type AdminPerson=EditableProfile & {display_order:number};
export type AdminRow=AdminPerson & {gift_count:number;link:{status:'none'|'active'|'expired'|'revoked';expires_at:string|null}};
export type AdminEvent={id:number;title:string;welcome_message:string;exchange_date:string|null;version:number};
export type AdminSnapshot={participants:AdminRow[];total:number;limit:number;offset:number;event:AdminEvent};
export type AdminRequest={action:string;[key:string]:unknown};
export type AdminResult={participant?:AdminPerson;event?:AdminEvent;snapshot?:AdminSnapshot;private_link?:string;token_id?:string;expires_at?:string|null};
export class AdminError extends Error {
  readonly kind:'fields'|'conflict'|'uncertain'|'access'|'rate'|'busy';readonly fields:Record<string,string>;readonly retryAfter:number;
  constructor(kind:AdminError['kind'],fields:Record<string,string>={},retryAfter=0){super('Organizer operation unavailable');this.kind=kind;this.fields=fields;this.retryAfter=retryAfter;}
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min=0)=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=2147483647;
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const timestamp=(v:unknown)=>v===null||typeof v==='string'&&Number.isFinite(Date.parse(v));
export function parseAdminPerson(raw:unknown):AdminPerson {
  if(!record(raw)||!integer(raw.display_order))throw new AdminError('uncertain');
  try{return {...parseEditableProfile(raw),display_order:Number(raw.display_order)};}catch{throw new AdminError('uncertain');}
}
function parseEvent(raw:unknown):AdminEvent {
  if(!record(raw)||raw.id!==1||!integer(raw.version,1)||typeof raw.title!=='string'||!raw.title.trim()||Array.from(raw.title).length>100||typeof raw.welcome_message!=='string'||!raw.welcome_message.trim()||Array.from(raw.welcome_message).length>500||!validEventDate(raw.exchange_date))throw new AdminError('uncertain');
  return {id:1,title:raw.title,welcome_message:raw.welcome_message,exchange_date:raw.exchange_date as string|null,version:Number(raw.version)};
}
export function parseAdminResult(request:AdminRequest,raw:unknown,appOrigin:string):AdminResult {
  if(!record(raw))throw new AdminError('uncertain');
  if(request.action==='admin_list'){
    if(!Array.isArray(raw.participants)||raw.participants.length>100||!integer(raw.total)||!integer(raw.offset)||!integer(raw.limit,1)||Number(raw.limit)>100||raw.offset!==(request.offset??0)||raw.limit!==(request.limit??100)||raw.participants.length>Number(raw.limit)||Number(raw.total)<Number(raw.offset)+raw.participants.length&&raw.participants.length>0)throw new AdminError('uncertain');
    const participants=raw.participants.map((p:unknown):AdminRow=>{
      if(!record(p)||!integer(p.gift_count)||Number(p.gift_count)>3||!record(p.link)||!['none','active','expired','revoked'].includes(String(p.link.status))||!timestamp(p.link.expires_at))throw new AdminError('uncertain');
      return {...parseAdminPerson(p),gift_count:Number(p.gift_count),link:{status:p.link.status as AdminRow['link']['status'],expires_at:p.link.expires_at as string|null}};
    });
    if(new Set(participants.map((p)=>p.id)).size!==participants.length)throw new AdminError('uncertain');
    return {snapshot:{participants,total:Number(raw.total),offset:Number(raw.offset),limit:Number(raw.limit),event:parseEvent(raw.event)}};
  }
  if(request.action==='update_event'){
    const event=parseEvent(raw.event);if(event.version<=Number(request.expected_version))throw new AdminError('uncertain');return {event};
  }
  if(request.action==='create_participant'||request.action==='update_participant'){
    const participant=parseAdminPerson(raw.participant);if(participant.id!==request.participant_id||request.action==='update_participant'&&participant.version<=Number(request.expected_version))throw new AdminError('uncertain');return {participant};
  }
  if(request.action==='move_participant'){
    if(raw.reload_required!==true||!Array.isArray(raw.participants)||raw.participants.length!==2)throw new AdminError('uncertain');
    const rows=raw.participants.map(parseAdminPerson),person=rows.find((p)=>p.id===request.participant_id),neighbor=rows.find((p)=>p.id===request.neighbor_id);
    // Normalizing tied ranks can leave one numeric rank (and its version) unchanged.
    if(new Set(rows.map((p)=>p.id)).size!==2||!person||!neighbor||person.version<Number(request.expected_version)||neighbor.version<Number(request.neighbor_version)||(request.direction==='up'?person.display_order>=neighbor.display_order:person.display_order<=neighbor.display_order))throw new AdminError('uncertain');return {};
  }
  if(request.action==='delete_participant'){
    if(!record(raw.deleted)||raw.deleted.id!==request.participant_id||!['gifts_removed','links_removed','media_queued'].every((key)=>integer((raw.deleted as Record<string,unknown>)[key])))throw new AdminError('uncertain');return {};
  }
  if(request.action==='revoke_participant_link'){if(!integer(raw.revoked))throw new AdminError('uncertain');return {};}
  if(typeof raw.private_link!=='string'||!uuid(raw.token_id)||!timestamp(raw.expires_at))throw new AdminError('uncertain');
  const url=new URL(raw.private_link),organizer=request.action==='rotate_organizer_link';
  if(url.origin!==appOrigin||url.username||url.password||url.search||url.pathname!==(organizer?'/organizador/acceso':'/acceso')||!url.hash.startsWith('#token=')||!isToken(url.hash.slice(7)))throw new AdminError('uncertain');
  return {private_link:url.href,token_id:raw.token_id as string,expires_at:raw.expires_at as string|null};
}
async function boundedJson(response:Response,signal:AbortSignal):Promise<unknown> {
  const reader=response.body?.getReader();if(!reader)throw new AdminError('uncertain');let bytes=0,text='';const decoder=new TextDecoder();
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{signal.throwIfAborted();while(true){const part=await reader.read();signal.throwIfAborted();if(part.done)break;bytes+=part.value.length;if(bytes>1024*1024){await reader.cancel();throw new AdminError('uncertain');}text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}
  finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}
export async function sendAdmin(token:string,request:AdminRequest,signal:AbortSignal,config?:PublicConfig,fetcher:typeof fetch=fetch,appOrigin=globalThis.location?.origin):Promise<AdminResult> {
  const lifecycle=['issue_participant_link','revoke_participant_link','rotate_organizer_link'].includes(request.action);
  if(lifecycle){if(Object.keys(request).some((key)=>!['action','participant_id'].includes(key))||(request.action==='rotate_organizer_link'?request.participant_id!==undefined:!uuid(request.participant_id)))throw new AdminError('fields');}
  else{const result=validateAdmin(request);if(!result.ok)throw new AdminError('fields',result.fields);}
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(12000)]);
  try{
    deadline.throwIfAborted();const settings=config??readPublicConfig(import.meta.env);
    const response=await fetcher(`${settings.supabaseUrl}/functions/v1/wishlist-api`,{method:'POST',headers:{'Content-Type':'application/json',apikey:settings.publishableKey,'X-Edit-Token':token},body:JSON.stringify(request),credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:deadline});
    if(!response.ok){if(response.status===422){const raw=await boundedJson(response,deadline) as {error?:{fields?:unknown}};const fields=record(raw?.error?.fields)?Object.fromEntries(Object.entries(raw.error.fields).filter(([k,v])=>/^(participant\.(name|slug|display_order|photo_url|photo_path|avatar_key|personal_message|general_preferences)|event\.(title|welcome_message|exchange_date))$/.test(k)&&typeof v==='string'&&v.length<=300)):{};throw new AdminError('fields',fields as Record<string,string>);}
      await response.body?.cancel();throw new AdminError([401,403].includes(response.status)?'access':[404,409].includes(response.status)?'conflict':response.status===429?'rate':'uncertain',{},response.status===429?retryAfterSeconds(response.headers.get('Retry-After')):0);}
    return parseAdminResult(request,await boundedJson(response,deadline),appOrigin);
  }catch(error){if(error instanceof AdminError)throw error;throw new AdminError('uncertain');}
}
export async function loadAdminPerson(id:string,signal:AbortSignal):Promise<AdminPerson|null> {
  if(!uuid(id))return null;
  const {data}=await getPublicSupabase().from('participants').select('id,name,slug,photo_path,photo_url,avatar_key,personal_message,general_preferences,display_order,version').eq('id',id).abortSignal(AbortSignal.any([signal,AbortSignal.timeout(12000)])).maybeSingle().throwOnError();
  return data?parseAdminPerson(data):null;
}
