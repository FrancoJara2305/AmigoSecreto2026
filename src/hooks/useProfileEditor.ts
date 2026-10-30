import { useEffect,useRef,useState } from 'react';
import { profileDraft,profileErrors,profileRequest,type EditableProfile,type ProfileDraft } from '../domain/profile-editor';
import { ProfileMutationError,loadEditableProfile } from '../services/profile-editor';
import { MediaUploadError } from '../services/media-upload';
import { usePrivateAccess } from '../app/PrivateAccessProvider';
import { focusField } from '../components/ui/focus-field';

export function useProfileEditor(initial:EditableProfile) {
  const {updateProfile,upload:sendUpload}=usePrivateAccess();
  const [base,setBase]=useState(initial),[draft,setDraft]=useState(()=>profileDraft(initial));
  const [baseline,setBaseline]=useState(()=>JSON.stringify(profileDraft(initial)));
  const [saving,setSaving]=useState(false),[uploading,setUploading]=useState(false),[uploadIssue,setUploadIssue]=useState('');
  const [fields,setFields]=useState<Record<string,string>>({}),[issue,setIssue]=useState<ProfileMutationError|null>(null),[notice,setNotice]=useState('');
  const [retryAt,setRetryAt]=useState(0),[uploadRetryAt,setUploadRetryAt]=useState(0);
  const [,tick]=useState(0);
  useEffect(()=>{const times=[retryAt,uploadRetryAt].filter((time)=>time>Date.now());if(!times.length)return;
    const timer=setTimeout(()=>tick((n)=>n+1),Math.max(0,Math.min(...times)-Date.now())+1);return()=>clearTimeout(timer);
  },[retryAt,uploadRetryAt,Math.min(retryAt>Date.now()?retryAt:Infinity,uploadRetryAt>Date.now()?uploadRetryAt:Infinity)]);
  const [latest,setLatest]=useState<EditableProfile|null|undefined>(),[reviewing,setReviewing]=useState(false),[reviewError,setReviewError]=useState(false);
  const locked=useRef(false),mounted=useRef(true),controller=useRef<AbortController|null>(null),reviewController=useRef<AbortController|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();reviewController.current?.abort();};},[]);
  const needsReview=issue?.kind==='conflict'||issue?.kind==='uncertain';
  function change(key:keyof ProfileDraft,value:string) {
    if(locked.current)return;setDraft((current)=>({...current,[key]:value}));setFields((current)=>({...current,[key]:''}));setNotice('');
  }
  function restorePhoto(){if(locked.current)return;const saved=profileDraft(base);setDraft((current)=>({...current,photoSource:saved.photoSource,photo_url:saved.photo_url,photo_path:saved.photo_path}));setFields((current)=>({...current,photo_url:'',photo_path:''}));setNotice('');}
  async function upload(file:File):Promise<string|null> {
    if(locked.current||uploadRetryAt>Date.now())return null;
    locked.current=true;setUploading(true);setUploadIssue('');setNotice('');const abort=new AbortController();controller.current=abort;
    try {
      const path=await sendUpload(base.id,'avatar',file,abort.signal);if(!mounted.current||abort.signal.aborted)return null;
      setDraft((current)=>({...current,photoSource:'upload',photo_path:path}));setFields((current)=>({...current,photo_path:'',photo_url:''}));return path;
    }catch(error){if(!mounted.current)return null;
      if(error instanceof MediaUploadError&&error.kind==='rate')setUploadRetryAt(Date.now()+Math.max(1,error.retryAfter)*1000);
      setUploadIssue(error instanceof MediaUploadError&&error.kind==='invalid'?'Elige una imagen JPEG, PNG o WebP estática de hasta 3 MiB y 16 megapíxeles.':
        error instanceof MediaUploadError&&error.kind==='access'?'Tu acceso ya no permite subir fotos. Conservamos la foto anterior.':
        error instanceof MediaUploadError&&error.kind==='rate'?`Alcanzaste el límite de imágenes. Espera ${Math.max(1,Math.ceil(error.retryAfter/60))} minuto(s) antes de volver a subir.`:
        'No pudimos confirmar la subida. La foto anterior se conserva; puedes intentarlo de nuevo.');return null;
    }finally{if(mounted.current)setUploading(false);locked.current=false;controller.current=null;}
  }
  async function save() {
    if(locked.current||needsReview||retryAt>Date.now())return;
    const request=profileRequest(base,draft),errors=profileErrors(request);setFields(errors);setNotice('');
    if(Object.keys(errors).length){requestAnimationFrame(()=>focusField(`profile-${Object.keys(errors)[0]}`));return;}
    locked.current=true;setSaving(true);setIssue(null);setLatest(undefined);setReviewError(false);const abort=new AbortController();controller.current=abort;
    try {
      const saved=await updateProfile(request,abort.signal);if(!mounted.current)return;
      const next=profileDraft(saved);setBase(saved);setDraft(next);setBaseline(JSON.stringify(next));setNotice('Tu perfil quedó guardado. Tus regalos se mantienen.');
    }catch(error){if(!mounted.current)return;const failure=error instanceof ProfileMutationError?error:new ProfileMutationError('uncertain');
      setIssue(failure);setFields(failure.fields);if(failure.kind==='rate')setRetryAt(Date.now()+Math.max(1,failure.retryAfter)*1000);
      requestAnimationFrame(()=>focusField(Object.keys(failure.fields).length?`profile-${Object.keys(failure.fields)[0]}`:'profile-feedback'));
    }finally{if(mounted.current)setSaving(false);locked.current=false;controller.current=null;}
  }
  async function review() {
    if(locked.current||reviewing)return;setReviewing(true);setReviewError(false);const abort=new AbortController();reviewController.current=abort;
    try{const current=await loadEditableProfile({id:base.id},abort.signal);if(mounted.current&&!abort.signal.aborted)setLatest(current);}
    catch{if(mounted.current&&!abort.signal.aborted)setReviewError(true);}finally{if(mounted.current)setReviewing(false);}
  }
  function useLatest(keepDraft:boolean) {
    if(!latest||locked.current)return;setBase(latest);const next=profileDraft(latest);setBaseline(JSON.stringify(next));if(!keepDraft)setDraft(next);
    setIssue(null);setFields({});setLatest(undefined);setReviewError(false);setNotice(keepDraft?'Conservamos tu borrador. Revisa los datos antes de guardar sobre la versión actual.':'Cargamos el perfil guardado actualmente.');
  }
  return {base,draft,dirty:JSON.stringify(draft)!==baseline,busy:saving||uploading,uploading,uploadIssue,uploadRateWaiting:uploadRetryAt>Date.now(),rateWaiting:retryAt>Date.now(),
    fields,issue,notice,needsReview,latest,reviewing,reviewError,change,restorePhoto,upload,save,review,useLatest};
}
