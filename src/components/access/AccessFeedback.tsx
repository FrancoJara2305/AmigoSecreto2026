import { useEffect, useRef, useState } from 'react';
import { AppLink as Link } from '../ui/AppLink';
import { ArrowLeft, Link2Off, RotateCcw } from 'lucide-react';
import type { AccessState } from '../../services/private-session';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/Feedback';

export function AccessFeedback({ state, checking = false, retry, close }: { state: AccessState; checking?: boolean; retry?: () => void; close(): void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const retryAt = state.status === 'temporary' ? state.retryAt : 0;
  const [waiting, setWaiting] = useState(retryAt > Date.now());
  useEffect(() => {
    setWaiting(retryAt > Date.now());
    const timer = setTimeout(() => setWaiting(false), Math.max(0, retryAt - Date.now()));
    return () => clearTimeout(timer);
  }, [retryAt]);
  const loading = checking || state.status === 'checking' || state.status === 'pending';
  const temporary = state.status === 'temporary';
  useEffect(() => { if (!loading) heading.current?.focus(); }, [loading, temporary]);
  return <section className="access-feedback" aria-labelledby="access-title">
    <span className="access-feedback__symbol" aria-hidden="true"><Link2Off /></span>
    <h1 id="access-title" ref={heading} tabIndex={-1}>{loading ? 'Estamos preparando tu lista' : temporary ? 'No pudimos comprobar el enlace' : 'Este enlace de edición no está disponible'}</h1>
    {loading ? <LoadingState label="Comprobando tu acceso…" /> : <>
      <p>{temporary ? state.rateLimited ? 'Has realizado varias solicitudes. Espera unos instantes antes de volver a intentarlo.' : 'La conexión no nos permitió verificar el acceso. Puedes volver a intentarlo.' : 'Pide un enlace nuevo al organizador para editar tu lista.'}</p>
      {temporary && retry && <Button variant="secondary" icon={<RotateCcw />} disabled={waiting} onClick={retry}>Volver a intentar</Button>}
    </>}
    <Link className="text-link" to="/" onClick={close}><ArrowLeft aria-hidden="true" />Volver al catálogo</Link>
  </section>;
}
