import { createFetchProxy,callbackClaim } from '../server/product-fetch/proxy.ts';
import { webServer } from '../tests/support/web-server.mjs';
import { isToken } from '../supabase/functions/_shared/tokens.ts';
// Explicit local server only. Load server/product-fetch/.env.local with Node's --env-file.
// No database key, participant token, arbitrary port or callback host is accepted.
const callback=process.env.FETCH_PROXY_CALLBACK_URL??'';
if(callback!=='http://127.0.0.1:54321/functions/v1/product-metadata')throw new Error('El callback local debe apuntar a Supabase local en 127.0.0.1:54321.');
if(!isToken(process.env.FETCH_PROXY_HMAC_SECRET))throw new Error('Configura un secreto HMAC local aleatorio de 32 bytes en base64url.');
const handler=createFetchProxy({secret:process.env.FETCH_PROXY_HMAC_SECRET,claim:callbackClaim(callback,fetch,true)});
const server=webServer(handler);
server.listen(54801,'0.0.0.0',()=>console.log('Transporte local firmado listo en puerto 54801 para Docker Desktop. Sin claves de base de datos.'));
const close=()=>{server.closeAllConnections();server.close();};process.once('SIGINT',close);process.once('SIGTERM',close);
