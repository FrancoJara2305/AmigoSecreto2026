import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
if (process.argv.length !== 2) throw new Error('Prueba local sin argumentos.');
const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
const id = randomUUID(); const giftId = randomUUID(); const hash = randomBytes(32).toString('hex');
function connection() {
  const child = spawn('docker', ['--host', endpoint, 'exec', '-i', 'supabase_db_AmigoSecreto2026',
    'psql', '-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { stdio: ['pipe','pipe','pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.resume();
  const finished = new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', (code) => resolve({ code, output }));
  });
  return { child, finished };
}
async function sql(statement) {
  const session = connection(); session.child.stdin.end(statement);
  const result = await session.finished;
  if (result.code !== 0) throw new Error('Falló una consulta local de concurrencia.');
  return result.output.trim();
}
async function race(first, second, expectedSecond) {
  const marker = `writer-${randomUUID()}`;
  const a = connection(); let b;
  try {
    const ready = new Promise((resolve, reject) => {
      let seen = '';
      const timeout = setTimeout(() => reject(new Error('No se adquirió la transacción de edición.')), 10000);
      a.child.stdout.on('data', (chunk) => {
        seen += chunk.toString();
        if (seen.includes('WRITE_HELD')) { clearTimeout(timeout); resolve(); }
      });
      a.finished.then(() => { clearTimeout(timeout); reject(new Error('La transacción terminó antes de tiempo.')); }, reject);
    });
    a.child.stdin.write(`begin; set local role service_role; ${first}; select 'WRITE_HELD';\n`);
    await ready;
    b = connection(); b.child.stdin.end(`set application_name='${marker}'; ${second};`);
    let waiting = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await sql(`select count(*) from pg_stat_activity where application_name='${marker}' and wait_event_type='Lock';`) === '1') {
        waiting = true; break;
      }
      await new Promise((resolve) => setTimeout(resolve,50));
    }
    assert.ok(waiting, 'La operación concurrente debe esperar, no sobrescribir sin control.');
    a.child.stdin.end('commit;\n');
    const firstResult = await a.finished; const secondResult = await b.finished;
    assert.equal(firstResult.code,0); assert.ok(firstResult.output.includes('200\nWRITE_HELD'));
    assert.equal(secondResult.code,0); assert.equal(secondResult.output.trim(),expectedSecond);
  } finally {
    for (const session of [a,b]) if (session && session.child.exitCode === null) {
      session.child.stdin.end(); await session.finished.catch(() => {});
    }
  }
}
const mutate = (action,version,position,gift,payload) => `select coalesce(r->>'status','200') from
 public.server_mutate('${action}','${hash}','${id}',${version},${position}::smallint,${gift},'${payload}') r`;
try {
  await sql(`begin; insert into public.participants(id,name,slug) values('${id}','T08 concurrencia','mutation-${id}');
    insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${id}',decode('${hash}','hex'));
    insert into public.gifts(id,participant_id,position,title,gift_type) values('${giftId}','${id}',1,'Inicial','object'); commit;`);
  await race(mutate('update_gift',1,1,`'${giftId}'`,'{"title":"Primero"}'),
    `set role service_role; ${mutate('update_gift',1,1,`'${giftId}'`,'{"title":"Segundo"}')}`, '409');
  assert.equal(await sql(`select title||':'||version from public.gifts where id='${giftId}';`),'Primero:2');
  await race(mutate('create_gift','null',2,'null','{"title":"Creación A","gift_type":"object"}'),
    `set role service_role; ${mutate('create_gift','null',2,'null','{"title":"Creación B","gift_type":"object"}')}`, '409');
  assert.equal(await sql(`select count(*) from public.gifts where participant_id='${id}' and position=2;`),'1');
  await race(mutate('update_gift',2,1,`'${giftId}'`,'{"title":"Antes de revocar"}'),
    `update private.access_tokens set revoked_at=clock_timestamp() where token_hash=decode('${hash}','hex'); select 'REVOKED'`, 'REVOKED');
  assert.equal(await sql(`set role service_role; ${mutate('update_gift',3,1,`'${giftId}'`,'{"title":"Después de revocar"}')}`),'401');
  assert.equal(await sql(`select title from public.gifts where id='${giftId}';`),'Antes de revocar');
  console.log('OK T08 concurrencia: un ganador por versión/posición, y ninguna escritura nueva tras revocación.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  await sql(`delete from public.participants where id='${id}';
    delete from private.rate_limits where key_hash=decode('${hash}','hex') and operation='mutation';`).catch(() => {
    console.error('No se pudo limpiar la identidad de concurrencia.'); process.exitCode=1;
  });
}
