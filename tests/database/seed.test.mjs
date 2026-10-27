import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const seed = await readFile(new URL('../../supabase/seed.sql', import.meta.url), 'utf8');
const localSeed = "set app.seed_environment = 'local';\n" + seed;
async function createDatabase() {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('../fixtures/supabase-platform.sql', import.meta.url), 'utf8'));
    const directory = new URL('../../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(name, directory), 'utf8'));
    }
    return db;
  } catch (error) { await db.close(); throw error; }
}

test('seed has 11 people, 18 gifts and 0/1/2/3-option cases', async () => {
  const db = await createDatabase();
  try {
    await db.exec(localSeed);
    const { rows } = await db.query(`select count(g.id)::int as gifts, count(*) over()::int as people
      from public.participants p left join public.gifts g on g.participant_id=p.id group by p.id`);
    assert.equal(rows.length, 11);
    assert.deepEqual(rows.map((r) => r.gifts).sort(), [0,0,1,1,1,2,2,2,3,3,3]);
    assert.equal(rows.reduce((n, r) => n + r.gifts, 0), 18);
    assert.equal((await db.query('select count(*)::int as n from private.access_tokens')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from private.media_assets')).rows[0].n, 0);
    const { rows: coverage } = await db.query(`select
      bool_or(gift_type='clothing') as clothing, bool_or(gift_type='object') as objects,
      bool_or(details->>'subtype'='footwear' and details->>'size_system'='EU') as footwear,
      bool_or(reference_price is null) as no_price, bool_or(currency='USD') as foreign_currency,
      bool_or(description is null) as no_description from public.gifts`);
    assert.ok(Object.values(coverage[0]).every(Boolean));
  } finally { await db.close(); }
});

test('rerun is idempotent and preserves manual changes and event settings', async () => {
  const db = await createDatabase();
  try {
    await db.exec(localSeed);
    await db.exec("update public.participants set personal_message='Mi cambio local' where slug='ana';");
    await db.exec("update public.gifts set title='Un libro distinto' where id='22222222-2222-4222-8222-000000000001';");
    const before = (await db.query(`select jsonb_build_object(
      'participants',(select jsonb_agg(p order by id) from public.participants p),
      'gifts',(select jsonb_agg(g order by id) from public.gifts g),
      'event',(select to_jsonb(e) from public.event_settings e)) as snapshot`)).rows[0].snapshot;
    await db.exec(localSeed);
    const after = (await db.query(`select jsonb_build_object(
      'participants',(select jsonb_agg(p order by id) from public.participants p),
      'gifts',(select jsonb_agg(g order by id) from public.gifts g),
      'event',(select to_jsonb(e) from public.event_settings e)) as snapshot`)).rows[0].snapshot;
    assert.deepEqual(after, before);
  } finally { await db.close(); }
});

test('seed without the local runner marker is rejected atomically', async () => {
  const db = await createDatabase();
  try {
    await assert.rejects(db.exec(seed), /Seed disabled/);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from public.participants')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('seed refuses a database with non-demo participants, preserving their data', async () => {
  const db = await createDatabase();
  try {
    await db.exec("insert into public.participants(name,slug) values ('Persona local','persona-local')");
    await assert.rejects(db.exec(localSeed), /non-demo participants/);
    await db.exec('rollback');
    assert.deepEqual((await db.query('select name from public.participants')).rows, [{ name: 'Persona local' }]);
  } finally { await db.close(); }
});

test('seed rejects a conflicting demo identity instead of overwriting it', async () => {
  const db = await createDatabase();
  try {
    await db.exec("insert into public.participants(id,name,slug) values ('11111111-1111-4111-8111-000000000001','Otra identidad','otra-identidad')");
    await assert.rejects(db.exec(localSeed), /demo identity conflicts/);
    await db.exec('rollback');
    assert.equal((await db.query('select slug from public.participants')).rows[0].slug, 'otra-identidad');
  } finally { await db.close(); }
});

test('SQL permission contract also passes after seeding and leaves demo data unchanged', async () => {
  const db = await createDatabase();
  try {
    await db.exec(localSeed);
    const snapshot = async () => (await db.query(`select jsonb_build_object(
      'participants',(select jsonb_agg(p order by id) from public.participants p),
      'gifts',(select jsonb_agg(g order by id) from public.gifts g)) as data`)).rows[0].data;
    const before = await snapshot();
    await db.exec(await readFile(new URL('../../supabase/tests/database/001_contract.sql', import.meta.url), 'utf8'));
    assert.deepEqual(await snapshot(), before);
  } finally { await db.close(); }
});
