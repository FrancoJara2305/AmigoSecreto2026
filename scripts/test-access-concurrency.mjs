import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

if (process.argv.length !== 2) throw new Error('Prueba local sin argumentos.');
const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
const participant = randomUUID();
const hash = randomBytes(32).toString('hex');
const name = `access-revoker-${randomUUID()}`;
function connection() {
  const child = spawn('docker', ['--host', endpoint, 'exec', '-i', 'supabase_db_AmigoSecreto2026',
    'psql', '-X', '-A', '-t', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const finished = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
  return { child, finished };
}
async function sql(statement) {
  const session = connection();
  session.child.stdin.end(statement);
  const result = await session.finished;
  if (result.code !== 0) throw new Error('Falló una consulta de prueba local; no se imprimen datos internos.');
  return result.stdout.trim();
}
let reader, revoker;
try {
  await sql(`begin;
    insert into public.participants(id,name,slug) values('${participant}','Test concurrencia','test-${participant}');
    insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${participant}',decode('${hash}','hex'));
    commit;`);
  reader = connection();
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No se adquirió el bloqueo local.')), 10000);
    reader.child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('ACCESS_LOCKED')) { clearTimeout(timeout); resolve(); }
    });
    reader.finished.then(() => { clearTimeout(timeout); reject(new Error('La sesión terminó antes de liberar el bloqueo.')); }, reject);
  });
  reader.child.stdin.write(`begin; set local role service_role;
    select private.require_access('${hash}','${participant}'); select 'ACCESS_LOCKED';\n`);
  await ready;
  revoker = connection();
  revoker.child.stdin.end(`set application_name='${name}';
    update private.access_tokens set revoked_at=clock_timestamp() where token_hash=decode('${hash}','hex');`);
  let waiting = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock';`) === '1') {
      waiting = true; break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(waiting, 'La revocación debe esperar al bloqueo de autorización vigente.');
  reader.child.stdin.end('commit;\n');
  assert.equal((await reader.finished).code, 0);
  assert.equal((await revoker.finished).code, 0);
  assert.equal(await sql(`set role service_role; select public.server_access('validate_access','${hash}')->>'status';`), 'SET\n401');
  console.log('OK: la revocación espera a la transacción autorizada; después el enlace devuelve 401.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const session of [reader, revoker]) {
    if (session && session.child.exitCode === null) { session.child.stdin.end(); await session.finished.catch(() => {}); }
  }
  await sql(`delete from public.participants where id='${participant}';
    delete from private.rate_limits where key_hash=decode('${hash}','hex') and operation='access';`).catch(() => {
    console.error('No se pudo limpiar la identidad temporal de prueba.'); process.exitCode = 1;
  });
}
