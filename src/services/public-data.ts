import { getPublicSupabase } from './supabase';

// No query runs at import time. The UI will invoke these explicitly in a future iteration.
export async function listParticipants() {
  return getPublicSupabase().from('participants').select('*')
    .order('display_order').order('name').order('id').throwOnError();
}

export async function getEventSettings() {
  return getPublicSupabase().from('event_settings').select('*').eq('id', 1).single().throwOnError();
}

export async function getParticipant(slug: string) {
  return getPublicSupabase().from('participants').select('*').eq('slug', slug).maybeSingle().throwOnError();
}

export async function listGifts(participantId: string) {
  return getPublicSupabase().from('gifts').select('*').eq('participant_id', participantId)
    .order('position').throwOnError();
}
