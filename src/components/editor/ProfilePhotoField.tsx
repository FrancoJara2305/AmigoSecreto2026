import { useEffect,useRef,useState } from 'react';
import type { EditableProfile,ProfileDraft } from '../../domain/profile-editor';
import { profileAvatars } from '../../domain/profile-editor';
import { safeExternalUrl } from '../../domain/profile';
import { ParticipantAvatar } from '../participants/ParticipantAvatar';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';

export function ProfilePhotoField({draft,base,change,restore,upload,uploading,uploadIssue,waiting,errors}:{draft:ProfileDraft;base:EditableProfile;change(key:keyof ProfileDraft,value:string):void;restore():void;upload(file:File):Promise<string|null>;uploading:boolean;uploadIssue:string;waiting:boolean;errors:Record<string,string>}) {
  const [local,setLocal]=useState<{path:string;url:string}|null>(null),[preview,setPreview]=useState(()=>safeExternalUrl(base.photo_url));
  const objectUrl=useRef<string|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);};},[]);
  async function choose(file:File){const path=await upload(file);if(!path||!mounted.current)return;if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);const url=URL.createObjectURL(file);objectUrl.current=url;setLocal({path,url});}
  const person={...base,avatar_key:draft.avatar_key,photo_path:draft.photoSource==='upload'?draft.photo_path:null,photo_url:draft.photoSource==='url'&&preview===safeExternalUrl(draft.photo_url)?preview:null};
  return <section className="profile-photo-editor" aria-labelledby="profile-photo-title"><h2 id="profile-photo-title">Una imagen que te represente</h2><p>Tu foto es opcional y será pública. Puedes elegir una ilustración en su lugar.</p>
    <div className="profile-photo-editor__preview" role="img" aria-label="Vista previa de foto o ilustración">{draft.photoSource==='upload'&&local?.path===draft.photo_path?<img src={local.url} alt="" width="128" height="128" />:<ParticipantAvatar participant={person}/>}</div>
    <div className="field"><label htmlFor="profile-photo_path">Subir foto</label><input id="profile-photo_path" type="file" disabled={waiting} accept="image/jpeg,image/png,image/webp" aria-describedby="profile-photo-help" aria-invalid={!!errors.photo_path||undefined} onChange={(event)=>{const file=event.target.files?.[0];event.target.value='';if(file)void choose(file);}}/><p className="field__hint" id="profile-photo-help">JPEG, PNG o WebP estática, hasta 3 MiB y 16 megapíxeles. La foto se prepara al subir; solo Guardar perfil la aplica.</p>{errors.photo_path&&<p className="field__error">{errors.photo_path}</p>}</div>
    {uploading&&<p role="status">Preparando y subiendo tu foto…</p>}{uploadIssue&&<p className="field__error" role="alert">{uploadIssue}</p>}
    <div className="profile-photo-editor__actions"><Button variant="secondary" onClick={()=>change('photoSource','url')}>Usar URL de foto</Button><Button variant="quiet" onClick={()=>change('photoSource','avatar')}>Usar ilustración local</Button>{(base.photo_path||base.photo_url)&&<Button variant="quiet" onClick={()=>{restore();setPreview(safeExternalUrl(base.photo_url));}}>Conservar foto guardada</Button>}</div>
    {draft.photoSource==='url'&&<><TextField id="profile-photo_url" type="url" label="URL de la foto" maxLength={2048} value={draft.photo_url} error={errors.photo_url} hint="Enlace HTTPS público. Puedes revisarlo antes de guardar." onChange={(event)=>change('photo_url',event.target.value)}/><Button variant="quiet" onClick={()=>setPreview(safeExternalUrl(draft.photo_url))}>Ver foto</Button></>}
    <fieldset id="profile-avatar_key" tabIndex={-1} className="profile-avatar-options"><legend>Ilustración local</legend>{profileAvatars.map(([key,label])=><label key={key}><input type="radio" name="profile-avatar" value={key} checked={draft.photoSource==='avatar'&&draft.avatar_key===key} onChange={()=>{change('avatar_key',key);change('photoSource','avatar');}}/><ParticipantAvatar participant={{...base,photo_path:null,photo_url:null,avatar_key:key}}/><span>{label}</span></label>)}</fieldset>
    {errors.avatar_key&&<p className="field__error">{errors.avatar_key}</p>}<p className="field__hint">Elegir una ilustración sustituye la foto al guardar. Si una foto no carga, se muestra la ilustración elegida.</p>
  </section>;
}
