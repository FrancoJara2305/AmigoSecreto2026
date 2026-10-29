import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Fixed Docker socket, container and DB loopback. No URL, credentials or CLI arguments.
if (process.argv.length !== 2) throw new Error('La carga local de participantes no admite argumentos.');
const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
const sql = await readFile(new URL('../supabase/participants.local.sql', import.meta.url), 'utf8');
const result = spawnSync('docker', [
  '--host', endpoint, 'exec', '-i', 'supabase_db_AmigoSecreto2026',
  'psql', '-X', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
], { input: "set app.seed_environment = 'local';\n" + sql, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 60000 });
if (result.error || result.status !== 0) {
  console.error('No se pudo cargar el grupo local. Inicia Docker Desktop y Supabase local; revisa cualquier conflicto indicado abajo.');
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = 1;
} else if (result.stdout) process.stdout.write(result.stdout);
