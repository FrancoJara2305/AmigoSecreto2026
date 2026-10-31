import { isIP } from 'node:net';

// Match SPA documents, never APIs, hashed assets or file-like paths.
export const spaSource='/((?!api(?:/|$)|assets(?:/|$)|.*\\.[^/]+$).*)';
export function deploymentOrigin(value:string):string {
  let url:URL;
  try{url=new URL(value);}catch{throw new Error('Usa un origen HTTPS válido para el destino.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.port||
    /[\s;'"*]/.test(value)||isIP(url.hostname.replace(/^\[|\]$/g,''))||url.hostname==='localhost'||url.hostname.endsWith('.localhost'))
    throw new Error('El destino debe ser un origen HTTPS sin credenciales, rutas, comodines o loopback.');
  return url.origin;
}
// Review templates only: no environment reads, credentials or provider calls.
export function deploymentEnvironmentTemplates(supabaseUrl:string,appUrl:string){
  const supabase=deploymentOrigin(supabaseUrl),app=deploymentOrigin(appUrl);
  if(supabase===app)throw new Error('Frontend y Supabase deben ser destinos distintos.');
  return {
    'frontend.env.example':[
      `VITE_SUPABASE_URL=${supabase}`,
      'VITE_SUPABASE_PUBLISHABLE_KEY=REPLACE_PUBLIC_KEY_FROM_THIS_ENVIRONMENT',
      `VITE_APP_URL=${app}`,
    ].join('\n')+'\n',
    'edge.env.example':[
      `APP_ALLOWED_ORIGINS=${app}`,`APP_BASE_URL=${app}`,
      'RATE_LIMIT_IP_SOURCE=off','RATE_LIMIT_HMAC_SECRET=REPLACE_UNUSED_WHILE_IP_SOURCE_OFF',
      `FETCH_PROXY_URL=${app}/api/fetch-product`,
      'FETCH_PROXY_HMAC_SECRET=REPLACE_UNIQUE_32_BYTE_BASE64URL_SHARED_WITH_PROXY',
      'APP_LOCAL_FETCH_PROXY=0',
    ].join('\n')+'\n',
    'fetch-proxy.env.example':[
      'FETCH_PROXY_HMAC_SECRET=REPLACE_UNIQUE_32_BYTE_BASE64URL_SHARED_WITH_PROXY',
      `FETCH_PROXY_CALLBACK_URL=${supabase}/functions/v1/product-metadata`,
    ].join('\n')+'\n',
  };
}
export function hostingConfig(supabaseUrl:string){
  const origin=deploymentOrigin(supabaseUrl);
  const csp=["default-src 'none'","script-src 'self'","style-src 'self'","style-src-attr 'unsafe-inline'",
    "img-src 'self' https: blob: data:",`connect-src 'self' ${origin}`,"font-src 'self'","base-uri 'none'",
    "object-src 'none'","frame-ancestors 'none'","form-action 'none'","worker-src 'none'"].join('; ');
  return {
    $schema:'https://openapi.vercel.sh/vercel.json',framework:'vite',installCommand:'npm ci --include=dev --ignore-scripts',
    buildCommand:'npm run build',outputDirectory:'dist',
    functions:{'api/fetch-product.ts':{maxDuration:15}},
    headers:[
      {source:'/(.*)',headers:[
        {key:'Content-Security-Policy',value:csp},{key:'Referrer-Policy',value:'no-referrer'},
        {key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},
        {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
        {key:'X-Robots-Tag',value:'noindex, nofollow'},
      ]},
      {source:spaSource,headers:[{key:'Cache-Control',value:'no-store'}]},
      {source:'/index.html',headers:[{key:'Cache-Control',value:'no-store'}]},
      {source:'/assets/(.*)',headers:[{key:'Cache-Control',value:'public, max-age=31536000, immutable'}]},
    ],
    rewrites:[{source:spaSource,destination:'/index.html'}],
  };
}
