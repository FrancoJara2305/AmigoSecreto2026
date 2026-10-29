import type { Gift } from './database.types.ts';
import { validateMutation } from './mutation-validation.ts';

export type GiftDraft = {
  title: string; gift_type: 'clothing' | 'object'; description: string; reference_price: string; currency: string;
  product_url: string; image_url: string; imageSource: 'none' | 'url' | 'existing'; existingPath: string | null;
  clothing: Record<string, string>; object: Record<string, string>;
};
export type GiftMutation = { participant_id: string; position: number } & (
  { action: 'create_gift'; gift: Record<string, unknown> } |
  { action: 'update_gift'; gift_id: string; expected_version: number; gift: Record<string, unknown> } |
  { action: 'delete_gift'; gift_id: string; expected_version: number }
);
export function draftFromGift(gift: Gift | null): GiftDraft {
  const detail: Record<string, string> = {};
  if (gift?.details && typeof gift.details === 'object' && !Array.isArray(gift.details)) for (const [key, value] of Object.entries(gift.details)) {
    if (typeof value === 'string') detail[key] = value;
    else if (key === 'alternative_colors' && Array.isArray(value)) detail[key] = value.filter((part) => typeof part === 'string').join(', ');
  }
  return { title: gift?.title ?? '', gift_type: gift?.gift_type ?? 'object', description: gift?.description ?? '',
    reference_price: gift?.reference_price === null || gift?.reference_price === undefined ? '' : String(gift.reference_price), currency: gift?.currency ?? 'PEN',
    product_url: gift?.product_url ?? '', image_url: gift?.image_url ?? '', existingPath: gift?.image_path ?? null,
    imageSource: gift?.image_path ? 'existing' : gift?.image_url ? 'url' : 'none',
    clothing: gift?.gift_type === 'clothing' ? detail : {}, object: gift?.gift_type === 'object' ? detail : {} };
}
export function draftPayload(draft: GiftDraft): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft[draft.gift_type])) {
    if (!value.trim()) continue;
    details[key] = key === 'alternative_colors' ? value.split(',').map((part) => part.trim()).filter(Boolean) : value;
  }
  return { title: draft.title, gift_type: draft.gift_type, description: draft.description.trim() || null,
    reference_price: draft.reference_price, currency: draft.currency, product_url: draft.product_url.trim() || null,
    image_url: draft.imageSource === 'url' ? draft.image_url.trim() || null : null,
    image_path: draft.imageSource === 'existing' ? draft.existingPath : null, details };
}
export function giftSaveRequest(participantId: string, position: number, base: Gift | null, draft: GiftDraft): GiftMutation {
  const shared = { participant_id: participantId, position, gift: draftPayload(draft) };
  return base ? { ...shared, action: 'update_gift', gift_id: base.id, expected_version: base.version } : { ...shared, action: 'create_gift' };
}
export function draftErrors(request: GiftMutation): Record<string, string> {
  const result = validateMutation(request);
  return result.ok ? {} : result.fields;
}
export function mergeSavedDraft(draft: GiftDraft, gift: Gift): GiftDraft {
  return { ...draftFromGift(gift), [gift.gift_type === 'clothing' ? 'object' : 'clothing']: draft[gift.gift_type === 'clothing' ? 'object' : 'clothing'] };
}
