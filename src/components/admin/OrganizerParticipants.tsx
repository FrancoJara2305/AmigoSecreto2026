import { useEffect,useRef,useState } from 'react';
import { AppLink as Link } from '../ui/AppLink';
import { ArrowUp,ArrowDown,Plus } from 'lucide-react';
import { usePrivateAccess } from '../../app/PrivateAccessProvider';
import { useAdminOperation } from '../../hooks/useAdminOperation';
import type { AdminRequest,AdminRow,AdminSnapshot } from '../../services/organizer';
import { AdminHeader,AdminIssue,NewPrivateLink } from './AdminShared';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';
import { LoadingState,Notice } from '../ui/Feedback';
import { ParticipantAvatar } from '../participants/ParticipantAvatar';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';

const statuses={none:'Sin enlace',active:'Enlace activo',expired:'Enlace vencido',revoked:'Enlace revocado'};
export function OrganizerParticipants({canWrite}:{canWrite:boolean}){
  const op=useAdminOperation(),{state}=usePrivateAccess();
  const [snapshot,setSnapshot]=useState<AdminSnapshot|null>(null),[offset,setOffset]=useState(0),[stale,setStale]=useState(true),[notice,setNotice]=useState('');
  const [selected,setSelected]=useState<AdminRow|null>(null),[deleting,setDeleting]=useState<AdminRow|null>(null),[confirmation,setConfirmation]=useState(''),[dialog,setDialog]=useState<'issue'|'revoke'|'delete'|'rotate'|null>(null),[newLink,setNewLink]=useState('');
  const initialized=useRef(false),linkHeading=useRef<HTMLHeadingElement>(null),deleteHeading=useRef<HTMLHeadingElement>(null);
  async function refresh(nextOffset=offset){setStale(true);try{const result=await op.run({action:'admin_list',limit:100,offset:nextOffset});if(result.snapshot){setSnapshot(result.snapshot);setOffset(nextOffset);setStale(false);setSelected(null);setDeleting(null);setConfirmation('');}}catch{/* op publishes a safe error; stale rows remain read-only. */}}
  useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active&&canWrite&&!initialized.current){initialized.current=true;void refresh();}});return()=>{active=false;};},[canWrite]);
  useEffect(()=>{if(state.status==='closed'||state.status==='unavailable')setNewLink('');},[state.status]);
  useEffect(()=>{if(selected)linkHeading.current?.focus();},[selected?.id]);
  useEffect(()=>{if(deleting)deleteHeading.current?.focus();},[deleting?.id]);
  const disabled=!canWrite||op.busy||op.waiting||stale||!!newLink;
  async function perform(request:AdminRequest,message:string){
    setNotice('');try{const result=await op.run(request);setDialog(null);if(result.private_link)setNewLink(result.private_link);setNotice(message);await refresh();}
    catch{setDialog(null);setStale(true);}
  }
  async function move(person:AdminRow,index:number,direction:'up'|'down'){
    if(disabled||!snapshot)return;let neighbor=snapshot.participants[index+(direction==='up'?-1:1)];
    try{if(!neighbor){const at=offset+index+(direction==='up'?-1:1);const result=await op.run({action:'admin_list',limit:1,offset:at});neighbor=result.snapshot!.participants[0];if(!neighbor){setStale(true);return;}}
      await perform({action:'move_participant',participant_id:person.id,expected_version:person.version,direction,neighbor_id:neighbor.id,neighbor_version:neighbor.version},'Orden actualizado.');
    }catch{setStale(true);}
  }
  const target=dialog==='delete'?deleting:selected;
  function confirm(){if(disabled)return;
    if(dialog==='rotate')void perform({action:'rotate_organizer_link'},'El enlace anterior del organizador dejó de funcionar. Conserva el nuevo.');
    else if(dialog==='delete'&&target&&confirmation===target.name)void perform({action:'delete_participant',participant_id:target.id,expected_version:target.version,confirm_participant_id:target.id},`${target.name} y su lista fueron retirados.`);
    else if(target)void perform({action:dialog==='issue'?'issue_participant_link':'revoke_participant_link',participant_id:target.id},dialog==='issue'?`Nuevo enlace para ${target.name}. El anterior dejó de funcionar.`:`Se revocó el acceso privado de ${target.name}.`);
  }
  return <><AdminHeader title="Organizar nuestro intercambio" busy={op.busy} secret={!!newLink}/>
    <div className="admin-section-heading"><div><h2>Participantes</h2><p>Sus listas y enlaces, a mano.</p></div><Link className="button button--primary" to="/organizador/participantes/nuevo"><Plus aria-hidden="true"/>Añadir participante</Link></div>
    {notice&&<Notice title="Listo" tone="success" live>{notice}</Notice>}<AdminIssue issue={op.issue}/>
    {newLink&&<NewPrivateLink value={newLink} onForget={()=>setNewLink('')}/>}
    {stale&&snapshot&&<p>Consulta la versión actual antes de hacer más cambios.</p>}
    <div className="admin-refresh"><Button variant="secondary" disabled={!canWrite||op.busy||op.waiting} onClick={()=>{void refresh();}}>{stale?'Consultar datos actuales':'Actualizar listado'}</Button>{op.busy&&<span role="status">Preparando el cambio…</span>}</div>
    {!snapshot&&!op.issue&&<LoadingState label="Preparando participantes…"/>}
    {snapshot&&<>{snapshot.total===0?<Notice title="Un intercambio por comenzar">Añade a la primera persona. Su lista empezará vacía.</Notice>:<><p>{snapshot.total} {snapshot.total===1?'participante':'participantes'} · Las listas admiten hasta tres ideas.</p><ul className="admin-roster" aria-label="Participantes del intercambio">{snapshot.participants.map((person,index)=><li key={person.id} className="admin-person"><div className="admin-person__identity"><ParticipantAvatar participant={person}/><div><h3>{person.name}</h3><p>{person.gift_count}/3 regalos · <span>{statuses[person.link.status]}</span></p>{person.link.expires_at&&<p className="field__hint">Vence: {new Date(person.link.expires_at).toLocaleString('es-PE',{timeZone:'America/Lima'})}</p>}</div></div>
      <div className="admin-person__actions"><Link className="text-link" to={`/organizador/participantes/${person.id}/editar`}>Editar datos<span className="sr-only"> de {person.name}</span></Link><Link className="text-link" to={`/participante/${person.slug}`}>Ver y editar lista<span className="sr-only"> de {person.name}</span></Link><Button variant="quiet" disabled={disabled} onClick={()=>{setSelected(person);setDeleting(null);}}>Gestionar enlace privado<span className="sr-only"> de {person.name}</span></Button><Button variant="quiet" disabled={disabled} onClick={()=>{setDeleting(person);setSelected(null);setConfirmation('');}}>Eliminar<span className="sr-only"> a {person.name}</span></Button></div>
      <div className="admin-person__order"><Button variant="secondary" icon={<ArrowUp/>} aria-label={`Subir a ${person.name}`} disabled={disabled||offset+index===0} onClick={()=>{void move(person,index,'up');}}>Subir</Button><Button variant="secondary" icon={<ArrowDown/>} aria-label={`Bajar a ${person.name}`} disabled={disabled||offset+index>=snapshot.total-1} onClick={()=>{void move(person,index,'down');}}>Bajar</Button></div>
    </li>)}</ul></>}
    {(offset>0||offset+snapshot.participants.length<snapshot.total)&&<nav className="admin-actions" aria-label="Páginas de participantes"><Button disabled={op.busy||op.waiting||!canWrite||offset===0} onClick={()=>{void refresh(Math.max(0,offset-100));}}>Anteriores</Button><p>Página {Math.floor(offset/100)+1}</p><Button disabled={op.busy||op.waiting||!canWrite||offset+100>=snapshot.total} onClick={()=>{void refresh(offset+100);}}>Siguientes</Button></nav>}</>}
    {selected&&<section className="admin-detail" aria-labelledby="admin-link-title"><h2 ref={linkHeading} tabIndex={-1} id="admin-link-title">Enlace privado de {selected.name}</h2><p>{statuses[selected.link.status]}. No se pueden recuperar enlaces anteriores. Emitir uno nuevo sustituye al anterior.</p><div className="admin-actions"><Button disabled={disabled} onClick={()=>setDialog('issue')}>Emitir nuevo enlace</Button><Button variant="danger" disabled={disabled||selected.link.status==='none'||selected.link.status==='revoked'} onClick={()=>setDialog('revoke')}>Revocar enlace</Button><Button variant="quiet" onClick={()=>setSelected(null)}>Cerrar gestión de enlace</Button></div></section>}
    {deleting&&<section className="admin-detail" aria-labelledby="admin-delete-title"><h2 ref={deleteHeading} tabIndex={-1} id="admin-delete-title">Eliminar a {deleting.name}</h2><p>Se eliminarán sus regalos y acceso privado. Sus imágenes propias quedarán pendientes de limpieza. Esta acción no se puede deshacer.</p><TextField label={`Escribe ${deleting.name} para confirmar`} value={confirmation} autoComplete="off" onChange={(e)=>setConfirmation(e.target.value)}/><div className="admin-actions"><Button variant="danger" disabled={disabled||confirmation!==deleting.name} onClick={()=>setDialog('delete')}>Confirmar eliminación</Button><Button variant="quiet" onClick={()=>setDeleting(null)}>Conservar participante</Button></div></section>}
    <section className="admin-security"><h2>Tu enlace de organizador</h2><p>Rotarlo invalida el enlace que usaste para entrar. Si se pierde la respuesta, el propietario del proyecto deberá recuperar el acceso mediante el comando local de mantenimiento. No se puede recuperar el enlace anterior desde este panel.</p><Button variant="secondary" disabled={disabled} onClick={()=>setDialog('rotate')}>Rotar mi enlace privado</Button></section>
    <ConfirmationDialog open={dialog!==null} onOpenChange={(open)=>{if(!open)setDialog(null);}} title={dialog==='rotate'?'¿Rotar tu enlace de organizador?':dialog==='delete'?`¿Eliminar a ${target?.name}?`:dialog==='revoke'?`¿Revocar el enlace de ${target?.name}?`:`¿Emitir un enlace para ${target?.name}?`} description={dialog==='rotate'?'El enlace anterior dejará de funcionar. Conserva el nuevo al recibirlo. Si la respuesta se pierde, necesitarás recuperación local por el propietario del proyecto.':dialog==='delete'?'Se eliminarán sus regalos y acceso privado. Las imágenes propias se retirarán mediante el mantenimiento de archivos.':dialog==='revoke'?'La persona ya no podrá guardar cambios desde el enlace anterior, aunque tenga una pestaña abierta.':'El enlace anterior dejará de funcionar. El nuevo se mostrará una sola vez; cópialo y entrégalo de forma privada.'} confirmLabel={dialog==='rotate'?'Sí, rotar mi enlace':dialog==='delete'?'Sí, eliminar participante':dialog==='revoke'?'Sí, revocar enlace':'Sí, emitir enlace'} busy={op.busy} busyLabel="Procesando…" onConfirm={confirm}/>
  </>;
}
