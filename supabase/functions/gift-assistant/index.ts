import { createAssistantHandler } from '../_shared/assistant-handler.ts';
import { createGeminiProvider,createSyntheticProvider,type AssistantProvider } from '../_shared/assistant-provider.ts';
import { createServerRpc } from '../_shared/server-rpc.ts';

const allowedOrigins=(Deno.env.get('APP_ALLOWED_ORIGINS')??'').split(',').map((s)=>s.trim()).filter(Boolean);
const rpc=createServerRpc(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
// The synthetic provider never runs on hosted Edge; a missing or invalid Gemini setup leaves the assistant unavailable.
function provider():AssistantProvider|null {
  if(Deno.env.get('GIFT_ASSISTANT_PROVIDER')==='synthetic')return Deno.env.get('DENO_DEPLOYMENT_ID')?null:createSyntheticProvider();
  try{return createGeminiProvider({apiKey:Deno.env.get('GEMINI_API_KEY')??'',model:Deno.env.get('GEMINI_MODEL')??''});}catch{return null;}
}
Deno.serve(createAssistantHandler({allowedOrigins,enabled:Deno.env.get('GIFT_ASSISTANT_ENABLED')==='1',provider:provider(),
  callRpc:(args)=>rpc('server_assistant',args),log:(entry)=>console.log(JSON.stringify(entry))}));
