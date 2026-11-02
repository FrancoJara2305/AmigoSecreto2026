import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { AppLink as Link } from '../ui/AppLink';
import { publicPhoto, type CatalogueParticipant } from '../../domain/catalogue';
import { ParticipantAvatar } from './ParticipantAvatar';

// Same condition as the hover reveal in catalogue.css.
const HOVER_MODE = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';

export function ParticipantCard({ participant, index }: { participant: CatalogueParticipant; index: number }) {
  const [broken, setBroken] = useState<string | null>(null), [revealed, setRevealed] = useState(false);
  const item = useRef<HTMLLIElement>(null);
  const source = publicPhoto(participant, import.meta.env.VITE_SUPABASE_URL ?? '');
  const photo = source && source !== broken ? source : null;
  // Without a hovering pointer, the photo takes over the card while it crosses the middle of the screen.
  useEffect(() => {
    const element = item.current;
    if (!photo || !element || typeof IntersectionObserver === 'undefined') return;
    const hover = matchMedia(HOVER_MODE);
    let observer: IntersectionObserver | null = null;
    const sync = () => {
      observer?.disconnect(); observer = null; setRevealed(false);
      if (hover.matches) return;
      observer = new IntersectionObserver(([entry]) => setRevealed(entry.isIntersecting), { rootMargin: '-45% 0px -45% 0px' });
      observer.observe(element);
    };
    sync(); hover.addEventListener('change', sync);
    return () => { observer?.disconnect(); hover.removeEventListener('change', sync); };
  }, [photo]);
  return <li ref={item}><Link to={`/participante/${encodeURIComponent(participant.slug)}`} className={`participant-card${photo ? ' participant-card--photo' : ''}`} data-revealed={revealed || undefined}>
    <span className="participant-card__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    <span className="participant-card__corner" aria-hidden="true">✧</span>
    {photo
      ? <span className="participant-card__photo" aria-hidden="true"><img src={photo} alt="" width="480" height="480" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(photo)} /></span>
      : <span className="participant-card__avatar"><ParticipantAvatar participant={{ ...participant, photo_path: null, photo_url: null }} /></span>}
    <h3 className="participant-card__name">{participant.name}</h3>
    <span className="participant-card__bottom"><span>{participant.giftCount} de 3 ideas</span><ArrowUpRight aria-hidden="true" /></span>
  </Link></li>;
}
