import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// In-memory PostgreSQL only: no env files, connection string, sockets or remote mode.
const db = new PGlite();
let phase = 'platform fixture';
try {
  const version = await db.query('select current_setting(\'server_version\') as version');
  console.log(`PostgreSQL embebido: ${version.rows[0].version}`);
  await db.exec(await readFile(new URL('../tests/fixtures/supabase-platform.sql', import.meta.url), 'utf8'));
  const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort()) {
    phase = name;
    await db.exec(await readFile(new URL(name, migrationDirectory), 'utf8'));
    console.log(`Migración aplicada en memoria: ${name}`);
  }
  phase = '001_contract.sql';
  const empty = await db.query(`select
    (select count(*) from public.participants)::int as participants,
    (select count(*) from public.gifts)::int as gifts,
    (select count(*) from private.access_tokens)::int as tokens`);
  if (Object.values(empty.rows[0]).some((count) => count !== 0)) {
    throw new Error('Las migraciones no deben crear participantes, regalos ni credenciales.');
  }
  const testDirectory = new URL('../supabase/tests/database/', import.meta.url);
  const results = [];
  for (const file of (await readdir(testDirectory)).filter((name) => name.endsWith('.sql')).sort()) {
    phase = file;
    results.push(...await db.exec(await readFile(new URL(file, testDirectory), 'utf8')));
  }
  let assertions = 0;
  for (const result of results) for (const row of result.rows) {
    const output = Object.values(row)[0];
    if (typeof output === 'string' && output.startsWith('ok - ')) {
      assertions++;
      console.log(output);
    }
  }
  console.log(`${assertions} comprobaciones SQL correctas. Sin conexión remota.`);
  console.log('Las pruebas de Docker/Edge y concurrencia se ejecutan por separado; ver docs/private-access.md.');
} catch (error) {
  // Do not dump the entire SQL error object (may contain complete queries).
  console.error('Falló la validación SQL local:', error.message);
  console.error('Archivo:', phase, 'posición:', error.position ?? error.internalPosition ?? 'n/d');
  if (error.where) console.error(error.where);
  if (error.detail) console.error(error.detail);
  process.exitCode = 1;
} finally {
  await db.close();
}
