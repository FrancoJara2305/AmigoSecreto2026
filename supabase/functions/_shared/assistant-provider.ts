import { boundedText } from './fetch-protocol.ts';

export interface ProviderInput { system:string; contents:{role:'user'|'model';text:string}[] }
export interface ProviderOutput { model:string; text:string; truncated:boolean; usage:{input:number;output:number}|null }
export interface AssistantProvider { readonly model:string; generate(input:ProviderInput,signal:AbortSignal):Promise<ProviderOutput> }
export class ProviderError extends Error {
  readonly kind:'busy'|'unavailable';
  constructor(kind:'busy'|'unavailable'){super('Provider unavailable');this.kind=kind;}
}

const GEMINI_ORIGIN='https://generativelanguage.googleapis.com';
// Server-pinned model id; the browser never chooses it.
export const isGeminiModel=(value:unknown):value is string=>typeof value==='string'&&/^gemini-[a-z0-9][a-z0-9.-]{0,60}$/.test(value);

// Plain HTTP adapter: one fixed Google origin, key in a header (never in the URL), bounded body,
// no tools. One call per message; 429/503 from Google are reported as saturation.
export function createGeminiProvider(options:{apiKey:string;model:string;fetcher?:typeof fetch;maxOutputTokens?:number;timeoutMs?:number}):AssistantProvider {
  if(!options.apiKey||options.apiKey.startsWith('REPLACE_')||!isGeminiModel(options.model))throw new Error('Provider not configured');
  const {model}=options,fetcher=options.fetcher??fetch;
  return {model,async generate(input,signal){
    let response:Response;
    try{
      response=await fetcher(`${GEMINI_ORIGIN}/v1beta/models/${model}:generateContent`,{method:'POST',redirect:'error',
        headers:{'Content-Type':'application/json','x-goog-api-key':options.apiKey},
        body:JSON.stringify({systemInstruction:{parts:[{text:input.system}]},contents:input.contents.map((turn)=>({role:turn.role,parts:[{text:turn.text}]})),
          generationConfig:{maxOutputTokens:options.maxOutputTokens??300,temperature:0.4}}),
        signal:AbortSignal.any([signal,AbortSignal.timeout(options.timeoutMs??20000)])});
    }catch{throw new ProviderError('unavailable');}
    if(!response.ok){void response.body?.cancel().catch(()=>{});throw new ProviderError(response.status===429||response.status===503?'busy':'unavailable');}
    let data:Record<string,unknown>;
    try{data=JSON.parse(await boundedText(response,262144,signal));}catch{throw new ProviderError('unavailable');}
    const candidate=(Array.isArray(data.candidates)?data.candidates[0]:null) as {content?:{parts?:{text?:unknown;thought?:unknown}[]};finishReason?:unknown}|null;
    // Thought summaries, if a model ever returns them, are not part of the answer.
    const text=(candidate?.content?.parts??[]).map((part)=>typeof part?.text==='string'&&part.thought!==true?part.text:'').join('');
    const usage=data.usageMetadata as {promptTokenCount?:unknown;candidatesTokenCount?:unknown}|undefined;
    return {model,text,truncated:candidate?.finishReason==='MAX_TOKENS',
      usage:usage&&Number.isInteger(usage.promptTokenCount)&&Number.isInteger(usage.candidatesTokenCount)?{input:usage.promptTokenCount as number,output:usage.candidatesTokenCount as number}:null};
  }};
}
// Local development only: deterministic text without network access or cost.
export function createSyntheticProvider():AssistantProvider {
  return {model:'synthetic',async generate(input,signal){
    signal.throwIfAborted();
    const question=input.contents.at(-1)?.text.split(/\r?\n/).at(-1)??'';
    return {model:'synthetic',truncated:false,usage:null,text:['Respuesta simulada para pruebas locales: no proviene de Gemini.',
      `Mensaje recibido: ${question.slice(0,200)}`,`Turnos previos: ${(input.contents.length-1)/2}`].join('\n')};
  }};
}
