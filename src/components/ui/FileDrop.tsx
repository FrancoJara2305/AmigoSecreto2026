import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { ImageUp, LoaderCircle } from 'lucide-react';

// A real file input stretched over a styled area: clicking opens the picker and dropping a file
// onto it fills the same input, so validation and tests keep using the labelled control.
export function FileDrop({ id, label, prompt, meta, busy = false, children, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { id: string; label: string; prompt: string; meta: string; busy?: boolean; children?: ReactNode }) {
  const [over, setOver] = useState(false);
  return <div className="field">
    <label className="field__label" htmlFor={id}>{label}</label>
    <div className={`file-drop${over ? ' file-drop--over' : ''}${busy ? ' file-drop--busy' : ''}`}>
      <input {...props} id={id} type="file" className="file-drop__input"
        onDragEnter={() => setOver(true)} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)} />
      <span className="file-drop__icon" aria-hidden="true">{busy ? <LoaderCircle className="spinner" /> : <ImageUp />}</span>
      <span className="file-drop__text" aria-hidden="true"><strong>{busy ? 'Subiendo…' : prompt}</strong><span>{meta}</span></span>
    </div>
    {children}
  </div>;
}
