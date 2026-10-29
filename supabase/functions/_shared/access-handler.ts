import { generateToken, hashToken, isToken, privateLink } from './tokens.ts';
import { mutationActions, validateMutation, type MutationRpcArgs } from './mutation-validation.ts';

export type AccessAction = 'validate_access' | 'issue_participant_link' | 'revoke_participant_link' | 'rotate_organizer_link';
export interface AccessRpcArgs {
  p_action: AccessAction;
  p_token_hash: string;
  p_participant_id: string | null;
  p_new_hash: string | null;
  p_expires_at: string | null;
}
export type AccessRpcResult = { ok: boolean; error?: string; status?: number; retry_after?: number; [key: string]: unknown };
export interface AccessDependencies {
  allowedOrigins: string[];
  appBaseUrl: string;
  callRpc(args: AccessRpcArgs): Promise<AccessRpcResult>;
  callMutationRpc?(args: MutationRpcArgs): Promise<AccessRpcResult>;
}
const actions = new Set<AccessAction>(['validate_access', 'issue_participant_link', 'revoke_participant_link', 'rotate_organizer_link']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');
}
const messages: Record<string, string> = {
  ACCESS_UNAVAILABLE: 'Este enlace de edición no está disponible.',
  FORBIDDEN: 'Tu enlace no permite realizar esta operación.',
  NOT_FOUND: 'No encontramos este participante.',
  INVALID_REQUEST: 'Revisa los datos de la solicitud.',
  RATE_LIMITED: 'Has realizado varias solicitudes. Inténtalo nuevamente en unos instantes.',
  CONFLICT: 'Los datos cambiaron. Recarga y revisa la versión actual antes de volver a guardar.',
  SERVER_ERROR: 'No pudimos completar la operación. Inténtalo nuevamente.',
};

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('INVALID_REQUEST');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 32768) { await reader.cancel(); throw new Error('PAYLOAD_TOO_LARGE'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
}

export function createAccessHandler(deps: AccessDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Vary': 'Origin',
      'Access-Control-Expose-Headers': 'Retry-After' });
    const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers });
    const fail = (status: number, code: string, fields?: Record<string, string>) => reply(status, { error: {
      code, message: messages[code] ?? 'Solicitud no disponible.', ...(fields ? { fields } : {}) } });
    const rpcFailure = (result: AccessRpcResult) => {
      const code = result.error && messages[result.error] ? result.error : 'SERVER_ERROR';
      if (code === 'RATE_LIMITED') headers.set('Retry-After', String(Math.max(1, Math.min(3600, Number(result.retry_after) || 60))));
      return fail([401, 403, 404, 409, 422, 429].includes(result.status ?? 0) ? result.status! : 503, code);
    };
    if (!deps.allowedOrigins.length) return fail(503, 'SERVER_ERROR');
    if (origin && !deps.allowedOrigins.includes(origin)) return fail(403, 'FORBIDDEN');
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'POST');
      headers.set('Access-Control-Allow-Headers', 'content-type, x-edit-token, apikey, authorization');
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') { headers.set('Allow', 'POST, OPTIONS'); return fail(405, 'METHOD_NOT_ALLOWED'); }
    // Prevent a caller from putting capabilities in URLs/logs or using JWT/API keys as capabilities.
    if (new URL(request.url).search) return fail(422, 'INVALID_REQUEST');
    const token = request.headers.get('x-edit-token');
    if (!isToken(token)) return fail(401, 'ACCESS_UNAVAILABLE');
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
      return fail(415, 'INVALID_REQUEST');
    }
    let payload: Record<string, unknown>;
    try {
      const value = await readBody(request);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(422, 'INVALID_REQUEST');
      payload = value as Record<string, unknown>;
    } catch (error) {
      return fail(error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 422, 'INVALID_REQUEST');
    }
    const action = payload.action;
    if (typeof action !== 'string') return fail(422, 'INVALID_REQUEST');
    if (mutationActions.has(action)) {
      if (!deps.callMutationRpc) return fail(503, 'SERVER_ERROR');
      const validation = validateMutation(payload);
      if (!validation.ok) return fail(422, 'INVALID_REQUEST', validation.fields);
      try {
        const result = await deps.callMutationRpc({ ...validation.args, p_token_hash: await hashToken(token) });
        if (!result.ok) return rpcFailure(result);
        if (action === 'update_profile') return reply(200, { participant: result.participant });
        if (action === 'delete_gift') return reply(200, { deleted: result.deleted });
        return reply(action === 'create_gift' ? 201 : 200, { gift: result.gift });
      } catch { return fail(503, 'SERVER_ERROR'); }
    }
    // Access actions retain the stricter original body bound.
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 4096) return fail(413, 'INVALID_REQUEST');
    if (!actions.has(action as AccessAction) || Object.keys(payload).some((key) => !['action', 'participant_id', 'expires_at'].includes(key))) {
      return fail(422, 'INVALID_REQUEST');
    }
    const participantId = payload.participant_id ?? null;
    if ((participantId !== null && (typeof participantId !== 'string' || !uuid.test(participantId))) ||
        (['issue_participant_link', 'revoke_participant_link'].includes(action) && !participantId) ||
        (action === 'rotate_organizer_link' && participantId !== null)) return fail(422, 'INVALID_REQUEST');
    const expiresAt = payload.expires_at ?? null;
    if (expiresAt !== null && (!isoTimestamp(expiresAt) ||
      !['issue_participant_link', 'rotate_organizer_link'].includes(action))) return fail(422, 'INVALID_REQUEST');
    const issue = ['issue_participant_link', 'rotate_organizer_link'].includes(action);
    let replacement: string | null = null;
    let link: string | null = null;
    try {
      if (issue) {
        replacement = generateToken();
        link = privateLink(deps.appBaseUrl, replacement, action === 'rotate_organizer_link');
      }
      const result = await deps.callRpc({ p_action: action as AccessAction, p_token_hash: await hashToken(token),
        p_participant_id: participantId as string | null, p_new_hash: replacement ? await hashToken(replacement) : null,
        p_expires_at: expiresAt as string | null });
      if (!result.ok) return rpcFailure(result);
      // Explicit response fields: never relay arbitrary database fields, hashes or credentials.
      if (action === 'validate_access') {
        const access = result.access;
        if (!access || typeof access !== 'object' || !('access_type' in access) ||
          !['participant', 'organizer'].includes(String(access.access_type))) return fail(503, 'SERVER_ERROR');
        const scope = access as Record<string, unknown>;
        return reply(200, { access: { token_id: scope.token_id, access_type: scope.access_type,
          participant_id: scope.participant_id, participant_slug: scope.participant_slug, expires_at: scope.expires_at } });
      }
      if (action === 'revoke_participant_link') return reply(200, { revoked: result.revoked });
      return reply(200, { token_id: result.token_id, expires_at: result.expires_at, private_link: link });
    } catch { return fail(503, 'SERVER_ERROR'); }
  };
}
