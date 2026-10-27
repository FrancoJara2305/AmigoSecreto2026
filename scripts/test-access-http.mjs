import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { generateToken, hashToken } from '../supabase/functions/_shared/tokens.ts';

if (process.argv.length !== 2) throw new Error('Prueba HTTP local sin argumentos.');
const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
const id = randomUUID();
const token = generateToken();
const hash = await hashToken(token);
function sql(statement) {
  const result = spawnSync('docker', ['--host', endpoint, 'exec', '-i', 'supabase_db_AmigoSecreto2026',
    'psql', '-X', '-A', '-t', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: statement, encoding: 'utf8', timeout: 10000 });
  if (result.error || result.status !== 0) throw new Error('No se pudo ejecutar una consulta de prueba local.');
}
async function call(action, participantId, options = {}) {
  return fetch('http://127.0.0.1:54321/functions/v1/wishlist-api', {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      'X-Edit-Token': options.token ?? token, Origin: options.origin ?? 'http://localhost:5173' },
    body: JSON.stringify({ action, ...(participantId ? { participant_id: participantId } : {}) }),
    signal: AbortSignal.timeout(15000),
  });
}
try {
  sql(`begin;
    insert into public.participants(id,name,slug) values('${id}','Test HTTP','http-${id}');
    insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${id}',decode('${hash}','hex'));
    commit;`);
  const valid = await call('validate_access');
  assert.equal(valid.status, 200, 'La validación debe pasar en el runtime Edge local.');
  assert.equal(valid.headers.get('cache-control'), 'no-store');
  const data = await valid.json();
  assert.equal(data.access.participant_id, id);
  assert.ok(!JSON.stringify(data).includes(token) && !JSON.stringify(data).includes(hash));
  assert.equal((await call('validate_access', randomUUID())).status, 403);
  assert.equal((await call('issue_participant_link', id)).status, 403);
  assert.equal((await call('validate_access', null, { token: '' })).status, 401);
  assert.equal((await call('bootstrap')).status, 422);
  assert.equal((await call('validate_access', null, { origin: 'https://attacker.example' })).status, 403);
  sql(`update private.access_tokens set revoked_at=clock_timestamp() where token_hash=decode('${hash}','hex');`);
  assert.equal((await call('validate_access')).status, 401);
  console.log('OK Edge/Deno: acceso válido, pertenencia, privilegios, origen y revocación verificados por HTTP local.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try { sql(`delete from public.participants where id='${id}';
    delete from private.rate_limits where key_hash=decode('${hash}','hex') and operation='access';`); }
  catch { console.error('No se pudo limpiar la identidad HTTP temporal.'); process.exitCode = 1; }
}
