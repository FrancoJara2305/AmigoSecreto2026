import { useState, useEffect } from 'react';
import { AppLink as Link } from '../ui/AppLink';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { usePrivateAccess } from '../../app/PrivateAccessProvider';
import { scopeCanEdit } from '../../domain/private-access';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Feedback';

export function PrivateProfileControls({ participantId, slug }: { participantId: string; slug: string }) {
  const { state, verify, close } = usePrivateAccess();
  const [waiting, setWaiting] = useState(false);
  const retryAt = state.status === 'temporary' ? state.retryAt : 0;
  useEffect(() => { setWaiting(retryAt > Date.now()); const timer = setTimeout(() => setWaiting(false), Math.max(0, retryAt - Date.now())); return () => clearTimeout(timer); }, [retryAt]);
  function closeAccess() {
    close();
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.profile-header h1')?.focus());
  }
  if (state.status === 'closed' || (state.status === 'ready' && !scopeCanEdit(state.scope, participantId))) return null;
  if (state.status !== 'ready') return <div className="private-status"><Notice title={state.status === 'unavailable' ? 'Este enlace de edición no está disponible' : state.status === 'temporary' ? 'No pudimos comprobar el acceso' : 'Comprobando tu acceso…'} live>
    {state.status === 'unavailable' ? 'Pide un enlace nuevo al organizador. Puedes seguir viendo esta lista pública.' : state.status === 'temporary' ? 'Mientras tanto, la lista permanece en modo de lectura.' : 'En un momento estarán disponibles tus opciones.'}</Notice>
    {state.status === 'temporary' && <Button variant="secondary" disabled={waiting} onClick={() => { void verify(participantId); }}>Volver a intentar</Button>}<Button variant="quiet" onClick={closeAccess}>Cerrar acceso de edición</Button></div>;
  const organizer = state.scope.accessType === 'organizer';
  return <aside className="private-profile-controls" aria-label="Acceso de edición"><div className="private-profile-controls__message"><span className="private-profile-controls__icon">{organizer ? <ShieldCheck aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}</span><div><strong>{organizer ? 'Acceso de organizador' : 'Estás editando tu lista'}</strong><p>{organizer ? 'Puedes acceder a la edición de las listas del intercambio.' : 'Este enlace permite editar tu lista. Guárdalo y no lo compartas.'}</p></div></div><div className="private-profile-controls__actions"><Link className="button button--secondary" to={`/participante/${slug}/editar`}>{organizer ? 'Editar perfil' : 'Editar mi perfil'}</Link>{organizer && <Link className="button button--quiet" to="/organizador">Organizar</Link>}<Button variant="quiet" onClick={closeAccess}>Cerrar acceso de edición</Button></div></aside>;
}
