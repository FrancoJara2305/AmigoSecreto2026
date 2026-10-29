import { retryAfterSeconds } from '../domain/retry-after.ts';
import type { AccessScope } from '../domain/private-access.ts';
import { parseAccessScope } from '../domain/private-access.ts';
import type { PublicConfig } from './public-config.ts';
import { readPublicConfig } from './public-config.ts';

export class PrivateAccessError extends Error {
  readonly kind: 'denied' | 'temporary' | 'rate-limited';
  readonly retryAfter: number;
  constructor(kind: 'denied' | 'temporary' | 'rate-limited', retryAfter = 0) { super('Private access unavailable'); this.kind = kind; this.retryAfter = retryAfter; }
}
export async function validatePrivateAccess(token: string, participantId: string | undefined, signal: AbortSignal, config?: PublicConfig, fetcher: typeof fetch = fetch): Promise<AccessScope> {
  try {
    const settings = config ?? readPublicConfig(import.meta.env);
    const response = await fetcher(`${settings.supabaseUrl}/functions/v1/wishlist-api`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: settings.publishableKey, 'X-Edit-Token': token },
      body: JSON.stringify({ action: 'validate_access', ...(participantId ? { participant_id: participantId } : {}) }),
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      if (response.status === 429) throw new PrivateAccessError('rate-limited', retryAfterSeconds(response.headers.get('Retry-After')));
      throw new PrivateAccessError([401,403,404,405,413,415,422].includes(response.status) ? 'denied' : 'temporary');
    }
    // Bound the only response body we inspect. Provider error text never reaches the UI.
    const reader = response.body?.getReader();
    if (!reader) throw new PrivateAccessError('temporary');
    const decoder = new TextDecoder(); let text = ''; let bytes = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 8192) { await reader.cancel(); throw new PrivateAccessError('temporary'); }
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    return parseAccessScope(JSON.parse(text));
  } catch (error) {
    if (error instanceof PrivateAccessError) throw error;
    throw new PrivateAccessError('temporary');
  }
}
