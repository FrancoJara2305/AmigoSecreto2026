// Conditional Node/Vercel transport. Never receives a participant token or a database key.
import { createFetchProxy,callbackClaim } from '../server/product-fetch/proxy.ts';
export const maxDuration=15;
async function handler(request:Request):Promise<Response> {
  try{
    const proxy=createFetchProxy({secret:process.env.FETCH_PROXY_HMAC_SECRET,
      claim:callbackClaim(process.env.FETCH_PROXY_CALLBACK_URL??'')});
    return await proxy(request);
  }catch{return Response.json({error:'Transport unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export default {fetch:handler};
