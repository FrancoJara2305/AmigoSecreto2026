import { spawn,spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { generateToken,hashToken,isToken } from '../supabase/functions/_shared/tokens.ts';
const base='http://127.0.0.1:54321',origin='http://localhost:5173';
// Two independent Node processes exercise the real HTTP endpoint. Secrets travel through stdin,
// never process arguments, files or stdout. The worker has no configurable destination.
if(process.argv.length===3 && process.argv[2]==='--worker') {
  let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>1024)throw new Error('Invalid fixture');}
  const {token,owner}=JSON.parse(input);if(!isToken(token)||!/^[-a-f0-9]{36}$/.test(owner))throw new Error('Invalid fixture');
  const response=await fetch(`${base}/functions/v1/media-upload`,{method:'POST',headers:{Origin:origin,'Content-Type':'image/png','X-Edit-Token':token,'X-Participant-Id':owner,'X-Media-Purpose':'gift'},
    body:await readFile(new URL('../tests/fixtures/images/small.png',import.meta.url)),signal:AbortSignal.timeout(20000)});
  const data=await response.json();process.stdout.write(JSON.stringify({status:response.status,retry:response.headers.get('Retry-After'),path:data.path??null}));
} else {
  if(process.argv.length!==2)throw new Error('Prueba HTTP exclusivamente local, sin argumentos.');
  const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
  const owner=randomUUID(),token=generateToken(),hash=await hashToken(token);
  function sql(statement){const r=spawnSync('docker',['--host',endpoint,'exec','-i','supabase_db_AmigoSecreto2026','psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:statement,encoding:'utf8',timeout:10000});if(r.error||r.status!==0)throw new Error('Consulta HTTP local falló.');return r.stdout.trim();}
  function worker(){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker'],{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='';child.stdout.on('data',(s)=>{output+=s;});child.stderr.resume();child.once('error',reject);child.once('close',(code)=>{if(code!==0)reject(new Error('Proceso HTTP local falló.'));else resolve(JSON.parse(output));});child.stdin.end(JSON.stringify({token,owner}));});}
  try {
    sql(`insert into public.participants(id,name,slug) values('${owner}','Cuotas HTTP','rates-${owner}');insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${owner}',decode('${hash}','hex'));
      insert into private.rate_limits(key_hash,operation,scope,window_seconds,window_start,expires_at,request_count)
      values(decode('${hash}','hex'),'upload','token',3600,date_trunc('hour',clock_timestamp()),date_trunc('hour',clock_timestamp())+interval '1 hour',9);`);
    const results=await Promise.all([worker(),worker()]);assert.deepEqual(results.map((r)=>r.status).sort(),[201,429]);
    const limited=results.find((r)=>r.status===429);assert.ok(Number(limited.retry)>=1 && Number(limited.retry)<=3600);
    assert.equal(sql(`select count(*) from private.media_assets where participant_id='${owner}';`),'1');
    console.log('OK dos procesos HTTP: décima carga permitida una vez; siguiente 429 con Retry-After, sin crear otra reserva.');
    for(const forwarded of ['203.0.113.1','198.51.100.2']) {
      const response=await fetch(`${base}/functions/v1/media-upload`,{method:'POST',headers:{Origin:origin,'Content-Type':'image/png','X-Edit-Token':token,'X-Participant-Id':owner,'X-Media-Purpose':'gift',
        'X-Forwarded-For':forwarded,'X-Real-IP':forwarded,'CF-Connecting-IP':forwarded},body:await readFile(new URL('../tests/fixtures/images/small.png',import.meta.url))});
      assert.equal(response.status,429);assert.ok(response.headers.get('Access-Control-Expose-Headers').includes('Retry-After'));assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('X-Request-Id'),/^[a-f0-9-]{36}$/);await response.body?.cancel();
    }
    assert.equal(sql(`select count(*) from private.media_assets where participant_id='${owner}';`),'1');
    const preflight=await fetch(`${base}/functions/v1/media-upload`,{method:'OPTIONS',headers:{Origin:origin}});assert.equal(preflight.status,204);
    // The same capability retains its permissions despite an upload-only quota.
    const validation=await fetch(`${base}/functions/v1/wishlist-api`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Edit-Token':token},body:JSON.stringify({action:'validate_access',participant_id:owner})});assert.equal(validation.status,200);await validation.body?.cancel();
    console.log('OK cabeceras IP falsificadas no evitan cuota; preflight libre, CORS/no-store y acceso privado conservado.');
  } finally {
    const paths=JSON.parse(sql(`select coalesce(json_agg(storage_path),'[]') from private.media_assets where participant_id='${owner}';`));
    if(paths.length){const r=spawnSync('docker',['--host',endpoint,'inspect','supabase_storage_AmigoSecreto2026','--format','{{json .Config.Env}}'],{encoding:'utf8',timeout:10000});const key=JSON.parse(r.stdout).find((s)=>s.startsWith('SERVICE_KEY='))?.slice(12);if(!key)throw new Error('Clave local de limpieza no disponible.');
      const response=await fetch(`${base}/storage/v1/object/wishlist-media`,{method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:paths})});if(!response.ok)throw new Error('Retirada de objetos de prueba falló.');await response.body?.cancel();}
    sql(`delete from public.participants where id='${owner}';delete from private.rate_limits where key_hash=decode('${hash}','hex');`);
  }
}
