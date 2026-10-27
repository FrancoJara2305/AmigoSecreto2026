/** Capability tokens: 256 random bits, canonical base64url, SHA-256 of the token text. */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isToken(value: unknown): value is string {
  // 32 bytes encode as 43 characters; the final base64 sextet has two unused bits.
  return typeof value === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
}

export async function hashToken(token: string): Promise<string> {
  if (!isToken(token)) throw new Error('Access unavailable');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function privateLink(baseUrl: string, token: string, organizer = false): string {
  if (!isToken(token)) throw new Error('Access unavailable');
  const url = new URL(baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Invalid application origin');
  }
  url.pathname = organizer ? '/organizador/acceso' : '/acceso';
  url.hash = `token=${token}`;
  return url.href;
}
