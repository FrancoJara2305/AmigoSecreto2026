import type { GiftDraft } from './gift-editor.ts';
import { productUrl } from '../../supabase/functions/_shared/product-url.ts';

export const importFields = ['title','description','image_url','reference_price','currency','brand','model','color','material'] as const;
export type ImportField = typeof importFields[number];
export type ImportMetadata = { fields: Partial<Record<ImportField,string>>; sources: Partial<Record<ImportField,'json-ld'|'open-graph'|'html'>>; warnings: string[]; final_url: string };
export type ImportResult = { status:'ok'|'partial'; metadata:ImportMetadata } | { status:'manual'; reason:string };
export const importLabels:Record<ImportField,string> = {title:'Título',description:'Descripción',image_url:'Imagen',reference_price:'Precio referencial',currency:'Moneda',brand:'Marca',model:'Modelo',color:'Color',material:'Material'};
const limits:Record<ImportField,number> = {title:120,description:2000,image_url:2048,reference_price:32,currency:3,brand:120,model:120,color:120,material:120};
export function parseImportResult(value:unknown):ImportResult {
  const data=value as Record<string,unknown>;
  if (!data || typeof data!=='object' || Array.isArray(data)) throw new Error('Invalid import');
  if (data.status==='manual' && typeof data.reason==='string' && /^[A-Z_]{1,64}$/.test(data.reason)) return {status:'manual',reason:data.reason};
  if (data.status!=='ok' && data.status!=='partial') throw new Error('Invalid import');
  const raw=data.metadata as ImportMetadata;
  if (!raw || !raw.fields || typeof raw.fields!=='object' || Array.isArray(raw.fields) || !raw.sources || typeof raw.sources!=='object' || Array.isArray(raw.sources) ||
    !Array.isArray(raw.warnings) || raw.warnings.length>20 || raw.warnings.some((w)=>typeof w!=='string'||!/^[A-Z_]{1,64}$/.test(w))) throw new Error('Invalid import');
  const fields:ImportMetadata['fields']={},sources:ImportMetadata['sources']={};
  for (const key of Object.keys(raw.fields)) {
    if (!importFields.includes(key as ImportField)) throw new Error('Invalid import');
    const field=key as ImportField,value=raw.fields[field],source=raw.sources[field];
    if (typeof value!=='string'||!value.trim()||value.length>limits[field]||/[\x00-\x1f\x7f]/.test(value)||!['json-ld','open-graph','html'].includes(source??'')) throw new Error('Invalid import');
    if (field==='image_url') productUrl(value);
    if (field==='reference_price'&&!/^\d{1,10}\.\d{2}$/.test(value)) throw new Error('Invalid import');
    if (field==='currency'&&!/^[A-Z]{3}$/.test(value)) throw new Error('Invalid import');
    fields[field]=value;sources[field]=source;
  }
  if (!fields.title) throw new Error('Invalid import');
  return {status:data.status,metadata:{fields,sources,warnings:[...raw.warnings],final_url:productUrl(raw.final_url).href}};
}
export function importValue(draft:GiftDraft,field:ImportField):string {
  if (field==='image_url') return draft.imageSource==='existing' ? draft.existingPath??'' : draft.imageSource==='url'?draft.image_url:'';
  if (['brand','model','color','material'].includes(field)) return draft[draft.gift_type][field]??'';
  return draft[field as 'title'|'description'|'reference_price'|'currency'];
}
export function availableImportFields(draft:GiftDraft,metadata:ImportMetadata):ImportField[] {
  return importFields.filter((field)=>metadata.fields[field]!==undefined && !(draft.gift_type==='clothing'&&field==='model'));
}
export function defaultImportSelection(draft:GiftDraft,metadata:ImportMetadata):ImportField[] {
  return availableImportFields(draft,metadata).filter((field)=>!importValue(draft,field).trim() && !(field==='reference_price'&&!metadata.fields.currency));
}
export function importPriceIssue(draft:GiftDraft,metadata:ImportMetadata,selected:ReadonlySet<ImportField>,confirmed:boolean):string {
  if (!selected.has('reference_price')) return '';
  if (!metadata.fields.currency) return confirmed?'':'La tienda no informó la moneda. Confírmala antes de aplicar el precio.';
  if (!selected.has('currency')&&draft.currency!==metadata.fields.currency) return `Selecciona también la moneda ${metadata.fields.currency} para aplicar este precio.`;
  return '';
}
export function applyImportFields(draft:GiftDraft,metadata:ImportMetadata,selected:ReadonlySet<ImportField>,confirmed=false):GiftDraft {
  if (importPriceIssue(draft,metadata,selected,confirmed)) throw new Error('Review currency');
  const next={...draft,clothing:{...draft.clothing},object:{...draft.object}};
  for (const field of availableImportFields(draft,metadata)) {
    if (!selected.has(field)) continue;
    const value=metadata.fields[field]!;
    if (field==='image_url') {next.imageSource='url';next.image_url=value;next.existingPath=null;}
    else if (['brand','model','color','material'].includes(field)) next[next.gift_type][field]=value;
    else next[field as 'title'|'description'|'reference_price'|'currency']=value;
  }
  return next;
}
