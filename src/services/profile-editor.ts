import { parseEditableProfile,profileErrors,type EditableProfile,type ProfileMutation } from '../domain/profile-editor.ts';
import { getPublicSupabase,type PublicDataClient } from './supabase.ts';
import { readPublicConfig,type PublicConfig } from './public-config.ts';
import { retryAfterSeconds } from '../domain/retry-after.ts';
import { validateMutation } from '../domain/mutation-validation.ts';
export class ProfileMutationError extends Error {
  readonly kind:'fields'|'conflict'|'uncertain'|'access'|'rate'|'busy';readonly fields:Record<string,string>;readonly retryAfter:number;
  constructor(kind:ProfileMutationError['kind'],fields:Record<string,string>={},retryAfter=0){super('Profile update unavailable');this.kind=kind;this.fields=fields;this.retryAfter=retryAfter;}
}
export async function loadEditableProfile(target:{slug:string}|{id:string},signal:AbortSignal,client?:PublicDataClient):Promise<EditableProfile|null> {
  const byId='id' in target,key=byId?'id':'slug',value=byId?target.id:target.slug;
  if(byId?!/^[0-9a-f-]{36}$/.test(value):value.length>100||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value))return null;
  const {data}=await (client??getPublicSupabase()).from('participants').select('id,name,slug,photo_path,photo_url,avatar_key,personal_message,general_preferences,version')
    .eq(key,value).abortSignal(AbortSignal.any([signal,AbortSignal.timeout(12000)])).maybeSingle().throwOnError();
  if(!data)return null;
  const profile=parseEditableProfile(data);if((byId?profile.id:profile.slug)!==value)throw new Error('Unexpected profile');return profile;
}
async function boundedJson(response:Response,signal:AbortSignal):Promise<unknown> {
  const reader=response.body?.getReader();if(!reader)throw new ProfileMutationError('uncertain');
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  let text='',bytes=0;const decoder=new TextDecoder();
  try{signal.throwIfAborted();while(true){const next=await reader.read();signal.throwIfAborted();if(next.done)break;bytes+=next.value.length;
    if(bytes>32768){await reader.cancel();throw new ProfileMutationError('uncertain');}text+=decoder.decode(next.value,{stream:true});}return JSON.parse(text+decoder.decode());
  }finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}
export async function sendProfileMutation(token:string,request:ProfileMutation,signal:AbortSignal,config?:PublicConfig,fetcher:typeof fetch=fetch):Promise<EditableProfile> {
  const errors=profileErrors(request);if(Object.keys(errors).length)throw new ProfileMutationError('fields',errors);
  const validated=validateMutation(request);if(!validated.ok||validated.args.p_action!=='update_profile')throw new ProfileMutationError('fields');
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(12000)]);
  try {
    deadline.throwIfAborted();const settings=config??readPublicConfig(import.meta.env);
    const response=await fetcher(`${settings.supabaseUrl}/functions/v1/wishlist-api`,{method:'POST',headers:{'Content-Type':'application/json',apikey:settings.publishableKey,'X-Edit-Token':token},
      body:JSON.stringify({action:'update_profile',participant_id:request.participant_id,expected_version:request.expected_version,profile:validated.args.p_payload}),
      credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:deadline});
    if(!response.ok){
      if(response.status===422){
        const data=await boundedJson(response,deadline) as {error?:{fields?:unknown}};const raw=data?.error?.fields;
        const allowed=['photo_url','photo_path','avatar_key','personal_message','general_preferences'];
        const fields=raw&&typeof raw==='object'&&!Array.isArray(raw)?Object.fromEntries(Object.entries(raw).filter(([key,value])=>allowed.includes(key)&&typeof value==='string'&&value.length<=300)):{};
        throw new ProfileMutationError('fields',fields as Record<string,string>);
      }
      await response.body?.cancel();
      throw new ProfileMutationError([401,403].includes(response.status)?'access':[404,409].includes(response.status)?'conflict':response.status===429?'rate':'uncertain',{},response.status===429?retryAfterSeconds(response.headers.get('Retry-After')):0);
    }
    const data=await boundedJson(response,deadline) as {participant?:unknown};const saved=parseEditableProfile(data?.participant);
    if(saved.id!==request.participant_id||saved.version<=request.expected_version)throw new ProfileMutationError('uncertain');
    return saved;
  }catch(error){if(error instanceof ProfileMutationError)throw error;throw new ProfileMutationError('uncertain');}
}
