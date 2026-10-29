import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import { tlsFixture } from '../tests/support/tls-fixture.mjs';
if(process.argv.length!==2)throw new Error('Sondeo exclusivamente local, sin argumentos.');
const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
const name=`amigo-network-probe-${randomUUID()}`;
const image='public.ecr.aws/supabase/edge-runtime:v1.77.8';
function docker(args){const r=spawnSync('docker',['--host',endpoint,...args],{encoding:'utf8',timeout:20000});if(r.error||r.status!==0)throw new Error('No se pudo ejecutar el sondeo Docker local.');return args[0]==='logs'?r.stdout+r.stderr:r.stdout;}
try{
  const tls=await tlsFixture();
  docker(['run','--detach','--name',name,'--network','none','--mount',`type=bind,source=${fileURLToPath(new URL('../tests/fixtures/edge-network-probe',import.meta.url))},target=/probe,readonly`,'--mount',`type=bind,source=${tls.directory},target=/tls,readonly`,image,'start','--main-service','/probe/main','--port','9000','--tls','19001','--cert','/tls/cert.pem','--key','/tls/key.pem']);
  let data;
  for(let i=0;i<30;i++){
    const log=docker(['logs',name]);const match=log.match(/PROBE_RESULT:(\{[^\n]+\})/);
    if(match){data=JSON.parse(match[1]);break;}await new Promise((resolve)=>setTimeout(resolve,200));
  }
  if(!data){console.log(docker(['logs',name]));throw new Error('El sondeo no respondió.');}
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/edge-network-probe.json',JSON.stringify({image,...data},null,2));
  console.log(JSON.stringify({image,...data},null,2));
}finally{docker(['rm','--force',name]);}
