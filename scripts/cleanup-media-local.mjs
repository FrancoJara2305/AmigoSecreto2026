import { spawnSync } from 'node:child_process';
// Hard-pinned to local Docker/loopback. No URL, key, project reference or env files accepted.
const args=process.argv.slice(2);
if (args.length>1 || (args.length && args[0]!=='--apply')) throw new Error('Usa cleanup:local [-- --apply].');
const apply=args[0]==='--apply';
const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
const result=spawnSync('docker',['--host',endpoint,'inspect','supabase_storage_AmigoSecreto2026','--format','{{json .Config.Env}}'],{encoding:'utf8',timeout:10000});
if (result.error || result.status!==0) throw new Error('Inicia Supabase local y Docker Desktop.');
const key=JSON.parse(result.stdout).find((s)=>s.startsWith('SERVICE_KEY='))?.slice(12);
if (!key) throw new Error('No se encontró la clave interna del contenedor local.');
const base='http://127.0.0.1:54321';
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
async function rpc(body) {
  const response=await fetch(`${base}/rest/v1/rpc/server_media_cleanup`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('No se pudo consultar el mantenimiento local.');
  return response.json();
}
const {paths}=await rpc({p_action:'list'});
console.log(`${apply?'Aplicación LOCAL':'Simulación LOCAL'}: ${paths.length} candidatos (máximo 100 por lote).`);
let removed=0,skipped=0,failed=0;
for (const path of paths) {
  if (!apply) {console.log(path); continue;}
  try {
    const claim=await rpc({p_action:'claim',p_path:path});
    if (!claim.ok) {skipped++; continue;}
    const response=await fetch(`${base}/storage/v1/object/wishlist-media`,{method:'DELETE',headers,
      body:JSON.stringify({prefixes:[claim.path]}),signal:AbortSignal.timeout(15000)});
    await response.body?.cancel();
    if (!response.ok) {failed++; continue;}
    const finished=await rpc({p_action:'finish',p_path:claim.path,p_claim:claim.claim});
    if (finished.ok) removed++; else failed++;
  } catch {failed++;}
}
if (apply) console.log(`Retirados: ${removed}. Protegidos/omitidos: ${skipped}. Pendientes de reintento: ${failed}.`);
if (failed) process.exitCode=1;
