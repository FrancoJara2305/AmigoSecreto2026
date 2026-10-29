import { spawnSync } from 'node:child_process';
const args=process.argv.slice(2);
if(args.length>1 || (args.length && args[0]!=='--apply')) throw new Error('Usa cleanup:rates:local [-- --apply].');
const apply=args[0]==='--apply';
const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
// No URL, project, credentials, environment files or arbitrary SQL accepted.
const result=spawnSync('docker',['--host',endpoint,'exec','-i','supabase_db_AmigoSecreto2026',
  'psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
 {input:`select public.server_rate_limits_cleanup(1000,${!apply});`,encoding:'utf8',timeout:10000});
if(result.error || result.status!==0) {console.error('No se pudo revisar la limpieza de cuotas local. Inicia Docker y aplica las migraciones locales.');process.exitCode=1;}
else {const info=JSON.parse(result.stdout.trim());console.log(info.dry_run?`Simulación LOCAL: ${info.candidates} ventanas vencidas elegibles (máximo ${info.limit}).`:`Limpieza LOCAL: ${info.removed} ventanas vencidas eliminadas (máximo ${info.limit}).`);}
