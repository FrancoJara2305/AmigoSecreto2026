import { boundedText,fetchEnvelope,verifyFetch,signFetch,encodeBytes,type FetchEnvelope } from '../../supabase/functions/_shared/fetch-protocol.ts';
import { isToken } from '../../supabase/functions/_shared/tokens.ts';
import { ProductImportError } from '../../supabase/functions/_shared/product-url.ts';
import { createProductDownloader,type HtmlDownload } from './transport.ts';
export function createFetchProxy(deps:{secret:string|undefined;claim(envelope:FetchEnvelope,body:string,signature:string,signal:AbortSignal):Promise<boolean>;
  download?:(url:string,signal:AbortSignal)=>Promise<HtmlDownload>}) {
  const download=deps.download??createProductDownloader();
  return async(request:Request):Promise<Response>=>{
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    const fail=(status:number)=>Response.json({error:'Transport unavailable'},{status,headers});
    if(request.method!=='POST')return fail(405);
    if(!isToken(deps.secret))return fail(503);
    if(new URL(request.url).search || request.headers.get('Content-Type')!=='application/json')return fail(400);
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(12000)]);
    let envelope:FetchEnvelope,body:string;
    try{body=await boundedText(request,4096,signal);if(!await verifyFetch('request',body,request.headers.get('X-Fetch-Signature'),deps.secret))return fail(401);envelope=fetchEnvelope(JSON.parse(body));}
    catch{return fail(401);}
    const reply=async(value:unknown,status=200)=>{
      const text=JSON.stringify({v:1,nonce:envelope.nonce,...value as object});
      return new Response(text,{status,headers:{...headers,'X-Fetch-Signature':await signFetch('response',text,deps.secret!)}});
    };
    try{
      // Durable claim in Supabase BEFORE DNS or any connection to the destination.
      if(!await deps.claim(envelope,body,await signFetch('claim',body,deps.secret),signal))return await reply({ok:false,error:'UNAVAILABLE'},409);
      const result=await download(envelope.url,signal);
      return await reply({ok:true,url:result.url,content_type:result.contentType,body:encodeBytes(result.bytes)});
    }catch(error){return await reply({ok:false,error:error instanceof ProductImportError?error.code:signal.aborted?'TIMEOUT':'UNAVAILABLE'},422);}
  };
}
export function callbackClaim(url:string,fetcher:typeof fetch=fetch,allowLocal=false) {
  const target=new URL(url);
  if(target.username||target.password||target.search||target.hash||target.pathname!=='/functions/v1/product-metadata' ||
    (target.protocol!=='https:' && !(allowLocal && target.protocol==='http:' && ['127.0.0.1','localhost'].includes(target.hostname))))throw new Error('Invalid callback configuration');
  return async(_envelope:FetchEnvelope,body:string,signature:string,signal:AbortSignal)=>{
    const response=await fetcher(target,{method:'POST',headers:{'Content-Type':'application/json','X-Transport-Claim':signature},body,
      redirect:'error',credentials:'omit',signal:AbortSignal.any([signal,AbortSignal.timeout(3000)])});
    if(!response.ok){await response.body?.cancel();return false;}
    const text=await boundedText(response,512,signal);return JSON.parse(text)?.claimed===true;
  };
}
