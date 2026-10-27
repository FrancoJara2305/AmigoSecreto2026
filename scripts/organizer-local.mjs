import { spawnSync } from 'node:child_process';
import { generateToken, hashToken, privateLink } from '../supabase/functions/_shared/tokens.ts';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('npm run organizer:bootstrap -- [--app-url http://localhost:5173] [--recover]');
  console.log('--recover revoca el enlace anterior del organizador. Solo opera sobre Docker LOCAL.');
  process.exit(0);
}
let recover = false;
let appUrl = 'http://localhost:5173';
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--recover' && !recover) recover = true;
  else if (args[index] === '--app-url' && args[index + 1]) appUrl = args[++index];
  else throw new Error('Argumento no permitido. Usa --help. No se aceptan tokens ni credenciales.');
}
const token = generateToken();
// Validate the app origin before making any database change.
const link = privateLink(appUrl, token, true);
const hash = await hashToken(token);
const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
// Only the hash goes through stdin. The raw capability never enters SQL, arguments or files.
const sql = `select private.bootstrap_organizer('${hash}',${recover ? 'true' : 'false'});`;
const result = spawnSync('docker', [
  '--host', endpoint, 'exec', '-i', 'supabase_db_AmigoSecreto2026',
  'psql', '-X', '-A', '-t', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
], { input: sql, encoding: 'utf8', timeout: 30000 });
if (result.error || result.status !== 0) {
  console.error(result.stderr?.includes('Organizer already initialized')
    ? 'El organizador ya está inicializado. Si perdiste el enlace, ejecuta la recuperación explícita con --recover.'
    : 'No se pudo preparar el acceso. Comprueba Docker, Supabase local y la migración de T07. Si se perdió una respuesta, usa --recover.');
  process.exitCode = 1;
} else {
  console.log(recover ? 'Enlace anterior revocado. Guarda el nuevo enlace privado:' : 'Organizador local preparado. Guarda este enlace privado:');
  console.log(link);
  console.log('Se muestra una sola vez. La pantalla de acceso se conectará en T12; el token ya puede validarse por la API local.');
}
