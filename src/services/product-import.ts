import { parseImportResult,type ImportResult } from '../domain/product-import.ts';
import { productUrl } from '../../supabase/functions/_shared/product-url.ts';
import { readPublicConfig,type PublicConfig } from './public-config.ts';
import { retryAfterSeconds } from '../domain/retry-after.ts';

export class ProductLookupError extends Error {
  readonly kind:'invalid'|'access'|'rate'|'unavailable';
  readonly retryAfter:number;
  constructor(kind:ProductLookupError['kind'],retryAfter=0) {super('Product lookup unavailable');this.kind=kind;this.retryAfter=retryAfter;}
}
export async function sendProductImport(token:string,participantId:string,url:string,signal:AbortSignal,config?:PublicConfig,fetcher:typeof fetch=fetch):Promise<ImportResult> {
  let canonical:string;
  try {canonical=productUrl(url.trim()).href;} catch {throw new ProductLookupError('invalid');}
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(20000)]);
  try {
    deadline.throwIfAborted();
    const settings=config??readPublicConfig(import.meta.env);
    const response=await fetcher(`${settings.supabaseUrl}/functions/v1/product-metadata`,{method:'POST',headers:{'Content-Type':'application/json',apikey:settings.publishableKey,'X-Edit-Token':token},
      body:JSON.stringify({participant_id:participantId,url:canonical}),credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:deadline});
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProductLookupError([401,403].includes(response.status)?'access':response.status===429?'rate':response.status===422?'invalid':'unavailable',response.status===429?retryAfterSeconds(response.headers.get('Retry-After')):0);
    }
    const reader=response.body?.getReader();if(!reader)throw new ProductLookupError('unavailable');
    // Enforce cancellation even on a stalled body supplied by a transport/test double.
    const abort=()=>{void reader.cancel().catch(()=>{});};deadline.addEventListener('abort',abort,{once:true});
    let text='',bytes=0;const decoder=new TextDecoder();
    try {
      deadline.throwIfAborted();
      while(true) {const part=await reader.read();deadline.throwIfAborted();if(part.done)break;bytes+=part.value.length;if(bytes>32768){await reader.cancel();throw new ProductLookupError('unavailable');}text+=decoder.decode(part.value,{stream:true});}
    } finally {deadline.removeEventListener('abort',abort);reader.releaseLock();}
    deadline.throwIfAborted();return parseImportResult(JSON.parse(text+decoder.decode()));
  } catch(error) {if(error instanceof ProductLookupError)throw error;throw new ProductLookupError('unavailable');}
}
