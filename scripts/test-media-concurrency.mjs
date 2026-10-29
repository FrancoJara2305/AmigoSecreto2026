import { spawn } from 'node:child_process';
import { randomUUID,randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
if (process.argv.length!==2) throw new Error('Prueba solo local, sin argumentos.');
const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
const owner=randomUUID(),gift=randomUUID(),hash=randomBytes(32).toString('hex');
const path=`${owner}/gift/${randomUUID()}.webp`;
function connection() {
  const child=spawn('docker',['--host',endpoint,'exec','-i','supabase_db_AmigoSecreto2026','psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
  let output=''; child.stdout.on('data',(chunk)=>{output+=chunk.toString();}); child.stderr.resume();
  const finished=new Promise((resolve,reject)=>{child.once('error',reject); child.once('close',(code)=>resolve({code,output}));});
  return {child,finished};
}
async function sql(statement) {
  const s=connection(); s.child.stdin.end(statement); const result=await s.finished;
  if (result.code!==0) throw new Error('Falló consulta de concurrencia local.'); return result.output.trim();
}
async function race(first,second,expected) {
  const marker=`media-${randomUUID()}`; const a=connection(); let b;
  try {
    const ready=new Promise((resolve,reject)=>{
      let seen=''; const timeout=setTimeout(()=>reject(new Error('No se adquirió el bloqueo.')),10000);
      a.child.stdout.on('data',(chunk)=>{seen+=chunk.toString(); if(seen.includes('HELD')) {clearTimeout(timeout); resolve();}});
      a.finished.then(()=>{clearTimeout(timeout); reject(new Error('Transacción terminada prematuramente.'));},reject);
    });
    a.child.stdin.write(`begin; set local role service_role; ${first}; select 'HELD';\n`); await ready;
    b=connection(); b.child.stdin.end(`set application_name='${marker}'; set role service_role; ${second};`);
    let waited=false;
    for (let i=0;i<50;i++) {if(await sql(`select count(*) from pg_stat_activity where application_name='${marker}' and wait_event_type='Lock';`)==='1') {waited=true;break;} await new Promise((r)=>setTimeout(r,50));}
    assert.ok(waited,'La segunda operación debe esperar el bloqueo.'); a.child.stdin.end('commit;\n');
    const ar=await a.finished,br=await b.finished; assert.equal(ar.code,0); assert.equal(br.code,0); assert.equal(br.output.trim(),expected);
  } finally {for (const s of [a,b]) if(s && s.child.exitCode===null) {s.child.stdin.end(); await s.finished.catch(()=>{});}}
}
const attach=`select r->>'ok' from public.server_mutate('update_gift','${hash}','${owner}',1,1::smallint,'${gift}','{"image_path":"${path}"}') r`;
const claim=`select r->>'ok' from public.server_media_cleanup('claim','${path}') r`;
try {
  await sql(`insert into public.participants(id,name,slug) values('${owner}','Media concurrencia','race-${owner}');
    insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${owner}',decode('${hash}','hex'));
    insert into public.gifts(id,participant_id,position,title,gift_type) values('${gift}','${owner}',1,'Imagen concurrente','object');
    insert into private.media_assets(participant_id,storage_path,mime_type,size_bytes,unused_since) values('${owner}','${path}','image/webp',100,clock_timestamp()-interval '25 hours');`);
  await race(attach,claim,'false');
  assert.equal(await sql(`select image_path from public.gifts where id='${gift}';`),path);
  // Detach, then make this isolated fixture eligible again; reset version only by recreating gift.
  await sql(`delete from public.gifts where id='${gift}'; insert into public.gifts(id,participant_id,position,title,gift_type) values('${gift}','${owner}',1,'Imagen concurrente','object');
    update private.media_assets set state='pending',unused_since=clock_timestamp()-interval '25 hours' where storage_path='${path}';`);
  await race(claim,attach,'false');
  assert.equal(await sql(`select image_path is null from public.gifts where id='${gift}';`),'t');
  console.log('OK: asociación gana => limpieza protegida; limpieza gana => asociación denegada. Dos conexiones y bloqueos reales.');
} finally {
  await sql(`delete from public.participants where id='${owner}'; delete from private.media_deletions where storage_path='${path}'; delete from private.rate_limits where key_hash=decode('${hash}','hex');`);
}
