import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { generateToken, hashToken } from '../supabase/functions/_shared/tokens.ts';

if (process.argv.length !== 2) throw new Error('Prueba HTTP local sin argumentos.');
const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
const id = randomUUID();
const other = randomUUID();
const token = generateToken();
const hash = await hashToken(token);
function sql(statement) {
  const result = spawnSync('docker', ['--host', endpoint, 'exec', '-i', 'supabase_db_AmigoSecreto2026',
    'psql', '-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: statement, encoding: 'utf8', timeout: 10000 });
  if (result.error || result.status !== 0) throw new Error('Falló una consulta de prueba local.');
  return result.stdout.trim();
}
async function call(body, credential = token) {
  const response = await fetch('http://127.0.0.1:54321/functions/v1/wishlist-api', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Edit-Token': credential, Origin: 'http://localhost:5173' },
    body: JSON.stringify({ participant_id: id, ...body }), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  assert.ok(!JSON.stringify(data).includes(token) && !JSON.stringify(data).includes(hash));
  return { status: response.status, data };
}
try {
  sql(`begin;
    insert into public.participants(id,name,slug) values('${id}','Test edición HTTP','edit-${id}'),('${other}','Otra persona HTTP','other-${other}');
    insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${id}',decode('${hash}','hex'));
    commit;`);
  assert.equal((await call({ action: 'update_profile', expected_version: 1, profile: { personal_message: 'Hola' } }, '')).status, 401);
  const profile = await call({ action: 'update_profile', expected_version: 1, profile: { personal_message: 'Hola', general_preferences: 'Azul' } });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.participant.version, 2);
  assert.equal((await call({ action: 'update_profile', expected_version: 1, profile: { personal_message: 'Viejo' } })).status, 409);
  assert.equal((await call({ action: 'update_profile', participant_id: other, expected_version: 1, profile: { personal_message: 'Hack' } })).status, 403);
  const invalid = await call({ action: 'create_gift', position: 1, gift: { title: '', gift_type: 'object' } });
  assert.equal(invalid.status, 422);
  assert.ok(invalid.data.error.fields.title);
  const created = await call({ action: 'create_gift', position: 1, gift: { title: 'Mi libro', gift_type: 'object', reference_price: '39,90' } });
  assert.equal(created.status, 201);
  const gift = created.data.gift;
  assert.equal(gift.version, 1);
  assert.equal(Number(gift.reference_price), 39.90);
  assert.equal(gift.currency, 'PEN');
  assert.equal(sql(`select title from public.gifts where id='${gift.id}';`), 'Mi libro');
  assert.equal((await call({ action: 'create_gift', position: 1, gift: { title: 'Otro', gift_type: 'object' } })).status, 409);
  const updated = await call({ action: 'update_gift', position: 1, gift_id: gift.id, expected_version: 1,
    gift: { title: 'Mi libro editado', product_url: 'https://example.com/book' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.gift.version, 2);
  assert.equal((await call({ action: 'delete_gift', position: 1, gift_id: gift.id, expected_version: 1 })).status, 409);
  assert.equal((await call({ action: 'delete_gift', position: 1, gift_id: gift.id, expected_version: 2 })).status, 200);
  assert.equal(sql(`select count(*) from public.gifts where participant_id='${id}';`), '0');
  const recreated = await call({ action: 'create_gift', position: 1, gift: { title: 'Nuevo regalo', gift_type: 'object' } });
  assert.equal(recreated.status, 201);
  assert.notEqual(recreated.data.gift.id, gift.id);
  assert.equal((await call({ action: 'delete_gift', position: 1, gift_id: gift.id, expected_version: 1 })).status, 409);
  sql(`update private.access_tokens set revoked_at=clock_timestamp() where token_hash=decode('${hash}','hex');`);
  assert.equal((await call({ action: 'update_profile', expected_version: 2, profile: { personal_message: 'Revocado' } })).status, 401);
  assert.equal(sql(`select personal_message from public.participants where id='${id}';`), 'Hola');
  console.log('OK T08 HTTP: perfil, CRUD independiente, persistencia, 409, permisos y revocación en Edge/Deno local.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  try { sql(`delete from public.participants where id in ('${id}','${other}');
    delete from private.rate_limits where key_hash=decode('${hash}','hex') and operation='mutation';`); }
  catch { console.error('No se pudo limpiar la prueba HTTP.'); process.exitCode = 1; }
}
