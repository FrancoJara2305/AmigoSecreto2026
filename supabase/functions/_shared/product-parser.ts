import { Parser } from 'htmlparser2';
import { productUrl,ProductImportError } from './product-url.ts';
export type MetadataField='title'|'description'|'image_url'|'reference_price'|'currency'|'brand'|'model'|'color'|'material';
export interface ProductMetadata {fields:Partial<Record<MetadataField,string>>;sources:Partial<Record<MetadataField,'json-ld'|'open-graph'|'html'>>;warnings:string[];final_url:string}
const limits:Record<MetadataField,number>={title:120,description:2000,image_url:2048,reference_price:32,currency:3,brand:120,model:120,color:120,material:120};
function plain(value:unknown,max:number):string|undefined {
  if(typeof value!=='string' && typeof value!=='number')return;
  let output='',skip=0;
  const parser=new Parser({onopentag(name){if(['script','style','iframe'].includes(name))skip++;},onclosetag(name){if(['script','style','iframe'].includes(name))skip=Math.max(0,skip-1);},ontext(text){if(!skip)output+=text;}},{decodeEntities:true});
  parser.end(String(value).slice(0,16384));
  output=output.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/gu,' ').trim();
  let text='';for(const char of output){if(text.length+char.length>max)break;text+=char;}
  return text||undefined;
}
function price(value:unknown):string|undefined {
  const text=typeof value==='number'?String(value):typeof value==='string'?value.trim():'';
  if(!/^\d{1,10}([.,]\d{1,2})?$/.test(text))return;
  const [whole,decimals='']=text.replace(',','.').split('.');return `${BigInt(whole)}.${decimals.padEnd(2,'0')}`;
}
function currency(value:unknown):string|undefined {return typeof value==='string'&&/^[A-Za-z]{3}$/.test(value.trim())?value.trim().toUpperCase():undefined;}
function jsonSafe(text:string):unknown {
  let depth=0,nodes=0,quoted=false,escape=false;
  for(const char of text){if(quoted){if(escape)escape=false;else if(char==='\\')escape=true;else if(char==='"')quoted=false;continue;}
    if(char==='"')quoted=true;else if(char==='{'||char==='['){depth++;nodes++;if(depth>24||nodes>2048)throw new Error('JSON limit');}else if(char==='}'||char===']')depth--;}
  return JSON.parse(text);
}
const types=(value:unknown,name:string):boolean=>typeof value==='string'?value===name||value===`https://schema.org/${name}`||value===`http://schema.org/${name}`:Array.isArray(value)&&value.some((v)=>types(v,name));
export function parseProductMetadata(html:string,finalUrl:string):ProductMetadata {
  const final=productUrl(finalUrl).href;
  if(new TextEncoder().encode(html).length>1048576)throw new ProductImportError('TOO_LARGE');
  const result:ProductMetadata={fields:{},sources:{},warnings:[],final_url:final};
  const warn=(code:string)=>{if(!result.warnings.includes(code))result.warnings.push(code);};
  const put=(field:MetadataField,value:unknown,source:'json-ld'|'open-graph'|'html')=>{
    if(result.fields[field]!==undefined)return;
    let text=field==='reference_price'?price(value):field==='currency'?currency(value):plain(value,limits[field]);
    if(field==='image_url' && text){try{text=productUrl(text,final).href;}catch{text=undefined;}}
    if(text!==undefined){result.fields[field]=text;result.sources[field]=source;}
  };
  const meta=new Map<string,string>();const scripts:string[]=[];
  let title='',inTitle=false,inJson=false,buffer='',skipJson=false,jsonBytes=0,tags=0,scriptCount=0;
  const parser=new Parser({
    onopentag(name,attrs){
      if(++tags>10000)throw new ProductImportError('UNSUPPORTED_CONTENT');
      if(name==='meta'){
        const key=(attrs.property??attrs.name??'').toLowerCase();
        if(key && attrs.content && !meta.has(key))meta.set(key,attrs.content.slice(0,8192));
      }
      if(name==='title')inTitle=true;
      if(name==='script' && (attrs.type??'').toLowerCase().split(';')[0].trim()==='application/ld+json'){
        inJson=true;buffer='';skipJson=++scriptCount>16;if(skipJson)warn('JSON_LD_LIMIT');
      }
    },
    ontext(text){
      if(inTitle && title.length<4096)title+=text.slice(0,4096-title.length);
      if(inJson && !skipJson){jsonBytes+=new TextEncoder().encode(text).length;if(jsonBytes>131072){skipJson=true;buffer='';warn('JSON_LD_LIMIT');}else buffer+=text;}
    },
    onclosetag(name){if(name==='title')inTitle=false;if(name==='script'&&inJson){if(!skipJson&&buffer)scripts.push(buffer);inJson=false;}},
  },{decodeEntities:true});
  parser.end(html);
  const products:Record<string,unknown>[]=[];let walked=0;
  for(const text of scripts){
    const previous=products.length;
    try{
      const queue:unknown[]=[jsonSafe(text)];
      while(queue.length){if(++walked>4096)throw new Error('JSON limit');const value=queue.pop();
        if(!value||typeof value!=='object')continue;
        if(Array.isArray(value)){queue.push(...value);continue;}
        const object=value as Record<string,unknown>;
        if(types(object['@type'],'Product'))products.push(object);
        // No remote @context, eval, or external JSON-LD references are followed.
        queue.push(...Object.values(object).filter((v)=>v&&typeof v==='object'));
      }
    }catch{products.splice(previous);warn('JSON_LD_INVALID_OR_LIMIT');}
  }
  let priceAmbiguous=products.length>1||result.warnings.some((w)=>w.startsWith('JSON_LD_'));
  if(products.length>1)warn('MULTIPLE_PRODUCTS');
  if(products.length===1){
    const product=products[0];
    put('title',product.name,'json-ld');put('description',product.description,'json-ld');
    const image=Array.isArray(product.image)?product.image[0]:product.image;
    put('image_url',image&&typeof image==='object'?(image as Record<string,unknown>).url:image,'json-ld');
    for(const field of ['brand','model','color','material'] as const){const value=product[field];put(field,value&&typeof value==='object'?(value as Record<string,unknown>).name:value,'json-ld');}
    const offers=Array.isArray(product.offers)?product.offers:product.offers?[product.offers]:[];
    if(offers.length>1 || (offers[0]&&typeof offers[0]==='object'&&types((offers[0] as Record<string,unknown>)['@type'],'AggregateOffer'))){priceAmbiguous=true;warn('PRICE_AMBIGUOUS');}
    else if(!priceAmbiguous && offers.length===1 && offers[0] && typeof offers[0]==='object'){
      const offer=offers[0] as Record<string,unknown>;
      if(types(offer['@type'],'Offer')||offer['@type']===undefined){put('reference_price',offer.price,'json-ld');put('currency',offer.priceCurrency,'json-ld');}
    }
  }
  // A challenge title is not a useful product suggestion. Never execute scripts to bypass it.
  if(!result.fields.title && /captcha|access denied|just a moment|verify (that )?you are human/i.test(title)){warn('STORE_BLOCKED');return result;}
  put('title',meta.get('og:title'),'open-graph');put('description',meta.get('og:description'),'open-graph');
  put('image_url',meta.get('og:image:secure_url')??meta.get('og:image'),'open-graph');
  if(!priceAmbiguous){put('reference_price',meta.get('product:price:amount')??meta.get('og:price:amount'),'open-graph');put('currency',meta.get('product:price:currency')??meta.get('og:price:currency'),'open-graph');}
  put('title',meta.get('title')??title,'html');put('description',meta.get('description'),'html');
  if(result.fields.reference_price && !result.fields.currency)warn('CURRENCY_MISSING');
  if(!result.fields.title)warn('NO_USABLE_METADATA');else if(!result.fields.description||!result.fields.image_url)warn('PARTIAL_METADATA');
  return result;
}
