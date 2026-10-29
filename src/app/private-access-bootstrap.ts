import { consumePrivateEntry, entryType } from '../domain/private-access';
import { privateSession } from '../services/private-session';

// Must run synchronously before React renders any component that can fetch or load images.
export function initializePrivateAccess() {
  const entry = consumePrivateEntry(window.location, window.history);
  if (entry) privateSession.begin(entry.token, entry.type);
  const capture = () => {
    if (!window.location.hash && !window.location.search) return;
    if (!entryType(window.location.pathname) && !window.location.hash.includes('token=') && !new URLSearchParams(window.location.search).has('token')) return;
    const next = consumePrivateEntry(window.location, window.history);
    if (next) privateSession.begin(next.token, next.type);
  };
  // Registered before BrowserRouter, so popstate sees only the cleaned location.
  window.addEventListener('popstate', capture);
  window.addEventListener('hashchange', capture);
  window.addEventListener('pagehide', () => privateSession.close());
  window.addEventListener('pageshow', (event) => { if (event.persisted) privateSession.close(); });
}
