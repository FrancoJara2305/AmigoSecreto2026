import { validateMutation } from './mutation-validation.ts';
export const adminActions=new Set(['admin_list','create_participant','update_participant','move_participant','delete_participant','update_event']);
export type AdminAction='admin_list'|'create_participant'|'update_participant'|'move_participant'|'delete_participant'|'update_event';
export type AdminRpcArgs={p_action:AdminAction;p_token_hash:string;p_participant_id:string|null;p_expected_version:number|null;p_payload:Record<string,unknown>};
type Validation={ok:true;args:Omit<AdminRpcArgs,'p_token_hash'>}|{ok:false;fields:Record<string,string>};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const integer=(v:unknown,min=0,max=2147483647)=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max;
export function suggestParticipantSlug(name:string):string{return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90).replace(/-+$/g,'')||'participante';}
export function validEventDate(value:unknown):boolean {
  if(value===null)return true;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000'))return false;
  const parsed=new Date(`${value}T00:00:00Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
export function validateAdmin(value:Record<string,unknown>):Validation {
  const fields:Record<string,string>={};const action=value.action as AdminAction;
  if(!adminActions.has(action))return {ok:false,fields:{action:'Operación no permitida.'}};
  const listing=action==='admin_list',event=action==='update_event',creating=action==='create_participant';
  const allowed=['action',...(listing?['limit','offset']:event?['expected_version','event']:['participant_id',...(creating?[]:['expected_version']),...(action.endsWith('_participant')&&['create_participant','update_participant'].includes(action)?['participant']:action==='move_participant'?['direction','neighbor_id','neighbor_version']:['confirm_participant_id'])])];
  if(Object.keys(value).some((key)=>!allowed.includes(key)))fields.request='Hay campos no permitidos.';
  if(!listing&&!event&&!uuid(value.participant_id))fields.participant_id='Participante inválido.';
  if(!listing&&!creating&&!integer(value.expected_version,1))fields.expected_version='Revisa la versión actual antes de guardar.';
  let payload:Record<string,unknown>={};
  if(listing){if(value.limit!==undefined&&!integer(value.limit,1,100))fields.limit='Usa un tamaño de página de 1 a 100.';if(value.offset!==undefined&&!integer(value.offset))fields.offset='Página inválida.';payload={limit:value.limit??100,offset:value.offset??0};}
  else if(action==='move_participant'){
    if(!['up','down'].includes(String(value.direction)))fields.direction='Elige Subir o Bajar.';
    if(!uuid(value.neighbor_id)||value.neighbor_id===value.participant_id)fields.neighbor_id='Revisa el participante contiguo.';
    if(!integer(value.neighbor_version,1))fields.neighbor_version='Revisa la versión del participante contiguo.';
    payload={direction:value.direction,neighbor_id:value.neighbor_id,neighbor_version:value.neighbor_version};
  }else if(action==='delete_participant'){
    if(!uuid(value.confirm_participant_id)||value.confirm_participant_id!==value.participant_id)fields.confirm_participant_id='Confirma exactamente el participante que deseas eliminar.';payload={confirm_participant_id:value.confirm_participant_id};
  }else {
    const raw=event?value.event:value.participant;
    if(!record(raw)||!Object.keys(raw).length)fields.payload='Incluye los datos que deseas guardar.';
    else for(const [key,item] of Object.entries(raw)){
      const prefix=event?'event.':'participant.';
      if((event?['title','welcome_message','exchange_date']:['name','slug','display_order','photo_url','photo_path','avatar_key','personal_message','general_preferences']).includes(key)===false){fields[prefix+key]='Campo no permitido.';continue;}
      if(key==='display_order'){if(!integer(item))fields[prefix+key]='Usa un orden entero no negativo.';else payload[key]=item;}
      else if(key==='exchange_date'){if(!validEventDate(item))fields[prefix+key]='Usa una fecha real con formato AAAA-MM-DD, o deja la fecha vacía.';else payload[key]=item;}
      else if(['name','slug','title','welcome_message'].includes(key)){
        const max=key==='name'?80:key==='welcome_message'?500:100;
        if(typeof item!=='string'||!item.trim()||Array.from(item.trim()).length>max||(key==='slug'&&!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.trim())))fields[prefix+key]=`Usa texto válido de hasta ${max} caracteres.`;else payload[key]=item.trim();
      }else{
        const result=validateMutation({action:'update_profile',participant_id:value.participant_id,expected_version:1,profile:{[key]:item}});
        if(!result.ok)for(const [field,message] of Object.entries(result.fields))fields[prefix+field]=message;
        else Object.assign(payload,result.args.p_payload);
      }
    }
    if(creating&&typeof payload.name!=='string')fields['participant.name']='Añade el nombre del participante.';
    if(creating&&payload.photo_path!=null)fields['participant.photo_path']='Primero crea el participante; después sube su foto.';
    if(payload.photo_path!=null&&(typeof payload.photo_path!=='string'||!payload.photo_path.startsWith(`${value.participant_id}/avatar/`)))fields['participant.photo_path']='Elige una foto propia de perfil.';
    if(record(raw)&&raw.photo_path!=null&&raw.photo_url!=null)fields['participant.photo_path']='Usa una URL o un archivo, no ambos.';
  }
  if(Object.keys(fields).length)return {ok:false,fields};
  return {ok:true,args:{p_action:action,p_participant_id:listing||event?null:value.participant_id as string,p_expected_version:listing||creating?null:value.expected_version as number,p_payload:payload}};
}
const participantKeys=['id','name','slug','photo_path','photo_url','avatar_key','personal_message','general_preferences','display_order','version'];
const pick=(value:unknown,keys:string[])=>{if(!record(value))throw new Error('Unavailable result');return Object.fromEntries(keys.map((key)=>[key,value[key]]));};
export function adminResponse(action:AdminAction,result:Record<string,unknown>):Record<string,unknown>{
  if(action==='admin_list'){
    if(!Array.isArray(result.participants))throw new Error('Unavailable result');
    return {participants:result.participants.map((p:unknown)=>{if(!record(p))throw new Error('Unavailable result');const link=pick(p.link,['status','expires_at']);return {...pick(p,participantKeys),gift_count:p.gift_count,link};}),
      total:result.total,offset:result.offset,limit:result.limit,event:result.event===null?null:pick(result.event,['id','title','welcome_message','exchange_date','version'])};
  }
  if(action==='update_event')return {event:pick(result.event,['id','title','welcome_message','exchange_date','version'])};
  if(action==='delete_participant')return {deleted:pick(result.deleted,['id','slug','gifts_removed','links_removed','media_queued'])};
  if(action==='move_participant'){
    if(!Array.isArray(result.participants))throw new Error('Unavailable result');return {participants:result.participants.map((p:unknown)=>pick(p,participantKeys)),reload_required:true};
  }
  return {participant:pick(result.participant,participantKeys)};
}
