import https from 'node:https';
import { Resolver } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import { Transform,Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip,createBrotliDecompress,createInflate } from 'node:zlib';
import { productUrl,ProductImportError } from '../../supabase/functions/_shared/product-url.ts';
import { publicAddress,sameAddress } from './ip-policy.ts';
export const HTML_BYTES=1024*1024;
// Product metadata lives in <head>, but some stores (Falabella, Sodimac, Coolbox) ship >1 MB pages.
// Keep the first HTML_BYTES instead of rejecting; the wire cap only guards against non-compressing junk.
const WIRE_BYTES=2*HTML_BYTES;
class Truncated extends Error {}
// Drop a trailing incomplete UTF-8 sequence so the strict decoder does not reject a cut page.
function utf8Prefix(bytes:Buffer):Buffer {
  let start=bytes.length-1;while(start>=0 && start>bytes.length-4 && (bytes[start]&0xc0)===0x80)start--;
  if(start<0||bytes[start]<0xc0)return bytes;
  const need=bytes[start]>=0xf0?4:bytes[start]>=0xe0?3:2;return bytes.length-start<need?bytes.subarray(0,start):bytes;
}
export type PinnedAddress={address:string;family:4|6};
export type HtmlDownload={url:string;bytes:Uint8Array;contentType:string};
export type ExchangeResult={status:number;location?:string;bytes:Uint8Array;contentType:string};
async function beforeAbort<T>(promise:Promise<T>,signal:AbortSignal):Promise<T> {
  signal.throwIfAborted();let abort:()=>void=()=>{};
  const stopped=new Promise<never>((_resolve,reject)=>{abort=()=>reject(new DOMException('Aborted','AbortError'));signal.addEventListener('abort',abort,{once:true});});
  try{return await Promise.race([promise,stopped]);}finally{signal.removeEventListener('abort',abort);}
}
export async function resolveAddresses(host:string,signal:AbortSignal):Promise<PinnedAddress[]> {
  const resolver=new Resolver({timeout:2000,tries:1});
  const cancel=()=>resolver.cancel();signal.addEventListener('abort',cancel,{once:true});
  try {
    signal.throwIfAborted();
    const lookup=async(family:4|6)=>{
      try{return (family===4?await resolver.resolve4(host):await resolver.resolve6(host)).map((address)=>({address,family}));}
      catch(error){if(error && typeof error==='object' && 'code' in error && ['ENODATA','ENOTFOUND'].includes(String(error.code)))return [];throw error;}
    };
    return (await Promise.all([lookup(4),lookup(6)])).flat();
  }finally{signal.removeEventListener('abort',cancel);}
}
// Low-level primitive is separately tested with a synthetic CA and loopback TLS fixture.
// Production callers must use downloadProduct, which validates EVERY resolved address first.
export async function pinnedExchange(url:URL,pin:PinnedAddress,signal:AbortSignal,fixture?:{port:number;ca:string}):Promise<ExchangeResult> {
  return new Promise((resolve,reject)=>{
    const lookup:LookupFunction=(_host,_options,callback)=>callback(null,pin.address,pin.family);
    const request=https.request({protocol:'https:',hostname:url.hostname,port:fixture?.port??443,path:url.pathname+url.search,
      method:'GET',servername:url.hostname,lookup,family:pin.family,agent:false,rejectUnauthorized:true,
      ...(fixture?{ca:fixture.ca}:{}),signal,maxHeaderSize:16384,
      headers:{Accept:'text/html, application/xhtml+xml','Accept-Encoding':'gzip, br, deflate','User-Agent':'AmigoSecretoMetadata/1.0'}},(response)=>{
      void(async()=>{
        const status=response.statusCode??0;
        if([301,302,303,307,308].includes(status)){response.destroy();resolve({status,location:response.headers.location,bytes:new Uint8Array(),contentType:''});return;}
        if(status!==200){response.destroy();throw new ProductImportError('UNAVAILABLE');}
        const contentType=response.headers['content-type']??'';
        if(!/^(text\/html|application\/xhtml\+xml)(\s*;|$)/i.test(contentType) || contentType.length>160){response.destroy();throw new ProductImportError('UNSUPPORTED_CONTENT');}
        const encoding=response.headers['content-encoding']?.trim().toLowerCase()??'identity';
        if(!['identity','gzip','br','deflate'].includes(encoding)){response.destroy();throw new ProductImportError('UNSUPPORTED_CONTENT');}
        let wire=0,decoded=0;const chunks:Buffer[]=[];
        const boundedWire=new Transform({transform(chunk:Buffer,_encoding,done){wire+=chunk.length;done(wire>WIRE_BYTES?new ProductImportError('TOO_LARGE'):null,chunk);}});
        const output=new Writable({write(chunk:Buffer,_encoding,done){
          const room=HTML_BYTES-decoded;decoded+=chunk.length;
          if(chunk.length>=room){chunks.push(chunk.subarray(0,room));done(new Truncated());return;}chunks.push(chunk);done();}});
        const decompressor=encoding==='gzip'?createGunzip():encoding==='br'?createBrotliDecompress():encoding==='deflate'?createInflate():null;
        let truncated=false;
        try{if(decompressor)await pipeline(response,boundedWire,decompressor,output,{signal});else await pipeline(response,boundedWire,output,{signal});}
        catch(error){if(!(error instanceof Truncated))throw error;truncated=true;response.destroy();}
        const bytes=Buffer.concat(chunks);
        resolve({status,bytes:new Uint8Array(truncated?utf8Prefix(bytes):bytes),contentType});
      })().catch((error)=>{response.destroy();reject(error);});
    });
    request.maxHeadersCount=64;
    request.on('socket',(socket)=>socket.once('secureConnect',()=>{
      if(!socket.remoteAddress || !sameAddress(socket.remoteAddress,pin.address))request.destroy(new ProductImportError('BLOCKED_DESTINATION'));
    }));
    request.once('error',reject);request.end();
  });
}
export function createProductDownloader(deps:{resolve?:typeof resolveAddresses;exchange?:typeof pinnedExchange;allowedHosts?:ReadonlySet<string>}={}) {
  return async(value:string,parentSignal?:AbortSignal):Promise<HtmlDownload>=>{
    const signal=AbortSignal.any([AbortSignal.timeout(8000),...(parentSignal?[parentSignal]:[])]);
    try{
      let url=productUrl(value);
      for(let hop=0;hop<=3;hop++){
        signal.throwIfAborted();if(deps.allowedHosts && !deps.allowedHosts.has(url.hostname))throw new ProductImportError('BLOCKED_DESTINATION');
        const addresses=await beforeAbort((deps.resolve??resolveAddresses)(url.hostname,signal),signal);
        signal.throwIfAborted();
        if(!addresses.length || addresses.length>16 || addresses.some((ip)=>!publicAddress(ip.address)))throw new ProductImportError('BLOCKED_DESTINATION');
        const response=await beforeAbort((deps.exchange??pinnedExchange)(url,addresses[0],signal),signal);
        if([301,302,303,307,308].includes(response.status)){
          if(hop===3)throw new ProductImportError('REDIRECT_LIMIT');
          if(!response.location)throw new ProductImportError('UNAVAILABLE');url=productUrl(response.location,url.href);continue;
        }
        if(response.status!==200 || response.bytes.length>HTML_BYTES)throw new ProductImportError(response.bytes.length>HTML_BYTES?'TOO_LARGE':'UNAVAILABLE');
        return {url:url.href,bytes:response.bytes,contentType:response.contentType};
      }
      throw new ProductImportError('REDIRECT_LIMIT');
    }catch(error){if(error instanceof ProductImportError)throw error;throw new ProductImportError(signal.aborted?'TIMEOUT':'UNAVAILABLE');}
  };
}
