import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve,sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { hostingConfig,deploymentOrigin,deploymentEnvironmentTemplates } from '../server/deployment-config.ts';

// Produces review artifacts only. Never logs in, links, reads a remote or deploys.
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--stage','--supabase-url','--app-url'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Usa --stage staging|production --supabase-url HTTPS_ORIGIN --app-url HTTPS_ORIGIN.');options[args[i]]=args[i+1];}
assert.ok(['staging','production'].includes(options['--stage']),'Indica explícitamente staging o production.');
const supabase=deploymentOrigin(options['--supabase-url']??''),app=deploymentOrigin(options['--app-url']??'');
assert.notEqual(supabase,app,'Frontend y Supabase deben ser destinos distintos.');
const stage=options['--stage'],directory=resolve('artifacts/deployment',stage);assert.ok(directory.startsWith(resolve('artifacts')+sep));
const git=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true});assert.equal(git.status,0);
const files=[...new Set(git.stdout.split('\0').filter((name)=>name&&(
  /^(src|server|api|supabase\/functions|supabase\/migrations)\//.test(name)||
  ['package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json','supabase/config.toml','.vercelignore','scripts/prepare-deployment.mjs'].includes(name)
)))].filter((name)=>!/(^|\/)\.env(?:$|\.)/.test(name)).sort();
const digest=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const entries=await Promise.all(files.map(async(path)=>({path,sha256:digest(await readFile(path))})));
const config=JSON.stringify(hostingConfig(supabase),null,2)+'\n';
const templates=deploymentEnvironmentTemplates(supabase,app);
const manifest={schemaVersion:2,stage,appOrigin:app,supabaseOrigin:supabase,deployed:false,remoteInspected:false,
  destinationStatus:'unverified',migrationPlanStatus:'inventory-only',
  migrations:entries.filter((e)=>e.path.startsWith('supabase/migrations/')),files:entries,hostingConfigSha256:digest(config),
  environmentTemplates:Object.entries(templates).map(([path,content])=>({path,sha256:digest(content)})),
  contentSha256:digest(JSON.stringify(entries)),notes:['Migration list is an inventory, not a remote pending list.','No seeds, participants or credential files included.','Review Supabase history and exact destination before any remote operation.']};
await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'vercel.json'),config);
for(const [path,content] of Object.entries(templates))await writeFile(resolve(directory,path),content);
await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Paquete de revisión ${stage}: ${entries.length} archivos y ${manifest.migrations.length} migraciones inventariados en artifacts/deployment/${stage}.`);
console.log('CSP y tres plantillas de variables ligadas a los orígenes elegidos; solo marcadores, sin claves reales.');
console.log('Destino sin verificar; inventario, no lista de pendientes. Sin conexión remota o despliegue.');
