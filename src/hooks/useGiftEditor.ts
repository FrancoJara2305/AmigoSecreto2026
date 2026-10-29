import { useEffect, useRef, useState } from 'react';
import type { Gift } from '../domain/database.types';
import type { GiftDraft } from '../domain/gift-editor';
import { draftErrors, draftFromGift, giftSaveRequest, mergeSavedDraft } from '../domain/gift-editor';
import { usePrivateAccess } from '../app/PrivateAccessProvider';
import { GiftMutationError } from '../services/gift-mutations';
import { loadPublicProfile } from '../services/profile';
import { focusField } from '../components/ui/focus-field';
import { MediaUploadError } from '../services/media-upload';

export function useGiftEditor(participantId: string, slug: string, position: number, initial: Gift | null) {
  const { mutate, upload: sendUpload } = usePrivateAccess();
  const [uploading, setUploading] = useState(false);
  const [uploadIssue, setUploadIssue] = useState('');
  const [uploadRetryAt,setUploadRetryAt] = useState(0);
  const [uploadRateWaiting,setUploadRateWaiting] = useState(false);
  useEffect(()=>{setUploadRateWaiting(uploadRetryAt>Date.now()); const timer=setTimeout(()=>setUploadRateWaiting(false),Math.max(0,uploadRetryAt-Date.now())); return ()=>clearTimeout(timer);},[uploadRetryAt]);
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(() => draftFromGift(initial));
  const [baseline, setBaseline] = useState(() => JSON.stringify(draftFromGift(initial)));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [issue, setIssue] = useState<GiftMutationError | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [latest, setLatest] = useState<Gift | null | undefined>();
  const [reviewError, setReviewError] = useState(false);
  const [rateWaiting, setRateWaiting] = useState(false);
  const locked = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const reviewController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); reviewController.current?.abort(); }; }, []);
  useEffect(() => { if (issue?.kind !== 'rate') { setRateWaiting(false); return; } setRateWaiting(true); const timer = setTimeout(() => setRateWaiting(false), issue.retryAfter * 1000); return () => clearTimeout(timer); }, [issue]);
  const dirty = JSON.stringify(draft) !== baseline;
  const needsReview = issue?.kind === 'conflict' || issue?.kind === 'uncertain';
  function change(key: keyof GiftDraft, value: string) {
    if (locked.current) return;
    setDraft((current) => ({ ...current, [key]: value })); setNotice(''); setFields((current) => ({ ...current, [key]: '' }));
  }
  function detail(key: string, value: string) {
    if (locked.current) return;
    setDraft((current) => ({ ...current, [current.gift_type]: { ...current[current.gift_type], [key]: value } }));
    setNotice(''); setFields((current) => ({ ...current, [`details.${key}`]: '' }));
  }
  async function upload(file: File): Promise<string | null> {
    if (locked.current || uploadRetryAt>Date.now()) return null;
    locked.current=true; setUploading(true); setUploadIssue(''); setNotice('');
    const abort=new AbortController(); controller.current=abort;
    try {
      const path=await sendUpload(participantId,'gift',file,abort.signal);
      if (!mounted.current) return null;
      setDraft((current)=>({...current,imageSource:'existing',existingPath:path,image_url:''}));
      setFields((current)=>({...current,image_path:'',image_url:''}));
      return path;
    } catch(error) {
      if (mounted.current && error instanceof MediaUploadError && error.kind==='rate') setUploadRetryAt(Date.now()+Math.max(1,error.retryAfter)*1000);
      if (mounted.current) setUploadIssue(error instanceof MediaUploadError && error.kind==='invalid'
        ? 'Elige una imagen JPEG, PNG o WebP estática de hasta 3 MiB y 16 megapíxeles.'
        : error instanceof MediaUploadError && error.kind==='access' ? 'Tu acceso ya no permite subir imágenes. La imagen anterior se conserva.'
        : error instanceof MediaUploadError && error.kind==='rate' ? `Alcanzaste el límite de imágenes. Espera ${Math.max(1,Math.ceil(error.retryAfter/60))} minuto(s) antes de volver a subir.`
        : 'No pudimos confirmar la subida. La imagen anterior se conserva; puedes intentarlo de nuevo.');
      return null;
    } finally { if (mounted.current) setUploading(false); locked.current=false; controller.current=null; }
  }
  async function perform(remove: boolean) {
    if (locked.current || needsReview || rateWaiting || (remove && !base)) return false;
    const request = remove && base ? { action: 'delete_gift' as const, participant_id: participantId, position, gift_id: base.id, expected_version: base.version } : giftSaveRequest(participantId, position, base, draft);
    const errors = draftErrors(request); setFields(errors); setNotice('');
    if (Object.keys(errors).length) { requestAnimationFrame(() => { const id = `gift-${Object.keys(errors)[0]}`; focusField(document.getElementById(id) ? id : 'editor-feedback'); }); return false; }
    locked.current = true; setBusy(true); setIssue(null); setLatest(undefined); setReviewError(false);
    const abort = new AbortController(); controller.current = abort;
    try {
      const result = await mutate(request, abort.signal);
      if (!mounted.current) return false;
      if ('gift' in result) {
        const next = mergeSavedDraft(draft, result.gift); setBase(result.gift); setDraft(next); setBaseline(JSON.stringify(next)); setNotice('Tu opción quedó guardada. Las demás ideas se mantienen.');
      } else {
        const next = draftFromGift(null); setBase(null); setDraft(next); setBaseline(JSON.stringify(next)); setNotice('Esta opción volvió a quedar pendiente. Las demás ideas se mantienen.');
      }
      return true;
    } catch (error) {
      if (!mounted.current) return false;
      const failure = error instanceof GiftMutationError ? error : new GiftMutationError('uncertain');
      setIssue(failure); setFields(failure.fields);
      requestAnimationFrame(() => { const id = `gift-${Object.keys(failure.fields)[0]}`; focusField(document.getElementById(id) ? id : 'editor-feedback'); });
      return false;
    } finally { if (mounted.current) setBusy(false); locked.current = false; controller.current = null; }
  }
  async function review() {
    if (reviewing || locked.current) return;
    setReviewing(true); setReviewError(false);
    const abort = new AbortController(); reviewController.current = abort;
    try {
      const profile = await loadPublicProfile(slug, abort.signal);
      if (!profile || profile.participant.id !== participantId) throw new Error('Unavailable participant');
      if (mounted.current) setLatest(profile.slots.find((slot) => slot.position === position)?.gift ?? null);
    } catch { if (mounted.current && !abort.signal.aborted) setReviewError(true); }
    finally { if (mounted.current) setReviewing(false); }
  }
  function useLatest(keepDraft: boolean) {
    if (latest === undefined || locked.current) return;
    setBase(latest); setBaseline(JSON.stringify(draftFromGift(latest)));
    if (!keepDraft) setDraft(draftFromGift(latest));
    setIssue(null); setFields({}); setLatest(undefined); setReviewError(false);
    setNotice(keepDraft ? 'Conservamos tu borrador. Revisa los datos antes de guardar sobre la versión actual.' : 'Cargamos los datos guardados actualmente.');
  }
  return { base, draft, fields, issue, notice, busy: busy || uploading, uploading, uploadIssue, uploadRateWaiting, upload, dirty, needsReview, rateWaiting, reviewing, latest, reviewError, change, detail, save: () => perform(false), remove: () => perform(true), review, useLatest };
}
