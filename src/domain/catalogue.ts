import type { Participant } from './database.types.ts';

export type CatalogueParticipant = Pick<Participant, 'id' | 'name' | 'slug' | 'avatar_key' | 'photo_path' | 'photo_url' | 'display_order'> & { giftCount: number };
export type CatalogueSettings = { title: string; welcome_message: string };
export type CatalogueData = { participants: CatalogueParticipant[]; settings: CatalogueSettings };

export function initials(name: string): string {
  return name.trim().split(/\s+/u).filter(Boolean).slice(0, 2).map((word) => [...word][0]).join('').toLocaleUpperCase('es-PE');
}

// Only published image sources. Private credentials are never used to resolve an avatar.
export function publicPhoto(participant: Pick<Participant, 'id' | 'photo_path' | 'photo_url'>, supabaseUrl: string): string | null {
  if (participant.photo_path) {
    const expected = new RegExp(`^${participant.id}/avatar/[0-9a-f-]{36}\\.(webp|jpg|png)$`);
    if (!expected.test(participant.photo_path)) return null;
    return `${supabaseUrl}/storage/v1/object/public/wishlist-media/${participant.photo_path}`;
  }
  if (!participant.photo_url) return null;
  try {
    const url = new URL(participant.photo_url);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
