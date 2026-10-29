import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { AccessType } from '../domain/private-access';
import { usePrivateAccess } from '../app/PrivateAccessProvider';
import { AppLayout } from '../components/layout/AppLayout';
import { AccessFeedback } from '../components/access/AccessFeedback';

export function PrivateAccessPage({ type }: { type: AccessType }) {
  const { state, verify, close } = usePrivateAccess();
  const navigate = useNavigate();
  const mounts = useRef(0);
  const completed = useRef(false);
  useEffect(() => {
    document.title = 'Tu enlace privado · Amigo Secreto';
    if (state.status === 'pending' && state.entryType === type) void verify();
    if (state.status === 'ready' && state.scope.accessType === type) { completed.current = true; navigate(type === 'organizer' ? '/organizador' : `/participante/${state.scope.participantSlug}`, { replace: true }); }
  }, [state, type, verify, navigate]);
  useEffect(() => {
    const mount = ++mounts.current;
    return () => { queueMicrotask(() => { if (mounts.current === mount && !completed.current) close(); }); };
  }, [close]);
  return <AppLayout><div className="page-width"><AccessFeedback state={state} retry={() => { void verify(); }} close={close} /></div></AppLayout>;
}
