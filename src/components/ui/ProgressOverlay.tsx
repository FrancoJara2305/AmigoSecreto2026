import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Labels = { busy: string; done: string };
type Track = <T>(task: Promise<T>, labels: Labels, ok?: (value: T) => boolean) => Promise<T>;
type State = { phase: 'busy' | 'done' | 'leaving'; label: string } | null;
const ProgressContext = createContext<Track | null>(null);
// Quick answers never flash the veil; a confirmed change always ends with the check.
const SHOW_AFTER = 150, DONE_FOR = 1100, LEAVE_FOR = 260;

// A visual veil over the page while an upload or save runs. It never intercepts pointer or focus:
// the form is already disabled while busy, and navigation guards keep handling exits.
export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(null);
  const current = useRef(0), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const track = useCallback<Track>(async (task, labels, ok = Boolean) => {
    const id = ++current.current; clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (current.current === id) setState({ phase: 'busy', label: labels.busy }); }, SHOW_AFTER);
    const finish = (success: boolean) => {
      if (current.current !== id) return;
      clearTimeout(timer.current);
      if (!success) { setState(null); return; }
      setState({ phase: 'done', label: labels.done });
      timer.current = setTimeout(() => {
        setState({ phase: 'leaving', label: labels.done });
        timer.current = setTimeout(() => { if (current.current === id) setState(null); }, LEAVE_FOR);
      }, DONE_FOR);
    };
    try { const value = await task; finish(ok(value)); return value; }
    catch (error) { finish(false); throw error; }
  }, []);
  return <ProgressContext value={track}>{children}
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{state && state.phase !== 'leaving' ? state.label : ''}</div>
    {state && <div className={`progress-overlay progress-overlay--${state.phase}`} aria-hidden="true">
      <div className="progress-overlay__card">
        {state.phase === 'busy' ? <span className="progress-overlay__ring" /> :
          <svg className="progress-overlay__check" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" /><path d="M20 33.5 28.5 42 45 24" /></svg>}
        <p className="progress-overlay__label">{state.label}</p>
      </div>
    </div>}
  </ProgressContext>;
}
export function useProgress() {
  const track = useContext(ProgressContext);
  if (!track) throw new Error('useProgress requires ProgressProvider');
  return track;
}
