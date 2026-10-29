// Pure domain rules: no environment, network, React or privileged client dependencies.
export type MutationAction = 'update_profile' | 'create_gift' | 'update_gift' | 'delete_gift';
export const mutationActions = new Set<string>(['update_profile', 'create_gift', 'update_gift', 'delete_gift']);
export interface MutationRpcArgs {
  p_action: MutationAction;
  p_token_hash: string;
  p_participant_id: string;
  p_expected_version: number | null;
  p_position: number | null;
  p_gift_id: string | null;
  p_payload: Record<string, unknown>;
}
export type MutationValidation = { ok: true; args: Omit<MutationRpcArgs, 'p_token_hash'> } |
  { ok: false; fields: Record<string, string> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const avatars = ['gift', 'tree', 'star', 'snowflake', 'bell', 'reindeer'];
const clothingKeys = ['subtype','size','size_system','color','alternative_colors','fit','brand','material','notes'];
const objectKeys = ['category','brand','model','color','dimensions','material','specifications','notes'];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const chars = (value: string) => Array.from(value).length;

export function normalizePrice(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Precio inválido.');
  const text = String(value).trim();
  if (!text) return null;
  if (!/^\d{1,10}([.,]\d{1,2})?$/.test(text)) throw new Error('Usa un precio positivo con hasta dos decimales.');
  const [integer, fraction = ''] = text.replace(',', '.').split('.');
  return `${integer.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
}

export function normalizeHttpsUrl(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Usa un enlace HTTPS público.');
  const text = value.trim();
  if (!text) return null;
  if (text.length > 2048 || /[\s\\\u0000-\u001f]/.test(text)) throw new Error('Usa un enlace HTTPS público.');
  let url: URL;
  try { url = new URL(text); } catch { throw new Error('Usa un enlace HTTPS público.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(url.hostname) ||
    /\.(local|internal|localhost|test|invalid)$/.test(url.hostname) || url.href.length > 2048) {
    throw new Error('Usa un enlace HTTPS público.');
  }
  return url.href;
}

export function validateMutation(value: Record<string, unknown>): MutationValidation {
  const fields: Record<string, string> = Object.create(null);
  const action = value.action as MutationAction;
  if (!mutationActions.has(action)) return { ok: false, fields: { action: 'Operación no permitida.' } };
  const profile = action === 'update_profile';
  const creating = action === 'create_gift';
  const deleting = action === 'delete_gift';
  const topKeys = ['action', 'participant_id', ...(creating ? [] : ['expected_version']),
    ...(profile ? [] : ['position']), ...(!profile && !creating ? ['gift_id'] : []),
    ...(deleting ? [] : [profile ? 'profile' : 'gift'])];
  if (Object.keys(value).some((key) => !topKeys.includes(key))) fields.request = 'Hay campos no permitidos.';
  if (typeof value.participant_id !== 'string' || !uuid.test(value.participant_id)) fields.participant_id = 'Participante inválido.';
  if (!creating && (!Number.isInteger(value.expected_version) || Number(value.expected_version) < 1 || Number(value.expected_version) > 2147483647)) {
    fields.expected_version = 'Recarga los datos antes de guardar.';
  }
  if (!profile && (!Number.isInteger(value.position) || Number(value.position) < 1 || Number(value.position) > 3)) fields.position = 'Elige una opción del 1 al 3.';
  if (!profile && !creating && (typeof value.gift_id !== 'string' || !uuid.test(value.gift_id))) fields.gift_id = 'Regalo inválido.';
  const source = deleting ? {} : value[profile ? 'profile' : 'gift'];
  if (!record(source) || (!deleting && !Object.keys(source).length)) fields.payload = 'Incluye los datos que deseas guardar.';
  const payload: Record<string, unknown> = {};
  const allowed = profile ? ['photo_url','photo_path','avatar_key','personal_message','general_preferences'] :
    ['title','description','image_url','image_path','product_url','reference_price','currency','gift_type','details'];
  if (record(source)) {
    for (const [key, item] of Object.entries(source)) {
      if (!allowed.includes(key)) { fields[key] = 'Campo no permitido.'; continue; }
      if (key.endsWith('_url')) {
        try { payload[key] = normalizeHttpsUrl(item); } catch (error) { fields[key] = (error as Error).message; }
      } else if (key === 'reference_price') {
        try { payload[key] = normalizePrice(item); } catch (error) { fields[key] = (error as Error).message; }
      } else if (key === 'details') {
        const keys = source.gift_type === 'clothing' ? clothingKeys : source.gift_type === 'object' ? objectKeys : [...clothingKeys, ...objectKeys];
        if (!record(item) || new TextEncoder().encode(JSON.stringify(item)).length > 8192) {
          fields.details = 'Los detalles deben ser un objeto de hasta 8 KiB.'; continue;
        }
        const details: Record<string, unknown> = {};
        for (const [detail, detailValue] of Object.entries(item)) {
          if (!keys.includes(detail)) { fields[`details.${detail}`] = 'Detalle no permitido para este tipo.'; continue; }
          if (detail === 'alternative_colors') {
            if (!Array.isArray(detailValue) || detailValue.length > 8 || detailValue.some((s) => typeof s !== 'string' || chars(s) > 80)) {
              fields[`details.${detail}`] = 'Incluye hasta ocho colores de 80 caracteres.';
            } else details[detail] = detailValue.map((s: string) => s.trim());
          } else if (typeof detailValue !== 'string' || chars(detailValue) > (['notes','specifications'].includes(detail) ? 1000 : 120)) {
            fields[`details.${detail}`] = 'Detalle inválido o demasiado largo.';
          } else details[detail] = detailValue.trim();
        }
        payload.details = details;
      } else if (key === 'gift_type') {
        if (typeof item !== 'string' || !['clothing','object'].includes(item)) fields.gift_type = 'Elige Prenda de vestir u Objeto.';
        else payload[key] = item;
      } else if (key === 'avatar_key') {
        if (typeof item !== 'string' || !avatars.includes(item)) fields.avatar_key = 'Elige un avatar disponible.';
        else payload[key] = item;
      } else if (key === 'currency') {
        if (item === null) payload.currency = null;
        else if (typeof item !== 'string' || !/^[A-Z]{3}$/.test(item.trim().toUpperCase())) fields.currency = 'Usa un código de moneda de tres letras.';
        else payload.currency = item.trim().toUpperCase();
      } else if (key.endsWith('_path')) {
        if (item === null || item === '') payload[key] = null;
        else if (typeof item !== 'string' || !/^[0-9a-f-]{36}\/(avatar|gift)\/[0-9a-f-]{36}\.(webp|jpg|png)$/.test(item) ||
          item.split('/')[0] !== value.participant_id) fields[key] = 'El archivo debe pertenecer a este participante.';
        else payload[key] = item;
      } else {
        const limit = key === 'title' ? 120 : key === 'personal_message' ? 500 : key.endsWith('_path') ? 512 : 2000;
        if (item === null && key !== 'title') payload[key] = null;
        else if (typeof item !== 'string' || chars(item) > limit || (key === 'title' && !item.trim())) fields[key] = `Usa texto de hasta ${limit} caracteres.`;
        else payload[key] = item.trim();
      }
    }
    if (creating) {
      if (typeof payload.title !== 'string' || !payload.title) fields.title = 'Añade el título del regalo.';
      if (!payload.gift_type) fields.gift_type = 'Elige Prenda de vestir u Objeto.';
      if (!('currency' in payload)) payload.currency = 'PEN';
    }
    if (payload.reference_price !== undefined && payload.reference_price !== null && payload.currency === null) fields.currency = 'El precio necesita una moneda.';
    const urlKey = profile ? 'photo_url' : 'image_url';
    const pathKey = profile ? 'photo_path' : 'image_path';
    if (payload[urlKey] != null && payload[pathKey] != null) fields[pathKey] = 'Usa una URL o un archivo, no ambos.';
    else if (payload[urlKey] != null) payload[pathKey] = null;
    else if (payload[pathKey] != null) payload[urlKey] = null;
  }
  if (Object.keys(fields).length) return { ok: false, fields };
  return { ok: true, args: { p_action: action, p_participant_id: value.participant_id as string,
    p_expected_version: creating ? null : value.expected_version as number,
    p_position: profile ? null : value.position as number,
    p_gift_id: profile || creating ? null : value.gift_id as string,
    p_payload: payload } };
}
