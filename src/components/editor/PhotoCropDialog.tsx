import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { centredCrop, clampCrop, cropRect, cropStyle, MAX_ZOOM, panCrop, type CropView } from '../../domain/photo-crop';
import { Button } from '../ui/Button';

// Lets the person frame a chosen photo in the circle before it is uploaded. Only the cropped square
// leaves the browser (re-encoded as JPEG, without metadata); the server still validates and normalizes it.
// Rendered in a portal so a disabled form fieldset never disables the dialog controls.
export function PhotoCropDialog({ file, onCancel, onConfirm }: { file: File | null; onCancel(): void; onConfirm(file: File): void }) {
  const dialog = useRef<HTMLDialogElement>(null), stage = useRef<HTMLDivElement>(null), image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [url, setUrl] = useState<string | null>(null), [view, setView] = useState<CropView | null>(null);
  const [failed, setFailed] = useState(false), [working, setWorking] = useState(false);
  const ids = { title: useId(), help: useId(), zoom: useId() };

  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file); setUrl(next); setView(null); setFailed(false); setWorking(false);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  useEffect(() => {
    const element = dialog.current;
    if (!element || !file) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal(); stage.current?.focus();
    return () => { element.close(); if (trigger?.isConnected) trigger.focus(); };
  }, [file]);
  // React registers wheel listeners as passive; zooming must keep the page from scrolling.
  useEffect(() => {
    const element = stage.current;
    if (!element || !file) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); setView((current) => current && clampCrop({ ...current, zoom: current.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08) })); };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [file]);

  const zoomBy = (factor: number) => setView((current) => current && clampCrop({ ...current, zoom: current.zoom * factor }));
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!view || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const size = event.currentTarget.clientWidth, dx = event.clientX - start.x, dy = event.clientY - start.y;
    drag.current = { ...start, x: event.clientX, y: event.clientY };
    setView((current) => current && panCrop(current, dx, dy, size));
  }
  function onStageKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 40 : 10, size = event.currentTarget.clientWidth;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) { event.preventDefault(); setView((current) => current && panCrop(current, ...moves[event.key], size)); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.1); }
    else if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.1); }
  }
  function onDialogKey(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'));
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  async function apply() {
    const element = image.current;
    if (!file) return;
    if (!element || !view) { onConfirm(file); return; }
    setWorking(true);
    const { sx, sy, side, size } = cropRect(view);
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    let blob: Blob | null = null;
    if (context) {
      // JPEG has no transparency: transparent PNG areas take the page background.
      context.fillStyle = '#fffaf2'; context.fillRect(0, 0, size, size);
      context.imageSmoothingQuality = 'high'; context.drawImage(element, sx, sy, side, side, 0, 0, size, size);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .9));
    }
    setWorking(false);
    // If the browser cannot export, the original goes through the same server validation as before.
    onConfirm(blob ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : file);
  }

  return createPortal(<dialog ref={dialog} className="crop-dialog" aria-labelledby={ids.title} aria-describedby={ids.help} onKeyDown={onDialogKey}
    onCancel={(event) => { event.preventDefault(); if (!working) onCancel(); }}>
    {file && <div className="crop-dialog__content">
      <div className="crop-dialog__top"><h2 id={ids.title}>Ajusta tu foto</h2>
        <Button variant="quiet" className="button--icon" aria-label="Cerrar ajuste de foto" disabled={working} onClick={onCancel}><X aria-hidden="true" /></Button></div>
      <p id={ids.help} className="crop-dialog__help">{failed ? 'No pudimos mostrar esta imagen para ajustarla. Puedes subirla tal como está o elegir otra.' : 'Arrastra la imagen o usa las flechas para encuadrarla, y acércala con el control. Así se verá en el círculo de tu perfil.'}</p>
      {!failed && <div ref={stage} className={`crop-stage${view ? '' : ' crop-stage--loading'}`} tabIndex={0} role="group" aria-label="Encuadre de la foto"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onKeyDown={onStageKey}>
        {url && <img ref={image} src={url} alt="" draggable={false} style={view ? cropStyle(view) : undefined}
          onLoad={(event) => setView(centredCrop(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight))} onError={() => setFailed(true)} />}
        <span className="crop-stage__mask" aria-hidden="true" />
      </div>}
      {!failed && <div className="crop-zoom">
        <Button variant="quiet" className="button--icon" aria-label="Alejar" disabled={!view || view.zoom <= 1} onClick={() => zoomBy(1 / 1.25)}><ZoomOut aria-hidden="true" /></Button>
        <label className="sr-only" htmlFor={ids.zoom}>Acercar o alejar la foto</label>
        <input id={ids.zoom} type="range" min={1} max={MAX_ZOOM} step={0.01} value={view?.zoom ?? 1} disabled={!view}
          aria-valuetext={`${Math.round((view?.zoom ?? 1) * 100)} %`} onChange={(event) => { const zoom = Number(event.target.value); setView((current) => current && clampCrop({ ...current, zoom })); }} />
        <Button variant="quiet" className="button--icon" aria-label="Acercar" disabled={!view || view.zoom >= MAX_ZOOM} onClick={() => zoomBy(1.25)}><ZoomIn aria-hidden="true" /></Button>
      </div>}
      <div className="crop-dialog__actions">
        {!failed && <Button variant="quiet" icon={<RotateCcw />} disabled={!view || working} onClick={() => setView((current) => current && centredCrop(current.width, current.height))}>Centrar</Button>}
        <Button variant="secondary" disabled={working} onClick={onCancel}>Cancelar</Button>
        <Button icon={<Check />} loading={working} disabled={!failed && !view} onClick={() => { void apply(); }}>{failed ? 'Subir sin ajustar' : 'Usar esta foto'}</Button>
      </div>
    </div>}
  </dialog>, document.body);
}
