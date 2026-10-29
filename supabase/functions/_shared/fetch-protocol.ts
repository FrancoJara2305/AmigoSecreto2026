import { isToken } from './tokens.ts';
import { productUrl } from './product-url.ts';
export interface FetchEnvelope {v:1;nonce:string;url:string;expires_at:number}
export const MAX_PROXY_RESPONSE=1_450_000;
export async function sha256Text(text:string):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest),(b)=>b.toString(16).padStart(2,'0')).join('');
}
export function fetchEnvelope(value:unknown,now=Date.now()):FetchEnvelope {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid transport envelope');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='expires_at,nonce,url,v' || v.v!==1 || !isToken(v.nonce) ||
    typeof v.expires_at!=='number'||!Number.isInteger(v.expires_at)||v.expires_at*1000<=now||v.expires_at*1000>now+31000 ||
    typeof v.url!=='string'||productUrl(v.url).href!==v.url)throw new Error('Invalid transport envelope');
  return v as unknown as FetchEnvelope;
}
async function key(secret:string) {
  if(!isToken(secret))throw new Error('Transport not configured');
  const bytes=Uint8Array.from(atob(secret.replace(/-/g,'+').replace(/_/g,'/')+'='),(c)=>c.charCodeAt(0));
  return crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function signFetch(domain:'request'|'claim'|'response',body:string,secret:string):Promise<string> {
  const bytes=await crypto.subtle.sign('HMAC',await key(secret),new TextEncoder().encode(`wishlist-fetch/${domain}/v1\n${body}`));
  return Array.from(new Uint8Array(bytes),(b)=>b.toString(16).padStart(2,'0')).join('');
}
export async function verifyFetch(domain:'request'|'claim'|'response',body:string,signature:string|null,secret:string):Promise<boolean> {
  if(!signature||!/^[0-9a-f]{64}$/.test(signature))return false;
  const bytes=Uint8Array.from(signature.match(/../g)!, (b)=>parseInt(b,16));
  return crypto.subtle.verify('HMAC',await key(secret),bytes,new TextEncoder().encode(`wishlist-fetch/${domain}/v1\n${body}`));
}
export async function boundedText(request:Request|Response,max:number,signal?:AbortSignal):Promise<string> {
  const reader=request.body?.getReader();if(!reader)throw new Error('Missing body');
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
  let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
  try{while(true){signal?.throwIfAborted();const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>max){await reader.cancel();throw new Error('Body limit');}text+=decoder.decode(part.value,{stream:true});}signal?.throwIfAborted();return text+decoder.decode();}
  finally{signal?.removeEventListener('abort',cancel);reader.releaseLock();}
}
export function encodeBytes(bytes:Uint8Array):string {
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
}
export function decodeHtmlBody(value:unknown):Uint8Array {
  if(typeof value!=='string'||value.length>1398104||value.length%4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error('Invalid transport result');
  const bytes=Uint8Array.from(atob(value),(c)=>c.charCodeAt(0));if(bytes.length>1048576)throw new Error('Body limit');return bytes;
}
