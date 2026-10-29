import type { Gift } from '../domain/database.types.ts';
import type { GiftMutation } from '../domain/gift-editor.ts';
import { validateMutation } from '../domain/mutation-validation.ts';
import type { PublicConfig } from './public-config.ts';
import { readPublicConfig } from './public-config.ts';
import { retryAfterSeconds } from '../domain/retry-after.ts';

export type GiftMutationResult = { gift: Gift } | { deleted: { id: string; position: number } };
export class GiftMutationError extends Error {
  readonly kind: 'fields' | 'conflict' | 'uncertain' | 'access' | 'rate' | 'busy';
  readonly fields: Record<string, string>; readonly retryAfter: number;
  constructor(kind: GiftMutationError['kind'], fields: Record<string, string> = {}, retryAfter = 0) { super('Gift mutation unavailable'); this.kind = kind; this.fields = fields; this.retryAfter = retryAfter; }
}
async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader(); if (!reader) throw new GiftMutationError('uncertain');
  let bytes = 0; let text = ''; const decoder = new TextDecoder();
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 32768) { await reader.cancel(); throw new GiftMutationError('uncertain'); } text += decoder.decode(part.value, { stream: true }); }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}
const fieldNames = new Set(['title','gift_type','description','reference_price','currency','product_url','image_url','image_path','details','details.subtype','details.size','details.size_system','details.color','details.alternative_colors','details.fit','details.brand','details.material','details.notes','details.category','details.model','details.dimensions','details.specifications']);
export async function sendGiftMutation(token: string, request: GiftMutation, signal: AbortSignal, config?: PublicConfig, fetcher: typeof fetch = fetch): Promise<GiftMutationResult> {
  const validation = validateMutation(request);
  if (!validation.ok) throw new GiftMutationError('fields', validation.fields);
  if (!['create_gift','update_gift','delete_gift'].includes(request.action)) throw new GiftMutationError('fields');
  const args = validation.args;
  const body = { action: args.p_action, participant_id: args.p_participant_id, position: args.p_position,
    ...(request.action !== 'create_gift' ? { gift_id: args.p_gift_id, expected_version: args.p_expected_version } : {}),
    ...(request.action !== 'delete_gift' ? { gift: args.p_payload } : {}) };
  try {
    const settings = config ?? readPublicConfig(import.meta.env);
    const response = await fetcher(`${settings.supabaseUrl}/functions/v1/wishlist-api`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: settings.publishableKey, 'X-Edit-Token': token },
      body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    });
    if (!response.ok) {
      if (response.status === 422) {
        const data = await boundedJson(response) as { error?: { fields?: unknown } };
        const raw = data?.error?.fields;
        const fields = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).filter(([key, value]) => fieldNames.has(key) && typeof value === 'string' && value.length <= 300)) as Record<string, string> : {};
        throw new GiftMutationError('fields', fields);
      }
      void response.body?.cancel().catch(() => {});
      if ([401,403].includes(response.status)) throw new GiftMutationError('access');
      if ([404,409].includes(response.status)) throw new GiftMutationError('conflict');
      if (response.status === 429) throw new GiftMutationError('rate', {}, retryAfterSeconds(response.headers.get('Retry-After')));
      throw new GiftMutationError('uncertain');
    }
    const data = await boundedJson(response) as { gift?: Gift; deleted?: { id: string; position: number } };
    if (request.action === 'delete_gift') {
      if (data?.deleted?.id !== request.gift_id || data.deleted.position !== request.position) throw new GiftMutationError('uncertain');
      return { deleted: data.deleted };
    }
    const gift = data?.gift;
    if (!gift || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gift.id) || gift.participant_id !== request.participant_id || gift.position !== request.position ||
      typeof gift.title !== 'string' || !gift.title.trim() || !['clothing','object'].includes(gift.gift_type) || !Number.isInteger(gift.version) || gift.version < 1 ||
      (request.action === 'update_gift' && (gift.id !== request.gift_id || gift.version <= request.expected_version))) throw new GiftMutationError('uncertain');
    const columns = ['id','participant_id','position','title','description','image_path','image_url','product_url','reference_price','currency','gift_type','details','version','created_at','updated_at'] as const;
    return { gift: Object.fromEntries(columns.map((column) => [column, gift[column]])) as Gift };
  } catch (error) { if (error instanceof GiftMutationError) throw error; throw new GiftMutationError('uncertain'); }
}
