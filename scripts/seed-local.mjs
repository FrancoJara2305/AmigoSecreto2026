import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Fixed local Docker endpoint/container/loopback DB. Never accepts credentials, URL or ref.
if (process.argv.length !== 2) throw new Error('La carga local no admite argumentos.');
const endpoint = process.platform === 'win32'
  ? 'npipe:////./pipe/docker_engine'
  : 'unix:///var/run/docker.sock';
const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
const result = spawnSync('docker', [
  '--host', endpoint, 'exec', '-i', 'supabase_db_AmigoSecreto2026',
  'psql', '-X', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
], { input: "set app.seed_environment = 'local';\n" + seed, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 60000 });

if (result.error) {
  console.error('No se pudo ejecutar Docker local. Inicia Docker Desktop y Supabase local.');
  process.exitCode = 1;
} else {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status === 0 ? 0 : 1;
}
