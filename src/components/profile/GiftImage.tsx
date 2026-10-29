import { useState } from 'react';
import { Gift as GiftIcon, ImageOff } from 'lucide-react';
import type { Gift } from '../../domain/database.types';
import { giftImage } from '../../domain/profile';

export function GiftImage({ gift }: { gift: Gift }) {
  const [broken, setBroken] = useState<string | null>(null);
  const source = giftImage(gift, import.meta.env.VITE_SUPABASE_URL ?? '');
  return <div className="gift-image">
    {source && source !== broken ? <img src={source} alt={gift.title} width="480" height="360" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(source)} />
      : <div className="gift-image__fallback">{broken ? <ImageOff aria-hidden="true" /> : <GiftIcon aria-hidden="true" />}<span>{broken ? 'Imagen no disponible' : 'Un deseo por imaginar'}</span></div>}
  </div>;
}
