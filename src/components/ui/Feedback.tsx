import type { ReactNode } from 'react';
import { focusField } from './focus-field';
import { CircleAlert, CircleCheck, Gift, Info, LoaderCircle } from 'lucide-react';

export function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'gold' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
export function Notice({ title, children, tone = 'info', live = false, className = '' }: {
  title: string; children?: ReactNode; tone?: 'info' | 'success' | 'error'; live?: boolean; className?: string;
}) {
  const Icon = tone === 'success' ? CircleCheck : tone === 'error' ? CircleAlert : Info;
  return <div className={`notice notice--${tone} ${className}`} role={live ? tone === 'error' ? 'alert' : 'status' : undefined}>
    <Icon aria-hidden="true" /><div><strong className="notice__title">{title}</strong>{children && <div>{children}</div>}</div>
  </div>;
}
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-state__icon"><Gift aria-hidden="true" /></span>
    <h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function LoadingState({ label = 'Preparando las sorpresas…' }: { label?: string }) {
  return <div className="loading-state" role="status" aria-live="polite">
    <div aria-hidden="true"><div className="skeleton skeleton--image" /><div className="skeleton skeleton--line" /><div className="skeleton skeleton--line skeleton--short" /></div>
    <p className="loading-state__label"><LoaderCircle aria-hidden="true" className="spinner" />{label}</p>
  </div>;
}
export function ErrorSummary({ errors }: { errors: { id: string; message: string }[] }) {
  if (!errors.length) return null;
  return <Notice title="Revisemos un pequeño detalle" tone="error" live className="error-summary">
    <ul>{errors.map(({ id, message }) => <li key={id}><button type="button" onClick={() => focusField(id)}>{message}</button></li>)}</ul>
  </Notice>;
}
