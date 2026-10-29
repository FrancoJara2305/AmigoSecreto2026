import { isToken } from '../../supabase/functions/_shared/tokens.ts';

export type AccessType = 'participant' | 'organizer';
export type AccessScope = { tokenId: string; accessType: AccessType; participantId: string | null; participantSlug: string | null; expiresAt: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function entryType(path: string): AccessType | null {
  return /^\/acceso\/?$/.test(path) ? 'participant' : /^\/organizador\/acceso\/?$/.test(path) ? 'organizer' : null;
}
export function fragmentCredential(hash: string): string | null {
  if (hash.length !== 50 || !hash.startsWith('#token=')) return null;
  const token = hash.slice(7);
  return isToken(token) ? token : null;
}
export function parseAccessScope(value: unknown, now = Date.now()): AccessScope {
  if (!value || typeof value !== 'object' || !('access' in value)) throw new Error('Unavailable access');
  const raw = value.access;
  if (!raw || typeof raw !== 'object') throw new Error('Unavailable access');
  const access = raw as Record<string, unknown>;
  if (typeof access.token_id !== 'string' || !uuid.test(access.token_id) || !['participant','organizer'].includes(String(access.access_type))) throw new Error('Unavailable access');
  if (access.expires_at !== null && (typeof access.expires_at !== 'string' || !Number.isFinite(Date.parse(access.expires_at)) || Date.parse(access.expires_at) <= now)) throw new Error('Unavailable access');
  if (access.access_type === 'participant') {
    if (typeof access.participant_id !== 'string' || !uuid.test(access.participant_id) || typeof access.participant_slug !== 'string' || access.participant_slug.length > 100 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(access.participant_slug)) throw new Error('Unavailable access');
  } else if (access.participant_id !== null || access.participant_slug !== null) throw new Error('Unavailable access');
  return { tokenId: access.token_id, accessType: access.access_type as AccessType, participantId: access.participant_id as string | null, participantSlug: access.participant_slug as string | null, expiresAt: access.expires_at as string | null };
}
export function scopeCanEdit(scope: AccessScope, participantId: string): boolean {
  return scope.accessType === 'organizer' || scope.participantId === participantId;
}

export function consumePrivateEntry(location: Pick<Location, 'pathname' | 'search' | 'hash'>, history: Pick<History, 'replaceState'>): { type: AccessType; token: string | null } | null {
  const type = entryType(location.pathname);
  const fragment = location.hash;
  const search = location.search;
  // Clean even rejected credentials; never copy them into history.state.
  if (type) {
    history.replaceState(null, '', type === 'participant' ? '/acceso' : '/organizador/acceso');
    return { type, token: search ? null : fragmentCredential(fragment) };
  }
  // A credential on any other route is discarded, never used as authorization.
  if (fragment.includes('token=') || new URLSearchParams(search).has('token')) history.replaceState(null, '', location.pathname);
  return null;
}
