import { spawn } from 'node:child_process';
import { randomUUID,randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
if(process.argv.length!==2)throw new Error('Prueba anti-replay solo local, sin argumentos.');
const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
const owner=randomUUID(),hash=randomBytes(32).toString('hex'),url=randomBytes(32).toString('hex'),nonce=randomBytes(32).toString('hex');
function connection(){const child=spawn('docker',['--host',endpoint,'exec','-i','supabase_db_AmigoSecreto2026','psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',(c)=>{output+=c;});child.stderr.resume();const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code)=>resolve({code,output}));});return {child,finished};}
async function sql(statement){const c=connection();c.child.stdin.end(statement);const result=await c.finished;if(result.code!==0)throw new Error('Consulta de concurrencia de importación falló.');return result.output.trim();}
async function held(statement){const c=connection();const ready=new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('No se adquirió el bloqueo.')),10000);c.child.stdout.on('data',(s)=>{out+=s;if(out.includes('HELD')){clearTimeout(timer);resolve();}});c.finished.then(()=>{clearTimeout(timer);reject(new Error('Transacción terminó prematuramente.'));},reject);});c.child.stdin.write(`begin;${statement};select 'HELD';\n`);await ready;return c;}
async function waitForLock(marker){for(let i=0;i<60;i++){if(await sql(`select count(*) from pg_stat_activity where application_name='${marker}' and wait_event_type='Lock';`)==='1')return;await new Promise((r)=>setTimeout(r,50));}throw new Error('La segunda conexión no esperó el nonce.');}
const claim=`select r->>'ok' from public.server_claim_import('${nonce}','${url}') r`;
let a,b;
try{
  await sql(`insert into public.participants(id,name,slug) values('${owner}','Nonce concurrente','import-race-${owner}');insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${owner}',decode('${hash}','hex'));
    select public.server_prepare_import('${hash}','${owner}','${url}','${nonce}',clock_timestamp()+interval '25 seconds');`);
  a=await held(`set local role service_role;${claim}`);const marker=`nonce-${randomUUID()}`;
  b=connection();b.child.stdin.end(`set application_name='${marker}';set role service_role;${claim};`);await waitForLock(marker);
  a.child.stdin.end('commit;\n');assert.match((await a.finished).output,/true\nHELD/);assert.equal((await b.finished).output.trim(),'false');
  console.log('OK dos conexiones: solo una reclama el nonce; la segunda espera y rechaza el replay.');
  // Simulate expiry while a queued claim waits, without modifying any persistent user record.
  await sql(`update private.import_requests set claimed_at=null,expires_at=clock_timestamp()+interval '1 second' where nonce_hash=decode('${nonce}','hex');`);
  a=await held(`select nonce_hash from private.import_requests where nonce_hash=decode('${nonce}','hex') for update`);
  const expiryMarker=`expiry-${randomUUID()}`;b=connection();b.child.stdin.end(`set application_name='${expiryMarker}';set role service_role;${claim};`);await waitForLock(expiryMarker);
  await new Promise((r)=>setTimeout(r,1100));a.child.stdin.end('commit;\n');await a.finished;assert.equal((await b.finished).output.trim(),'false');
  console.log('OK expiración tras espera: un nonce vencido no autoriza la conexión externa.');
}finally{
  for(const c of [a,b])if(c&&c.child.exitCode===null){c.child.stdin.end();await c.finished.catch(()=>{});}
  await sql(`delete from public.participants where id='${owner}';delete from private.rate_limits where key_hash=decode('${hash}','hex');`);
}
