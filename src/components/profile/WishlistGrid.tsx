import { ArrowUpRight, Gift, Sparkles } from 'lucide-react';
import type { Gift as GiftData } from '../../domain/database.types';
import type { GiftSlot } from '../../domain/profile';
import { displayPrice, giftDetails, safeExternalUrl } from '../../domain/profile';
import { GiftImage } from './GiftImage';
import type { ReactNode } from 'react';

function GiftCard({ gift,priority }: { gift: GiftData; priority:boolean }) {
  const price = displayPrice(gift.reference_price, gift.currency);
  const details = giftDetails(gift);
  const shopUrl = safeExternalUrl(gift.product_url);
  return <><GiftImage key={gift.id} gift={gift} priority={priority} /><div className="gift-card__body"><h3>{gift.title}</h3>
    {gift.description && <p className="gift-card__description">{gift.description}</p>}
    {price && <p className="gift-card__price"><span>Precio referencial</span><strong>{price}</strong></p>}
    {details.length > 0 && <dl className="gift-details">{details.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {shopUrl && <a tabIndex={0} className="gift-card__shop" href={shopUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Ver en la tienda<ArrowUpRight aria-hidden="true" /><span className="sr-only"> (abre en otra pestaña)</span></a>}
  </div></>;
}
function PendingGiftCard() {
  return <div className="pending-gift"><div className="pending-gift__art" aria-hidden="true"><span><Gift strokeWidth={1.2} /></span><Sparkles className="pending-gift__spark" /></div>
    <h3>Regalo pendiente</h3><p>Pronto habrá una pista por aquí.</p></div>;
}
export function WishlistGrid({ slots, actions }: { slots: GiftSlot[]; actions?: (slot: GiftSlot) => ReactNode }) {
  return <ol className="wishlist-grid" aria-label="Tres opciones de regalo">{slots.map(({ position, gift }) => <li key={position} className={`gift-card${gift ? '' : ' gift-card--pending'}`}>
    <div className="gift-card__option"><span>Opción {position}</span><span aria-hidden="true">✧</span></div>
    {gift ? <GiftCard gift={gift} priority={position===1} /> : <PendingGiftCard />}
    {actions && <div className="gift-card__private-actions">{actions({ position, gift })}</div>}
  </li>)}</ol>;
}
