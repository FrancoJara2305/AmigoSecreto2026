import { useEffect,useRef,useState,type FormEvent } from 'react';
import { AppLink as Link } from '../ui/AppLink';
import { useLocation, useNavigate } from 'react-router';
import { usePrivateAccess } from '../../app/PrivateAccessProvider';
import { useAdminOperation } from '../../hooks/useAdminOperation';
import { AdminError,loadAdminPerson,type AdminPerson,type AdminEvent,type AdminRequest } from '../../services/organizer';
import { MediaUploadError } from '../../services/media-upload';
import { profileDraft,profileRequest,type ProfileDraft } from '../../domain/profile-editor';
import { validateAdmin,suggestParticipantSlug } from '../../../supabase/functions/_shared/admin-validation';
import { AdminHeader,AdminIssue } from './AdminShared';
import { Button } from '../ui/Button';
import { TextField,TextAreaField } from '../ui/Fields';
import { LoadingState,Notice,ErrorSummary } from '../ui/Feedback';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { ProfilePhotoField } from '../editor/ProfilePhotoField';

type Model={person:AdminPerson}|{event:AdminEvent};
type Draft={name:string;slug:string;display_order:string;title:string;welcome_message:string;exchange_date:string;photo:ProfileDraft};
const fieldTarget=(key:string)=>{const name=key.split('.').at(-1);return `${['photo_path','photo_url','avatar_key'].includes(name??'')?'profile':'admin'}-${name}`;};
function toDraft(model:Model):Draft {
  const person='person' in model?model.person:null,event='event' in model?model.event:null;
  return {name:person?.name??'',slug:person?.slug??'',display_order:person?String(person.display_order):'',title:event?.title??'',welcome_message:event?.welcome_message??'',exchange_date:event?.exchange_date??'',photo:profileDraft(person??{id:'',name:'',slug:'',version:1,photo_path:null,photo_url:null,avatar_key:'gift',personal_message:null,general_preferences:null})};
}
export function OrganizerForm({mode,id,canWrite}:{mode:'new'|'edit'|'event';id:string;canWrite:boolean}){
  const {admin}=usePrivateAccess(),[model,setModel]=useState<Model|null>(null),[issue,setIssue]=useState<AdminError|null>(null),[attempt,setAttempt]=useState(0),[retryAt,setRetryAt]=useState(0),[,tick]=useState(0);
  useEffect(()=>{if(retryAt<=Date.now())return;const timer=setTimeout(()=>tick((n)=>n+1),retryAt-Date.now()+1);return()=>clearTimeout(timer);},[retryAt]);
  useEffect(()=>{if(mode==='new'||model||!canWrite||issue||retryAt>Date.now())return;const controller=new AbortController();
    void Promise.resolve().then(()=>{controller.signal.throwIfAborted();return mode==='event'?admin({action:'admin_list'},controller.signal).then((r):Model=>({event:r.snapshot!.event})):loadAdminPerson(id,controller.signal).then((person):Model=>{if(!person)throw new AdminError('conflict');return {person};});}).then((value)=>{if(!controller.signal.aborted)setModel(value);}).catch((error)=>{if(!controller.signal.aborted){const failure=error instanceof AdminError?error:new AdminError('uncertain');setIssue(failure);if(failure.kind==='rate')setRetryAt(Date.now()+Math.max(1,failure.retryAfter)*1000);}});return()=>controller.abort();
  },[mode,id,attempt,canWrite,!!model,admin]);
  if(mode==='new'||model)return <OrganizerEditor initial={model} mode={mode} canWrite={canWrite}/>;
  return <><AdminHeader title={mode==='event'?'Nuestro evento':'Editar participante'}/><AdminIssue issue={issue}/>{issue?<Button disabled={!canWrite||retryAt>Date.now()} onClick={()=>{setIssue(null);setAttempt((n)=>n+1);}}>Volver a consultar</Button>:<LoadingState label="Preparando el formulario…"/>}{issue?.kind==='conflict'&&<p>Este participante ya no está disponible. Vuelve al listado para consultar los actuales.</p>}</>;
}
function OrganizerEditor({initial,mode,canWrite}:{initial:Model|null;mode:'new'|'edit'|'event';canWrite:boolean}){
  const [creationId]=useState(()=>crypto.randomUUID()),[base,setBase]=useState(initial),[draft,setDraft]=useState(()=>({...toDraft(initial??{person:{id:creationId,name:'',slug:'',version:1,display_order:0,photo_path:null,photo_url:null,avatar_key:'gift',personal_message:null,general_preferences:null}}),...(mode==='new'?{display_order:''}:{})}));
  const [baseline,setBaseline]=useState(()=>JSON.stringify(draft)),[autoSlug,setAutoSlug]=useState(mode==='new'),[fields,setFields]=useState<Record<string,string>>({}),[notice,setNotice]=useState(''),[needsReview,setNeedsReview]=useState(false),[latest,setLatest]=useState<Model|null|undefined>(),[slugConfirm,setSlugConfirm]=useState(false),[loadConfirm,setLoadConfirm]=useState(false),[created,setCreated]=useState('');
  const op=useAdminOperation(),reviewOp=useAdminOperation(),{upload}=usePrivateAccess(),navigate=useNavigate(),location=useLocation();
  const [uploading,setUploading]=useState(false),[uploadIssue,setUploadIssue]=useState(''),[uploadAt,setUploadAt]=useState(0),[,tick]=useState(0),[reviewing,setReviewing]=useState(false),[reviewError,setReviewError]=useState(false);
  const controller=useRef<AbortController|null>(null),reviewController=useRef<AbortController|null>(null),locked=useRef(false),mounted=useRef(true);
  const person=base&&'person' in base?base.person:null,event=base&&'event' in base?base.event:null,creating=mode==='new'&&!person;
  const previewPerson=person??{id:creationId,name:draft.name,slug:draft.slug,version:1,display_order:0,photo_path:null,photo_url:null,avatar_key:'gift',personal_message:null,general_preferences:null};
  const dirty=JSON.stringify(draft)!==baseline,busy=op.busy||uploading||reviewOp.busy||reviewing;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();reviewController.current?.abort();};},[]);
  useEffect(()=>{if(uploadAt<=Date.now())return;const timer=setTimeout(()=>tick((n)=>n+1),uploadAt-Date.now()+1);return()=>clearTimeout(timer);},[uploadAt]);
  useEffect(()=>{if(created)void navigate(`/organizador/participantes/${created}/editar`,{replace:true,state:{created:true}});},[created,navigate]);
  function change(key:Exclude<keyof Draft,'photo'>,value:string){if(busy)return;setDraft((d)=>({...d,[key]:value,...(key==='name'&&autoSlug?{slug:suggestParticipantSlug(value)}:{})}));if(key==='slug')setAutoSlug(false);setFields({});setNotice('');}
  function photoChange(key:keyof ProfileDraft,value:string){if(busy)return;setDraft((d)=>({...d,photo:{...d.photo,[key]:value}}));setFields({});setNotice('');}
  function request():AdminRequest {
    if(mode==='event')return {action:'update_event',expected_version:event!.version,event:{title:draft.title,welcome_message:draft.welcome_message,exchange_date:draft.exchange_date||null}};
    const profile=profileRequest(previewPerson,draft.photo).profile;
    const participant={...profile,name:draft.name,...(!creating||!autoSlug?{slug:draft.slug}:{}),...(draft.display_order!==''?{display_order:Number(draft.display_order)}:{})};
    return {action:creating?'create_participant':'update_participant',participant_id:previewPerson.id,...(!creating?{expected_version:person!.version}:{}),participant};
  }
  async function save(confirmed=false){
    if(!canWrite||busy||locked.current||needsReview||op.waiting)return;const body=request(),validation=validateAdmin(body);
    const errors=validation.ok?{}:validation.fields;
    if(mode!=='event'&&draft.display_order!==''&&!/^\d+$/.test(draft.display_order))errors['participant.display_order']='Usa un número entero no negativo.';
    setFields(errors);setNotice('');if(Object.keys(errors).length){requestAnimationFrame(()=>document.getElementById(fieldTarget(Object.keys(errors)[0]))?.focus());return;}
    if(person&&draft.slug!==person.slug&&!confirmed){setSlugConfirm(true);return;}
    locked.current=true;try{const result=await op.run(body);if(!mounted.current)return;
      const saved:Model=result.participant?{person:result.participant}:{event:result.event!};const next=toDraft(saved);setBase(saved);setDraft(next);setBaseline(JSON.stringify(next));setFields({});setNotice(mode==='event'?'Los datos del evento quedaron guardados.':'Los datos del participante quedaron guardados.');if(mode==='new')setCreated(result.participant!.id);
    }catch(error){if(mounted.current&&error instanceof AdminError){setFields(error.fields);if(error.kind==='conflict'||error.kind==='uncertain')setNeedsReview(true);}}
    finally{locked.current=false;setSlugConfirm(false);}
  }
  async function review(){
    if(busy||locked.current||!canWrite)return;setLatest(undefined);setReviewError(false);setReviewing(true);try{if(mode==='event'){const result=await reviewOp.run({action:'admin_list'});setLatest({event:result.snapshot!.event});}
      else{const abort=new AbortController();reviewController.current=abort;const person=await loadAdminPerson(previewPerson.id,abort.signal);if(mounted.current&&!abort.signal.aborted)setLatest(person?{person}:null);}}
    catch{if(mounted.current)setReviewError(true);}finally{if(mounted.current)setReviewing(false);}
  }
  function useLatest(keep:boolean){
    if(latest===undefined)return;
    if(latest===null){if(!creating)return;setNeedsReview(false);op.clear();setNotice('No encontramos un alta con este identificador. Puedes volver a preparar el alta.');return;}
    const next=toDraft(latest);setBase(latest);setBaseline(JSON.stringify(next));if(!keep)setDraft(next);else if(creating&&autoSlug)setDraft((d)=>({...d,slug:next.slug}));
    setAutoSlug(false);setNeedsReview(false);setLatest(undefined);op.clear();setFields({});setNotice(keep?'Conservamos tu borrador. Revisa los datos antes de guardar sobre la versión actual.':'Cargamos los datos guardados actualmente.');if(mode==='new'&&!keep&&'person' in latest)setCreated(latest.person.id);
  }
  async function uploadPhoto(file:File):Promise<string|null>{
    if(!canWrite||creating||locked.current||busy||uploadAt>Date.now())return null;locked.current=true;setUploading(true);setUploadIssue('');const abort=new AbortController();controller.current=abort;
    try{const path=await upload(previewPerson.id,'avatar',file,abort.signal);if(!mounted.current||abort.signal.aborted)return null;setDraft((d)=>({...d,photo:{...d.photo,photoSource:'upload',photo_path:path}}));return path;}
    catch(error){if(mounted.current){if(error instanceof MediaUploadError&&error.kind==='rate')setUploadAt(Date.now()+Math.max(1,error.retryAfter)*1000);setUploadIssue(error instanceof MediaUploadError&&error.kind==='invalid'?'Elige una imagen JPEG, PNG o WebP válida de hasta 3 MiB.':error instanceof MediaUploadError&&error.kind==='rate'?'Alcanzaste el límite de imágenes. Espera antes de volver a subir.':'No pudimos completar la subida. La foto guardada se conserva.');}return null;}
    finally{locked.current=false;if(mounted.current)setUploading(false);}
  }
  const title=mode==='event'?'Nuestro evento':creating?'Añadir participante':`Editar a ${person?.name}`;
  const photoErrors=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key.replace('participant.',''),value]));
  return <><AdminHeader title={title} dirty={dirty} busy={busy}/>
    {location.state?.created&&<Notice title="Participante añadido" tone="success">Su lista empieza vacía. Ya puedes subir una foto, preparar sus ideas o emitir su enlace desde Participantes.</Notice>}
    {notice&&<Notice title="Listo" tone="success" live>{notice}</Notice>}<AdminIssue issue={op.issue}/><AdminIssue issue={reviewOp.issue}/>
    {needsReview&&<section className="admin-review" aria-labelledby="admin-review-title"><h2 id="admin-review-title">Tu borrador sigue aquí</h2><p>Comparar no guarda nada. Consulta los datos actuales antes de decidir.</p><Button disabled={!canWrite||busy||op.waiting||reviewOp.waiting} onClick={()=>{void review();}}>Revisar datos guardados</Button>{reviewError&&<p role="alert">No pudimos consultar los datos guardados. Puedes intentarlo otra vez sin perder tu borrador.</p>}
      {latest===null&&<p>{creating?'No hay un alta guardada con este identificador.':'Este participante ya no está disponible. Conservamos tu borrador.'}</p>}
      {latest&&<><h3>Guardado actualmente</h3><dl>{Object.entries(toDraft(latest)).filter(([key])=>mode==='event'?['title','welcome_message','exchange_date'].includes(key):['name','slug','display_order'].includes(key)).map(([key,value])=><div key={key}><dt>{{name:'Nombre',slug:'Slug',display_order:'Orden',title:'Título',welcome_message:'Bienvenida',exchange_date:'Fecha'}[key]}</dt><dd>{String(value)||'Sin completar'}</dd></div>)}</dl>{'person' in latest&&<><p>Mensaje: {latest.person.personal_message||'Sin mensaje'}</p><p>Gustos: {latest.person.general_preferences||'Sin preferencias'}</p><p>Foto: {latest.person.photo_path||latest.person.photo_url||`Ilustración ${latest.person.avatar_key}`}</p></>}
        <div className="admin-actions"><Button variant="secondary" onClick={()=>useLatest(true)}>Seguir con mi borrador</Button><Button variant="quiet" onClick={()=>dirty?setLoadConfirm(true):useLatest(false)}>Cargar datos guardados</Button></div></>}
      {latest===null&&creating&&<Button onClick={()=>useLatest(true)}>Volver a preparar el alta</Button>}
    </section>}
    <form className="admin-form" noValidate onSubmit={(e:FormEvent)=>{e.preventDefault();void save();}}><ErrorSummary errors={Object.entries(fields).map(([key,message])=>({id:fieldTarget(key),message}))}/><fieldset disabled={!canWrite||busy}><legend className="sr-only">{title}</legend>
    {mode==='event'?<><TextField id="admin-title" label="Título del evento" required maxLength={100} value={draft.title} error={fields['event.title']} onChange={(e)=>change('title',e.target.value)}/><TextAreaField id="admin-welcome_message" label="Mensaje de bienvenida" required maxLength={500} value={draft.welcome_message} error={fields['event.welcome_message']} onChange={(e)=>change('welcome_message',e.target.value)}/><TextField id="admin-exchange_date" label="Fecha del intercambio" type="date" value={draft.exchange_date} error={fields['event.exchange_date']} hint="Opcional. Fecha de calendario en Lima; déjala vacía si todavía no la conocen." onChange={(e)=>change('exchange_date',e.target.value)}/></>:<>
      <TextField id="admin-name" label="Nombre" required maxLength={80} value={draft.name} error={fields['participant.name']} onChange={(e)=>change('name',e.target.value)}/>
      <TextField id="admin-slug" label="Slug del enlace público" maxLength={100} value={draft.slug} error={fields['participant.slug']} hint={creating&&autoSlug?'Propuesto desde el nombre. El servidor ajustará colisiones al crear.':'Cambiar el nombre conserva este enlace. Cambiar el slug modifica la URL pública.'} onChange={(e)=>change('slug',e.target.value)}/><p className="admin-public-url">Enlace público resultante: <span>{globalThis.location.origin}/participante/{draft.slug||'participante'}</span></p>
      <TextField id="admin-display_order" label="Orden" inputMode="numeric" value={draft.display_order} error={fields['participant.display_order']} hint={creating?'Opcional. Vacío lo añade al final. También puedes usar Subir/Bajar en el listado.':'Número entero no negativo. También puedes usar Subir/Bajar en el listado.'} onChange={(e)=>change('display_order',e.target.value)}/>
      <ProfilePhotoField draft={draft.photo} base={previewPerson} change={photoChange} restore={()=>{const saved=profileDraft(previewPerson);setDraft((d)=>({...d,photo:{...d.photo,photoSource:saved.photoSource,photo_path:saved.photo_path,photo_url:saved.photo_url}}));}} upload={uploadPhoto} uploading={uploading} uploadIssue={uploadIssue} waiting={uploadAt>Date.now()} allowUpload={!creating} saveLabel="Guardar participante" errors={photoErrors}/>
      <TextAreaField id="admin-personal_message" label="Mensaje personal" maxLength={500} value={draft.photo.personal_message} error={fields['participant.personal_message']} onChange={(e)=>photoChange('personal_message',e.target.value)}/><TextAreaField id="admin-general_preferences" label="Gustos y consideraciones generales" maxLength={2000} value={draft.photo.general_preferences} error={fields['participant.general_preferences']} onChange={(e)=>photoChange('general_preferences',e.target.value)}/>
    </>}
    </fieldset><div className="admin-actions"><Button type="submit" loading={busy} disabled={!canWrite||needsReview||op.waiting}>{busy?'Preparando…':mode==='event'?'Guardar evento':creating?'Crear participante':'Guardar participante'}</Button><Link className="button button--quiet" to="/organizador">Cancelar</Link>{person&&<Link className="text-link" to={`/participante/${person.slug}`}>Ver y editar lista</Link>}</div></form>
    <ConfirmationDialog open={slugConfirm} onOpenChange={(open)=>setSlugConfirm(open)} title="¿Cambiar el enlace público?" description={`El enlace /participante/${person?.slug} dejará de funcionar. El nuevo será /participante/${draft.slug}. El enlace privado seguirá asociado a la misma persona.`} confirmLabel="Sí, cambiar el enlace público" busy={op.busy} onConfirm={()=>{void save(true);}}/>
    <ConfirmationDialog open={loadConfirm} onOpenChange={(open)=>setLoadConfirm(open)} title="¿Descartar el borrador?" description="Cargar los datos guardados reemplazará los cambios que aún no enviaste." confirmLabel="Sí, cargar datos guardados" onConfirm={()=>{useLatest(false);setLoadConfirm(false);}}/>
  </>;
}
