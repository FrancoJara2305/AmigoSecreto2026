import { useEffect,useState } from 'react';
import { Link,useParams } from 'react-router';
import { usePrivateAccess } from '../app/PrivateAccessProvider';
import { scopeCanEdit } from '../domain/private-access';
import type { EditableProfile } from '../domain/profile-editor';
import { loadEditableProfile } from '../services/profile-editor';
import { AppLayout } from '../components/layout/AppLayout';
import { AccessFeedback } from '../components/access/AccessFeedback';
import { ProfileEditor } from '../components/editor/ProfileEditor';
import { Button } from '../components/ui/Button';

export function ProfileEditorPage() {
  const {slug=''}=useParams(),{state:access,verify,close}=usePrivateAccess();
  const [attempt,setAttempt]=useState(0),[result,setResult]=useState<{slug:string;profile?:EditableProfile|null;error?:boolean}>({slug});
  const [model,setModel]=useState<{slug:string;profile:EditableProfile;tokenId:string}|null>(null);
  useEffect(()=>{const abort=new AbortController();setResult({slug});
    void loadEditableProfile({slug},abort.signal).then((profile)=>{if(!abort.signal.aborted)setResult({slug,profile});}).catch(()=>{if(!abort.signal.aborted)setResult({slug,error:true});});return()=>abort.abort();
  },[slug,attempt]);
  useEffect(()=>{if(access.status==='closed'||access.status==='ready'&&model&&access.scope.tokenId!==model.tokenId)setModel(null);},[access,model?.tokenId]);
  const profile=result.slug===slug?result.profile:undefined;
  useEffect(()=>{if(!profile||model?.slug===slug)return;let active=true;
    void verify(profile.id).then((scope)=>{if(active&&scope&&scopeCanEdit(scope,profile.id))setModel({slug,profile,tokenId:scope.tokenId});});return()=>{active=false;};
  },[slug,profile,attempt,model?.slug,verify]);
  if(model?.slug===slug&&access.status!=='closed')return <AppLayout><ProfileEditor key={`${slug}:${model.tokenId}`} initial={model.profile} canWrite={access.status==='ready'&&access.scope.tokenId===model.tokenId&&scopeCanEdit(access.scope,model.profile.id)}/></AppLayout>;
  if(access.status==='closed'||access.status==='unavailable'||access.status==='temporary'||access.status==='ready'&&profile&&!scopeCanEdit(access.scope,profile.id))return <AppLayout><div className="page-width"><AccessFeedback state={access} retry={()=>setAttempt((n)=>n+1)} close={close}/></div></AppLayout>;
  if(result.slug===slug&&(result.error||profile===null))return <AppLayout><section className="profile-state page-width"><h1>{result.error?'No pudimos cargar el perfil':'No encontramos este participante'}</h1>{result.error&&<Button onClick={()=>setAttempt((n)=>n+1)}>Volver a intentar</Button>}<Link className="text-link" to="/#participantes">Volver a participantes</Link></section></AppLayout>;
  return <AppLayout><div className="page-width"><AccessFeedback state={access} checking retry={()=>setAttempt((n)=>n+1)} close={close}/></div></AppLayout>;
}
