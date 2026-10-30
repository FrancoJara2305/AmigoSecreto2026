import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
interface VisualProps { variant?: Variant; icon?: ReactNode; className?: string; }
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VisualProps { loading?: boolean; }
export function Button({ variant = 'primary', icon, loading = false, disabled, className = '', children, type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
    className={`button button--${variant} ${className}`}>
    {loading ? <LoaderCircle className="spinner" aria-hidden="true" /> : icon ? <span aria-hidden="true">{icon}</span> : null}
    {children}
  </button>;
}
export function LinkButton({ variant = 'primary', icon, className = '', children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & VisualProps) {
  return <a tabIndex={0} {...props} className={`button button--${variant} ${className}`}>
    {icon ? <span aria-hidden="true">{icon}</span> : null}{children}
  </a>;
}
