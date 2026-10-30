import { useCallback,useEffect,useRef,useState } from 'react';
import { AppLink as Link } from '../ui/AppLink';
import { useBeforeUnload, useBlocker, useLocation } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { usePrivateAccess } from '../../app/PrivateAccessProvider';
import type { AdminError } from '../../services/organizer';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Feedback';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';

export function AdminHeader({title,dirty=false,busy=false,secret=false}:{title:string;dirty?:boolean;busy?:boolean;secret?:boolean}){
  const {close}=usePrivateAccess(),[confirm,setConfirm]=useState(false),heading=useRef<HTMLHeadingElement>(null);
  const {pathname}=useLocation();
  const pending=dirty||busy||secret;
  const blocker=useBlocker(({currentLocation,nextLocation})=>pending&&currentLocation.pathname+currentLocation.search!==nextLocation.pathname+nextLocation.search);
  useBeforeUnload(useCallback((event)=>{if(pending){event.preventDefault();event.returnValue='';}},[pending]));
  useEffect(()=>{heading.current?.focus();},[]);
  useEffect(()=>{document.title=`${title} · Amigo Secreto`;},[title]);
  return <><div className="admin-top"><Link className="text-link" to="/#participantes"><ArrowLeft aria-hidden="true"/>Ver participantes</Link><Button variant="quiet" disabled={busy} onClick={()=>pending?setConfirm(true):close()}>Cerrar acceso de edición</Button></div>
    <header className="admin-heading"><p className="eyebrow">AMIGO SECRETO · ORGANIZACIÓN</p><h1 ref={heading} tabIndex={-1}>{title}</h1><p>Pequeños detalles para preparar nuestro intercambio.</p></header>
    <nav className="admin-tabs" aria-label="Administración"><Link to="/organizador" aria-current={pathname==='/organizador'?'page':pathname.startsWith('/organizador/participantes/')?'location':undefined}>Participantes</Link><Link to="/organizador/evento" aria-current={pathname==='/organizador/evento'?'page':undefined}>Evento</Link></nav>
    <ConfirmationDialog open={confirm||blocker.state==='blocked'} onOpenChange={(open)=>{if(!open){setConfirm(false);if(blocker.state==='blocked')blocker.reset();}}} title={confirm?'¿Cerrar el acceso?':secret?'¿Ya conservaste el enlace nuevo?':'¿Salir sin guardar?'} description={secret?'El enlace nuevo no se podrá recuperar desde el listado. Guárdalo antes de salir.':busy?'Espera a que termine la operación.':'Se descartarán los cambios de esta página que todavía no guardaste.'} busy={busy} busyLabel="Espera un momento…" confirmLabel={confirm?'Sí, cerrar acceso':'Sí, salir'} onConfirm={()=>{setConfirm(false);if(confirm)close();else if(blocker.state==='blocked')blocker.proceed();}}/>
  </>;
}
export function AdminIssue({issue}:{issue:AdminError|null}){
  if(!issue)return null;
  const message=issue.kind==='access'?'Tu acceso ya no permite hacer cambios. Conservamos el borrador en esta pestaña.':issue.kind==='conflict'?'Los datos cambiaron. Revisa la versión actual antes de volver a guardar.':issue.kind==='uncertain'?'No pudimos confirmar el resultado. La operación podría haberse realizado. Consulta lo guardado antes de volver a enviar.':issue.kind==='rate'?'Has realizado varias solicitudes. Espera antes de volver a intentarlo; no reenviaremos nada automáticamente.':issue.kind==='busy'?'Espera a que termine la operación.':'Revisa los campos indicados antes de guardar.';
  return <Notice title="Revisemos este paso" tone="error" live>{message}</Notice>;
}
export function NewPrivateLink({value,onForget}:{value:string;onForget():void}){
  const [copied,setCopied]=useState(false),[manual,setManual]=useState(false),field=useRef<HTMLInputElement>(null);
  useEffect(()=>{setCopied(false);setManual(false);field.current?.focus();field.current?.select();},[value]);
  return <section className="admin-new-link" aria-labelledby="new-link-title"><h2 id="new-link-title">Conserva este enlace nuevo</h2><p>Solo se muestra ahora. Quien lo tenga podrá editar; entrégalo por el canal privado que elijas.</p><label htmlFor="new-private-link">Enlace privado nuevo</label><input ref={field} id="new-private-link" value={value} readOnly autoComplete="off" spellCheck={false} onFocus={(e)=>e.currentTarget.select()}/><div className="admin-actions"><Button onClick={()=>{void navigator.clipboard?.writeText(value).then(()=>setCopied(true)).catch(()=>{setManual(true);field.current?.focus();field.current?.select();});if(!navigator.clipboard){setManual(true);field.current?.focus();field.current?.select();}}}>Copiar enlace</Button><Button variant="quiet" onClick={onForget}>Ya lo conservé, ocultar enlace</Button></div>{copied&&<p role="status">Enlace copiado.</p>}{manual&&<p role="status">Seleccionamos el enlace. Cópialo manualmente y guárdalo en un lugar privado.</p>}</section>;
}
