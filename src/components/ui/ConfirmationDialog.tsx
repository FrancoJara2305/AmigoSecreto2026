import { useEffect, useId, useRef } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from './Button';

export function ConfirmationDialog({ open, onOpenChange, title, description, onConfirm, confirmLabel = 'Sí, limpiar', busy = false, busyLabel = 'Limpiando…' }: {
  open: boolean; onOpenChange(open: boolean): void; title: string; description: string;
  onConfirm(): void; confirmLabel?: string; busy?: boolean; busyLabel?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId(); const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => { dialog.close(); if (trigger?.isConnected) trigger.focus(); };
  }, [open]);
  return <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = buttons[0]; const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onCancel={(event) => { event.preventDefault(); if (!busy) onOpenChange(false); }}
    onClick={(event) => {
      if (busy || event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onOpenChange(false);
    }}>
    <div className="confirm-dialog__content">
      <div className="confirm-dialog__top"><span className="confirm-dialog__symbol"><Trash2 aria-hidden="true" /></span>
        <Button variant="quiet" className="button--icon" aria-label="Cerrar confirmación" disabled={busy} onClick={() => onOpenChange(false)}><X aria-hidden="true" /></Button></div>
      <h2 id={titleId}>{title}</h2><p id={descriptionId} className="confirm-dialog__description">{description}</p>
      <div className="confirm-dialog__actions">
        <button type="button" ref={cancelRef} className="button button--secondary" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</button>
        <Button variant="danger" loading={busy} onClick={onConfirm}>{busy ? busyLabel : confirmLabel}</Button>
      </div>
    </div>
  </dialog>;
}
