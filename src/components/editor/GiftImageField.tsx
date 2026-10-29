import { useEffect, useRef, useState } from 'react';
import { Image, ImageOff, Link2, X } from 'lucide-react';
import type { GiftDraft } from '../../domain/gift-editor';
import { giftImage, safeExternalUrl } from '../../domain/profile';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';

export function GiftImageField({ draft, participantId, error, change, upload, uploading, uploadIssue, uploadRateWaiting }: { draft: GiftDraft; participantId: string; error?: string; change(key: keyof GiftDraft, value: string): void; upload(file: File): Promise<string|null>; uploading: boolean; uploadIssue: string; uploadRateWaiting: boolean }) {
  const [local, setLocal] = useState<{path:string;url:string}|null>(null);
  const objectUrl=useRef<string|null>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true; return ()=>{mounted.current=false; if(objectUrl.current) URL.revokeObjectURL(objectUrl.current);};},[]);
  async function selectFile(file: File) {
    const path=await upload(file);
    if (!path || !mounted.current) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url=URL.createObjectURL(file); objectUrl.current=url; setLocal({path,url}); setBroken(null);
  }
  const [preview, setPreview] = useState<string | null>(null); const [broken, setBroken] = useState<string | null>(null);
  const existing = draft.imageSource === 'existing' ? giftImage({ participant_id: participantId, image_path: draft.existingPath, image_url: null }, import.meta.env.VITE_SUPABASE_URL ?? '') : null;
  const source = (draft.imageSource === 'existing' && local?.path === draft.existingPath ? local.url : existing) ?? (draft.imageSource === 'url' && preview === safeExternalUrl(draft.image_url) ? preview : null);
  return <section id="gift-image_path" tabIndex={-1} className="editor-image" aria-labelledby="image-field-title"><div><h2 id="image-field-title">Una imagen para inspirar</h2><p>Es opcional. El título también puede dar una buena pista.</p></div>{error && draft.imageSource !== 'url' && <p className="field__error">{error}</p>}
    <div className="editor-image__preview">{source && source !== broken ? <img src={source} alt="Vista previa del regalo" width="480" height="360" referrerPolicy="no-referrer" onError={() => setBroken(source)} /> : <span>{broken && source === broken ? <ImageOff aria-hidden="true" /> : <Image aria-hidden="true" />}{broken && source === broken ? 'No pudimos mostrar esta imagen.' : 'Tu idea puede empezar sin imagen.'}</span>}</div>
    <div className="field"><label htmlFor="gift-image_file">Subir imagen</label><input id="gift-image_file" type="file" disabled={uploadRateWaiting} accept="image/jpeg,image/png,image/webp" aria-describedby="gift-image-help" onChange={(event)=>{const file=event.target.files?.[0]; event.target.value=''; if(file) void selectFile(file);}} /><p id="gift-image-help" className="field__hint">JPEG, PNG o WebP estática. Hasta 3 MiB y 16 megapíxeles. La imagen se aplicará al guardar el regalo.</p></div>
    {uploading && <p role="status">Preparando y subiendo imagen…</p>}{uploadIssue && <p role="alert" className="field__error">{uploadIssue}</p>}
    <div className="editor-image__actions"><Button variant="secondary" icon={<Link2 />} onClick={() => change('imageSource','url')}>Usar URL de imagen</Button>{draft.existingPath && draft.imageSource !== 'existing' && <Button variant="quiet" onClick={() => change('imageSource','existing')}>Conservar imagen guardada</Button>}{draft.imageSource !== 'none' && <Button variant="quiet" icon={<X />} onClick={() => change('imageSource','none')}>Quitar imagen</Button>}</div>
    {draft.imageSource === 'url' && <><TextField id="gift-image_url" label="URL de la imagen" type="url" value={draft.image_url} maxLength={2048} error={error} hint="Enlace HTTPS público a una imagen. Se guardará al confirmar el regalo." onChange={(event) => change('image_url', event.target.value)} /><Button variant="quiet" onClick={() => { setBroken(null); setPreview(safeExternalUrl(draft.image_url)); }}>Ver imagen</Button></>}
    {draft.imageSource === 'existing' && <p className="field__hint">La imagen elegida se aplicará al guardar el regalo. Puedes cambiarla o quitarla antes de confirmar.</p>}
  </section>;
}
