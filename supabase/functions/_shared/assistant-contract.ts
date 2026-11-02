// Shared, pure contract of the gift assistant (browser and Edge). No env, I/O or secrets.
// One question, one answer: no history, threads or search results.
export const ASSISTANT_LIMITS={message:500,answer:3000,body:4096,response:16384} as const;
export const assistantErrorCodes=['INVALID_REQUEST','NOT_FOUND','RATE_LIMITED','UNAVAILABLE','PROVIDER_UNAVAILABLE','SERVER_ERROR'] as const;
export type AssistantErrorCode=typeof assistantErrorCodes[number];

// gift_id null means the person's general preferences.
export interface AssistantRequest { v:1; participant_id:string; gift_id:string|null; message:string }
export interface AssistantReply { answer:string }

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Line breaks and tabs are allowed; other control characters are rejected rather than repaired.
const controls=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/;
export const isAssistantId=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value);

export function validateAssistantRequest(value:unknown):{ok:true;request:AssistantRequest}|{ok:false} {
  if(!value||typeof value!=='object'||Array.isArray(value))return {ok:false};
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='gift_id,message,participant_id,v'||v.v!==1)return {ok:false};
  if(!isAssistantId(v.participant_id)||(v.gift_id!==null&&!isAssistantId(v.gift_id)))return {ok:false};
  if(typeof v.message!=='string'||v.message.length>ASSISTANT_LIMITS.message||controls.test(v.message))return {ok:false};
  const message=v.message.trim();
  if(!message)return {ok:false};
  return {ok:true,request:{v:1,participant_id:v.participant_id,gift_id:v.gift_id as string|null,message}};
}
// Strict response reader shared by the browser client and handler tests.
export function validateAssistantReply(value:unknown):AssistantReply|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(Object.keys(v).join(',')!=='answer'||typeof v.answer!=='string'||!v.answer.trim()||v.answer.length>ASSISTANT_LIMITS.answer)return null;
  return {answer:v.answer};
}
