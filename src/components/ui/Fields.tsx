import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { CircleAlert, ChevronDown } from 'lucide-react';

interface FieldProps { label: string; hint?: string; error?: string; }
function Field({ label, hint, error, id, required, children }: FieldProps & { id: string; required?: boolean; children: ReactNode }) {
  return <div className="field">
    <label className="field__label" htmlFor={id}>{label}{required && <><span className="field__required" aria-hidden="true">*</span><span className="sr-only"> (obligatorio)</span></>}</label>
    {children}
    {hint && <p id={`${id}-hint`} className="field__hint">{hint}</p>}
    {error && <p id={`${id}-error`} className="field__error"><CircleAlert aria-hidden="true" /><span>{error}</span></p>}
  </div>;
}
function description(id: string, hint?: string, error?: string, existing?: string) {
  return [existing, hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
}
export function TextField({ label, hint, error, id: givenId, className = '', required, ...props }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId(); const id = givenId ?? generated;
  return <Field {...{ label, hint, error, id, required }}><input {...props} id={id} required={required}
    className={`field__control ${className}`} aria-invalid={!!error || props['aria-invalid'] || undefined}
    aria-describedby={description(id, hint, error, props['aria-describedby'])} /></Field>;
}
export function TextAreaField({ label, hint, error, id: givenId, className = '', required, ...props }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId(); const id = givenId ?? generated;
  return <Field {...{ label, hint, error, id, required }}><textarea {...props} id={id} required={required}
    className={`field__control ${className}`} aria-invalid={!!error || props['aria-invalid'] || undefined}
    aria-describedby={description(id, hint, error, props['aria-describedby'])} /></Field>;
}
export function SelectField({ label, hint, error, id: givenId, className = '', required, children, ...props }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId(); const id = givenId ?? generated;
  return <Field {...{ label, hint, error, id, required }}><div className="field__select"><select {...props} id={id} required={required}
    className={`field__control ${className}`} aria-invalid={!!error || props['aria-invalid'] || undefined}
    aria-describedby={description(id, hint, error, props['aria-describedby'])}>{children}</select><ChevronDown aria-hidden="true" /></div></Field>;
}
export function Checkbox({ label, className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }) {
  return <label className={`checkbox ${className}`}><input {...props} type="checkbox" /><span>{label}</span></label>;
}
