import type { ReactNode } from 'react';
import { ArrowUpRight, Eye, Gift, Leaf, Settings2 } from 'lucide-react';
import { useLocation } from 'react-router';
import { AppLink as Link } from '../ui/AppLink';
import { usePrivateAccess } from '../../app/PrivateAccessProvider';

export function AppLayout({ title = 'Amigo Secreto 2026', children }: { title?: string; children: ReactNode }) {
  const { state } = usePrivateAccess();
  const { pathname } = useLocation();
  // With organizer access open, the header always offers both views, so neither needs a detour through a profile.
  const organizer = state.status === 'ready' && state.scope.accessType === 'organizer';
  const inPanel = pathname === '/organizador' || pathname.startsWith('/organizador/');
  return <div id="inicio" className="catalogue-app">
    <a tabIndex={0} className="skip-link" href="#contenido">Saltar al contenido</a>
    <header className="catalogue-header page-width"><Link className="catalogue-brand" to="/" aria-label={`${title}, inicio`}><span className="catalogue-brand__icon"><Gift aria-hidden="true" /></span><span>{title}</span></Link>
      {organizer
        ? <nav className="organizer-switch" aria-label="Vistas de organizador">
          <Link className="button button--quiet" to="/#participantes" aria-current={inPanel ? undefined : 'page'}><Eye aria-hidden="true" />Vista previa</Link>
          <Link className="button button--secondary" to="/organizador" aria-current={inPanel ? 'page' : undefined}><Settings2 aria-hidden="true" />Panel de organización</Link>
        </nav>
        : <nav aria-label="Navegación principal"><Link to="/#participantes">Participantes</Link></nav>}</header>
    <main id="contenido" tabIndex={-1}>{children}</main>
    <div className="catalogue-closing page-width"><Leaf aria-hidden="true" /><p>Lo bonito es pensar en alguien.</p><span aria-hidden="true">✦</span></div>
    <footer className="catalogue-footer page-width"><p>Hecho para compartir un poquito de ilusión.</p><Link to="#inicio">Volver arriba<ArrowUpRight aria-hidden="true" /></Link></footer>
  </div>;
}
