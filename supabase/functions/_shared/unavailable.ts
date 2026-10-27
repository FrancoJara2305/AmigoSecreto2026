/** Fail closed until capability validation, transactional authorization and quotas are ready.
 * This handler intentionally has no Supabase client, fetch, SQL, uploads or token decoding.
 * Even a syntactically valid token or service key cannot enable a business operation here.
 */
export function unavailable(request: Request): Response {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Allow': 'POST',
  };
  // No CORS allowance yet. Browsers must not invoke the placeholder cross-origin.
  const status = request.method === 'POST' ? 503 : 405;
  return new Response(JSON.stringify({
    error: {
      code: status === 503 ? 'FEATURE_NOT_ENABLED' : 'METHOD_NOT_ALLOWED',
      message: status === 503
        ? 'Esta operación todavía no está habilitada.'
        : 'Método no permitido.',
    },
  }), { status, headers });
}
