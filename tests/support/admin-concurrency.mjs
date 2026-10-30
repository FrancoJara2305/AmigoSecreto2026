import { spawn } from 'node:child_process';
import { randomUUID,randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
export async function adminConcurrency({endpoint,container,sql,organizerHash,participantId,personalHash}){
  function connection(){const child=spawn('docker',['--host',endpoint,'exec','-i',container,'psql','-X','-q','-A','-t','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='';child.stdout.on('data',(data)=>{output+=data;});child.stderr.resume();const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code)=>resolve({code,output}));});return{child,finished};}
  async function race(first,second,{delay=0,afterBlock=''}={}){
    const a=connection(),marker=`admin-${randomUUID()}`;let b;
    try{
      const ready=new Promise((resolve,reject)=>{let seen='';const timeout=setTimeout(()=>reject(new Error('Local lock timeout')),10000);a.child.stdout.on('data',(data)=>{seen+=data;if(seen.includes('ADMIN_HELD')){clearTimeout(timeout);resolve();}});a.finished.then(()=>{clearTimeout(timeout);reject(new Error('Local transaction ended'));},reject);});
      a.child.stdin.write(`begin;set local statement_timeout='12s';set local role service_role;${first};select 'ADMIN_HELD';\n`);await ready;
      b=connection();b.child.stdin.end(`set statement_timeout='12s';set application_name='${marker}';set role service_role;${second};`);
      let blocked=false;for(let attempt=0;attempt<60;attempt++){if(sql(`select count(*) from pg_stat_activity where application_name='${marker}' and wait_event_type='Lock';`)==='1'){blocked=true;break;}await new Promise((resolve)=>setTimeout(resolve,30));}assert.equal(blocked,true);
      if(delay)await new Promise((resolve)=>setTimeout(resolve,delay));
      a.child.stdin.end(`${afterBlock?afterBlock+';':''}commit;`);const one=await a.finished,two=await b.finished;assert.equal(one.code,0);assert.equal(two.code,0);
      return JSON.parse(two.output.trim().split('\n').filter(Boolean).at(-1));
    }finally{if(a.child.exitCode===null)a.child.kill();if(b&&b.child.exitCode===null)b.child.kill();}
  }
  let version=Number(sql(`select version from public.participants where id='${participantId}';`));
  const update=(name)=>`select public.server_admin('update_participant','${organizerHash}','${participantId}',${version},'{"name":"${name}"}')`;
  assert.equal((await race(update('Concurrent winner'),update('Concurrent stale'))).status,409);
  assert.equal(sql(`select name from public.participants where id='${participantId}';`),'Concurrent winner');
  console.log('OK dos conexiones: una edición gana y la versión antigua recibe 409.');
  version=Number(sql(`select version from public.participants where id='${participantId}';`));
  sql(`update private.access_tokens set created_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()+interval '5 seconds' where token_hash=decode('${organizerHash}','hex');`);
  assert.equal((await race(`select id from public.participants where id='${participantId}' for update`,update('Expired write'),{delay:5200})).status,401);
  sql(`update private.access_tokens set expires_at=null where token_hash=decode('${organizerHash}','hex');`);
  assert.equal(sql(`select name from public.participants where id='${participantId}';`),'Concurrent winner');
  console.log('OK vencimiento tras esperar una fila: no se autoriza la escritura.');
  const reissuedHash=randomBytes(32).toString('hex');
  const linkIssue=`select public.server_access('issue_participant_link','${organizerHash}','${participantId}','${reissuedHash}')`;
  assert.equal((await race(`select private.require_access('${personalHash}','${participantId}',false)`,linkIssue,{afterBlock:`select id from public.participants where id='${participantId}' for update`})).ok,true);
  personalHash=reissuedHash;
  console.log('OK emisión frente a edición parcialmente autorizada: credencial -> participante evita el ciclo de bloqueos.');
  sql(`update private.access_tokens set expires_at=clock_timestamp()+interval '5 seconds' where token_hash=decode('${organizerHash}','hex');`);
  assert.equal((await race(`select id from public.participants where id='${participantId}' for update`,
    `select public.server_access('revoke_participant_link','${organizerHash}','${participantId}')`,{delay:5200})).status,401);
  sql(`update private.access_tokens set expires_at=null where token_hash=decode('${organizerHash}','hex');`);
  assert.equal(sql(`select revoked_at is null from private.access_tokens where token_hash=decode('${personalHash}','hex');`),'t');
  console.log('OK revocación tras esperar: organizador vencido no altera el enlace personal.');
  sql(`update private.access_tokens set expires_at=clock_timestamp()+interval '5 seconds' where token_hash=decode('${organizerHash}','hex');`);
  const rotationHash=randomBytes(32).toString('hex');
  assert.equal((await race(`select private.require_access('${organizerHash}',null,true)`,
    `select public.server_access('rotate_organizer_link','${organizerHash}',null,'${rotationHash}')`,{delay:5200})).status,401);
  sql(`update private.access_tokens set expires_at=null where token_hash=decode('${organizerHash}','hex');`);
  assert.equal(sql(`select count(*) from private.access_tokens where token_hash=decode('${rotationHash}','hex');`),'0');
  console.log('OK rotación tras esperar al actor: no se crea un relevo con un organizador vencido.');
  const reserved=JSON.parse(sql(`select public.server_media_upload('reserve','${personalHash}','${participantId}','avatar');`));assert.equal(reserved.ok,true);
  const deleting=`select public.server_admin('delete_participant','${organizerHash}','${participantId}',${version},'{"confirm_participant_id":"${participantId}"}')`;
  const completing=`select public.server_media_upload('complete','${personalHash}','${participantId}','avatar','${reserved.path}',100)`;
  assert.equal((await race(completing,deleting)).ok,true);
  assert.equal(sql(`select count(*) from private.media_deletions where storage_path='${reserved.path}';`),'1');
  assert.equal(sql(`select count(*) from private.access_tokens where participant_id='${participantId}';`),'0');
  console.log('OK completar subida antes de baja: la baja espera, invalida acceso y conserva la cola.');
  const id=randomUUID(),hash=randomBytes(32).toString('hex');
  sql(`insert into public.participants(id,name,slug) values('${id}','Race deletion','race-${id}');insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','${id}',decode('${hash}','hex'));`);
  const reservation=JSON.parse(sql(`select public.server_media_upload('reserve','${hash}','${id}','avatar');`));assert.equal(reservation.ok,true);
  const firstDelete=`select public.server_admin('delete_participant','${organizerHash}','${id}',1,'{"confirm_participant_id":"${id}"}')`;
  assert.equal((await race(firstDelete,`select public.server_media_upload('complete','${hash}','${id}','avatar','${reservation.path}',100)`)).status,401);
  console.log('OK baja antes de completar: la credencial eliminada recibe 401 y no vuelve a asociar la foto.');
}
