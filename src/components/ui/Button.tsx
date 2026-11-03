import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { LoaderCircle } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
interface VisualProps { variant?: Variant; icon?: ReactNode; className?: string; }
// React 19 passes ref as a regular prop; it reaches the <button> through the props spread.
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VisualProps { loading?: boolean; ref?: Ref<HTMLButtonElement>; }
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
