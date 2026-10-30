import { spawn,spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname,join,resolve } from 'node:path';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { readFile,writeFile,mkdir,cp,rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { generateToken,hashToken } from '../supabase/functions/_shared/tokens.ts';
import { adminConcurrency } from '../tests/support/admin-concurrency.mjs';
const ui=process.argv.length===3&&process.argv[2]==='--ui';
const security=process.argv.length===3&&process.argv[2]==='--security';
const recovery=process.argv.length===3&&process.argv[2]==='--recovery';
if(process.argv.length!==2&&!ui&&!security&&!recovery)throw new Error('Ensayo exclusivamente local; solo admite --ui, --security o --recovery.');
const project='AmigoSecretoAdminTest',endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
const directory=fileURLToPath(new URL('../artifacts/admin-local/',import.meta.url)),db=`supabase_db_${project}`,base='http://127.0.0.1:54421',origin='http://localhost:5179';
const require=createRequire(import.meta.url),suffix=process.platform==='win32'?'windows-x64':`${process.platform}-${process.arch}`;
const binary=join(dirname(require.resolve(`@supabase/cli-${suffix}/package.json`)),'bin',`supabase${process.platform==='win32'?'.exe':''}`);
const childEnv={...process.env};for(const name of ['SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','SUPABASE_PROJECT_REF'])delete childEnv[name];
let cli,started=false,log='',anon,key,token=generateToken(),phase='preflight',fixture;
const envFile=join(directory,'functions.env.local');
function docker(args,input){return spawnSync('docker',['--host',endpoint,...args],{input,encoding:'utf8',timeout:15000,windowsHide:true});}
function sql(statement){const result=docker(['exec','-i',db,'psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],statement);if(result.error||result.status!==0)throw new Error('Isolated local SQL failed');return result.stdout.trim();}
async function waitFor(check,attempts=100){for(let i=0;i<attempts;i++){if(await check())return;await new Promise((resolve)=>setTimeout(resolve,100));}throw new Error('Isolated readiness failed');}
async function portOpen(port){return new Promise((resolve)=>{const socket=createConnection({host:'127.0.0.1',port});const done=(open)=>{socket.destroy();resolve(open);};socket.setTimeout(300);socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.once('timeout',()=>done(false));});}
async function call(body,secret=token){const response=await fetch(`${base}/functions/v1/wishlist-api`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',apikey:anon,'X-Edit-Token':secret},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});return {status:response.status,headers:response.headers,data:await response.json()};}
async function rpc(name,body){const response=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);return response.json();}
const secretFromLink=(data)=>{const url=new URL(data.private_link);assert.equal(url.origin,origin);const credential=url.hash.slice('#token='.length);fixture?.trackToken(credential);return credential;};
try{
  // Project, ports and workdir are constants. Never use link, reset, --all or user credentials.
  assert.ok(resolve(directory).startsWith(resolve('artifacts')+ (process.platform==='win32'?'\\':'/')));
  const running=docker(['ps','-a','--format','{{.Names}}']);if(running.error||running.status!==0)throw new Error('Docker unavailable');
  if(running.stdout.split(/\r?\n/).some((name)=>name.endsWith(`_${project}`)))throw new Error('Existing isolated project; review before reuse');
  for(const port of [54421,54422,8094])if(await portOpen(port))throw new Error('Isolated port occupied');
  await mkdir(join(directory,'supabase'),{recursive:true});
  const config=(await readFile(new URL('../supabase/config.toml',import.meta.url),'utf8')).replace('project_id = "AmigoSecreto2026"',`project_id = "${project}"`).replaceAll('54321','54421').replaceAll('54322','54422').replaceAll('54320','54420').replaceAll('54323','54423').replace('[edge_runtime]\nenabled = true','[edge_runtime]\nenabled = true\ninspector_port = 8094').replace('[edge_runtime]\r\nenabled = true','[edge_runtime]\r\nenabled = true\r\ninspector_port = 8094');
  assert.match(config,/^project_id = "AmigoSecretoAdminTest"\r?$/m);assert.ok(config.includes('port = 54421')&&config.includes('port = 54422')&&config.includes('inspector_port = 8094'));
  await writeFile(join(directory,'supabase','config.toml'),config);
  await cp(new URL('../supabase/migrations/',import.meta.url),join(directory,'supabase','migrations'),{recursive:true});
  await cp(new URL('../supabase/functions/',import.meta.url),join(directory,'supabase','functions'),{recursive:true,filter:(source)=>!/(^|[\\/])\.env(?:$|\.)/.test(source)});
  if(security)fixture=await (await import('../tests/support/security-integration.mjs')).securityFixture({base});
  await writeFile(envFile,`APP_ALLOWED_ORIGINS=${origin}\nAPP_BASE_URL=${origin}\nRATE_LIMIT_IP_SOURCE=off\n${fixture?.env??''}`);
  phase='isolated stack startup';started=true;
  const start=spawn(binary,['start','--workdir',directory,'--exclude','edge-runtime,studio,postgres-meta'],{env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true});let startLog='';start.stdout.on('data',(data)=>{startLog+=data;});start.stderr.on('data',(data)=>{startLog+=data;});const startCode=await new Promise((resolve,reject)=>{start.once('error',reject);start.once('close',resolve);});if(startCode!==0)throw new Error('Isolated stack start failed');
  const inspect=docker(['inspect',`supabase_storage_${project}`,'--format','{{json .Config.Env}}']);if(inspect.status!==0)throw new Error('Isolated keys unavailable');const vars=JSON.parse(inspect.stdout);anon=vars.find((s)=>s.startsWith('ANON_KEY='))?.slice(9);key=vars.find((s)=>s.startsWith('SERVICE_KEY='))?.slice(12);assert.ok(anon&&key);
  const hash=await hashToken(token);sql(`select private.bootstrap_organizer('${hash}');`);
  cli=spawn(binary,['functions','serve','--workdir',directory,'--env-file',envFile],{env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true});cli.stdout.on('data',(data)=>{log+=data;});cli.stderr.on('data',(data)=>{log+=data;});
  phase='isolated worker readiness';await waitFor(()=>log.includes('Serving functions on'));await waitFor(()=>fetch(`${base}/functions/v1/wishlist-api`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(1000)}).then(async(r)=>{await r.body?.cancel();return r.status===401;},()=>false));
  console.log('Pila de prueba aislada lista en 54421/54422; proyecto principal sin cambios.');
  if(security){phase='SQL and hostile HTTP integration';await fixture.run({base,origin,sql,anon,key,token});}
  if(recovery){phase='backup and recovery rehearsal';await (await import('../tests/support/recovery-local.mjs')).recoveryLocal({base,origin,sql,anon,key,token,endpoint,container:db});}
  else if(ui){phase='browser organizer UI';const {organizerUI}=await import('../tests/support/organizer-ui-local.mjs');await organizerUI({base,anon,token,origin,sql});}
  else{
  const a=randomUUID(),b=randomUUID();
  phase='admin CRUD';let res=await call({action:'create_participant',participant_id:a,participant:{name:'Álice de prueba',avatar_key:'star'}});assert.equal(res.status,201);let alice=res.data.participant;assert.equal(alice.slug,'alice-de-prueba');
  res=await call({action:'create_participant',participant_id:b,participant:{name:'Álice de prueba'}});assert.equal(res.status,201);let bob=res.data.participant;assert.equal(bob.slug,'alice-de-prueba-2');
  const snapshot=await call({action:'admin_list'});assert.equal(snapshot.status,200);assert.equal(snapshot.data.total,2);assert.ok(!/token_hash|private_link|suggested_budget/.test(JSON.stringify(snapshot.data)));assert.ok(!JSON.stringify(snapshot.data).includes(token));
  res=await call({action:'move_participant',participant_id:b,expected_version:bob.version,direction:'up',neighbor_id:a,neighbor_version:alice.version});assert.equal(res.status,200);alice=res.data.participants.find((p)=>p.id===a);bob=res.data.participants.find((p)=>p.id===b);
  res=await call({action:'update_participant',participant_id:a,expected_version:alice.version,participant:{name:'Alice revisada'}});assert.equal(res.status,200);alice=res.data.participant;assert.equal(alice.slug,'alice-de-prueba');
  assert.equal((await call({action:'update_participant',participant_id:a,expected_version:1,participant:{name:'Stale'}})).status,409);
  const issued=await call({action:'issue_participant_link',participant_id:a});assert.equal(issued.status,200);const personal=secretFromLink(issued.data);assert.equal((await call({action:'admin_list'},personal)).status,403);
  assert.equal((await call({action:'update_event',expected_version:1,event:{title:'Forbidden'}},personal)).status,403);
  let event=(await call({action:'admin_list'})).data.event;
  res=await call({action:'update_event',expected_version:event.version,event:{title:'Evento de prueba',welcome_message:'Bienvenidos',exchange_date:'2028-02-29'}});assert.equal(res.status,200);event=res.data.event;assert.equal(event.exchange_date,'2028-02-29');
  assert.equal((await call({action:'update_event',expected_version:event.version,event:{suggested_budget:200}})).status,422);
  console.log('OK HTTP Edge real: altas, slugs únicos, cambios/versiones, orden, evento/fecha y permisos de organizador.');
  phase='media and deletion';
  let upload;await waitFor(async()=>{upload=await fetch(`${base}/functions/v1/media-upload`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(1000)}).then(async(r)=>{await r.body?.cancel();return r.status;},()=>0);return upload===401;});
  const file=await readFile(new URL('../tests/fixtures/images/small.png',import.meta.url));const uploaded=await fetch(`${base}/functions/v1/media-upload`,{method:'POST',headers:{Origin:origin,'Content-Type':'image/png',apikey:anon,'X-Edit-Token':personal,'X-Participant-Id':a,'X-Media-Purpose':'avatar'},body:file,signal:AbortSignal.timeout(30000)});assert.equal(uploaded.status,201);const path=(await uploaded.json()).path;
  res=await call({action:'update_participant',participant_id:a,expected_version:alice.version,participant:{photo_path:path}});assert.equal(res.status,200);alice=res.data.participant;
  assert.equal((await call({action:'create_gift',participant_id:a,position:1,gift:{title:'Regalo efímero',gift_type:'object'}},personal)).status,201);
  res=await call({action:'delete_participant',participant_id:a,expected_version:alice.version,confirm_participant_id:a});assert.equal(res.status,200);assert.equal(res.data.deleted.gifts_removed,1);assert.ok(res.data.deleted.media_queued>=1);
  assert.equal((await call({action:'validate_access'},personal)).status,401);const kept=await fetch(`${base}/storage/v1/object/public/wishlist-media/${path}`);assert.equal(kept.status,200);await kept.body?.cancel();
  const claim=await rpc('server_media_cleanup',{p_action:'claim',p_path:path});assert.equal(claim.ok,true);const remove=await fetch(`${base}/storage/v1/object/wishlist-media`,{method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})});assert.ok(remove.ok);await remove.body?.cancel();assert.equal((await rpc('server_media_cleanup',{p_action:'finish',p_path:path,p_claim:claim.claim})).ok,true);
  console.log('OK baja: regalos y credenciales retirados; Storage en cola y borrado solo por API de mantenimiento.');
  phase='link lifecycle';
  const oldLink=secretFromLink((await call({action:'issue_participant_link',participant_id:b})).data),newLink=secretFromLink((await call({action:'issue_participant_link',participant_id:b})).data);assert.equal((await call({action:'validate_access'},oldLink)).status,401);assert.equal((await call({action:'validate_access'},newLink)).status,200);
  res=await call({action:'rotate_organizer_link'});assert.equal(res.status,200);const replacement=secretFromLink(res.data);assert.equal((await call({action:'admin_list'})).status,401);token=replacement;assert.equal((await call({action:'admin_list'})).status,200);
  console.log('OK emisión/reemisión y rotación: solo el enlace nuevo conserva acceso; sin secretos en listados.');
  phase='concurrency';await adminConcurrency({endpoint,container:db,sql,organizerHash:await hashToken(token),participantId:b,personalHash:await hashToken(newLink)});
  phase='client RPC denied';const denied=await fetch(`${base}/rest/v1/rpc/server_admin`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${anon}`,'Content-Type':'application/json'},body:JSON.stringify({p_action:'admin_list',p_token_hash:await hashToken(token)})});assert.ok([401,403].includes(denied.status));await denied.body?.cancel();
  console.log('OK RPC administrativo no ejecutable por la clave pública.');
  if(security){
    phase='local database lint';
    const lint=spawnSync(binary,['db','lint','--local','--workdir',directory,'--schema','public,private','--level','warning','--fail-on','warning'],{env:childEnv,encoding:'utf8',timeout:60000,windowsHide:true});
    if(lint.error||lint.status!==0)throw new Error('Isolated database lint failed');
    console.log('OK lint public/private de la base aislada, sin advertencias.');
    phase='secret-free worker logs';await fixture.checkLogs(log);
  }
  }
}catch(error){console.error(`Falló el ensayo administrativo aislado (${phase}). No se imprimen claves, tokens ni cuerpos.`);const frame=error?.stack?.split('\n').find((line)=>/^\s+at .*\/tests\/support\/(security-integration|recovery-local)\.mjs:\d+:\d+/.test(line));if(frame)console.error(frame.trim());process.exitCode=1;}
finally{
  cli?.kill();if(cli)await Promise.race([new Promise((resolve)=>cli.once('close',resolve)),new Promise((resolve)=>setTimeout(resolve,2000))]);
  if(started){const stop=spawnSync(binary,['stop','--workdir',directory,'--project-id',project,'--no-backup'],{env:childEnv,encoding:'utf8',timeout:60000,windowsHide:true});if(stop.error||stop.status!==0){console.error('Pendiente retirar únicamente la pila AmigoSecretoAdminTest.');process.exitCode=1;}else console.log('Pila de prueba retirada con sus volúmenes; instancia principal conservada.');}
  await fixture?.close();
  if(started||fixture)await rm(envFile,{force:true});
}
