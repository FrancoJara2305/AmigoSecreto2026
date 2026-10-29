import { useState } from 'react';
import { Bell, Gift, Snowflake, Star, TreePine } from 'lucide-react';
import type { Participant } from '../../domain/database.types';
import { initials, publicPhoto } from '../../domain/catalogue';

function Reindeer({ strokeWidth }: { strokeWidth?: number }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><path d="M7 10 4 6V2M4 5 1 3M17 10l3-4V2m0 3 3-2M7 10c-4-4-6-2-4 0l4 2m10-2c4-4 6-2 4 0l-4 2M7 11v5c0 7 10 7 10 0v-5c-2-3-8-3-10 0Z" /><path d="M9 13v1m6-1v1" /><ellipse cx="12" cy="18" rx="2" ry="1.5" /></svg>;
}
const illustrations = { gift: Gift, tree: TreePine, star: Star, snowflake: Snowflake, bell: Bell, reindeer: Reindeer };
export function ParticipantAvatar({ participant }: { participant: Pick<Participant, 'id' | 'name' | 'photo_path' | 'photo_url' | 'avatar_key'> }) {
  const [brokenSource, setBrokenSource] = useState<string | null>(null);
  const source = publicPhoto(participant, import.meta.env.VITE_SUPABASE_URL ?? '');
  const known = Object.hasOwn(illustrations, participant.avatar_key);
  const Icon = known ? illustrations[participant.avatar_key as keyof typeof illustrations] : null;
  return <span className={`participant-avatar participant-avatar--${known ? participant.avatar_key : 'initials'}`} aria-hidden="true">
    {source && source !== brokenSource
      ? <img src={source} alt="" width="128" height="128" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBrokenSource(source)} />
      : Icon ? <><span className="participant-avatar__halo" /><Icon strokeWidth={1.25} /><span className="participant-avatar__spark">✦</span></>
        : <span className="participant-avatar__initials">{initials(participant.name)}</span>}
  </span>;
}
