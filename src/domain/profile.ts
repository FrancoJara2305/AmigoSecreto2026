import type { Gift, Participant } from './database.types.ts';
import { normalizeHttpsUrl } from './mutation-validation.ts';

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

export function displayPrice(amount: number | null, currency: string | null): string | null {
  if (amount === null || !Number.isFinite(amount) || amount < 0 || !currency || !/^[A-Z]{3}$/.test(currency)) return null;
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency, currencyDisplay: currency === 'PEN' ? 'symbol' : 'code', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function safeExternalUrl(value: string | null): string | null {
  try { return normalizeHttpsUrl(value); } catch { return null; }
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

const clothing: [string, string][] = [['subtype','Prenda'],['size','Talla'],['size_system','Sistema de tallas'],['color','Color'],['alternative_colors','Colores alternativos'],['fit','Ajuste'],['brand','Marca'],['material','Material'],['notes','Notas']];
const object: [string, string][] = [['category','Categoría'],['brand','Marca'],['model','Modelo'],['color','Color'],['dimensions','Dimensiones'],['material','Material'],['specifications','Características'],['notes','Notas']];
export function giftDetails(gift: Pick<Gift, 'gift_type' | 'details'>): { label: string; value: string }[] {
  if (!gift.details || typeof gift.details !== 'object' || Array.isArray(gift.details)) return [];
  const details = gift.details;
  const footwear = gift.gift_type === 'clothing' && details.subtype === 'footwear';
  return (gift.gift_type === 'clothing' ? clothing : object).flatMap(([key, label]) => {
    const raw = details[key];
    let value = typeof raw === 'string' ? raw.trim() : key === 'alternative_colors' && Array.isArray(raw) ? raw.filter((part): part is string => typeof part === 'string' && !!part.trim()).join(', ') : '';
    if (!value) return [];
    if (key === 'subtype' && value === 'footwear') value = 'Calzado';
    return [{ label: footwear && key === 'size' ? 'Numeración' : label, value }];
  });
}
