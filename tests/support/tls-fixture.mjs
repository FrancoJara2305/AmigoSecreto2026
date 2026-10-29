import { spawnSync } from 'node:child_process';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export async function tlsFixture() {
  const directory=new URL('../../artifacts/tls-fixture/',import.meta.url);await mkdir(directory,{recursive:true});
  const openssl=process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl';
  const key=fileURLToPath(new URL('key.pem',directory)),cert=fileURLToPath(new URL('cert.pem',directory));
  const ca=fileURLToPath(new URL('ca.pem',directory)),caKey=fileURLToPath(new URL('ca-key.pem',directory)),csr=fileURLToPath(new URL('request.csr',directory)),ext=fileURLToPath(new URL('extensions.cnf',directory));
  await writeFile(ext,'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:shop.example.com\n');
  for(const args of [
    ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',caKey,'-out',ca,'-days','1','-subj','/CN=Local test CA','-addext','basicConstraints=critical,CA:TRUE'],
    ['req','-newkey','rsa:2048','-nodes','-keyout',key,'-out',csr,'-subj','/CN=shop.example.com'],
    ['x509','-req','-in',csr,'-CA',ca,'-CAkey',caKey,'-CAcreateserial','-out',cert,'-days','1','-extfile',ext],
  ]){const result=spawnSync(openssl,args,{encoding:'utf8',windowsHide:true,timeout:15000});if(result.error||result.status!==0)throw new Error('OpenSSL es necesario para generar certificados sintéticos locales.');}
  return {directory:fileURLToPath(directory),key:await readFile(key,'utf8'),cert:await readFile(cert,'utf8'),ca:await readFile(ca,'utf8')};
}
