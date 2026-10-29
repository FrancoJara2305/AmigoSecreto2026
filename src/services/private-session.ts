import type { AccessScope, AccessType } from '../domain/private-access.ts';
import { scopeCanEdit } from '../domain/private-access.ts';
import { isToken } from '../../supabase/functions/_shared/tokens.ts';
import { PrivateAccessError, validatePrivateAccess } from './access-validation.ts';
import type { GiftMutation } from '../domain/gift-editor.ts';
import { GiftMutationError, sendGiftMutation } from './gift-mutations.ts';
import { MediaUploadError, sendMediaUpload } from './media-upload.ts';

export type AccessState = { status: 'closed' } | { status: 'pending' | 'checking'; entryType: AccessType } |
  { status: 'ready'; entryType: AccessType; scope: AccessScope } |
  { status: 'unavailable'; entryType: AccessType } |
  { status: 'temporary'; entryType: AccessType; retryAt: number; rateLimited: boolean };
type Validator = (token: string, participantId: string | undefined, signal: AbortSignal) => Promise<AccessScope>;
export function createPrivateSession(validate: Validator = validatePrivateAccess, sendMutation: typeof sendGiftMutation = sendGiftMutation, sendUpload: typeof sendMediaUpload = sendMediaUpload) {
  let credential: string | null = null;
  let kind: AccessType = 'participant';
  let state: AccessState = { status: 'closed' };
  let generation = 0;
  let identity = 0;
  const mutations = new Map<string, AbortController>();
  let pending: { promise: Promise<AccessScope | null>; participantId?: string } | null = null;
  let request: AbortController | null = null;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: AccessState) => { state = next; listeners.forEach((notify) => notify()); };
  function discard() { generation++; identity++; credential = null; request?.abort(); request = null; pending = null; clearTimeout(expiry); mutations.forEach((controller) => controller.abort()); mutations.clear(); }
  function unavailable() { discard(); publish({ status: 'unavailable', entryType: kind }); }
  function scheduleExpiry(scope: AccessScope) {
    clearTimeout(expiry);
    if (!scope.expiresAt) return;
    const remaining = Date.parse(scope.expiresAt) - Date.now();
    if (remaining <= 0) { unavailable(); return; }
    expiry = setTimeout(() => { if (remaining > 2147483647) scheduleExpiry(scope); else unavailable(); }, Math.min(remaining, 2147483647));
  }
  function begin(token: string | null, type: AccessType) {
    discard(); kind = type;
    credential = isToken(token) ? token : null;
    publish(credential ? { status: 'pending', entryType: kind } : { status: 'unavailable', entryType: kind });
  }
  function verify(participantId?: string): Promise<AccessScope | null> {
    if (!credential) return Promise.resolve(null);
    if (state.status === 'temporary' && state.retryAt > Date.now()) return Promise.resolve(null);
    if (state.status === 'ready' && participantId && !scopeCanEdit(state.scope, participantId)) return Promise.resolve(null);
    if (pending && pending.participantId === participantId) return pending.promise;
    request?.abort(); clearTimeout(expiry);
    const current = ++generation;
    const controller = new AbortController(); request = controller;
    const secret = credential;
    publish({ status: 'checking', entryType: kind });
    const promise = Promise.resolve().then(async () => {
      try {
        if (controller.signal.aborted) return null;
        const scope = await validate(secret, participantId, controller.signal);
        if (current !== generation || controller.signal.aborted) return null;
        if (scope.accessType !== kind || (participantId && !scopeCanEdit(scope, participantId)) || (scope.expiresAt && Date.parse(scope.expiresAt) <= Date.now())) { unavailable(); return null; }
        publish({ status: 'ready', entryType: kind, scope }); scheduleExpiry(scope);
        return state.status === 'ready' ? scope : null;
      } catch (error) {
        if (current !== generation || controller.signal.aborted) return null;
        if (error instanceof PrivateAccessError && error.kind === 'denied') unavailable();
        else publish({ status: 'temporary', entryType: kind, retryAt: Date.now() + (error instanceof PrivateAccessError ? error.retryAfter * 1000 : 0), rateLimited: error instanceof PrivateAccessError && error.kind === 'rate-limited' });
        return null;
      } finally { if (current === generation) { pending = null; request = null; } }
    });
    pending = { promise, participantId };
    return promise;
  }
  return {
    begin, verify,
    upload: async (participantId: string, purpose: 'gift'|'avatar', file: Blob, signal: AbortSignal) => {
      if (!credential || state.status!=='ready' || !scopeCanEdit(state.scope,participantId) || (state.scope.expiresAt && Date.parse(state.scope.expiresAt)<=Date.now())) throw new MediaUploadError('access');
      const key=`upload:${participantId}:${purpose}`;
      if (mutations.has(key)) throw new MediaUploadError('rate');
      const controller=new AbortController(); mutations.set(key,controller);
      const currentIdentity=identity; const secret=credential;
      try {
        const result=await sendUpload(secret,participantId,purpose,file,AbortSignal.any([signal,controller.signal]));
        if (identity!==currentIdentity || controller.signal.aborted) throw new MediaUploadError('access');
        return result;
      } catch(error) {
        if (identity===currentIdentity && error instanceof MediaUploadError && error.kind==='access') unavailable();
        throw error;
      } finally { if (mutations.get(key)===controller) mutations.delete(key); }
    },
    mutate: async (mutation: GiftMutation, signal: AbortSignal) => {
      if (!credential || state.status !== 'ready' || !scopeCanEdit(state.scope, mutation.participant_id) || (state.scope.expiresAt && Date.parse(state.scope.expiresAt) <= Date.now())) throw new GiftMutationError('access');
      const key = `${mutation.participant_id}:${mutation.position}`;
      if (mutations.has(key)) throw new GiftMutationError('busy');
      const controller = new AbortController(); mutations.set(key, controller);
      const currentIdentity = identity; const secret = credential;
      try {
        const result = await sendMutation(secret, mutation, AbortSignal.any([signal, controller.signal]));
        if (identity !== currentIdentity || controller.signal.aborted) throw new GiftMutationError('access');
        return result;
      } catch (error) {
        if (identity === currentIdentity && error instanceof GiftMutationError && error.kind === 'access') unavailable();
        throw error;
      } finally { if (mutations.get(key) === controller) mutations.delete(key); }
    },
    snapshot: () => state,
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    close: () => { discard(); publish({ status: 'closed' }); },
  };
}
export const privateSession = createPrivateSession();
