import { hashToken, isToken } from './tokens.ts';
import { ImageValidationError, inspectImage, MAX_IMAGE_BYTES } from './image-inspection.ts';
export interface MediaRpcArgs { p_action: 'reserve'|'complete'; p_token_hash: string; p_participant_id: string; p_purpose: 'gift'|'avatar'; p_path?: string; p_size?: number }
export interface MediaRpcResult { ok: boolean; path?: string; status?: number; error?: string; retry_after?: number }
export interface MediaDependencies {
  allowedOrigins: string[];
  rpc(args: MediaRpcArgs): Promise<MediaRpcResult>;
  normalize(bytes: Uint8Array, mime: string, purpose: 'gift'|'avatar'): Promise<Uint8Array>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function createMediaHandler(deps: MediaDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin=request.headers.get('Origin');
    const headers=new Headers({ 'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
      'X-Content-Type-Options':'nosniff',Vary:'Origin','Access-Control-Expose-Headers':'Retry-After' });
    const reply=(status: number,data: unknown) => new Response(JSON.stringify(data),{status,headers});
    const fail=(status: number,code: string) => reply(status,{error:{code}});
    if (!deps.allowedOrigins.length) return fail(503,'SERVER_ERROR');
    if (origin && !deps.allowedOrigins.includes(origin)) return fail(403,'FORBIDDEN');
    if (origin) headers.set('Access-Control-Allow-Origin',origin);
    if (request.method==='OPTIONS') {
      headers.set('Access-Control-Allow-Methods','POST');
      headers.set('Access-Control-Allow-Headers','content-type, x-edit-token, x-participant-id, x-media-purpose, apikey, authorization');
      return new Response(null,{status:204,headers});
    }
    if (request.method!=='POST') { headers.set('Allow','POST, OPTIONS'); return fail(405,'METHOD_NOT_ALLOWED'); }
    if (new URL(request.url).search) return fail(422,'INVALID_REQUEST');
    const token=request.headers.get('X-Edit-Token');
    if (!isToken(token)) return fail(401,'ACCESS_UNAVAILABLE');
    const participant=request.headers.get('X-Participant-Id') ?? '';
    const purpose=request.headers.get('X-Media-Purpose');
    const mime=request.headers.get('Content-Type') ?? '';
    if (!uuid.test(participant) || (purpose!=='gift' && purpose!=='avatar')) return fail(422,'INVALID_REQUEST');
    if (!['image/jpeg','image/png','image/webp'].includes(mime)) return fail(415,'INVALID_IMAGE');
    const declared=request.headers.get('Content-Length');
    if (declared && (!/^\d+$/.test(declared) || Number(declared)>MAX_IMAGE_BYTES)) return fail(413,'IMAGE_TOO_LARGE');
    const rpcFailure=(result: MediaRpcResult) => {
      const status=[401,403,404,422,429].includes(result.status ?? 0)?result.status!:503;
      if (status===429) headers.set('Retry-After',String(Math.max(1,Math.min(3600,Number(result.retry_after)||60))));
      return fail(status,['ACCESS_UNAVAILABLE','FORBIDDEN','NOT_FOUND','INVALID_REQUEST','RATE_LIMITED'].includes(result.error ?? '')?result.error!:'SERVER_ERROR');
    };
    try {
      const hash=await hashToken(token);
      // Authorization + persistent quota BEFORE reading any binary body.
      const reservation=await deps.rpc({p_action:'reserve',p_token_hash:hash,p_participant_id:participant,p_purpose:purpose});
      if (!reservation.ok) return rpcFailure(reservation);
      const path=reservation.path;
      if (!path || !new RegExp(`^${participant}/${purpose}/[0-9a-f-]{36}\\.webp$`).test(path)) return fail(503,'SERVER_ERROR');
      const reader=request.body?.getReader(); if (!reader) return fail(422,'INVALID_IMAGE');
      const chunks: Uint8Array[]=[]; let length=0; let timedOut=false;
      const timer=setTimeout(() => {timedOut=true; void reader.cancel().catch(() => {});},10000);
      try {
        while (true) { const part=await reader.read(); if (part.done) break; length+=part.value.byteLength;
          if (length>MAX_IMAGE_BYTES) {await reader.cancel(); return fail(413,'IMAGE_TOO_LARGE');} chunks.push(part.value);
        }
      } finally {clearTimeout(timer); reader.releaseLock();}
      if (timedOut || !length || (declared && Number(declared)!==length)) return fail(422,'INVALID_IMAGE');
      const bytes=new Uint8Array(length); let offset=0;
      for (const chunk of chunks) {bytes.set(chunk,offset); offset+=chunk.length;}
      inspectImage(bytes,mime);
      const normalized=await deps.normalize(bytes,mime,purpose);
      const output=inspectImage(normalized,'image/webp');
      if (Math.max(output.width,output.height)>(purpose==='gift'?1200:512) || normalized.length>(purpose==='gift'?400_000:150_000)) return fail(422,'INVALID_IMAGE');
      await deps.upload(path,normalized);
      // Re-authorize after CPU/Storage I/O. Failures remain pending for safe cleanup.
      const complete=await deps.rpc({p_action:'complete',p_token_hash:hash,p_participant_id:participant,p_purpose:purpose,p_path:path,p_size:normalized.length});
      if (!complete.ok) return rpcFailure(complete);
      return reply(201,{path,mime:'image/webp',size:normalized.length});
    } catch(error) {
      if (error instanceof ImageValidationError) return fail(422,'INVALID_IMAGE');
      if (error instanceof Error && error.message==='IMAGE_BUSY') {headers.set('Retry-After','2'); return fail(429,'RATE_LIMITED');}
      return fail(503,'SERVER_ERROR');
    }
  };
}
