import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { generateToken,hashToken } from '../supabase/functions/_shared/tokens.ts';
import { inspectImage } from '../supabase/functions/_shared/image-inspection.ts';
if (process.argv.length!==2) throw new Error('Prueba HTTP solo local, sin argumentos.');
const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
const owner=randomUUID(),other=randomUUID(),token=generateToken(),hash=await hashToken(token);
const base='http://127.0.0.1:54321';
const paths=[];
function localStorageKey() {
  const result=spawnSync('docker',['--host',endpoint,'inspect','supabase_storage_AmigoSecreto2026','--format','{{json .Config.Env}}'],{encoding:'utf8',timeout:10000});
  if (result.error || result.status!==0) throw new Error('No se pudo inspeccionar Storage local.');
  const key=JSON.parse(result.stdout).find((s)=>s.startsWith('SERVICE_KEY='))?.slice(12);
  if (!key) throw new Error('Clave interna de Storage local no disponible.'); return key;
}
const localKey=localStorageKey();
const serverHeaders={apikey:localKey,Authorization:`Bearer ${localKey}`,'Content-Type':'application/json'};
async function cleanupRpc(body) {
  const response=await fetch(`${base}/rest/v1/rpc/server_media_cleanup`,{method:'POST',headers:serverHeaders,body:JSON.stringify(body)});
  assert.equal(response.status,200); return response.json();
}
async function remove(path) {
  const response=await fetch(`${base}/storage/v1/object/wishlist-media`,{method:'DELETE',headers:serverHeaders,body:JSON.stringify({prefixes:[path]})});
  assert.equal(response.status,200); await response.body?.cancel();
}
function sql(statement) {
  const result=spawnSync('docker',['--host',endpoint,'exec','-i','supabase_db_AmigoSecreto2026','psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:statement,encoding:'utf8',timeout:10000});
  if (result.error || result.status!==0) throw new Error('Falló consulta de prueba local.');
  return result.stdout.trim();
}
async function upload(bytes,mime,participant=owner,credential=token,purpose='gift') {
  const start=performance.now();
  const response=await fetch(`${base}/functions/v1/media-upload`,{method:'POST',headers:{'Content-Type':mime,'X-Edit-Token':credential,'X-Participant-Id':participant,'X-Media-Purpose':purpose,Origin:'http://localhost:5173'},body:bytes,signal:AbortSignal.timeout(30000)});
  const data=await response.json();
  assert.ok(!JSON.stringify(data).includes(token) && !JSON.stringify(data).includes(hash));
  if (data.path) paths.push(data.path);
  return {status:response.status,data,ms:Math.round(performance.now()-start)};
}
try {
  sql(`insert into public.participants(id,name,slug) values('${owner}','Prueba media','media-${owner}'),('${other}','Otra prueba','media-${other}');
    insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${owner}',decode('${hash}','hex'));`);
  const png=await readFile(new URL('../tests/fixtures/images/small.png',import.meta.url));
  assert.equal((await upload(png,'image/png',owner,'')).status,401);
  assert.equal((await upload(png,'image/png',other)).status,403);
  assert.equal((await upload(png,'image/gif')).status,415);
  assert.equal((await upload(png,'image/jpeg')).status,422);
  for (const [file,mime,purpose] of [['large.jpg','image/jpeg','gift'],['large.png','image/png','gift'],['large.webp','image/webp','gift'],['small.png','image/png','avatar'],['large16.png','image/png','gift']]) {
    // Independent test cases; reset only this ephemeral credential's local upload quota.
    sql(`delete from private.rate_limits where operation='upload' and key_hash=decode('${hash}','hex');`);
    const result=await upload(await readFile(new URL(`../tests/fixtures/images/${file}`,import.meta.url)),mime,owner,token,purpose);
    assert.equal(result.status,201,`${file}: ${JSON.stringify(result.data)}`);
    const object=await fetch(`${base}/storage/v1/object/public/wishlist-media/${result.data.path}`);
    assert.equal(object.status,200);
    const bytes=new Uint8Array(await object.arrayBuffer()); const info=inspectImage(bytes,'image/webp');
    assert.equal(Math.max(info.width,info.height),purpose==='gift'?1200:96);
    assert.equal(sql(`select upload_complete and state='pending' from private.media_assets where storage_path='${result.data.path}';`),'t');
    assert.ok(!Buffer.from(bytes).includes(Buffer.from('EXIF')));
    console.log(`${file} -> ${purpose}: ${info.width}x${info.height}, ${bytes.length} bytes, ${result.ms} ms HTTP local.`);
  }
  const giftPath=paths[0];
  const mutation=await fetch(`${base}/functions/v1/wishlist-api`,{method:'POST',headers:{'Content-Type':'application/json','X-Edit-Token':token},body:JSON.stringify({action:'create_gift',participant_id:owner,position:1,gift:{title:'Prueba imagen',gift_type:'object',image_path:giftPath}})});
  assert.equal(mutation.status,201);
  const saved=await mutation.json();
  assert.equal(sql(`select state from private.media_assets where storage_path='${giftPath}';`),'attached');
  sql(`update private.media_assets set unused_since=clock_timestamp()-interval '25 hours' where storage_path='${giftPath}';`);
  assert.equal((await cleanupRpc({p_action:'claim',p_path:giftPath})).ok,false);
  const replacement=await fetch(`${base}/functions/v1/wishlist-api`,{method:'POST',headers:{'Content-Type':'application/json','X-Edit-Token':token},body:JSON.stringify({action:'update_gift',participant_id:owner,position:1,gift_id:saved.gift.id,expected_version:1,gift:{image_url:'https://example.com/reference.webp'}})});
  assert.equal(replacement.status,200); await replacement.body?.cancel();
  sql(`update private.media_assets set unused_since=clock_timestamp()-interval '25 hours' where storage_path='${giftPath}';`);
  const claim=await cleanupRpc({p_action:'claim',p_path:giftPath}); assert.equal(claim.ok,true);
  // Simulated delete failure: acknowledgment must fail and the claim must remain retryable.
  assert.equal((await cleanupRpc({p_action:'finish',p_path:giftPath,p_claim:claim.claim})).ok,false);
  assert.ok((await cleanupRpc({p_action:'list'})).paths.includes(giftPath));
  await remove(giftPath);
  assert.equal((await cleanupRpc({p_action:'finish',p_path:giftPath,p_claim:claim.claim})).ok,true);
  const absent=await fetch(`${base}/storage/v1/object/public/wishlist-media/${giftPath}`); assert.ok([400,404].includes(absent.status)); await absent.body?.cancel();
  const orphan=paths[1];
  sql(`delete from public.participants where id='${owner}'; update storage.objects set created_at=clock_timestamp()-interval '25 hours' where bucket_id='wishlist-media' and name='${orphan}';`);
  assert.ok((await cleanupRpc({p_action:'list'})).paths.includes(orphan));
  const orphanClaim=await cleanupRpc({p_action:'claim',p_path:orphan}); assert.equal(orphanClaim.ok,true);
  await remove(orphan);
  assert.equal((await cleanupRpc({p_action:'finish',p_path:orphan,p_claim:orphanClaim.claim})).ok,true);
  console.log('Permisos HTTP, codec real, asociación, limpieza Storage, reintento y huérfano tras borrar participante: correctos.');
} finally {
  // Query only our ephemeral reservations, including failures with no response path.
  const reserved=sql(`select coalesce(json_agg(storage_path),'[]') from private.media_assets where participant_id='${owner}';`);
  const all=[...new Set([...JSON.parse(reserved),...paths])];
  if (all.length) {
    const response=await fetch(`${base}/storage/v1/object/wishlist-media`,{method:'DELETE',headers:{apikey:localKey,Authorization:`Bearer ${localKey}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:all})});
    if (!response.ok) throw new Error('No se pudieron retirar objetos de prueba locales.');
  }
  sql(`delete from public.participants where id in ('${owner}','${other}'); delete from private.rate_limits where key_hash=decode('${hash}','hex');
    delete from private.media_deletions where storage_path like '${owner}/%';`);
}
