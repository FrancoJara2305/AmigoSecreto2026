import { useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { publicProfileUrl } from '../../domain/profile';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';
import { Notice } from '../ui/Feedback';
import { useToast } from '../ui/ToastNotifications';

export function CopyPublicProfile({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const notify = useToast();
  const url = publicProfileUrl(slug, window.location.origin);
  async function copy() {
    if (busy) return;
    setBusy(true);
    try {
      await navigator.clipboard.writeText(url);
      if (mounted.current) { setManual(false); notify({ title: 'Enlace público copiado', description: 'Ya puedes compartir esta lista de deseos.' }); }
    } catch {
      if (mounted.current) {
        setManual(true);
        requestAnimationFrame(() => { const field = document.querySelector<HTMLInputElement>('#public-profile-url'); field?.focus(); field?.select(); });
      }
    } finally { if (mounted.current) setBusy(false); }
  }
  return <div className="profile-share"><Button variant="secondary" icon={<Copy />} loading={busy} onClick={() => void copy()}>{busy ? 'Copiando…' : 'Copiar perfil público'}</Button>
    {manual && <div className="profile-share__manual"><Notice title="Puedes copiarlo desde aquí" live>Selecciona el enlace público y cópialo.</Notice><TextField id="public-profile-url" label="Enlace público" value={url} readOnly onFocus={(event) => event.currentTarget.select()} /></div>}
  </div>;
}
