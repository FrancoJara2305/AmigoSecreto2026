import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../domain/database.types';
import { readPublicConfig } from './public-config.ts';

let publicClient: SupabaseClient<Database> | undefined;

/** Lazy: importing this module neither connects to Supabase nor reads credentials. */
export function getPublicSupabase(): SupabaseClient<Database> {
  if (!publicClient) {
    const config = readPublicConfig({
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      VITE_APP_URL: import.meta.env.VITE_APP_URL,
    });
    publicClient = createClient<Database>(config.supabaseUrl, config.publishableKey, {
      db: { schema: 'public' },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return publicClient;
}
