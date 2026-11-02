import { normalizeHttpsUrl } from './mutation-validation.ts';

// Public gift facts shared by the copy-ready prompt (browser) and the gift assistant (Edge).
// Only public profile data: never names, photos, slugs, ids or private links.
export type PromptGift = {
  title: string; description: string | null; gift_type: 'clothing' | 'object'; details: unknown;
  reference_price: number | null; currency: string | null; product_url: string | null;
};

export function displayPrice(amount: number | null, currency: string | null): string | null {
  if (amount === null || !Number.isFinite(amount) || amount < 0 || !currency || !/^[A-Z]{3}$/.test(currency)) return null;
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency, currencyDisplay: currency === 'PEN' ? 'symbol' : 'code', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function safeExternalUrl(value: string | null): string | null {
  try { return normalizeHttpsUrl(value); } catch { return null; }
}

const clothing: [string, string][] = [['subtype','Prenda'],['size','Talla'],['size_system','Sistema de tallas'],['color','Color'],['alternative_colors','Colores alternativos'],['fit','Ajuste'],['brand','Marca'],['material','Material'],['notes','Notas']];
const object: [string, string][] = [['category','Categoría'],['brand','Marca'],['model','Modelo'],['color','Color'],['dimensions','Dimensiones'],['material','Material'],['specifications','Características'],['notes','Notas']];
export function giftDetails(gift: Pick<PromptGift, 'gift_type' | 'details'>): { label: string; value: string }[] {
  if (!gift.details || typeof gift.details !== 'object' || Array.isArray(gift.details)) return [];
  const details = gift.details as Record<string, unknown>;
  const footwear = gift.gift_type === 'clothing' && details.subtype === 'footwear';
  return (gift.gift_type === 'clothing' ? clothing : object).flatMap(([key, label]) => {
    const raw = details[key];
    let value = typeof raw === 'string' ? raw.trim() : key === 'alternative_colors' && Array.isArray(raw) ? raw.filter((part): part is string => typeof part === 'string' && !!part.trim()).join(', ') : '';
    if (!value) return [];
    if (key === 'subtype' && value === 'footwear') value = 'Calzado';
    return [{ label: footwear && key === 'size' ? 'Numeración' : label, value }];
  });
}

// Collapses whitespace (\s includes U+2028/U+2029), strips control characters and delimiter runs
// so pasted data stays on its own line inside the DATOS block.
export function cleanPromptText(value: string, limit: number): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/<{3,}|>{3,}/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
function giftFacts(gift: PromptGift): string[] {
  const facts = [`Producto: ${cleanPromptText(gift.title, 200)}`, `Tipo: ${gift.gift_type === 'clothing' ? 'Ropa o calzado' : 'Objeto'}`];
  if (gift.description) facts.push(`Descripción: ${cleanPromptText(gift.description, 1000)}`);
  for (const { label, value } of giftDetails(gift)) facts.push(`${label}: ${cleanPromptText(value, 300)}`);
  const price = displayPrice(gift.reference_price, gift.currency);
  if (price) facts.push(`Precio referencial: ${price}`);
  const link = safeExternalUrl(gift.product_url);
  if (link) facts.push(`Enlace de referencia: ${link}`);
  return facts;
}

/** The delimited data block: one saved gift, or the person's general preferences. */
export function giftDataBlock(gift: PromptGift | null, preferences: string | null): string[] {
  const data = gift
    ? ['Ámbito: un regalo concreto de la lista', ...giftFacts(gift)]
    : ['Ámbito: gustos generales de la persona', `Gustos publicados: ${preferences?.trim() ? cleanPromptText(preferences, 1000) : 'No hay gustos publicados.'}`];
  return ['<<<DATOS', ...data, 'DATOS>>>'];
}
