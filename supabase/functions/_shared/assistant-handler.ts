import { ASSISTANT_LIMITS,validateAssistantRequest,type AssistantErrorCode,type AssistantReply } from './assistant-contract.ts';
import { buildProviderInput } from './assistant-prompt.ts';
import { ProviderError,type AssistantProvider } from './assistant-provider.ts';
import type { AccessRpcResult } from './access-handler.ts';
import { boundedText } from './fetch-protocol.ts';
import type { PromptGift } from './gift-facts.ts';

export interface AssistantRpcArgs { p_participant_id:string; p_gift_id:string|null }
export interface AssistantLog { request_id:string; action:'gift-assistant'; status:number; duration_ms:number; model?:string; input_tokens?:number; output_tokens?:number }
export interface AssistantDependencies {
  allowedOrigins:string[];
  enabled:boolean;
  provider:AssistantProvider|null;
  // Quota first, then canonical public context. Server-only RPC; fails closed when it throws.
  callRpc(args:AssistantRpcArgs):Promise<AccessRpcResult>;
  now?():number;
  log?(entry:AssistantLog):void;
}
const messages:Record<AssistantErrorCode|'FORBIDDEN'|'METHOD_NOT_ALLOWED',string>={
  INVALID_REQUEST:'Revisa los datos de la consulta.',
  NOT_FOUND:'Esta persona o este regalo ya no están disponibles.',
  RATE_LIMITED:'El asistente recibió muchas consultas. Espera antes de intentarlo nuevamente.',
  UNAVAILABLE:'El asistente no está disponible en este momento.',
  PROVIDER_UNAVAILABLE:'No pudimos obtener una respuesta. Inténtalo nuevamente en unos instantes.',
  SERVER_ERROR:'No pudimos completar la consulta.',
  FORBIDDEN:'Origen no permitido.',
  METHOD_NOT_ALLOWED:'Método no permitido.',
};
const limaDate=(now:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date(now));
// Plain text only: line breaks stay; other controls and Markdown emphasis are dropped.
const clean=(text:string)=>text.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g,'').replace(/\*\*/g,'').replace(/\n{3,}/g,'\n\n').trim();
const cut=(text:string,max:number)=>text.length>max?`${text.slice(0,max-1).trimEnd()}…`:text;

function giftContext(value:unknown,giftId:string):PromptGift|null {
  if(!value||typeof value!=='object')return null;
  const g=value as Record<string,unknown>;
  if(g.id!==giftId||typeof g.title!=='string'||(g.gift_type!=='clothing'&&g.gift_type!=='object'))return null;
  return {title:g.title,description:typeof g.description==='string'?g.description:null,gift_type:g.gift_type,details:g.details,
    reference_price:typeof g.reference_price==='number'&&Number.isFinite(g.reference_price)?g.reference_price:null,
    currency:typeof g.currency==='string'?g.currency:null,product_url:typeof g.product_url==='string'?g.product_url:null};
}

export function createAssistantHandler(deps:AssistantDependencies) {
  const available=()=>deps.enabled&&!!deps.provider&&deps.allowedOrigins.length>0;
  return async(request:Request):Promise<Response> => {
    const started=performance.now(),id=crypto.randomUUID(),now=deps.now?.()??Date.now();
    const origin=request.headers.get('origin');
    const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer',Vary:'Origin','Access-Control-Expose-Headers':'Retry-After, X-Request-Id','X-Request-Id':id});
    let usage:Pick<AssistantLog,'model'|'input_tokens'|'output_tokens'>={};
    const done=(response:Response)=>{
      try{deps.log?.({request_id:id,action:'gift-assistant',status:response.status,duration_ms:Math.round(performance.now()-started),...usage});}catch{/* never changes the result */}
      return response;
    };
    const reply=(status:number,data:unknown)=>done(new Response(JSON.stringify(data),{status,headers}));
    const fail=(status:number,code:keyof typeof messages,retryAfter?:number)=>{
      if(status===429)headers.set('Retry-After',String(Math.max(1,Math.min(86400,Math.trunc(Number(retryAfter))||60))));
      return reply(status,{error:{code,message:messages[code]}});
    };
    if(!deps.allowedOrigins.length)return fail(503,'UNAVAILABLE');
    if(origin&&!deps.allowedOrigins.includes(origin))return fail(403,'FORBIDDEN');
    if(origin)headers.set('Access-Control-Allow-Origin',origin);
    if(request.method==='OPTIONS'){
      headers.set('Access-Control-Allow-Methods','GET, POST');
      headers.set('Access-Control-Allow-Headers','content-type, apikey, authorization');
      return done(new Response(null,{status:204,headers}));
    }
    if(new URL(request.url).search)return fail(422,'INVALID_REQUEST');
    // Public availability only: no quota, provider call or configuration details.
    if(request.method==='GET')return reply(200,{available:available()});
    if(request.method!=='POST'){headers.set('Allow','GET, POST, OPTIONS');return fail(405,'METHOD_NOT_ALLOWED');}
    if(!available())return fail(503,'UNAVAILABLE');
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail(415,'INVALID_REQUEST');
    let raw:unknown;
    try{raw=JSON.parse(await boundedText(request,ASSISTANT_LIMITS.body));}
    catch(error){return fail(error instanceof Error&&error.message==='Body limit'?413:422,'INVALID_REQUEST');}
    const validation=validateAssistantRequest(raw);
    if(!validation.ok)return fail(422,'INVALID_REQUEST');
    const input=validation.request;
    let result:AccessRpcResult;
    try{result=await deps.callRpc({p_participant_id:input.participant_id,p_gift_id:input.gift_id});}
    catch{return fail(503,'SERVER_ERROR');}
    if(result.ok!==true){
      if(result.status===429)return fail(429,'RATE_LIMITED',result.retry_after);
      if(result.status===404)return fail(404,'NOT_FOUND');
      if(result.status===422)return fail(422,'INVALID_REQUEST');
      return fail(503,'SERVER_ERROR');
    }
    // The gift text always comes from the database, never from the browser.
    const person=result.participant as Record<string,unknown>|undefined;
    if(!person||person.id!==input.participant_id||(person.general_preferences!==null&&typeof person.general_preferences!=='string'))return fail(503,'SERVER_ERROR');
    const gift=input.gift_id?giftContext(result.gift,input.gift_id):null;
    if(input.gift_id&&!gift)return fail(503,'SERVER_ERROR');
    let output;
    try{
      output=await deps.provider!.generate(buildProviderInput({context:{gift,preferences:person.general_preferences as string|null},
        message:input.message,today:limaDate(now)}),request.signal);
    }catch(error){return error instanceof ProviderError&&error.kind==='busy'?fail(429,'RATE_LIMITED',60):fail(503,'PROVIDER_UNAVAILABLE');}
    usage={model:output.model,...(output.usage?{input_tokens:output.usage.input,output_tokens:output.usage.output}:{})};
    let answer=clean(output.text);
    // A blocked or empty candidate is a final answer, not a failure worth retrying.
    if(!answer)answer='No pude responder esta consulta. Prueba a reformularla.';
    else if(output.truncated)answer+='…';
    const body:AssistantReply={answer:cut(answer,ASSISTANT_LIMITS.answer)};
    return reply(200,body);
  };
}
