import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react';
import { Button } from './Button';
type ToastInput = { title: string; description?: string; tone?: 'success' | 'info' | 'error' };
type Toast = ToastInput & { id: number; returnFocus: HTMLElement | null };
const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [announcement, setAnnouncement] = useState<Toast | null>(null);
  const nextId = useRef(0);
  const notify = useCallback((toast: ToastInput) => {
    const id = ++nextId.current;
    const item = { ...toast, id, returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    setToasts((previous) => [...previous.slice(-2), item]);
    setAnnouncement(item);
  }, []);
  const latest = announcement;
  return <ToastContext value={notify}>{children}
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{latest && latest.tone !== 'error' && <span key={latest.id}>{latest.title}. {latest.description}</span>}</div>
    <div className="sr-only" role="alert" aria-atomic="true">{latest?.tone === 'error' && <span key={latest.id}>{latest.title}. {latest.description}</span>}</div>
    <ol className="toast-stack" aria-label="Notificaciones">{toasts.map((toast) => {
      const Icon = toast.tone === 'error' ? CircleAlert : toast.tone === 'info' ? Info : CircleCheck;
      return <li key={toast.id} className={`toast toast--${toast.tone ?? 'success'}`}>
        <Icon aria-hidden="true" /><div className="toast__text"><strong>{toast.title}</strong>{toast.description && <p>{toast.description}</p>}</div>
        <Button className="button--icon" variant="quiet" aria-label={`Cerrar notificación: ${toast.title}`} onClick={() => {
          setToasts((items) => items.filter((item) => item.id !== toast.id));
          const target = toast.returnFocus;
          if (target?.isConnected && target !== document.body && !target.closest('dialog:not([open])') && !target.matches(':disabled')) target.focus();
          else document.querySelector<HTMLElement>('main[tabindex]')?.focus();
        }}><X aria-hidden="true" /></Button>
      </li>;
    })}</ol>
  </ToastContext>;
}
export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error('useToast requires ToastProvider');
  return notify;
}
