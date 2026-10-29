import { createProductHandler } from '../_shared/product-handler.ts';
import { withRateLimit } from '../_shared/rate-limit.ts';
import { createServerRpc } from '../_shared/server-rpc.ts';
const allowedOrigins=(Deno.env.get('APP_ALLOWED_ORIGINS')??'').split(',').map((s)=>s.trim()).filter(Boolean);
const rpc=createServerRpc(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const handler=createProductHandler({allowedOrigins,proxyUrl:Deno.env.get('FETCH_PROXY_URL'),secret:Deno.env.get('FETCH_PROXY_HMAC_SECRET'),
  allowLocalProxy:Deno.env.get('APP_LOCAL_FETCH_PROXY')==='1'&&!Deno.env.get('DENO_DEPLOYMENT_ID'),callRpc:rpc});
Deno.serve(withRateLimit(handler,{allowedOrigins,endpoint:'product-metadata',callRpc:(args)=>rpc('server_rate_limit',args),
  ipSource:Deno.env.get('RATE_LIMIT_IP_SOURCE')??'off',hmacSecret:Deno.env.get('RATE_LIMIT_HMAC_SECRET'),log:(entry)=>console.log(JSON.stringify(entry))}));
