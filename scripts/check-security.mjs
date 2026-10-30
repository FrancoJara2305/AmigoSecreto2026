import { spawnSync } from 'node:child_process';
import { readFile,readdir,stat } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

if(process.argv.length!==2)throw new Error('Comprobación de seguridad sin argumentos. Ejecuta build antes.');
const git=(args)=>{const result=spawnSync('git',args,{encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error('Git no disponible');return result.stdout;};
const files=[...new Set(git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean))];
const issues=[];
function inspect(text,file){
  if(/sb_secret_[A-Za-z0-9_-]{20,}/.test(text)||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))issues.push(`${file}: posible secreto`);
  for(const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)){
    try{const claims=JSON.parse(Buffer.from(match[1],'base64url').toString());if(['service_role','supabase_admin','postgres'].includes(claims.role))issues.push(`${file}: JWT privilegiado`);}catch{/* not a JWT */}
  }
  if(/#token=[A-Za-z0-9_-]{43}(?:[^A-Za-z0-9_-]|$)/.test(text))issues.push(`${file}: enlace privado literal`);
}
for(const file of files){
  if(/(^|\/)\.env(?:$|\.)/.test(file)&&!file.endsWith('.env.example'))issues.push(`${file}: entorno versionado`);
  if(/\.(?:ts|tsx|mjs|js|json|md|sql|toml|html|css|example)$/.test(file)){
    let text=await readFile(file,'utf8');
    // Exact pre-existing negative fixture; do not exempt other content or all tests.
    if(file==='tests/unit/public-config.test.ts')text=text.replace("'sb_secret_"+"this_must_never_appear'","'redacted-negative-fixture'");
    inspect(text,file);
  }
  if(file.startsWith('src/')&&/\.(?:ts|tsx)$/.test(file)){
    const text=await readFile(file,'utf8');
    if(/dangerouslySetInnerHTML|\beval\s*\(|\.innerHTML\s*=|(?:localStorage|sessionStorage)\.setItem\s*\(/.test(text))issues.push(`${file}: sumidero de HTML/almacenamiento por revisar`);
  }
}
for(const file of ['.env','.env.local','supabase/functions/.env.local'])assert.ok(git(['check-ignore',file]).trim(),`${file} debe estar ignorado`);
const tracked=git(['ls-files','-z']).split('\0');assert.ok(!tracked.some((file)=>/(^|\/)\.env(?:$|\.)/.test(file)&&!file.endsWith('.env.example')));
let assets=0;
async function walk(directory){for(const entry of await readdir(directory)){const file=join(directory,entry);if((await stat(file)).isDirectory())await walk(file);else if(/\.(?:js|html|css|map)$/.test(entry)){const text=await readFile(file,'utf8');inspect(text,file);assets++;if(entry.endsWith('.map'))issues.push(`${file}: source map público`);}}}
await walk('dist');assert.ok(assets>0);
const config=await readFile('supabase/config.toml','utf8');assert.match(config,/\[auth\]\s*enabled = false/);assert.match(config,/enable_signup = false/);assert.match(config,/schemas = \["public"\]/);
for(const name of ['wishlist-api','media-upload','product-metadata'])assert.match(config,new RegExp(`\\[functions\\.${name}\\]\\s*enabled = true\\s*verify_jwt = false`));
assert.equal(issues.length,0,`Revisión requerida (sin imprimir valores):\n${issues.join('\n')}`);
const invalidBuild=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir','artifacts/security-invalid-build'],
  {env:{...process.env,VITE_SERVICE_ROLE_KEY:'negative-fixture'},encoding:'utf8',timeout:30000,windowsHide:true});
assert.ok(!invalidBuild.error&&invalidBuild.status!==0,'El build debe rechazar variables privilegiadas públicas');
assert.match(invalidBuild.stdout+invalidBuild.stderr,/No se permiten secretos en variables VITE_/);
assert.ok(!(invalidBuild.stdout+invalidBuild.stderr).includes('negative-fixture'));
console.log(`OK revisión estática: ${files.length} archivos de entrega y ${assets} assets del build; sin patrones de secretos, enlaces privados literales, entornos versionados ni sumideros HTML/almacenamiento en src.`);
console.log('OK build rechaza variables privilegiadas públicas sin revelar valores; Auth convencional desactivado, esquema expuesto public y entornos locales ignorados. Los permisos se prueban con test:security:local.');
