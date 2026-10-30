import { useEffect,useState } from 'react';
import { useLocation,useParams } from 'react-router';
import { usePrivateAccess } from '../app/PrivateAccessProvider';
import { AppLayout } from '../components/layout/AppLayout';
import { AccessFeedback } from '../components/access/AccessFeedback';
import { Notice } from '../components/ui/Feedback';
import { Button } from '../components/ui/Button';
import { OrganizerParticipants } from '../components/admin/OrganizerParticipants';
import { OrganizerForm } from '../components/admin/OrganizerForm';
import '../styles/organizer.css';

function OrganizerGate({mode}:{mode:'list'|'new'|'edit'|'event'}){
  const {state,verify,close}=usePrivateAccess(),[checked,setChecked]=useState(false),[attempt,setAttempt]=useState(0),[waiting,setWaiting]=useState(false),{id=''}=useParams();
  const retryAt=state.status==='temporary'?state.retryAt:0;
  useEffect(()=>{setWaiting(retryAt>Date.now());const timer=setTimeout(()=>setWaiting(false),Math.max(0,retryAt-Date.now()));return()=>clearTimeout(timer);},[retryAt]);
  useEffect(()=>{let active=true;void verify().then((scope)=>{if(active&&scope?.accessType==='organizer')setChecked(true);});return()=>{active=false;};},[attempt,verify]);
  if(!checked||state.status==='closed'||state.status==='ready'&&state.scope.accessType!=='organizer')return <AppLayout><div className="page-width"><AccessFeedback state={state} retry={()=>setAttempt((n)=>n+1)} close={close}/></div></AppLayout>;
  const canWrite=state.status==='ready'&&state.scope.accessType==='organizer';
  return <AppLayout><section className="admin-page page-width">{!canWrite&&<Notice title="La administración está en pausa" live>Conservamos los datos de esta pestaña. Necesitas un acceso válido para guardar. {state.status==='temporary'&&<Button variant="quiet" disabled={waiting} onClick={()=>{void verify();}}>Volver a comprobar acceso</Button>}</Notice>}
    {mode==='list'?<OrganizerParticipants canWrite={canWrite}/>:<OrganizerForm mode={mode} id={id} canWrite={canWrite}/>}</section></AppLayout>;
}
export function OrganizerPage({mode}:{mode:'list'|'new'|'edit'|'event'}){const {pathname}=useLocation();return <OrganizerGate key={pathname} mode={mode}/>;}
