import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Pin the local Docker endpoint AND loopback PostgreSQL inside the known local container.
// Never accepts a database URL, arbitrary container, linked project or remote option.
if (process.argv.length !== 2) throw new Error('Este ejecutor local no admite argumentos.');
const endpoint = process.platform === 'win32'
  ? 'npipe:////./pipe/docker_engine'
  : 'unix:///var/run/docker.sock';
const directory = new URL('../supabase/tests/database/', import.meta.url);
const sql = (await Promise.all((await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()
  .map((name) => readFile(new URL(name, directory), 'utf8')))).join('\n');
const result = spawnSync('docker', [
  '--host', endpoint, 'exec', '-i', 'supabase_db_AmigoSecreto2026',
  'psql', '-X', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
], { input: sql, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 60000 });

if (result.error) {
  console.error(result.error.code === 'ENOENT'
    ? 'Docker no está disponible. Usa npm run test:db para PostgreSQL embebido.'
    : 'No se pudo ejecutar Docker local; comprueba Docker Desktop.');
  process.exitCode = 1;
} else {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status === 0 ? 0 : 1;
}
