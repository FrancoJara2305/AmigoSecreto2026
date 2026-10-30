import type { PublicParticipant } from './profile.ts';
import { validateMutation } from './mutation-validation.ts';

export const profileAvatars = [['gift','Regalo'],['tree','Árbol'],['star','Estrella'],['snowflake','Copo de nieve'],['bell','Campana'],['reindeer','Reno']] as const;
export type EditableProfile=PublicParticipant & {version:number};
export type ProfileDraft={photoSource:'avatar'|'url'|'upload';photo_url:string;photo_path:string|null;avatar_key:string;personal_message:string;general_preferences:string};
export type ProfileMutation={action:'update_profile';participant_id:string;expected_version:number;profile:Record<string,unknown>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function profileDraft(profile:EditableProfile):ProfileDraft {
  return {photoSource:profile.photo_path?'upload':profile.photo_url?'url':'avatar',photo_url:profile.photo_url??'',photo_path:profile.photo_path,avatar_key:profile.avatar_key,personal_message:profile.personal_message??'',general_preferences:profile.general_preferences??''};
}
export function profileRequest(base:EditableProfile,draft:ProfileDraft):ProfileMutation {
  return {action:'update_profile',participant_id:base.id,expected_version:base.version,profile:{
    photo_url:draft.photoSource==='url'?draft.photo_url.trim()||null:null,
    photo_path:draft.photoSource==='upload'?draft.photo_path:null,
    avatar_key:draft.avatar_key,personal_message:draft.personal_message.trim()||null,general_preferences:draft.general_preferences.trim()||null,
  }};
}
export function profileErrors(request:ProfileMutation):Record<string,string> {
  const result=validateMutation(request);const errors=result.ok?{}:result.fields;
  const path=request.profile.photo_path;
  if(path!==null&&path!==undefined&&(typeof path!=='string'||!/^[0-9a-f-]{36}\/avatar\/[0-9a-f-]{36}\.(webp|jpg|png)$/.test(path)||!path.startsWith(`${request.participant_id}/avatar/`)))errors.photo_path='Elige una foto propia de perfil.';
  return errors;
}
export function parseEditableProfile(value:unknown):EditableProfile {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid profile');
  const p=value as Record<string,unknown>;
  if(typeof p.id!=='string'||!uuid.test(p.id)||typeof p.name!=='string'||!p.name.trim()||Array.from(p.name).length>80||
    typeof p.slug!=='string'||p.slug.length>100||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)||!Number.isInteger(p.version)||Number(p.version)<1||Number(p.version)>2147483647)throw new Error('Invalid profile');
  for(const [key,limit] of [['personal_message',500],['general_preferences',2000],['photo_url',2048],['photo_path',512]] as const) {
    if(p[key]!==null&&(typeof p[key]!=='string'||Array.from(p[key] as string).length>limit))throw new Error('Invalid profile');
  }
  if(p.photo_path!==null&&p.photo_url!==null)throw new Error('Invalid photo sources');
  const columns=['id','name','slug','version','photo_path','photo_url','avatar_key','personal_message','general_preferences'] as const;
  const result=Object.fromEntries(columns.map((key)=>[key,p[key]])) as EditableProfile;
  if(Object.keys(profileErrors(profileRequest(result,profileDraft(result)))).length)throw new Error('Invalid profile');
  return result;
}
