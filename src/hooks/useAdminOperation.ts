import { useEffect,useRef,useState } from 'react';
import { usePrivateAccess } from '../app/PrivateAccessProvider';
import { AdminError,type AdminRequest } from '../services/organizer';
export function useAdminOperation(){
  const {admin}=usePrivateAccess(),[busy,setBusy]=useState(false),[issue,setIssue]=useState<AdminError|null>(null),[retryAt,setRetryAt]=useState(0),[,tick]=useState(0);
  const locked=useRef(false),abort=useRef<AbortController|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;abort.current?.abort();};},[]);
  useEffect(()=>{if(retryAt<=Date.now())return;const timer=setTimeout(()=>tick((n)=>n+1),retryAt-Date.now()+1);return()=>clearTimeout(timer);},[retryAt]);
  async function run(request:AdminRequest){
    if(locked.current)throw new AdminError('busy');if(retryAt>Date.now())throw new AdminError('rate',{},Math.ceil((retryAt-Date.now())/1000));
    locked.current=true;setBusy(true);setIssue(null);const controller=new AbortController();abort.current=controller;
    try{const result=await admin(request,controller.signal);if(!mounted.current||controller.signal.aborted)throw new AdminError('access');return result;}
    catch(error){const failure=error instanceof AdminError?error:new AdminError('uncertain');if(mounted.current){setIssue(failure);if(failure.kind==='rate')setRetryAt(Date.now()+Math.max(1,failure.retryAfter)*1000);}throw failure;}
    finally{locked.current=false;if(mounted.current)setBusy(false);}
  }
  return {run,busy,issue,waiting:retryAt>Date.now(),clear:()=>setIssue(null)};
}
