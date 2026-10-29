import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { privateSession } from '../services/private-session';

const PrivateAccessContext = createContext<typeof privateSession | null>(null);
export function PrivateAccessProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const resume = () => { if (document.visibilityState === 'visible' && privateSession.snapshot().status === 'ready') void privateSession.verify(); };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, []);
  return <PrivateAccessContext value={privateSession}>{children}</PrivateAccessContext>;
}
export function usePrivateAccess() {
  const session = useContext(PrivateAccessContext);
  if (!session) throw new Error('PrivateAccessProvider required');
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  return { state, verify: session.verify, close: session.close, mutate: session.mutate, upload: session.upload };
}
