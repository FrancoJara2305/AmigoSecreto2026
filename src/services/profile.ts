import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../domain/database.types.ts';
import type { PublicProfile } from '../domain/profile.ts';
import { giftSlots } from '../domain/profile.ts';
import { getPublicSupabase } from './supabase.ts';

export async function loadPublicProfile(slug: string, signal: AbortSignal, client?: SupabaseClient<Database>): Promise<PublicProfile | null> {
  if (slug.length > 100 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const { data } = await (client ?? getPublicSupabase()).from('participants')
    .select('id,name,slug,photo_path,photo_url,avatar_key,personal_message,general_preferences,gifts(*)')
    .eq('slug', slug).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(12000)])).maybeSingle().throwOnError();
  if (!data) return null;
  const { gifts, ...participant } = data;
  return { participant, slots: giftSlots(participant.id, gifts) };
}
