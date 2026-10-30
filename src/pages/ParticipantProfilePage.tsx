import { useEffect, useRef } from 'react';
import { ArrowLeft, Heart, RotateCcw, Sparkles } from 'lucide-react';
import { AppLink as Link } from '../components/ui/AppLink';
import { useParams } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';
import { ParticipantAvatar } from '../components/participants/ParticipantAvatar';
import { CopyPublicProfile } from '../components/profile/CopyPublicProfile';
import { WishlistGrid } from '../components/profile/WishlistGrid';
import { Button } from '../components/ui/Button';
import { LoadingState, Notice } from '../components/ui/Feedback';
import { usePublicProfile } from '../hooks/usePublicProfile';
import { usePrivateAccess } from '../app/PrivateAccessProvider';
import { scopeCanEdit } from '../domain/private-access';
import { PrivateProfileControls } from '../components/access/PrivateProfileControls';

export function ParticipantProfilePage() {
  const { slug = '' } = useParams();
  const { state, retry } = usePublicProfile(slug);
  const heading = useRef<HTMLHeadingElement>(null);
  const person = state.status === 'ready' ? state.data.participant : null;
  const { state: access } = usePrivateAccess();
  const editable = access.status === 'ready' && person && scopeCanEdit(access.scope, person.id);
  useEffect(() => {
    document.title = person ? `${person.name} · Amigo Secreto` : state.status === 'missing' ? 'Perfil no encontrado · Amigo Secreto' : 'Lista de deseos · Amigo Secreto';
    if (state.status !== 'loading') heading.current?.focus({ preventScroll: true });
  }, [slug, state.status, person?.name]);
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);
  return <AppLayout><div className="profile-page page-width"><Link className="profile-back text-link" to="/#participantes"><ArrowLeft aria-hidden="true" />Volver a participantes</Link>
    {state.status === 'loading' && <section className="profile-state profile-state--loading"><h1>Estamos preparando esta lista</h1><LoadingState label="Buscando sus pequeñas pistas…" /></section>}
    {state.status === 'missing' && <section className="profile-state"><span className="profile-state__symbol" aria-hidden="true"><Sparkles /></span><h1 ref={heading} tabIndex={-1}>No encontramos este perfil</h1><p>Quizá el enlace cambió. Vuelve a los participantes para encontrar su lista.</p></section>}
    {state.status === 'error' && <section className="profile-state"><h1 ref={heading} tabIndex={-1}>Esta lista se hizo esperar</h1><Notice title="No pudimos cargar los deseos" tone="error" live>Inténtalo de nuevo en un momento. Las ideas siguen guardadas.</Notice><Button variant="secondary" icon={<RotateCcw />} onClick={retry}>Volver a intentar</Button></section>}
    {state.status === 'ready' && <><PrivateProfileControls participantId={state.data.participant.id} slug={slug} /><header className="profile-header"><div className="profile-header__identity"><div className="profile-header__avatar"><ParticipantAvatar participant={state.data.participant} /></div><div className="profile-header__copy"><p className="eyebrow"><span aria-hidden="true">✦</span> UNA LISTA CON ILUSIÓN</p><h1 ref={heading} tabIndex={-1}>{state.data.participant.name}</h1>{state.data.participant.personal_message && <p className="profile-header__message">{state.data.participant.personal_message}</p>}</div></div><CopyPublicProfile key={slug} slug={state.data.participant.slug} /></header>
      <section className="profile-wishlist" aria-labelledby="wishlist-title"><div className="profile-section-heading"><div><p className="eyebrow"><span>01</span> PEQUEÑAS PISTAS</p><h2 id="wishlist-title">Mi lista de deseos</h2></div><Sparkles aria-hidden="true" /></div><p className="profile-wishlist__intro">Tres ideas para inspirarte; el orden no indica preferencia.</p><WishlistGrid slots={state.data.slots} actions={editable ? ({ position, gift }) => <Link className="button button--secondary" aria-label={`${gift ? 'Editar regalo de' : 'Añadir regalo a'} la opción ${position}`} to={`/participante/${slug}/regalo/${position}/editar`}>{gift ? 'Editar regalo' : 'Añadir regalo'}</Link> : undefined} /></section>
      <section className="profile-preferences" aria-labelledby="preferences-title"><span className="profile-preferences__icon"><Heart aria-hidden="true" /></span><div><p className="eyebrow"><span>02</span> LOS DETALLES QUE CUENTAN</p><h2 id="preferences-title">Un poquito sobre mis gustos</h2><p>{state.data.participant.general_preferences || 'Todavía no se han añadido gustos o consideraciones generales.'}</p></div></section>
    </>}
  </div></AppLayout>;
}
