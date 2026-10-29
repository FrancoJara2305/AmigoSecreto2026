import { useEffect } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { ParticipantCard } from '../components/participants/ParticipantCard';
import { WelcomeHero } from '../components/participants/WelcomeHero';
import { Button } from '../components/ui/Button';
import { EmptyState, Notice } from '../components/ui/Feedback';
import { useCatalogue } from '../hooks/useCatalogue';

export function CataloguePage() {
  const { state, retry } = useCatalogue();
  const data = state.status === 'ready' ? state.data : undefined;
  useEffect(() => { document.title = data?.settings.title ?? 'Amigo Secreto 2026'; }, [data?.settings.title]);
  return <AppLayout title={data?.settings.title}><div className="page-width"><WelcomeHero settings={data?.settings} />
    <div className="catalogue-divider" aria-hidden="true"><span /><Sparkles /><span /></div>
    <section id="participantes" className="catalogue-section" aria-labelledby="participants-title">
      <div className="catalogue-section__heading"><div><p className="eyebrow"><span>01</span> NUESTRO AMIGO SECRETO</p><h2 id="participants-title" tabIndex={-1}>Pequeñas pistas para un gran regalo</h2></div>
        {data && <span className="catalogue-count">{data.participants.length} {data.participants.length === 1 ? 'participante' : 'participantes'}</span>}</div>
      <p className="catalogue-section__intro">Elige a alguien y descubre sus ideas. El orden de los deseos no indica preferencia.</p>
      {state.status === 'loading' && <div className="catalogue-loading" role="status" aria-live="polite"><p className="sr-only">Preparando a los participantes…</p><div className="participants-grid" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <div className="participant-skeleton skeleton" key={index} />)}</div></div>}
      {state.status === 'error' && <div className="catalogue-error"><Notice title="No pudimos preparar el encuentro" tone="error" live><p>Los participantes no se han podido cargar. Inténtalo de nuevo en un momento.</p></Notice>
        <Button variant="secondary" icon={<RotateCcw />} onClick={retry}>Volver a intentar</Button></div>}
      {data && (data.participants.length ? <ul className="participants-grid" aria-label="Participantes">{data.participants.map((person, index) => <ParticipantCard key={person.id} participant={person} index={index} />)}</ul>
        : <EmptyState title="El encuentro está por comenzar" description="Pronto estarán aquí las personas que compartirán esta Navidad." />)}
    </section></div></AppLayout>;
}
