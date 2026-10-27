export interface PublicConfigInput {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_APP_URL?: string;
}

export interface PublicConfig {
  supabaseUrl: string;
  publishableKey: string;
  appUrl: string;
}

function publicUrl(value: string | undefined, name: string): string {
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    throw new Error(`Configura ${name} con una URL válida.`);
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${name} debe ser un origen HTTPS (HTTP solo en localhost).`);
  }
  return url.origin;
}

function publicKey(value: string | undefined): string {
  const key = value?.trim() ?? '';
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return key;
  // Supabase local/legacy uses a JWT anon key. Decode only to prevent mistakes;
  // this is NOT signature verification or an authorization decision.
  try {
    const segments = key.split('.');
    if (segments.length === 3 && segments.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
      const payload = segments[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims: unknown = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
      if (typeof claims === 'object' && claims !== null && 'role' in claims && claims.role === 'anon') {
        return key;
      }
    }
  } catch { /* Return a redacted configuration error below. */ }
  throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY debe ser publishable o anon. No uses una clave privilegiada.');
}

export function readPublicConfig(env: PublicConfigInput): PublicConfig {
  return {
    supabaseUrl: publicUrl(env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL'),
    publishableKey: publicKey(env.VITE_SUPABASE_PUBLISHABLE_KEY),
    appUrl: publicUrl(env.VITE_APP_URL ?? globalThis.location?.origin ?? 'http://localhost:5173', 'VITE_APP_URL'),
  };
}
