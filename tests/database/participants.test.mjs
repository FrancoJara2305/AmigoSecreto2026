import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../../supabase/participants.local.sql', import.meta.url), 'utf8');
const roster = "set app.seed_environment = 'local';\n" + sql;
const names = ['Melyza','Karina','Norma','Magaly','Cesar','Fabrizio','Brandon','Pamela','Franco','Derek Leonardo','Alice'];
async function database() {
  const db = new PGlite();
  await db.exec(await readFile(new URL('../fixtures/supabase-platform.sql', import.meta.url), 'utf8'));
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name, directory), 'utf8'));
  return db;
}
const snapshot = async (db) => (await db.query(`select jsonb_build_object('p',(select jsonb_agg(p order by id) from public.participants p),
  'g',(select jsonb_agg(g order by id) from public.gifts g)) as data`)).rows[0].data;

test('user roster starts with eleven named, public-readable empty lists and no invented preferences or access', async () => {
  const db = await database();
  try {
    await db.exec(roster);
    assert.deepEqual((await db.query('select name from public.participants order by display_order')).rows.map((row) => row.name), names);
    assert.equal((await db.query('select count(*)::int as n from public.gifts')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from private.access_tokens')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.participants where general_preferences is not null or personal_message is not null')).rows[0].n, 0);
    await db.exec('set role anon');
    assert.equal((await db.query('select count(*)::int as n from public.participants')).rows[0].n, 11);
    await assert.rejects(db.exec("update public.participants set name='Otro nombre'"), /permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});
test('repeating the user roster preserves edited names, slugs, order and later wishes', async () => {
  const db = await database();
  try {
    await db.exec(roster);
    await db.exec("update public.participants set name='Melyza editada',slug='melyza-editada',display_order=20 where slug='melyza';");
    await db.exec("insert into public.gifts(participant_id,position,title,gift_type) select id,1,'Mi deseo real','object' from public.participants where slug='melyza-editada'");
    const before = await snapshot(db);
    await db.exec(roster);
    assert.deepEqual(await snapshot(db), before);
  } finally { await db.close(); }
});
test('pristine fictitious demo converts atomically to user names, empty gifts and no fictitious personal text', async () => {
  const db = await database();
  try {
    await db.exec("set app.seed_environment = 'local';\n" + await readFile(new URL('../../supabase/seed.sql', import.meta.url), 'utf8'));
    await db.exec(roster);
    assert.deepEqual((await db.query('select name from public.participants order by display_order')).rows.map((row) => row.name), names);
    assert.equal((await db.query('select count(*)::int as n from public.gifts')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.participants where general_preferences is not null or personal_message is not null')).rows[0].n, 0);
    const before = await snapshot(db);
    await db.exec(roster);
    assert.deepEqual(await snapshot(db), before);
  } finally { await db.close(); }
});
test('conversion refuses custom demo edits and rolls back without losing them', async () => {
  const db = await database();
  try {
    await db.exec("set app.seed_environment = 'local';\n" + await readFile(new URL('../../supabase/seed.sql', import.meta.url), 'utf8'));
    await db.exec("update public.gifts set title='Un deseo que ya edité' where id='22222222-2222-4222-8222-000000000001'");
    const before = await snapshot(db);
    await assert.rejects(db.exec(roster), /custom changes or private access/);
    await db.exec('rollback');
    assert.deepEqual(await snapshot(db), before);
  } finally { await db.close(); }
});
test('user roster refuses a missing local marker and unrelated participants', async () => {
  const db = await database();
  try {
    await assert.rejects(db.exec(sql), /Roster disabled/);
    await db.exec('rollback');
    await db.exec("insert into public.participants(name,slug) values('Persona ajena','persona-ajena')");
    const before = await snapshot(db);
    await assert.rejects(db.exec(roster), /unrelated participants/);
    await db.exec('rollback');
    assert.deepEqual(await snapshot(db), before);
  } finally { await db.close(); }
});
