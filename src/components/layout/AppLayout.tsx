import type { ReactNode } from 'react';
import { ArrowUpRight, Gift, Leaf } from 'lucide-react';
import { AppLink as Link } from '../ui/AppLink';

export function AppLayout({ title = 'Amigo Secreto 2026', children }: { title?: string; children: ReactNode }) {
  return <div id="inicio" className="catalogue-app">
    <a tabIndex={0} className="skip-link" href="#contenido">Saltar al contenido</a>
    <header className="catalogue-header page-width"><Link className="catalogue-brand" to="/" aria-label={`${title}, inicio`}><span className="catalogue-brand__icon"><Gift aria-hidden="true" /></span><span>{title}</span></Link>
      <nav aria-label="Navegación principal"><Link to="/#participantes">Participantes</Link></nav></header>
    <main id="contenido" tabIndex={-1}>{children}</main>
    <div className="catalogue-closing page-width"><Leaf aria-hidden="true" /><p>Lo bonito es pensar en alguien.</p><span aria-hidden="true">✦</span></div>
    <footer className="catalogue-footer page-width"><p>Hecho para compartir un poquito de ilusión.</p><a tabIndex={0} href="#inicio">Volver arriba<ArrowUpRight aria-hidden="true" /></a></footer>
  </div>;
}
