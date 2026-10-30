import { PostgrestClient } from '@supabase/postgrest-js';
import type { Database } from '../domain/database.types';
import { readPublicConfig,type PublicConfig } from './public-config.ts';

export type PublicDataClient=Pick<PostgrestClient<Database>,'from'>;
let publicClient: PublicDataClient | undefined;

export function createPublicDataClient(config:PublicConfig,fetcher:typeof fetch=fetch):PublicDataClient {
  const settings=readPublicConfig({VITE_SUPABASE_URL:config.supabaseUrl,VITE_SUPABASE_PUBLISHABLE_KEY:config.publishableKey,VITE_APP_URL:config.appUrl});
  // Public REST only: no Auth/session, Realtime or Storage SDK in the initial bundle.
  // Database grants/RLS remain the authority for every query.
  return new PostgrestClient<Database>(`${settings.supabaseUrl}/rest/v1`,{
    schema:'public',headers:{apikey:settings.publishableKey,Authorization:`Bearer ${settings.publishableKey}`},
    fetch:(input,init)=>fetcher(input,{...init,credentials:'omit',referrerPolicy:'no-referrer'}),
  });
}

/** Lazy: importing this module neither connects to Supabase nor reads credentials. */
export function getPublicSupabase(): PublicDataClient {
  if (!publicClient) {
    const config = readPublicConfig({
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      VITE_APP_URL: import.meta.env.VITE_APP_URL,
    });
    publicClient = createPublicDataClient(config);
  }
  return publicClient;
}
