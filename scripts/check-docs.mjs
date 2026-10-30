import { readFile,readdir,stat,access } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

if(process.argv.length!==2)throw new Error('Revisión de documentación sin argumentos.');
const scripts=JSON.parse(await readFile('package.json','utf8')).scripts;
const files=['README.md','supabase/functions/README.md'];
async function collect(dir){for(const name of await readdir(dir)){const path=resolve(dir,name);if((await stat(path)).isDirectory())await collect(path);else if(name.endsWith('.md'))files.push(path);}}
await collect('docs');
const issues=[];let links=0,commands=0;
for(const file of files){const text=await readFile(file,'utf8');
  for(const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
    let target=match[1].replace(/^<|>$/g,'');if(/^(https?:|mailto:|#)/.test(target))continue;
    target=decodeURIComponent(target.split('#')[0]);if(!target)continue;
    try{await access(resolve(dirname(file),target));links++;}catch{issues.push(`${file}: enlace local inexistente ${target}`);}
  }
  for(const match of text.matchAll(/npm(?:\.cmd)? run ([a-zA-Z0-9:_-]+)/g)){commands++;if(!scripts[match[1]])issues.push(`${file}: comando inexistente ${match[1]}`);}
}
const expected={
  '.env.example':['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_APP_URL'],
  'supabase/functions/.env.example':['APP_ALLOWED_ORIGINS','APP_BASE_URL','RATE_LIMIT_IP_SOURCE','RATE_LIMIT_HMAC_SECRET','FETCH_PROXY_URL','FETCH_PROXY_HMAC_SECRET','APP_LOCAL_FETCH_PROXY'],
  'server/product-fetch/.env.example':['FETCH_PROXY_HMAC_SECRET','FETCH_PROXY_CALLBACK_URL'],
};
for(const [file,keys] of Object.entries(expected)){
  const env=Object.fromEntries((await readFile(file,'utf8')).split(/\r?\n/).filter((line)=>/^[A-Z_]+=/.test(line)).map((line)=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
  for(const key of keys)if(!(key in env))issues.push(`${file}: falta ${key}`);
  assert.equal(Object.keys(env).length,keys.length,`${file}: revisar variables inesperadas`);
  for(const [name,value] of Object.entries(env))if(/SECRET|KEY/.test(name)&&!value.startsWith('REPLACE_'))issues.push(`${file}: marcador requerido para ${name}`);
}
for(const path of ['.env.local','supabase/functions/.env.local','server/product-fetch/.env.local','backups/test.sql','test.dump','.vercel/project.json']){
  const result=spawnSync('git',['check-ignore',path],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,`${path} debe estar ignorado`);
}
assert.deepEqual(issues,[],'Revisión de enlaces/comandos/variables requerida');
console.log(`OK documentación: ${files.length} archivos, ${links} enlaces locales, ${commands} referencias npm y tres plantillas de variables; entornos y respaldos ignorados.`);
console.log('Sin consultas remotas ni lectura de archivos de credenciales reales.');
