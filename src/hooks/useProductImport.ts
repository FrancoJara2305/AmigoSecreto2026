import { useEffect,useRef,useState } from 'react';
import type { GiftDraft } from '../domain/gift-editor';
import { applyImportFields,defaultImportSelection,importPriceIssue,type ImportField,type ImportMetadata } from '../domain/product-import';
import { ProductLookupError } from '../services/product-import';
import { usePrivateAccess } from '../app/PrivateAccessProvider';

type Preview={metadata:ImportMetadata;snapshot:string};
export function useProductImport(draft:GiftDraft,participantId:string,enabled:boolean,apply:(next:GiftDraft,expected:string)=>boolean) {
  const {importProduct}=usePrivateAccess();
  const snapshot=JSON.stringify(draft);
  const current=useRef({snapshot,enabled});current.current={snapshot,enabled};
  const request=useRef<{controller:AbortController;snapshot:string}|null>(null);
  const [loading,setLoading]=useState(false),[preview,setPreview]=useState<Preview|null>(null);
  const [selected,setSelected]=useState<Set<ImportField>>(new Set()),[confirmed,setConfirmed]=useState(false);
  const [message,setMessage]=useState(''),[retryAt,setRetryAt]=useState(0),[waiting,setWaiting]=useState(false);
  useEffect(()=>{setWaiting(retryAt>Date.now());const timer=setTimeout(()=>setWaiting(false),Math.max(0,retryAt-Date.now()));return()=>clearTimeout(timer);},[retryAt]);
  useEffect(()=>()=>{request.current?.controller.abort();request.current=null;},[]);
  useEffect(()=>{
    const stale=request.current&&request.current.snapshot!==snapshot || preview&&preview.snapshot!==snapshot;
    if ((!enabled || stale) && (request.current || preview)) {
      request.current?.controller.abort();request.current=null;setLoading(false);setPreview(null);setSelected(new Set());setConfirmed(false);
      setMessage(stale?'El borrador cambió. Vuelve a importar si quieres revisar sugerencias para este enlace.':'La consulta se descartó. Necesitas acceso de edición disponible para importar.');
    }
  },[snapshot,enabled,preview]);
  function cancel() {
    request.current?.controller.abort();request.current=null;setLoading(false);setPreview(null);setSelected(new Set());setConfirmed(false);
    setMessage('Importación cancelada. Tu borrador se conserva.');
  }
  async function start() {
    if (request.current || !enabled || retryAt>Date.now()) return;
    const attempt={controller:new AbortController(),snapshot};request.current=attempt;
    setLoading(true);setPreview(null);setSelected(new Set());setConfirmed(false);setMessage('');
    try {
      const result=await importProduct(participantId,draft.product_url,attempt.controller.signal);
      if(request.current!==attempt || attempt.controller.signal.aborted || current.current.snapshot!==attempt.snapshot || !current.current.enabled)return;
      if(result.status==='manual')setMessage(result.reason==='NO_USABLE_METADATA'?'No encontramos información utilizable. Puedes completar tu regalo manualmente.':'La tienda no respondió o no permite esta consulta. Tu enlace sigue disponible.');
      else {setPreview({metadata:result.metadata,snapshot:attempt.snapshot});setSelected(new Set(defaultImportSelection(draft,result.metadata)));}
    } catch(error) {
      if(request.current!==attempt || attempt.controller.signal.aborted)return;
      if(error instanceof ProductLookupError && error.kind==='rate') {
        const seconds=Math.max(1,error.retryAfter);setRetryAt(Date.now()+seconds*1000);setWaiting(true);
        setMessage(`Has realizado varias importaciones. Espera ${seconds>=60?`${Math.ceil(seconds/60)} minuto(s)`:`${seconds} segundo(s)`} antes de volver a intentarlo. Tu borrador se conserva.`);
      } else setMessage(error instanceof ProductLookupError && error.kind==='invalid'?'Usa un enlace HTTPS público de un producto.':error instanceof ProductLookupError && error.kind==='access'?'Tu acceso ya no permite importar. El borrador se conserva.':'La tienda no respondió o no permite esta consulta. Tu enlace sigue disponible.');
    } finally {if(request.current===attempt){request.current=null;setLoading(false);}}
  }
  function toggle(field:ImportField) {setSelected((old)=>{const next=new Set(old);if(next.has(field))next.delete(field);else next.add(field);return next;});}
  const priceIssue=preview?importPriceIssue(draft,preview.metadata,selected,confirmed):'';
  function applySelected() {
    if(!preview || !enabled || !selected.size || priceIssue || current.current.snapshot!==preview.snapshot)return;
    const next=applyImportFields(draft,preview.metadata,selected,confirmed);
    if(!apply(next,preview.snapshot))return;
    setPreview(null);setSelected(new Set());setConfirmed(false);setMessage('Campos aplicados al borrador. Revisa la información y pulsa Guardar regalo cuando quieras conservarla.');
  }
  return {loading,preview,selected,confirmed,setConfirmed,message,waiting,priceIssue,start,cancel,toggle,applySelected};
}
