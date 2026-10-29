import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import type { CatalogueParticipant } from '../../domain/catalogue';
import { ParticipantAvatar } from './ParticipantAvatar';

export function ParticipantCard({ participant, index }: { participant: CatalogueParticipant; index: number }) {
  return <li><Link to={`/participante/${encodeURIComponent(participant.slug)}`} className="participant-card">
    <span className="participant-card__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    <span className="participant-card__corner" aria-hidden="true">✧</span>
    <span className="participant-card__avatar"><ParticipantAvatar participant={participant} /></span>
    <h3 className="participant-card__name">{participant.name}</h3>
    <span className="participant-card__bottom"><span>{participant.giftCount} de 3 ideas</span><ArrowUpRight aria-hidden="true" /></span>
  </Link></li>;
}
