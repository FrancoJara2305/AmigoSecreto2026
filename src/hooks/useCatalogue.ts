import { useEffect, useState } from 'react';
import type { CatalogueData } from '../domain/catalogue';
import { loadCatalogue } from '../services/catalogue';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: CatalogueData };
export function useCatalogue() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    // Skip the discarded StrictMode effect rather than send duplicate requests.
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void loadCatalogue(controller.signal).then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      }).catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }); });
    });
    return () => controller.abort();
  }, [attempt]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}
