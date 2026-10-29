import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Gift } from '../domain/database.types';
import { usePrivateAccess } from '../app/PrivateAccessProvider';
import { usePublicProfile } from '../hooks/usePublicProfile';
import { scopeCanEdit } from '../domain/private-access';
import { AppLayout } from '../components/layout/AppLayout';
import { AccessFeedback } from '../components/access/AccessFeedback';
import { GiftEditor } from '../components/editor/GiftEditor';
import { Button } from '../components/ui/Button';

export function GiftEditorPage() {
  const { slug = '', position: raw = '' } = useParams();
  const valid = ['1','2','3'].includes(raw); const position = Number(raw); const key = `${slug}:${raw}`;
  const { state: profile, retry: retryProfile } = usePublicProfile(slug);
  const { state: access, verify, close } = usePrivateAccess();
  const person = profile.status === 'ready' ? profile.data.participant : null;
  const [attempt, setAttempt] = useState(0);
  const [model, setModel] = useState<{ key: string; tokenId: string; participantId: string; name: string; gift: Gift | null } | null>(null);
  useEffect(() => { if (access.status === 'closed') setModel(null); }, [access.status]);
  useEffect(() => {
    if (!valid || !person || model?.key === key) return;
    let active = true;
    void verify(person.id).then((scope) => {
      if (active && scope && scopeCanEdit(scope, person.id) && profile.status === 'ready') setModel({ key, tokenId: scope.tokenId, participantId: person.id, name: person.name, gift: profile.data.slots.find((slot) => slot.position === position)?.gift ?? null });
    });
    return () => { active = false; };
  }, [key, valid, person?.id, attempt, model?.key, verify]);
  if (valid && model?.key === key && access.status !== 'closed') {
    const canWrite = access.status === 'ready' && access.scope.tokenId === model.tokenId && scopeCanEdit(access.scope, model.participantId);
    return <AppLayout><GiftEditor key={key} participantId={model.participantId} name={model.name} slug={slug} position={position} initial={model.gift} canWrite={canWrite} /></AppLayout>;
  }
  if (access.status === 'closed' || access.status === 'unavailable' || access.status === 'temporary' || !valid || (access.status === 'ready' && person && !scopeCanEdit(access.scope, person.id))) return <AppLayout><div className="page-width"><AccessFeedback state={access} retry={() => setAttempt((value) => value + 1)} close={close} /></div></AppLayout>;
  if (profile.status === 'error' || profile.status === 'missing') return <AppLayout><section className="profile-state page-width"><h1>{profile.status === 'missing' ? 'No encontramos este participante' : 'No pudimos cargar la opción'}</h1>{profile.status === 'error' && <Button onClick={retryProfile}>Volver a intentar</Button>}<Link className="text-link" to="/#participantes">Volver a participantes</Link></section></AppLayout>;
  return <AppLayout><div className="page-width"><AccessFeedback state={access} checking retry={() => setAttempt((value) => value + 1)} close={close} /></div></AppLayout>;
}
