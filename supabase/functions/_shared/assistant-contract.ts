// Shared, pure contract of the gift assistant chat (browser and Edge). No env, I/O or secrets.
// The browser keeps the conversation in memory and sends the last turns with each question; it
// never sends gift data, which the server reads from the database.
export const ASSISTANT_LIMITS={message:500,answer:3000,turns:3,historyAnswer:1500,body:16384,response:16384} as const;
export const assistantErrorCodes=['INVALID_REQUEST','NOT_FOUND','RATE_LIMITED','UNAVAILABLE','PROVIDER_UNAVAILABLE','SERVER_ERROR'] as const;
export type AssistantErrorCode=typeof assistantErrorCodes[number];

// One earlier exchange: the person's question and the assistant's answer.
export interface AssistantTurn { q:string; a:string }
export interface AssistantRequest { v:1; participant_id:string; message:string; history:AssistantTurn[] }
export interface AssistantReply { answer:string }

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Line breaks and tabs are allowed; other control characters are rejected rather than repaired.
const controls=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/;
export const isAssistantId=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value);
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&!!value.trim()&&value.length<=max&&!controls.test(value);

export function validateAssistantRequest(value:unknown):{ok:true;request:AssistantRequest}|{ok:false} {
  if(!value||typeof value!=='object'||Array.isArray(value))return {ok:false};
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='history,message,participant_id,v'||v.v!==1||!isAssistantId(v.participant_id))return {ok:false};
  if(!text(v.message,ASSISTANT_LIMITS.message)||!Array.isArray(v.history)||v.history.length>ASSISTANT_LIMITS.turns)return {ok:false};
  const history:AssistantTurn[]=[];
  for(const item of v.history){
    const t=item as Record<string,unknown>|null;
    if(!t||typeof t!=='object'||Object.keys(t).sort().join(',')!=='a,q'||!text(t.q,ASSISTANT_LIMITS.message)||!text(t.a,ASSISTANT_LIMITS.historyAnswer))return {ok:false};
    history.push({q:t.q.trim(),a:t.a.trim()});
  }
  return {ok:true,request:{v:1,participant_id:v.participant_id,message:v.message.trim(),history}};
}
// Strict response reader shared by the browser client and handler tests.
export function validateAssistantReply(value:unknown):AssistantReply|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(Object.keys(v).join(',')!=='answer'||typeof v.answer!=='string'||!v.answer.trim()||v.answer.length>ASSISTANT_LIMITS.answer)return null;
  return {answer:v.answer};
}
