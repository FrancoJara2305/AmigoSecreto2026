import { generateToken,hashToken,isToken } from './tokens.ts';
import { productUrl,ProductImportError } from './product-url.ts';
import { boundedText,fetchEnvelope,signFetch,verifyFetch,sha256Text,decodeHtmlBody,MAX_PROXY_RESPONSE } from './fetch-protocol.ts';
import { parseProductMetadata } from './product-parser.ts';
import type { AccessRpcResult } from './access-handler.ts';
export interface ProductDependencies {
  allowedOrigins:string[];proxyUrl?:string;secret?:string;allowLocalProxy?:boolean;
  callRpc(name:'server_prepare_import'|'server_claim_import'|'server_access',args:unknown,signal?:AbortSignal):Promise<AccessRpcResult>;
  fetcher?:typeof fetch;
}
export function createProductHandler(deps:ProductDependencies) {
  return async(request:Request):Promise<Response>=>{
    const origin=request.headers.get('Origin');
    const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
      'X-Content-Type-Options':'nosniff',Vary:'Origin','Access-Control-Expose-Headers':'Retry-After'});
    const reply=(status:number,value:unknown)=>Response.json(value,{status,headers});
    const fail=(status:number,code:string)=>reply(status,{error:{code,message:status===401||status===403?'Este enlace de edición no está disponible.':code==='INVALID_URL'?'Usa un enlace HTTPS público de un producto.':'No pudimos consultar la tienda. Puedes completar el regalo manualmente.'}});
    const manual=(reason:string)=>reply(200,{status:'manual',reason,message:reason==='NO_USABLE_METADATA'?'No encontramos información utilizable. Puedes completar tu regalo manualmente.':'La tienda no respondió o no permite esta consulta. Tu enlace sigue disponible.'});
    if(!deps.allowedOrigins.length)return fail(503,'UNAVAILABLE');
    if(origin&&!deps.allowedOrigins.includes(origin))return fail(403,'FORBIDDEN');
    if(origin)headers.set('Access-Control-Allow-Origin',origin);
    if(request.method==='OPTIONS'){
      headers.set('Access-Control-Allow-Methods','POST');headers.set('Access-Control-Allow-Headers','content-type, x-edit-token, apikey, authorization');return new Response(null,{status:204,headers});
    }
    if(request.method!=='POST'){headers.set('Allow','POST, OPTIONS');return fail(405,'INVALID_REQUEST');}
    if(new URL(request.url).search)return fail(422,'INVALID_REQUEST');
    if(request.headers.get('Content-Type')!=='application/json')return fail(415,'INVALID_REQUEST');
    if(!isToken(deps.secret))return fail(503,'UNAVAILABLE');
    const secret=deps.secret;
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(16000)]);
    // Node calls this signed operational branch to consume a nonce atomically before DNS.
    // Browser capabilities/API keys never authorize this branch.
    const claim=request.headers.get('X-Transport-Claim');
    if(claim){
      try{
        const body=await boundedText(request,4096,signal);
        if(!await verifyFetch('claim',body,claim,secret))return fail(401,'ACCESS_UNAVAILABLE');
        const envelope=fetchEnvelope(JSON.parse(body));
        const result=await deps.callRpc('server_claim_import',{p_nonce_hash:await sha256Text(envelope.nonce),p_url_hash:await sha256Text(envelope.url)},signal);
        return reply(result.ok?200:409,{claimed:result.ok===true});
      }catch{return fail(401,'ACCESS_UNAVAILABLE');}
    }
    const token=request.headers.get('X-Edit-Token');if(!isToken(token))return fail(401,'ACCESS_UNAVAILABLE');
    let proxy:URL;
    try{proxy=new URL(deps.proxyUrl??'');if(proxy.username||proxy.password||proxy.hash||proxy.search||
      (proxy.protocol!=='https:'&&!(deps.allowLocalProxy&&proxy.protocol==='http:'&&['127.0.0.1','localhost','host.docker.internal'].includes(proxy.hostname))))throw new Error();}
    catch{return fail(503,'UNAVAILABLE');}
    let body:Record<string,unknown>;let url:URL;
    try{
      const value=JSON.parse(await boundedText(request,4096,signal));
      if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='participant_id,url' ||
        typeof value.participant_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.participant_id))return fail(422,'INVALID_REQUEST');
      body=value;url=productUrl(value.url);
    }catch(error){return fail(422,error instanceof ProductImportError?'INVALID_URL':'INVALID_REQUEST');}
    const hash=await hashToken(token);
    const envelope={v:1 as const,nonce:generateToken(),url:url.href,expires_at:Math.floor(Date.now()/1000)+30};
    const rpcFailure=(result:AccessRpcResult)=>{
      const status=[401,403,404,422,429].includes(result.status??0)?result.status!:503;
      if(status===429)headers.set('Retry-After',String(Math.max(1,Math.min(3600,Number(result.retry_after)||60))));
      return fail(status,status===429?'RATE_LIMITED':status===401?'ACCESS_UNAVAILABLE':status===403?'FORBIDDEN':'UNAVAILABLE');
    };
    try{
      const admitted=await deps.callRpc('server_prepare_import',{p_token_hash:hash,p_participant_id:body.participant_id,p_url_hash:await sha256Text(url.href),
        p_nonce_hash:await sha256Text(envelope.nonce),p_expires_at:new Date(envelope.expires_at*1000).toISOString()},signal);
      signal.throwIfAborted();
      if(!admitted.ok)return rpcFailure(admitted);
      const payload=JSON.stringify(envelope);
      const response=await (deps.fetcher??fetch)(proxy,{method:'POST',headers:{'Content-Type':'application/json','X-Fetch-Signature':await signFetch('request',payload,secret)},
        body:payload,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.any([signal,AbortSignal.timeout(13000)])});
      const raw=await boundedText(response,MAX_PROXY_RESPONSE,signal);
      if(!await verifyFetch('response',raw,response.headers.get('X-Fetch-Signature'),secret))return manual('UNAVAILABLE');
      const downloaded=JSON.parse(raw);
      if(downloaded?.v!==1||downloaded?.nonce!==envelope.nonce)return manual('UNAVAILABLE');
      if(downloaded.ok!==true)return manual(['BLOCKED_DESTINATION','TIMEOUT','TOO_LARGE','REDIRECT_LIMIT','UNSUPPORTED_CONTENT'].includes(downloaded.error)?downloaded.error:'UNAVAILABLE');
      const final=productUrl(downloaded.url).href;
      if(typeof downloaded.content_type!=='string'||!/^(text\/html|application\/xhtml\+xml)(\s*;|$)/i.test(downloaded.content_type))return manual('UNSUPPORTED_CONTENT');
      const charset=/charset\s*=\s*["']?([^;\s"']+)/i.exec(downloaded.content_type)?.[1].toLowerCase()??'utf-8';
      if(!['utf-8','utf8','us-ascii','iso-8859-1','windows-1252'].includes(charset))return manual('UNSUPPORTED_CONTENT');
      const metadata=parseProductMetadata(new TextDecoder(charset,{fatal:true}).decode(decodeHtmlBody(downloaded.body)),final);
      // A revoked/expired link cannot receive a late result. No imported field is persisted here.
      const access=await deps.callRpc('server_access',{p_action:'validate_access',p_token_hash:hash,p_participant_id:body.participant_id},signal);
      signal.throwIfAborted();
      if(!access.ok)return rpcFailure(access);
      if(!metadata.fields.title)return manual(metadata.warnings.includes('STORE_BLOCKED')?'UNAVAILABLE':'NO_USABLE_METADATA');
      return reply(200,{status:metadata.warnings.length?'partial':'ok',metadata});
    }catch(error){return manual(error instanceof ProductImportError?error.code:signal.aborted?'TIMEOUT':'UNAVAILABLE');}
  };
}
