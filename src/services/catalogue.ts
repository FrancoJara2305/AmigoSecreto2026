import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../domain/database.types';
import type { CatalogueData } from '../domain/catalogue';
import { getPublicSupabase } from './supabase.ts';

export async function loadCatalogue(signal: AbortSignal, client: SupabaseClient<Database> = getPublicSupabase()): Promise<CatalogueData> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
  // Two public requests regardless of the number of cards. No per-person gift request.
  const [people, event] = await Promise.all([
    client.from('participants').select('id,name,slug,photo_path,photo_url,avatar_key,display_order,gifts(count)')
      .order('display_order').order('name').order('id').abortSignal(requestSignal).throwOnError(),
    client.from('event_settings').select('title,welcome_message').eq('id', 1)
      .abortSignal(requestSignal).single().throwOnError(),
  ]);
  return {
    participants: people.data.map(({ gifts, ...person }) => {
      const count = gifts[0]?.count;
      if (!Number.isInteger(count) || count < 0 || count > 3) throw new Error('Invalid public gift count');
      return { ...person, giftCount: count };
    }),
    settings: event.data,
  };
}
