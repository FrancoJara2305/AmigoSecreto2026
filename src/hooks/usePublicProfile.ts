import { useEffect, useState } from 'react';
import type { PublicProfile } from '../domain/profile';
import { loadPublicProfile } from '../services/profile';

type State = { status: 'loading' | 'error' | 'missing' } | { status: 'ready'; data: PublicProfile };
export function usePublicProfile(slug: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ slug: string; state: State }>({ slug, state: { status: 'loading' } });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ slug, state: { status: 'loading' } });
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void loadPublicProfile(slug, controller.signal).then((data) => {
        if (!controller.signal.aborted) setResult({ slug, state: data ? { status: 'ready', data } : { status: 'missing' } });
      }).catch(() => { if (!controller.signal.aborted) setResult({ slug, state: { status: 'error' } }); });
    });
    return () => controller.abort();
  }, [slug, attempt]);
  return { state: result.slug === slug ? result.state : { status: 'loading' } as State, retry: () => setAttempt((value) => value + 1) };
}
