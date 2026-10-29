import { isToken } from './tokens.ts';

export interface RateLimitResult { ok: boolean; status?: number; retry_after?: number }
export interface RateLimitArgs { p_action: 'request'|'failure'; p_network_hash: string|null }
export interface RequestLog { request_id: string; action: string; status: number; duration_ms: number }
export interface RateLimitDependencies {
  allowedOrigins: string[];
  endpoint: 'wishlist-api'|'media-upload'|'product-metadata';
  callRpc(args: RateLimitArgs): Promise<RateLimitResult>;
  // An explicit deployment assertion; never autodetected from a request/header/domain.
  ipSource?: string;
  hmacSecret?: string;
  log?(entry: RequestLog): void;
}
export function canonicalIp(value: string|null): string|null {
  if (!value || value.length>45 || /[\s,%\[\]]/.test(value)) return null;
  if (!value.includes(':')) {
    const parts=value.split('.');
    return parts.length===4 && parts.every((v)=>/^(0|[1-9]\d{0,2})$/.test(v) && Number(v)<=255) ? value : null;
  }
  try {
    const ip=new URL(`http://[${value}]/`).hostname.slice(1,-1);
    const mapped=/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(ip);
    if (mapped) {const a=parseInt(mapped[1],16),b=parseInt(mapped[2],16); return `${a>>8}.${a&255}.${b>>8}.${b&255}`;}
    return ip;
  } catch {return null;}
}
export async function networkHash(request: Request,source='off',secret?: string): Promise<string|null> {
  if (source==='off') return null; // Ignore ALL forwarded headers in local/unverified environments.
  if (source!=='verified-cloudflare' || !isToken(secret)) throw new Error('Rate limit configuration unavailable');
  // Enable only after the provider contract (including custom/bypass routes) is verified.
  // No X-Forwarded-For/X-Real-IP fallback; malformed/duplicate/missing headers use global limits.
  const ip=canonicalIp(request.headers.get('cf-connecting-ip'));
  if (!ip) return null;
  const raw=Uint8Array.from(atob(secret.replace(/-/g,'+').replace(/_/g,'/')+'='),(c)=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`amigo-secreto/rate-limit/ip/v1\n${ip}`));
  return Array.from(new Uint8Array(signature),(v)=>v.toString(16).padStart(2,'0')).join('');
}
export function retrySeconds(value: unknown): number {
  const seconds=Number(value);
  return Number.isFinite(seconds) && Number.isInteger(seconds) && seconds>0 ? Math.min(3600,seconds) : 60;
}
export function withRateLimit(handler: (request: Request)=>Promise<Response>,deps: RateLimitDependencies) {
  return async(request: Request): Promise<Response> => {
    const started=performance.now(); const id=crypto.randomUUID(); let response: Response;
    const origin=request.headers.get('Origin');
    const fail=(status: number,seconds?: number) => {
      const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
        'X-Content-Type-Options':'nosniff',Vary:'Origin','Access-Control-Expose-Headers':'Retry-After, X-Request-Id'});
      if (origin && deps.allowedOrigins.includes(origin)) headers.set('Access-Control-Allow-Origin',origin);
      if (status===429) headers.set('Retry-After',String(retrySeconds(seconds)));
      return Response.json({error:{code:status===429?'RATE_LIMITED':'SERVER_ERROR',message:status===429?
        'Has realizado varias solicitudes. Espera antes de intentarlo nuevamente.':'No pudimos completar la operación.'}},{status,headers});
    };
    try {
      // Preflights and rejected origins never enter business logic or quota RPCs.
      if (request.method!=='POST' || !deps.allowedOrigins.length || (origin && !deps.allowedOrigins.includes(origin))) response=await handler(request);
      else {
        const hash=await networkHash(request,deps.ipSource ?? 'off',deps.hmacSecret);
        const admission=await deps.callRpc({p_action:'request',p_network_hash:hash});
        if (admission.ok!==true) response=admission.status===429?fail(429,admission.retry_after):fail(503);
        else {
          response=await handler(request);
          if (response.status===401 || response.status===403) {
            const recorded=await deps.callRpc({p_action:'failure',p_network_hash:hash});
            if (recorded.ok!==true) {void response.body?.cancel().catch(()=>{}); response=recorded.status===429?fail(429,recorded.retry_after):fail(503);}
          }
        }
      }
    } catch {response=fail(503);}
    response.headers.set('X-Request-Id',id);
    try {deps.log?.({request_id:id,action:deps.endpoint,status:response.status,duration_ms:Math.round(performance.now()-started)});} catch {/* Logging never changes an authorized result. */}
    return response;
  };
}
