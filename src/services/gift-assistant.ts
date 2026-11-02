import { ASSISTANT_LIMITS, validateAssistantReply, validateAssistantRequest, type AssistantRequest } from '../../supabase/functions/_shared/assistant-contract.ts';
import type { PublicConfig } from './public-config.ts';
import { readPublicConfig } from './public-config.ts';
import { retryAfterSeconds } from '../domain/retry-after.ts';

export type AssistantErrorKind = 'invalid' | 'missing' | 'rate' | 'unavailable' | 'provider' | 'offline';
export class AssistantError extends Error {
  readonly kind: AssistantErrorKind; readonly retryAfter: number;
  constructor(kind: AssistantErrorKind, retryAfter = 0) { super('Gift assistant unavailable'); this.kind = kind; this.retryAfter = retryAfter; }
}
async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader(); if (!reader) throw new AssistantError('provider');
  let bytes = 0; let text = ''; const decoder = new TextDecoder();
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > ASSISTANT_LIMITS.response) { await reader.cancel(); throw new AssistantError('provider'); } text += decoder.decode(part.value, { stream: true }); }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}
const endpoint = (config?: PublicConfig) => { const settings = config ?? readPublicConfig(import.meta.env); return { url: `${settings.supabaseUrl}/functions/v1/gift-assistant`, key: settings.publishableKey }; };
// Public endpoint: never sends edit tokens, cookies or referrers.
const transport = { credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' } as const;

// A missing function (404), a switched-off assistant or a network failure all read as unavailable.
export async function loadAssistantAvailability(signal: AbortSignal, config?: PublicConfig, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const { url, key } = endpoint(config);
    const response = await fetcher(url, { method: 'GET', headers: { apikey: key }, ...transport, signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
    if (!response.ok) { void response.body?.cancel().catch(() => {}); return false; }
    const data = await boundedJson(response) as { available?: unknown };
    return data?.available === true;
  } catch (error) { if (signal.aborted) throw error; return false; }
}
export async function askGiftAssistant(request: AssistantRequest, signal: AbortSignal, config?: PublicConfig, fetcher: typeof fetch = fetch): Promise<string> {
  const validation = validateAssistantRequest(request);
  if (!validation.ok) throw new AssistantError('invalid');
  let response: Response;
  try {
    const { url, key } = endpoint(config);
    response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key }, body: JSON.stringify(validation.request), ...transport,
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new AssistantError(globalThis.navigator?.onLine === false ? 'offline' : 'provider');
  }
  try {
    if (!response.ok) {
      const code = await boundedJson(response).then((data) => (data as { error?: { code?: unknown } })?.error?.code, () => undefined);
      if (response.status === 404) throw new AssistantError('missing');
      if (response.status === 429) throw new AssistantError('rate', retryAfterSeconds(response.headers.get('Retry-After')));
      if ([413, 415, 422].includes(response.status)) throw new AssistantError('invalid');
      throw new AssistantError(code === 'UNAVAILABLE' ? 'unavailable' : 'provider');
    }
    const reply = validateAssistantReply(await boundedJson(response));
    if (!reply) throw new AssistantError('provider');
    return reply.answer;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof AssistantError) throw error;
    throw new AssistantError('provider');
  }
}
