import type { Gift, Participant } from './database.types.ts';
import { safeExternalUrl } from '../../supabase/functions/_shared/gift-facts.ts';
// Shared with the gift assistant on Edge, so prompt and profile describe a gift the same way.
export { displayPrice, giftDetails, safeExternalUrl } from '../../supabase/functions/_shared/gift-facts.ts';

export type PublicParticipant = Pick<Participant, 'id' | 'name' | 'slug' | 'photo_path' | 'photo_url' | 'avatar_key' | 'personal_message' | 'general_preferences'>;
export type GiftSlot = { position: number; gift: Gift | null };
export type PublicProfile = { participant: PublicParticipant; slots: GiftSlot[] };

export function giftSlots(participantId: string, gifts: Gift[]): GiftSlot[] {
  const byPosition = new Map<number, Gift>();
  for (const gift of gifts) {
    if (gift.participant_id !== participantId || ![1,2,3].includes(gift.position) || byPosition.has(gift.position)) throw new Error('Invalid public wishlist');
    byPosition.set(gift.position, gift);
  }
  return [1,2,3].map((position) => ({ position, gift: byPosition.get(position) ?? null }));
}

export function giftImage(gift: Pick<Gift, 'participant_id' | 'image_path' | 'image_url'>, supabaseUrl: string): string | null {
  if (!gift.image_path) return safeExternalUrl(gift.image_url);
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  if (!new RegExp(`^${uuid}$`).test(gift.participant_id) || !new RegExp(`^${gift.participant_id}/gift/${uuid}\\.(webp|jpg|png)$`).test(gift.image_path)) return null;
  return `${supabaseUrl}/storage/v1/object/public/wishlist-media/${gift.image_path}`;
}

export function publicProfileUrl(slug: string, origin: string): string {
  return new URL(`/participante/${encodeURIComponent(slug)}`, new URL(origin).origin).href;
}
