import type { AccessRpcResult } from './access-handler.ts';
export function createServerRpc(base: string|undefined,key: string|undefined) {
  return async(name: 'server_access'|'server_mutate'|'server_media_upload'|'server_rate_limit'|'server_prepare_import'|'server_claim_import'|'server_admin',args: unknown,signal?:AbortSignal): Promise<AccessRpcResult> => {
    if (!base || !key) throw new Error('Server configuration unavailable');
    const response=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${key}`},
      body:JSON.stringify(args),signal:AbortSignal.any([AbortSignal.timeout(5000),...(signal?[signal]:[])])});
    if (!response.ok) {await response.body?.cancel(); throw new Error('Server operation unavailable');}
    return await response.json();
  };
}
