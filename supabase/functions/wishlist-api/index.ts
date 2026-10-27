import { createAccessHandler } from '../_shared/access-handler.ts';

const handler = createAccessHandler({
  allowedOrigins: (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  appBaseUrl: Deno.env.get('APP_BASE_URL') ?? '',
  async callRpc(args) {
    const base = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!base || !key) throw new Error('Server configuration unavailable');
    const response = await fetch(`${base}/rest/v1/rpc/server_access`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify(args), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Server operation unavailable');
    return await response.json();
  },
});
Deno.serve(handler);
