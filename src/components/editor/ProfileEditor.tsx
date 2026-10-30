import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
import { ArrowLeft,Check,RotateCcw } from 'lucide-react';
import { Link,useBeforeUnload,useBlocker } from 'react-router';
import type { EditableProfile } from '../../domain/profile-editor';
import { useProfileEditor } from '../../hooks/useProfileEditor';
import { usePrivateAccess } from '../../app/PrivateAccessProvider';
import { Button } from '../ui/Button';
import { Notice,ErrorSummary } from '../ui/Feedback';
import { TextAreaField } from '../ui/Fields';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { ParticipantAvatar } from '../participants/ParticipantAvatar';
import { ProfilePhotoField } from './ProfilePhotoField';

export function ProfileEditor({initial,canWrite}:{initial:EditableProfile;canWrite:boolean}) {
  const editor=useProfileEditor(initial),{state:access,verify,close}=usePrivateAccess();
  const [confirm,setConfirm]=useState<'close'|'load'|null>(null),[accessWaiting,setAccessWaiting]=useState(false);
  const retryAt=access.status==='temporary'?access.retryAt:0;
  useEffect(()=>{setAccessWaiting(retryAt>Date.now());const timer=setTimeout(()=>setAccessWaiting(false),Math.max(0,retryAt-Date.now()));return()=>clearTimeout(timer);},[retryAt]);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{document.title=`El perfil de ${editor.base.name} · Amigo Secreto`;heading.current?.focus();},[initial.id]);
  const blocker=useBlocker(({currentLocation,nextLocation})=>(editor.dirty||editor.busy)&&currentLocation.pathname+currentLocation.search!==nextLocation.pathname+nextLocation.search);
  useBeforeUnload(useCallback((event)=>{if(editor.dirty||editor.busy){event.preventDefault();event.returnValue='';}},[editor.dirty,editor.busy]));
  useEffect(()=>{if(blocker.state==='blocked'&&!editor.dirty&&!editor.busy)blocker.proceed();},[blocker,editor.dirty,editor.busy]);
  async function submit(event:FormEvent){event.preventDefault();if(canWrite)await editor.save();}
  const issue=editor.issue?.kind==='conflict'?'El perfil cambió desde que lo abriste. Conservamos tu borrador; revisa lo guardado antes de decidir.':editor.issue?.kind==='uncertain'?'No pudimos confirmar el resultado. El perfil podría haberse guardado. Consulta lo guardado antes de volver a enviar.':
    editor.issue?.kind==='access'?'El acceso ya no permite guardar. Tu borrador permanece en esta pestaña.':editor.issue?.kind==='rate'?`Has realizado varias solicitudes. Espera ${Math.max(1,Math.ceil(editor.issue.retryAfter/60))} minuto(s) antes de volver a guardar.`:'Revisa los campos indicados antes de volver a guardar.';
  const errors=Object.entries(editor.fields).filter(([,message])=>!!message).map(([key,message])=>({id:document.getElementById(`profile-${key}`)?`profile-${key}`:'profile-feedback',message}));
  return <section className="gift-editor profile-editor"><div className="editor-navigation"><Link className="text-link" to={`/participante/${editor.base.slug}`}><ArrowLeft aria-hidden="true"/>Volver a la lista</Link><Button variant="quiet" disabled={editor.busy} onClick={()=>editor.dirty?setConfirm('close'):close()}>Cerrar acceso de edición</Button></div>
    <header className="editor-heading"><p className="eyebrow">UN POQUITO MÁS SOBRE TI</p><h1 ref={heading} tabIndex={-1}>El perfil de {editor.base.name}</h1><p>Tu foto, mensaje y gustos acompañan las tres ideas de tu lista. El organizador puede corregir tu nombre.</p></header>
    {!canWrite&&<div className="editor-access-notice"><Notice title={access.status==='checking'?'Comprobando tu acceso…':'La edición está en pausa'} live>Conservamos tu borrador en esta pestaña. Necesitas un acceso válido para guardar.</Notice>{access.status==='temporary'&&<Button variant="secondary" disabled={accessWaiting} onClick={()=>{void verify(initial.id);}}>Volver a comprobar acceso</Button>}</div>}
    <div id="profile-feedback" tabIndex={-1} className="editor-feedback">{editor.notice&&<Notice title="Un paso más cerca" tone="success" live>{editor.notice}</Notice>}{editor.issue&&<Notice title={editor.needsReview?'Revisemos el perfil guardado':'No pudimos guardar el perfil'} tone="error" live>{issue}</Notice>}</div>
    {editor.needsReview&&<section className="editor-review" aria-labelledby="profile-review-title"><h2 id="profile-review-title">Tu borrador sigue aquí</h2><Button variant="secondary" icon={<RotateCcw/>} loading={editor.reviewing} onClick={()=>{void editor.review();}}>Revisar versión actual</Button>
      {editor.reviewError&&<p role="alert">No pudimos consultar el perfil guardado. Puedes intentarlo otra vez sin perder tu borrador.</p>}
      {editor.latest===null&&<p role="alert">Este participante ya no está disponible. Conservamos tu borrador, pero no se puede guardar.</p>}
      {editor.latest&&<div className="editor-review__current"><h3>Guardado actualmente</h3><ParticipantAvatar participant={editor.latest}/><p><strong>{editor.latest.name}</strong></p><dl><dt>Mensaje personal</dt><dd>{editor.latest.personal_message||'Sin mensaje'}</dd><dt>Gustos y consideraciones generales</dt><dd>{editor.latest.general_preferences||'Sin preferencias'}</dd></dl><div className="editor-review__actions"><Button variant="secondary" onClick={()=>editor.useLatest(true)}>Seguir con mi borrador</Button><Button variant="quiet" onClick={()=>editor.dirty?setConfirm('load'):editor.useLatest(false)}>Cargar datos guardados</Button></div><p>Comparar o cargar no guarda nada. Tú decides si enviar después el formulario.</p></div>}
    </section>}
    <form noValidate onSubmit={(event)=>{void submit(event);}}><ErrorSummary errors={errors}/><fieldset className="editor-fields" disabled={editor.busy||!canWrite}><legend className="sr-only">Foto, mensaje y preferencias</legend>
      <ProfilePhotoField draft={editor.draft} base={editor.base} change={editor.change} restore={editor.restorePhoto} upload={editor.upload} uploading={editor.uploading} uploadIssue={editor.uploadIssue} waiting={editor.uploadRateWaiting} errors={editor.fields}/>
      <section className="profile-text-editor"><h2>Un mensaje para quien te regale</h2><TextAreaField id="profile-personal_message" label="Mensaje personal" maxLength={500} value={editor.draft.personal_message} error={editor.fields.personal_message} hint="Opcional, hasta 500 caracteres. Aparecerá junto a tu nombre en el perfil público." onChange={(event)=>editor.change('personal_message',event.target.value)}/><p className="field__hint">{Array.from(editor.draft.personal_message).length}/500 caracteres</p></section>
      <section className="profile-text-editor"><h2>Los detalles que cuentan</h2><TextAreaField id="profile-general_preferences" label="Gustos y consideraciones generales" maxLength={2000} value={editor.draft.general_preferences} error={editor.fields.general_preferences} hint="Colores que te gustan, alergias, materiales que prefieres evitar… Estas pistas son generales; los detalles de cada regalo van en su opción." onChange={(event)=>editor.change('general_preferences',event.target.value)}/><p className="field__hint">{Array.from(editor.draft.general_preferences).length}/2000 caracteres. Esta información será pública.</p></section>
    </fieldset><div className="editor-actions"><Button type="submit" icon={<Check/>} loading={editor.busy} disabled={!canWrite||editor.needsReview||editor.rateWaiting}>{editor.uploading?'Preparando foto…':editor.busy?'Guardando…':'Guardar perfil'}</Button><Link className="button button--quiet" to={`/participante/${editor.base.slug}`}>Cancelar</Link></div></form>
    <ConfirmationDialog open={confirm!==null} onOpenChange={(open)=>{if(!open)setConfirm(null);}} title={confirm==='load'?'¿Cargar los datos guardados?':'¿Cerrar y descartar el borrador?'} description="Se descartarán los cambios sin guardar de esta página. El perfil y los regalos ya guardados se mantienen." confirmLabel={confirm==='load'?'Sí, cargar datos guardados':'Sí, cerrar acceso'} busy={editor.busy} onConfirm={()=>{if(confirm==='load')editor.useLatest(false);else close();setConfirm(null);}}/>
    <ConfirmationDialog open={blocker.state==='blocked'} onOpenChange={(open)=>{if(!open&&blocker.state==='blocked')blocker.reset();}} title={editor.busy?'Estamos preparando tu perfil':'¿Salir sin guardar?'} description={editor.busy?'Espera a que termine la operación antes de salir.':'Se descartará el borrador de esta página. Tu perfil guardado se mantiene.'} confirmLabel="Sí, salir sin guardar" busyLabel="Espera un momento…" busy={editor.busy} onConfirm={()=>{if(blocker.state==='blocked')blocker.proceed();}}/>
  </section>;
}
