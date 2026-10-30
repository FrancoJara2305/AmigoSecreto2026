import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID,createHash } from 'node:crypto';
import { mkdir,mkdtemp,readFile,writeFile,readdir } from 'node:fs/promises';
import { resolve,sep } from 'node:path';
import { generateToken,hashToken } from '../../supabase/functions/_shared/tokens.ts';

// Deliberately NOT a backup/restore command for user data. All destinations are fixed.
export async function recoveryLocal({base,origin,sql,anon,key,token,endpoint,container}){
  assert.equal(base,'http://127.0.0.1:54421');assert.equal(origin,'http://localhost:5179');
  assert.equal(container,'supabase_db_AmigoSecretoAdminTest');
  assert.equal(endpoint,process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock');
  assert.equal(sql('select count(*) from public.participants;'),'0','Rehearsal must start without participants');
  const root=resolve('artifacts/recovery-local');await mkdir(root,{recursive:true});
  const archive=await mkdtemp(resolve(root,'rehearsal-'));assert.ok(archive.startsWith(root+sep));
  const digest=(bytes)=>createHash('sha256').update(bytes).digest('hex');
  const secretValues=[key,token,await hashToken(token)];
  function redacted(value){for(const secret of secretValues)assert.ok(!JSON.stringify(value).includes(secret),'Private material in public result');}
  async function call(body,credential=token){
    const response=await fetch(`${base}/functions/v1/wishlist-api`,{method:'POST',headers:{Origin:origin,apikey:anon,'Content-Type':'application/json','X-Edit-Token':credential},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!data.private_link)redacted(data);return {status:response.status,data};
  }
  async function rpc(name,body){const response=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);return response.json();}
  function pg(program,args,input){
    const result=spawnSync('docker',['--host',endpoint,'exec','-i',container,program,...args],{input,encoding:null,windowsHide:true,timeout:60000,maxBuffer:16*1024*1024});
    if(result.error||result.status!==0){
      const detail=result.stderr?.toString().match(/ERROR:\s+([^\r\n]+)/)?.[1];
      if(detail)console.error(`PostgreSQL aislado: ${detail.replace(/[a-f0-9]{32,}|[A-Za-z0-9_-]{43,}/g,'[redactado]')}`);
      throw new Error(`Isolated ${program} failed`);
    }
    return result.stdout;
  }
  const pgArgs=['--host=127.0.0.1','--username=postgres','--dbname=postgres'];
  const id=randomUUID();let phase='fixture';
  try{
    let result=await call({action:'create_participant',participant_id:id,participant:{name:'Recovery fixture',personal_message:'Mensaje preservado',general_preferences:'Gustos preservados'}});assert.equal(result.status,201);let person=result.data.participant;
    const issued=await call({action:'issue_participant_link',participant_id:id});assert.equal(issued.status,200);const personal=new URL(issued.data.private_link).hash.slice(7);secretValues.push(personal,await hashToken(personal));
    const source=await readFile(new URL('../fixtures/images/small.png',import.meta.url));
    async function upload(purpose){const response=await fetch(`${base}/functions/v1/media-upload`,{method:'POST',headers:{Origin:origin,apikey:anon,'Content-Type':'image/png','X-Edit-Token':personal,'X-Participant-Id':id,'X-Media-Purpose':purpose},body:source,signal:AbortSignal.timeout(30000)});assert.equal(response.status,201);return (await response.json()).path;}
    // Cold worker readiness: no capability/no binary body in the probe.
    for(let attempt=0;attempt<80;attempt++){const response=await fetch(`${base}/functions/v1/media-upload`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});await response.body?.cancel();if(response.status===401)break;await new Promise((r)=>setTimeout(r,100));}
    const avatar=await upload('avatar'),image=await upload('gift');
    result=await call({action:'update_participant',participant_id:id,expected_version:person.version,participant:{photo_path:avatar}});assert.equal(result.status,200);person=result.data.participant;
    const gift=await call({action:'create_gift',participant_id:id,position:2,gift:{title:'Regalo restaurable',gift_type:'object',image_path:image,reference_price:'0'}},personal);assert.equal(gift.status,201);
    const event=(await call({action:'admin_list'})).data.event;
    assert.equal((await call({action:'update_event',expected_version:event.version,event:{title:'Evento recuperable',welcome_message:'Bienvenida preservada',exchange_date:'2026-12-25'}})).status,200);
    const tables=sql("select schemaname||'.'||tablename from pg_tables where schemaname in ('public','private') order by schemaname,tablename;").split('\n');
    for(const table of tables)assert.match(table,/^(public|private)\.[a-z_]+$/);
    function fingerprints(){return Object.fromEntries(tables.map((table)=>[table,sql(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text) from ${table} t;`)]));}
    const before=fingerprints();
    phase='export';
    const dump=pg('pg_dump',[...pgArgs,'--format=custom','--schema=public','--schema=private','--no-owner']);assert.equal(dump.subarray(0,5).toString(),'PGDMP');
    const toc=pg('pg_restore',['--list'],dump).toString();
    await writeFile(resolve(archive,'application.toc'),toc);
    // The target platform owns its reserved-role defaults. Retain application ACLs,
    // including postgres defaults; do not escalate privileges to restore supabase_admin.
    const omitted=toc.split('\n').filter((line)=>line.includes(' DEFAULT ACL ')&&/ supabase_admin$/.test(line));
    const restoreList=toc.split('\n').map((line)=>omitted.includes(line)?'; '+line:line).join('\n');
    await writeFile(resolve(archive,'restore.toc'),restoreList);
    pg('tee',['/tmp/amigo-recovery.toc'],Buffer.from(restoreList));
    await writeFile(resolve(archive,'application.dump'),dump);
    const objects=[];
    for(const path of [avatar,image]){
      assert.match(path,/^[a-f0-9-]{36}\/(avatar|gift)\/[a-f0-9-]{36}\.webp$/);
      const response=await fetch(`${base}/storage/v1/object/public/wishlist-media/${path}`);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());
      const file=resolve(archive,'storage',path);assert.ok(file.startsWith(archive+sep));await mkdir(resolve(file,'..'),{recursive:true});await writeFile(file,bytes);
      objects.push({path,bytes:bytes.length,sha256:digest(bytes),contentType:'image/webp',cacheControl:'3600'});
    }
    const bucket=JSON.parse(sql("select to_jsonb(b) from (select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id='wishlist-media') b;"));
    const manifest={format:1,synthetic:true,project:'AmigoSecretoAdminTest',pgMajor:sql('show server_version_num;').slice(0,2),database:{file:'application.dump',sha256:digest(dump),schemas:['public','private'],tables,reservedDefaultAclsExcluded:omitted.length},bucket,objects};
    await writeFile(resolve(archive,'manifest.json'),JSON.stringify(manifest,null,2));
    // Prove that modifications after the snapshot are lost, and a revoked capability's
    // old active hash comes back. It MUST be invalidated before reopening writes.
    assert.equal((await call({action:'revoke_participant_link',participant_id:id})).status,200);
    assert.equal((await call({action:'validate_access'},personal)).status,401);
    phase='simulated loss';
    const removed=await fetch(`${base}/storage/v1/object/wishlist-media`,{method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:objects.map((o)=>o.path)})});assert.ok(removed.ok);await removed.body?.cancel();
    for(const object of objects){const response=await fetch(`${base}/storage/v1/object/public/wishlist-media/${object.path}`);assert.ok(!response.ok);await response.body?.cancel();}
    // The enclosing runner owns this disposable stack. NEVER point this helper at another DB.
    assert.equal(sql(`select count(*) from public.participants where id='${id}';`),'1');
    sql('drop schema private cascade;drop schema public cascade;');
    assert.equal(sql("select count(*) from pg_namespace where nspname in ('public','private');"),'0');
    // pg_dump can omit CREATE for the built-in public schema; a fresh Postgres has it.
    const hasPublicSchema=/\bSCHEMA - public\b/.test(toc);
    if(!hasPublicSchema)sql('create schema public;');
    const initialSchemas=hasPublicSchema?'0':'1';
    phase='restore';
    const saved=await readFile(resolve(archive,'application.dump'));assert.equal(digest(saved),manifest.database.sha256);
    // An incomplete/corrupt archive must fail atomically, without half a schema.
    const corrupt=spawnSync('docker',['--host',endpoint,'exec','-i',container,'pg_restore',...pgArgs,'--no-owner','--exit-on-error','--single-transaction'],{input:saved.subarray(0,Math.floor(saved.length/2)),encoding:null,windowsHide:true,timeout:60000});assert.notEqual(corrupt.status,0);
    assert.equal(sql("select count(*) from pg_namespace where nspname in ('public','private');"),initialSchemas);
    pg('pg_restore',[...pgArgs,'--no-owner','--exit-on-error','--single-transaction','--use-list=/tmp/amigo-recovery.toc'],saved);
    assert.deepEqual(fingerprints(),before);
    assert.equal(sql(`select revoked_at is null from private.access_tokens where token_hash=decode('${await hashToken(personal)}','hex');`),'t');
    console.log('OK pg_dump/pg_restore: todos los datos public/private idénticos, permisos/DDL recuperados y archivo corrupto rechazado sin restauración parcial.');
    phase='invalidate restored links';
    const replacement=generateToken();secretValues.push(replacement,await hashToken(replacement));
    sql(`begin;update private.access_tokens set revoked_at=clock_timestamp() where revoked_at is null;select private.bootstrap_organizer('${await hashToken(replacement)}',true);commit;notify pgrst,'reload schema';`);
    assert.equal((await call({action:'validate_access'},personal)).status,401);assert.equal((await call({action:'validate_access'})).status,401);token=replacement;
    assert.equal((await call({action:'admin_list'})).status,200);
    const fresh=(await call({action:'issue_participant_link',participant_id:id})).data.private_link;const newPersonal=new URL(fresh).hash.slice(7);secretValues.push(newPersonal,await hashToken(newPersonal));
    assert.equal((await call({action:'validate_access'},newPersonal)).status,200);assert.equal((await call({action:'validate_access'},personal)).status,401);
    console.log('OK recuperación: el backup reintroduce el hash anterior; invalidar todo y emitir nuevos enlaces impide reactivar revocaciones posteriores.');
    phase='restore storage';
    for(const object of manifest.objects){
      const bytes=await readFile(resolve(archive,'storage',object.path));assert.equal(digest(bytes),object.sha256);assert.equal(bytes.length,object.bytes);
      const response=await fetch(`${base}/storage/v1/object/wishlist-media/${object.path}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':object.contentType,'Cache-Control':object.cacheControl,'x-upsert':'false'},body:bytes});assert.equal(response.status,200);await response.body?.cancel();
      const read=await fetch(`${base}/storage/v1/object/public/wishlist-media/${object.path}`);assert.equal(read.status,200);assert.equal(digest(Buffer.from(await read.arrayBuffer())),object.sha256);
    }
    const publicRows=await fetch(`${base}/rest/v1/participants?select=*,gifts(*)&id=eq.${id}`,{headers:{apikey:anon,Authorization:`Bearer ${anon}`}});assert.equal(publicRows.status,200);const rows=await publicRows.json();redacted(rows);assert.equal(rows[0].photo_path,avatar);assert.equal(rows[0].gifts[0].image_path,image);assert.equal(rows[0].gifts[0].position,2);assert.equal(Number(rows[0].gifts[0].reference_price),0);
    console.log('OK Storage restaurado por API: avatar y regalo conservan rutas y bytes SHA-256, relaciones y lectura pública.');
    phase='maintenance';
    assert.equal((await rpc('server_media_cleanup',{p_action:'claim',p_path:image})).ok,false);
    const orphan=await rpc('server_media_upload',{p_action:'reserve',p_token_hash:await hashToken(newPersonal),p_participant_id:id,p_purpose:'gift'});assert.equal(orphan.ok,true);
    sql(`update private.media_assets set unused_since=clock_timestamp()-interval '2 days' where storage_path='${orphan.path}';`);
    const listed=await rpc('server_media_cleanup',{p_action:'list'});assert.ok(listed.paths.includes(orphan.path));
    const claim=await rpc('server_media_cleanup',{p_action:'claim',p_path:orphan.path});assert.equal(claim.ok,true);
    const deletion=await fetch(`${base}/storage/v1/object/wishlist-media`,{method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[orphan.path]})});assert.ok(deletion.ok);await deletion.body?.cancel();
    assert.equal((await rpc('server_media_cleanup',{p_action:'finish',p_path:orphan.path,p_claim:claim.claim})).ok,true);
    sql("update private.rate_limits set window_start=window_start-interval '2 days',expires_at=expires_at-interval '2 days';");
    const dry=await rpc('server_rate_limits_cleanup',{p_limit:1000,p_dry_run:true});assert.ok(dry.candidates>0);const cleaned=await rpc('server_rate_limits_cleanup',{p_limit:1000,p_dry_run:false});assert.ok(cleaned.removed>0);
    const tests=new URL('../../supabase/tests/database/',import.meta.url);let checks=0;
    for(const file of (await readdir(tests)).filter((name)=>name.endsWith('.sql')).sort())checks+=sql(await readFile(new URL(file,tests),'utf8')).split('\n').filter((line)=>line.startsWith('ok - ')).length;
    assert.ok(checks>=303);
    await writeFile(resolve(archive,'result.json'),JSON.stringify({ok:true,synthetic:true,objects:objects.length,sqlAssertions:checks,dbRestored:true,corruptRejected:true,linksReissued:true,maintenanceVerified:true},null,2));
    console.log(`OK mantenimiento y permisos tras restaurar: referencia protegida, huérfano reclamado, cuotas limpiadas y ${checks} aserciones SQL reales.`);
    console.log('Respaldo sintético y manifiesto bajo artifacts/recovery-local; ningún enlace privado en archivos ni logs.');
  }catch(error){console.error(`Falló recuperación aislada en: ${phase}. Sin imprimir datos o credenciales.`);throw error;}
}
