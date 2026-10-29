import { spawn } from 'node:child_process';
import { randomBytes,randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
if(process.argv.length!==2) throw new Error('Prueba de cuotas solo local, sin argumentos.');
const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
const key=randomBytes(32).toString('hex');
function connection() {
  const child=spawn('docker',['--host',endpoint,'exec','-i','supabase_db_AmigoSecreto2026','psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
  let output=''; child.stdout.on('data',(chunk)=>{output+=chunk;}); child.stderr.resume();
  const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code)=>resolve({code,output}));});
  return {child,finished};
}
async function sql(statement) {
  const c=connection(); c.child.stdin.end(statement);const r=await c.finished;if(r.code!==0) throw new Error('Consulta de cuota local falló.');return r.output.trim();
}
async function race(statement,expected) {
  const a=connection(),marker=`quota-${randomUUID()}`;let b;
  try {
    const ready=new Promise((resolve,reject)=>{
      let seen='';const timeout=setTimeout(()=>reject(new Error('No se adquirió el contador.')),10000);
      a.child.stdout.on('data',(chunk)=>{seen+=chunk;if(seen.includes('HELD')){clearTimeout(timeout);resolve();}});
      a.finished.then(()=>{clearTimeout(timeout);reject(new Error('Transacción terminó prematuramente.'));},reject);
    });
    a.child.stdin.write(`begin;set local role service_role;${statement};select 'HELD';\n`);await ready;
    b=connection();b.child.stdin.end(`set application_name='${marker}';set role service_role;${statement};`);
    let waited=false;
    for(let i=0;i<50;i++){if(await sql(`select count(*) from pg_stat_activity where application_name='${marker}' and wait_event_type='Lock';`)==='1'){waited=true;break;}await new Promise((r)=>setTimeout(r,50));}
    assert.ok(waited,'La segunda instancia debe esperar el contador compartido.');a.child.stdin.end('commit;\n');
    const ar=await a.finished,br=await b.finished;assert.equal(ar.code,0);assert.match(ar.output,/true\nHELD/);assert.equal(br.code,0);assert.equal(br.output.trim(),expected);
  } finally {for(const c of [a,b]) if(c && c.child.exitCode===null){c.child.stdin.end();await c.finished.catch(()=>{});}}
}
try {
  for(const [seconds,limit] of [[60,60],[3600,10]]) {
    await sql(`insert into private.rate_limits(key_hash,operation,scope,window_seconds,window_start,expires_at,request_count)
      values(decode('${key}','hex'),'upload','token',${seconds},to_timestamp(floor(extract(epoch from clock_timestamp())/${seconds})*${seconds}),
      to_timestamp(floor(extract(epoch from clock_timestamp())/${seconds})*${seconds})+make_interval(secs=>${seconds}),${limit-1});`);
    const call=`select r->>'ok' from private.consume_quota('upload','token',decode('${key}','hex'),${seconds},${limit}) r`;
    await race(call,'false');
    assert.equal(await sql(`select request_count from private.rate_limits where key_hash=decode('${key}','hex') and window_seconds=${seconds};`),String(limit+1));
    console.log(`OK dos instancias: ventana ${seconds}s, una última admisión y una denegación, sin actualizaciones perdidas.`);
  }
  // A cleanup process skips a bucket currently being used by a different connection.
  await sql(`update private.rate_limits set window_start=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where key_hash=decode('${key}','hex');`);
  const held=connection();
  try {
    const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('No se bloqueó la fila de limpieza.')),10000);held.child.stdout.on('data',(c)=>{if(String(c).includes('LOCKED')){clearTimeout(timer);resolve();}});});
    held.child.stdin.write(`begin;select key_hash from private.rate_limits where key_hash=decode('${key}','hex') for update;select 'LOCKED';\n`);await ready;
    const started=Date.now();await sql('set role service_role;select public.server_rate_limits_cleanup(1000,false);');
    assert.ok(Date.now()-started<5000);assert.equal(await sql(`select count(*) from private.rate_limits where key_hash=decode('${key}','hex');`),'2');
    held.child.stdin.end('rollback;\n');await held.finished;
    console.log('OK limpieza: SKIP LOCKED no espera ni borra ventanas bloqueadas por otra instancia.');
  } finally {if(held.child.exitCode===null){held.child.stdin.end();await held.finished.catch(()=>{});}}
} finally {await sql(`delete from private.rate_limits where key_hash=decode('${key}','hex');`);}
