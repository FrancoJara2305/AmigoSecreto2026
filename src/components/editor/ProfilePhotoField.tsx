import { useEffect,useRef,useState } from 'react';
import { Crop } from 'lucide-react';
import type { EditableProfile,ProfileDraft } from '../../domain/profile-editor';
import { profileAvatars } from '../../domain/profile-editor';
import { safeExternalUrl } from '../../domain/profile';
import { publicPhoto } from '../../domain/catalogue';
import { ParticipantAvatar } from '../participants/ParticipantAvatar';
import { inspectImage,MAX_IMAGE_BYTES } from '../../../supabase/functions/_shared/image-inspection';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';
import { FileDrop } from '../ui/FileDrop';
import { useProgress } from '../ui/ProgressOverlay';
import { PhotoCropDialog } from './PhotoCropDialog';

export function ProfilePhotoField({draft,base,change,restore,upload,uploading,uploadIssue,waiting,errors,allowUpload=true,saveLabel='Guardar perfil'}:{draft:ProfileDraft;base:EditableProfile;change(key:keyof ProfileDraft,value:string):void;restore():void;upload(file:File):Promise<string|null>;uploading:boolean;uploadIssue:string;waiting:boolean;errors:Record<string,string>;allowUpload?:boolean;saveLabel?:string}) {
  const [local,setLocal]=useState<{path:string;url:string}|null>(null),[preview,setPreview]=useState(()=>safeExternalUrl(base.photo_url));
  const [cropping,setCropping]=useState<File|null>(null),[adjusting,setAdjusting]=useState(false),[adjustIssue,setAdjustIssue]=useState(''),track=useProgress();
  // The uncropped file behind each uploaded path, so reframing starts from the full picture.
  const objectUrl=useRef<string|null>(null),mounted=useRef(true),original=useRef<File|null>(null),originals=useRef(new Map<string,File>());
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);};},[]);
  // Files that fail the local check go straight to upload(), which reports the usual validation message without sending them.
  async function pick(file:File){setAdjustIssue('');try{inspectImage(new Uint8Array(await file.arrayBuffer()),file.type);}catch{await upload(file);return;}if(mounted.current){original.current=file;setCropping(file);}}
  async function choose(file:File){const source=original.current;const path=await track(upload(file),{busy:'Preparando y subiendo tu foto…',done:'Foto lista'});if(!path||!mounted.current)return;if(source)originals.current.set(path,source);if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);const url=URL.createObjectURL(file);objectUrl.current=url;setLocal({path,url});}
  // A photo saved earlier (possibly not square) is read back from public storage, without credentials, to be reframed and uploaded again.
  async function adjust(){
    setAdjustIssue('');const kept=draft.photo_path?originals.current.get(draft.photo_path):undefined;
    if(kept){original.current=kept;setCropping(kept);return;}
    const source=publicPhoto({id:base.id,photo_path:draft.photo_path,photo_url:null},import.meta.env.VITE_SUPABASE_URL??'');if(!source)return;
    setAdjusting(true);
    try{
      const response=await fetch(source,{credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
      const blob=response.ok?await response.blob():null;
      if(!blob||blob.size>MAX_IMAGE_BYTES||!['image/webp','image/jpeg','image/png'].includes(blob.type))throw new Error('Unreadable photo');
      if(!mounted.current)return;const file=new File([blob],'foto-guardada',{type:blob.type});original.current=file;setCropping(file);
    }catch{if(mounted.current)setAdjustIssue('No pudimos abrir la foto guardada para ajustarla. Puedes volver a subirla desde tu dispositivo.');}
    finally{if(mounted.current)setAdjusting(false);}
  }
  const canAdjust=draft.photoSource==='upload'&&!!draft.photo_path&&allowUpload&&!waiting;
  const person={...base,avatar_key:draft.avatar_key,photo_path:draft.photoSource==='upload'?draft.photo_path:null,photo_url:draft.photoSource==='url'&&preview===safeExternalUrl(draft.photo_url)?preview:null};
  return <section className="profile-photo-editor" aria-labelledby="profile-photo-title"><h2 id="profile-photo-title">Una imagen que te represente</h2><p>Tu foto es opcional y será pública. Puedes elegir una ilustración en su lugar.</p>
    <div className="profile-photo-editor__preview" role="img" aria-label="Vista previa de foto o ilustración">{draft.photoSource==='upload'&&local?.path===draft.photo_path?<img src={local.url} alt="" width="128" height="128" />:<ParticipantAvatar participant={person}/>}</div>
    <FileDrop id="profile-photo_path" busy={uploading} label="Subir foto" prompt="Elige una foto o arrástrala aquí" meta="Podrás encuadrarla antes de subirla" disabled={waiting||!allowUpload} accept="image/jpeg,image/png,image/webp" aria-describedby={['profile-photo-help',errors.photo_path&&'profile-photo-error',uploadIssue&&'profile-upload-error'].filter(Boolean).join(' ')} aria-invalid={!!errors.photo_path||undefined} onChange={(event)=>{const file=event.target.files?.[0];event.target.value='';if(file)void pick(file);}}><p className="field__hint" id="profile-photo-help">JPEG, PNG o WebP estática, hasta 3 MiB y 16 megapíxeles. La foto se prepara al subir; solo {saveLabel} la aplica. {!allowUpload&&'Primero crea el participante; después podrás subir un archivo.'}</p>{errors.photo_path&&<p id="profile-photo-error" className="field__error">{errors.photo_path}</p>}</FileDrop>
    {uploadIssue&&<p id="profile-upload-error" className="field__error" role="alert">{uploadIssue}</p>}{adjustIssue&&<p className="field__error" role="alert">{adjustIssue}</p>}
    <PhotoCropDialog file={cropping} onCancel={()=>setCropping(null)} onConfirm={(file)=>{setCropping(null);void choose(file);}}/>
    <div className="profile-photo-editor__actions">{canAdjust&&<Button variant="secondary" icon={<Crop/>} loading={adjusting} onClick={()=>{void adjust();}}>Ajustar encuadre</Button>}<Button variant="secondary" onClick={()=>change('photoSource','url')}>Usar URL de foto</Button><Button variant="quiet" onClick={()=>change('photoSource','avatar')}>Usar ilustración local</Button>{(base.photo_path||base.photo_url)&&<Button variant="quiet" onClick={()=>{restore();setPreview(safeExternalUrl(base.photo_url));}}>Conservar foto guardada</Button>}</div>
    {draft.photoSource==='url'&&<><TextField id="profile-photo_url" type="url" label="URL de la foto" maxLength={2048} value={draft.photo_url} error={errors.photo_url} hint="Enlace HTTPS público. Puedes revisarlo antes de guardar. En el círculo se muestra su parte central; para elegir el encuadre, sube el archivo." onChange={(event)=>change('photo_url',event.target.value)}/><Button variant="quiet" onClick={()=>setPreview(safeExternalUrl(draft.photo_url))}>Ver foto</Button></>}
    <fieldset id="profile-avatar_key" tabIndex={-1} className="profile-avatar-options" aria-invalid={!!errors.avatar_key||undefined} aria-describedby={errors.avatar_key?'profile-avatar-error':undefined}><legend>Ilustración local</legend>{profileAvatars.map(([key,label])=><label key={key}><input type="radio" name="profile-avatar" value={key} checked={draft.photoSource==='avatar'&&draft.avatar_key===key} aria-describedby={errors.avatar_key?'profile-avatar-error':undefined} onChange={()=>{change('avatar_key',key);change('photoSource','avatar');}}/><ParticipantAvatar participant={{...base,photo_path:null,photo_url:null,avatar_key:key}}/><span>{label}</span></label>)}</fieldset>
    {errors.avatar_key&&<p id="profile-avatar-error" className="field__error">{errors.avatar_key}</p>}<p className="field__hint">Elegir una ilustración sustituye la foto al guardar. Si una foto no carga, se muestra la ilustración elegida.</p>
  </section>;
}
