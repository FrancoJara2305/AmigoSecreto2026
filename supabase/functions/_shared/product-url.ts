export class ProductImportError extends Error {
  readonly code: 'INVALID_URL'|'BLOCKED_DESTINATION'|'UNAVAILABLE'|'TIMEOUT'|'TOO_LARGE'|'REDIRECT_LIMIT'|'UNSUPPORTED_CONTENT';
  constructor(code: ProductImportError['code']) {super('Product import unavailable');this.code=code;}
}
export function productUrl(value: unknown,base?: string): URL {
  if(typeof value!=='string' || !value || value.length>2048 || /[\s\x00-\x1f\x7f\\]/.test(value))throw new ProductImportError('INVALID_URL');
  let url:URL;try{url=new URL(value,base);}catch{throw new ProductImportError('INVALID_URL');}
  const host=url.hostname;
  if(url.protocol!=='https:' || (url.port && url.port!=='443') || url.username || url.password ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z][a-z0-9-]{1,62}$/.test(host) || host.length>253 ||
    host.split('.').some((label)=>!label || label.length>63 || label.startsWith('-') || label.endsWith('-')) ||
    /(^|\.)(localhost|local|internal|invalid|test|onion)$/.test(host))throw new ProductImportError('INVALID_URL');
  // WHATWG canonicalization turns numeric/octal/hex IPv4 into dotted decimal before this check.
  if(/^\d+\.\d+\.\d+\.\d+$/.test(host))throw new ProductImportError('INVALID_URL');
  url.hash='';if(url.href.length>2048)throw new ProductImportError('INVALID_URL');return url;
}
