import { inspectImage, MAX_IMAGE_BYTES } from '../../supabase/functions/_shared/image-inspection.ts';
import { readPublicConfig, type PublicConfig } from './public-config.ts';
import { retryAfterSeconds } from '../domain/retry-after.ts';
export class MediaUploadError extends Error {
  readonly kind: 'invalid'|'access'|'rate'|'unavailable';
  readonly retryAfter: number;
  constructor(kind: MediaUploadError['kind'],retryAfter=0) { super('Media upload unavailable'); this.kind=kind; this.retryAfter=retryAfter; }
}
export async function sendMediaUpload(token: string, participantId: string, purpose: 'gift'|'avatar', file: Blob, signal: AbortSignal,
  config?: PublicConfig, fetcher: typeof fetch=fetch): Promise<string> {
  if (file.size>MAX_IMAGE_BYTES) throw new MediaUploadError('invalid');
  try { inspectImage(new Uint8Array(await file.arrayBuffer()),file.type); } catch { throw new MediaUploadError('invalid'); }
  try {
    const settings=config ?? readPublicConfig(import.meta.env);
    const response=await fetcher(`${settings.supabaseUrl}/functions/v1/media-upload`,{ method:'POST',
      headers:{'Content-Type':file.type,apikey:settings.publishableKey,'X-Edit-Token':token,'X-Participant-Id':participantId,'X-Media-Purpose':purpose},
      body:file,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)]) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new MediaUploadError([401,403].includes(response.status)?'access':response.status===429?'rate':[413,415,422].includes(response.status)?'invalid':'unavailable',response.status===429?retryAfterSeconds(response.headers.get('Retry-After')):0);
    }
    const reader=response.body?.getReader(); if (!reader) throw new MediaUploadError('unavailable');
    let bytes=0; let text=''; const decoder=new TextDecoder();
    try { while (true) {const part=await reader.read(); if (part.done) break; bytes+=part.value.byteLength;
      if (bytes>2048) {await reader.cancel(); throw new MediaUploadError('unavailable');} text+=decoder.decode(part.value,{stream:true});}
    } finally {reader.releaseLock();}
    const data=JSON.parse(text+decoder.decode());
    if (typeof data?.path!=='string' || !new RegExp(`^${participantId}/${purpose}/[0-9a-f-]{36}\\.webp$`).test(data.path)) throw new MediaUploadError('unavailable');
    return data.path;
  } catch(error) { if (error instanceof MediaUploadError) throw error; throw new MediaUploadError('unavailable'); }
}
