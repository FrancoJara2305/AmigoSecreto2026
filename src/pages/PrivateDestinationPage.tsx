import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { usePrivateAccess } from '../app/PrivateAccessProvider';
import { usePublicProfile } from '../hooks/usePublicProfile';
import { scopeCanEdit } from '../domain/private-access';
import { AppLayout } from '../components/layout/AppLayout';
import { AccessFeedback } from '../components/access/AccessFeedback';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/ui/Feedback';

// T12 protects navigation; the actual forms/panel remain in T13, T18 and T20.
export function PrivateDestinationPage({ mode }: { mode: 'organizer' | 'profile' | 'gift' }) {
  const { slug = '', position = '' } = useParams();
  const location = useLocation();
  const key = `${location.key}:${location.pathname}`;
  const { state, verify, close } = usePrivateAccess();
  const { state: profile, retry: retryProfile } = usePublicProfile(mode === 'organizer' ? '' : slug);
  const person = profile.status === 'ready' ? profile.data.participant : null;
  const [attempt, setAttempt] = useState(0);
  const [checked, setChecked] = useState<{ key: string; participantId?: string; tokenId: string | null } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const validPosition = mode !== 'gift' || ['1','2','3'].includes(position);
  useEffect(() => {
    if (!validPosition || (mode !== 'organizer' && !person)) return;
    let active = true;
    void verify(person?.id).then((scope) => {
      if (active) setChecked({ key, participantId: person?.id, tokenId: scope && (mode !== 'organizer' || scope.accessType === 'organizer') ? scope.tokenId : null });
    });
    return () => { active = false; };
  }, [key, person?.id, validPosition, mode, attempt, verify]);
  const allowed = state.status === 'ready' && checked?.key === key && checked.tokenId === state.scope.tokenId && validPosition &&
    (mode === 'organizer' ? state.scope.accessType === 'organizer' : !!person && checked.participantId === person.id && scopeCanEdit(state.scope, person.id));
  useEffect(() => { document.title = 'Acceso de edición · Amigo Secreto'; if (allowed || profile.status === 'missing' || profile.status === 'error') heading.current?.focus(); }, [allowed, key, profile.status]);
  if (state.status === 'closed' || state.status === 'unavailable' || state.status === 'temporary' || !validPosition || (state.status === 'ready' && mode === 'organizer' && state.scope.accessType !== 'organizer') || (state.status === 'ready' && person && !scopeCanEdit(state.scope, person.id))) {
    return <AppLayout><div className="page-width"><AccessFeedback state={state} retry={() => setAttempt((value) => value + 1)} close={close} /></div></AppLayout>;
  }
  if (mode !== 'organizer' && (profile.status === 'missing' || profile.status === 'error')) return <AppLayout><section className="profile-state page-width"><h1 ref={heading} tabIndex={-1}>{profile.status === 'missing' ? 'No encontramos este participante' : 'No pudimos cargar el destino'}</h1>{profile.status === 'error' && <Button variant="secondary" onClick={retryProfile}>Volver a intentar</Button>}<Link className="text-link" to="/#participantes">Volver a participantes</Link></section></AppLayout>;
  if (!allowed) return <AppLayout><div className="page-width"><AccessFeedback state={state} checking={state.status === 'checking' || checked?.key !== key} retry={() => setAttempt((value) => value + 1)} close={close} />{mode !== 'organizer' && profile.status === 'loading' && <span className="sr-only"><LoadingState label="Preparando el destino…" /></span>}</div></AppLayout>;
  return <AppLayout><section className="private-destination page-width"><div className="private-access-bar"><span><ShieldCheck aria-hidden="true" />{mode === 'organizer' ? 'Acceso de organizador verificado' : 'Acceso de edición verificado'}</span><Button variant="quiet" onClick={close}>Cerrar acceso de edición</Button></div>
    <h1 ref={heading} tabIndex={-1}>{mode === 'organizer' ? 'Organizar nuestro intercambio' : mode === 'gift' ? `Tu opción ${position}` : `El perfil de ${person?.name}`}</h1>
    <p>{mode === 'organizer' ? 'El acceso está listo. El panel para gestionar participantes y enlaces estará disponible en el siguiente bloque de administración.' : mode === 'gift' ? 'Aquí podrás completar esta idea. El formulario de regalo se incorpora en el siguiente paso.' : 'Aquí podrás actualizar tu foto, mensaje y gustos cuando esté disponible la edición de perfil.'}</p>
    <Link className="text-link" to={mode === 'organizer' ? '/#participantes' : `/participante/${slug}`}><ArrowLeft aria-hidden="true" />{mode === 'organizer' ? 'Ver participantes' : 'Volver a la lista'}</Link>
  </section></AppLayout>;
}
