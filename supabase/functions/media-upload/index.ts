import { createMediaHandler } from '../_shared/media-handler.ts';
import { createImageNormalizer } from './codec.ts';
import { withRateLimit } from '../_shared/rate-limit.ts';
import { createServerRpc } from '../_shared/server-rpc.ts';
const base=Deno.env.get('SUPABASE_URL');
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const serverRpc=createServerRpc(base,key);
const allowedOrigins=(Deno.env.get('APP_ALLOWED_ORIGINS') ?? '').split(',').map((s)=>s.trim()).filter(Boolean);
function serverHeaders() {
  if (!base || !key) throw new Error('Server configuration unavailable');
  return {apikey:key,Authorization:`Bearer ${key}`};
}
const handler=createMediaHandler({
  allowedOrigins,
  normalize:createImageNormalizer((url)=>Deno.readFile(url)),
  rpc:async(args)=>serverRpc('server_media_upload',args),
  upload:async(path,bytes)=>{
    const response=await fetch(`${base}/storage/v1/object/wishlist-media/${path}`,{method:'POST',
      headers:{...serverHeaders(),'Content-Type':'image/webp','x-upsert':'false','Cache-Control':'3600'},
      body:bytes,signal:AbortSignal.timeout(15000)});
    await response.body?.cancel();
    if (!response.ok) throw new Error('Media storage unavailable');
  },
});
Deno.serve(withRateLimit(handler,{allowedOrigins,endpoint:'media-upload',
  callRpc:(args)=>serverRpc('server_rate_limit',args),ipSource:Deno.env.get('RATE_LIMIT_IP_SOURCE') ?? 'off',
  hmacSecret:Deno.env.get('RATE_LIMIT_HMAC_SECRET'),log:(entry)=>console.log(JSON.stringify(entry)),
}));
