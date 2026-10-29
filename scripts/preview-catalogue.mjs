import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Explicit, disposable local preview. Never loads .env files or contacts Supabase.
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]))) throw new Error('Usa preview:local [--port 5173].');
const port = Number(args[1] ?? 5173);
if (port < 1024 || port > 65534) throw new Error('Puerto de previsualización inválido.');
const origin = `http://127.0.0.1:${port}`;
const apiOrigin = `http://127.0.0.1:${port + 1}`;
const db = new PGlite();
let vite;
let server;
let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  if (vite && vite.exitCode === null) vite.kill();
  server?.closeAllConnections();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await db.close();
  process.exitCode = code;
}
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
try {
  await db.exec(await readFile(new URL('../tests/fixtures/supabase-platform.sql', import.meta.url), 'utf8'));
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name, directory), 'utf8'));
  await db.exec("set app.seed_environment = 'local';\n" + await readFile(new URL('../supabase/participants.local.sql', import.meta.url), 'utf8'));
  server = createServer(async (request, response) => {
    // Fixed read-only SQL; no caller-controlled statements, filters or mutations.
    if (request.headers.origin && request.headers.origin !== origin) { response.writeHead(403).end(); return; }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type, x-client-info');
      response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      response.writeHead(204).end(); return;
    }
    if (request.method !== 'GET') { response.writeHead(405).end('{}'); return; }
    try {
      const requestUrl = new URL(request.url, apiOrigin);
      const path = requestUrl.pathname;
      if (path === '/rest/v1/participants') {
        const slugFilter = requestUrl.searchParams.get('slug');
        if (slugFilter !== null) {
          if (!/^eq\.[a-z0-9]+(-[a-z0-9]+)*$/.test(slugFilter) || slugFilter.length > 103) { response.writeHead(400).end('{}'); return; }
          const { rows } = await db.query(`select p.id,p.name,p.slug,p.photo_path,p.photo_url,p.avatar_key,p.personal_message,p.general_preferences,
            coalesce((select jsonb_agg(g order by g.position) from public.gifts g where g.participant_id=p.id), '[]'::jsonb) as gifts
            from public.participants p where p.slug=$1`, [slugFilter.slice(3)]);
          response.end(JSON.stringify(rows)); return;
        }
        const { rows } = await db.query(`select p.id,p.name,p.slug,p.photo_path,p.photo_url,p.avatar_key,p.display_order,
          jsonb_build_array(jsonb_build_object('count',count(g.id)::integer)) as gifts
          from public.participants p left join public.gifts g on g.participant_id=p.id
          group by p.id order by p.display_order,p.name,p.id`);
        response.end(JSON.stringify(rows));
      } else if (path === '/rest/v1/event_settings') {
        response.end(JSON.stringify((await db.query('select title,welcome_message from public.event_settings where id=1')).rows[0]));
      } else response.writeHead(404).end('{}');
    } catch { response.writeHead(500).end('{"message":"No se pudo leer la vista local."}'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port + 1, '127.0.0.1', resolve); });
  console.log(`Vista temporal: once participantes con listas vacías. Se pierde al cerrar. Sin conexión remota.\n${origin}/`);
  vite = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: 'inherit',
    env: { ...process.env, APP_LOCAL_PREVIEW: '1', VITE_SUPABASE_URL: apiOrigin, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_disposable_preview_only', VITE_APP_URL: origin },
  });
  vite.once('error', () => void close(1));
  vite.once('exit', (code) => void close(code ?? 0));
} catch (error) { console.error('No se pudo iniciar la previsualización local:', error.message); await close(1); }
