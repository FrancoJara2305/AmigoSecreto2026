import { ArrowDown } from 'lucide-react';
import { AppLink as Link } from '../ui/AppLink';
import type { CatalogueSettings } from '../../domain/catalogue';
import { ChristmasGifts } from '../illustrations/ChristmasGifts';

export function WelcomeHero({ settings }: { settings?: CatalogueSettings }) {
  return <section className="welcome-hero" aria-labelledby="welcome-title">
    <div className="welcome-hero__copy"><p className="eyebrow"><span aria-hidden="true">✦</span> UNA NAVIDAD PARA COMPARTIR</p>
      <h1 id="welcome-title">¡Bienvenido a nuestro<br className="desktop-break" /> Amigo Secreto!</h1>
      <p className="welcome-hero__message">{settings?.welcome_message ?? 'Unas pistas, tres deseos y muchas ganas de sorprender. La ilusión empieza aquí.'}</p>
      <Link className="button button--welcome" to="/#participantes">Ver participantes<ArrowDown aria-hidden="true" /></Link>
      <p className="welcome-hero__footnote">Tres ideas para inspirarte. Un detalle para recordar.</p>
    </div>
    <div className="welcome-hero__art"><ChristmasGifts /></div>
  </section>;
}
