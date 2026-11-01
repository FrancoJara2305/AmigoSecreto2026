param([switch]$Open,[switch]$Check,[switch]$Import)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$root=Split-Path $PSScriptRoot -Parent
$directory=Join-Path $root 'artifacts/deployment/production'
$path=Join-Path $directory 'organizer-access.dpapi.local'
$origin='https://amigo-secreto2026.vercel.app'
$entropy=[Text.Encoding]::UTF8.GetBytes('AmigoSecreto2026:production:jtuhcilcnuydsbcbsazo:v1:organizer-access')
$scope=[Security.Cryptography.DataProtectionScope]::CurrentUser
if($Check -and ($Open -or $Import)){throw 'Usa -Check por separado, o -Import con -Open opcional.'}
if(!$Open -and !$Check -and !$Import){Write-Output 'Usa -Open para abrir el acceso guardado; -Import para reemplazarlo por un enlace que conservas; -Check para comprobar el archivo cifrado.';return}
try {
 if($Import){
  $secure=Read-Host 'Pega el enlace NUEVO del organizador (entrada oculta, no se guarda en el historial)' -AsSecureString
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {$link=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
  $uri=$null
  if(![Uri]::TryCreate($link,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.Host -ne 'amigo-secreto2026.vercel.app' -or !$uri.IsDefaultPort -or $uri.UserInfo -or $uri.Query -or $uri.AbsolutePath -ne '/organizador/acceso' -or $uri.Fragment -notmatch '^#token=([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$'){
   throw 'El enlace no tiene el formato productivo del organizador. Se conserva el archivo anterior.'
  }
  $token=$Matches[1]
  $access=@{projectRef='jtuhcilcnuydsbcbsazo';appOrigin=$origin;token=$token;savedAtUtc=[DateTime]::UtcNow.ToString('o')}
  $plain=[Text.Encoding]::UTF8.GetBytes(($access | ConvertTo-Json -Compress))
  $cipher=[Security.Cryptography.ProtectedData]::Protect($plain,$entropy,$scope)
  $roundtrip=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$entropy,$scope)
  if([Convert]::ToBase64String($plain) -ne [Convert]::ToBase64String($roundtrip)){throw 'No se pudo verificar el cifrado. Se conserva el archivo anterior.'}
  [void][IO.Directory]::CreateDirectory($directory)
  $temporary=Join-Path $directory ('organizer-access.'+[Guid]::NewGuid().ToString('N')+'.dpapi.local')
  [IO.File]::WriteAllBytes($temporary,$cipher)
  if(Test-Path -LiteralPath $path){$previous=Join-Path $directory ('organizer-access.previous.'+[Guid]::NewGuid().ToString('N')+'.dpapi.local');[IO.File]::Replace($temporary,$path,$previous)}else{[IO.File]::Move($temporary,$path)}
  Write-Output 'Enlace nuevo guardado cifrado en este equipo. Importar no genera ni rota enlaces en el servidor.'
 } else {
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path),$entropy,$scope)
  $access=[Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json
 }
 if($access.projectRef -ne 'jtuhcilcnuydsbcbsazo' -or $access.appOrigin -ne $origin -or $access.token -notmatch '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'){throw 'El archivo no corresponde al acceso productivo esperado.'}
 if($Check){Write-Output 'Archivo cifrado legible y con formato correcto. Esta comprobacion local no certifica que el enlace siga vigente en el servidor.'}
 if($Open){Start-Process -FilePath ($origin+'/organizador/acceso#token='+$access.token);Write-Output 'Organizador abierto con el enlace guardado. Si lo rotaste, importa el nuevo con -Import.'}
} finally {
 if($plain){[Array]::Clear($plain,0,$plain.Length)}
 if($roundtrip){[Array]::Clear($roundtrip,0,$roundtrip.Length)}
 $link=$null;$token=$null;$access=$null;$secure=$null
}
