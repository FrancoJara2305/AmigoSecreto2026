import { createAccessHandler } from '../_shared/access-handler.ts';
import { withRateLimit } from '../_shared/rate-limit.ts';
import { createServerRpc } from '../_shared/server-rpc.ts';

const serverRpc=createServerRpc(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const allowedOrigins=(Deno.env.get('APP_ALLOWED_ORIGINS') ?? '').split(',').map((s)=>s.trim()).filter(Boolean);

const handler = createAccessHandler({
  allowedOrigins,
  appBaseUrl: Deno.env.get('APP_BASE_URL') ?? '',
  callRpc: (args) => serverRpc('server_access', args),
  callMutationRpc: (args) => serverRpc('server_mutate', args),
  callAdminRpc:(args)=>serverRpc('server_admin',args),
});
Deno.serve(withRateLimit(handler,{allowedOrigins,endpoint:'wishlist-api',
  callRpc:(args)=>serverRpc('server_rate_limit',args),ipSource:Deno.env.get('RATE_LIMIT_IP_SOURCE') ?? 'off',
  hmacSecret:Deno.env.get('RATE_LIMIT_HMAC_SECRET'),log:(entry)=>console.log(JSON.stringify(entry)),
}));
