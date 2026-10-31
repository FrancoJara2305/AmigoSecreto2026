# Entornos, variables y secretos

Las tres plantillas se versionan sin credenciales. Los archivos de trabajo `.env.local` están ignorados por Git. No sobrescribir uno existente. Desde PowerShell, solo si faltan:

```powershell
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
if (!(Test-Path supabase/functions/.env.local)) { Copy-Item supabase/functions/.env.example supabase/functions/.env.local }
if (!(Test-Path server/product-fetch/.env.local)) { Copy-Item server/product-fetch/.env.example server/product-fetch/.env.local }
```

No hace falta copiar nada para `preview:local`, pruebas en memoria, `test:admin:ui:local`, `test:security:local`, `test:recovery:local` o `measure:performance`: preparan sus propios entornos sintéticos. El proyecto configurado en `supabase/config.toml` es **local**, no el Project Ref alojado.

## Frontend público: .env.local

| Variable | Local | Uso |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `http://127.0.0.1:54321` | API de la pila local. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave publishable o JWT **anon** local | Se envía al navegador; no otorga escritura por sí sola. |
| `VITE_APP_URL` | `http://localhost:5173` | Origen de enlaces generados/validados. Si se omite, usa el origen del navegador. |

Las URLs deben ser orígenes sin rutas, query, fragmento o credenciales; HTTP solo para loopback. El cliente público PostgREST consulta `public` sin Auth, cookies, renovación ni sesión persistente. Las escrituras usan Edge y enlaces privados. Nunca añadir claves de servidor, contraseñas o tokens a variables `VITE_*`; el build rechaza esa configuración.

Obtén **solo la clave pública** de Studio local o, con Supabase activo, filtra la salida de la CLI en tu terminal:

```powershell
npm.cmd run supabase -- status --output env 2>$null | Where-Object { $_ -match '^ANON_KEY=' } | ForEach-Object { $_ -replace '^ANON_KEY=', 'VITE_SUPABASE_PUBLISHABLE_KEY=' }
```

Copia esa línea al archivo local; no compartas la salida completa de `status`, que puede incluir credenciales privilegiadas. No copies datos reales a las plantillas. Reinicia Vite al cambiar variables.

## Edge: supabase/functions/.env.local

| Variable | Valor/comportamiento |
| --- | --- |
| `APP_ALLOWED_ORIGINS` | Lista separada por comas de orígenes exactos. Local habitual: `http://localhost:5173,http://127.0.0.1:5173`. Sin `*`, rutas o slash final. El ejemplo mantiene también 5175 para el ensayo antiguo de medios. |
| `APP_BASE_URL` | Origen canónico de enlaces privados, igual al usado para abrir la aplicación; local `http://localhost:5173`. |
| `RATE_LIMIT_IP_SOURCE` | `off` en local y hasta verificar la sanitización del proveedor. Ignora cabeceras IP reenviadas; siguen cuotas globales y por token. |
| `RATE_LIMIT_HMAC_SECRET` | Secreto de servidor de 32 bytes base64url, compartido por las tres Edge si se habilita el modo IP verificado. El marcador no se usa con `off`. |
| `FETCH_PROXY_URL` | Vacío deja importación sin configurar. Para proxy local: `http://host.docker.internal:54801/fetch-product`. |
| `FETCH_PROXY_HMAC_SECRET` | Secreto de 32 bytes base64url, idéntico al del proxy Node. Separado del secreto de identidad IP. |
| `APP_LOCAL_FETCH_PROXY` | Predeterminado `0`; `1` solo para el HTTP local entre Docker Desktop y el host. Nunca habilitarlo en el entorno alojado. |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son inyectadas por CLI/runtime; no copiarlas a frontend o plantillas. No crear secretos personalizados con el prefijo reservado `SUPABASE_`. Las tres funciones tienen `verify_jwt=false` porque aplican autorización propia en SQL, no cuentas Auth; esto no elimina la exigencia de capacidad privada. Sin orígenes/configuración válida fallan cerradas.

`npm.cmd run functions:local` usa el ejemplo: permite acceso, edición y carga locales; el importador devuelve error controlado porque no tiene transporte configurado. Para usar tus valores:

```cmd
npm.cmd run supabase -- functions serve --env-file supabase/functions/.env.local
```

## Proxy Node: server/product-fetch/.env.local

Solo requiere `FETCH_PROXY_HMAC_SECRET` y `FETCH_PROXY_CALLBACK_URL`. El callback local es **exactamente** `http://127.0.0.1:54321/functions/v1/product-metadata`. No poner API keys Supabase, tokens personales o contraseñas en este proceso.

Para habilitar importación local, genera un secreto en tu propia terminal y colócalo en ambos archivos de servidor, sin registrarlo o versionarlo:

```cmd
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Configura Edge con el proxy local y `APP_LOCAL_FETCH_PROXY=1`; deja `RATE_LIMIT_IP_SOURCE=off`. En terminales separadas ejecuta `npm.cmd run fetch-proxy:local` y la función con tu archivo Edge. El proxy escucha en 54801, accesible desde Docker Desktop; toda descarga sigue exigiendo firma y nonce SQL antes de DNS/TLS. La UI importa sugerencias al borrador; únicamente Guardar persiste. No es necesario habilitarlo para editar manualmente.

## Entornos alojados

Staging y producción deberán tener proyectos, claves y orígenes propios. En Vercel frontend solo van las tres variables públicas. El adaptador Node necesita el HMAC y el callback HTTPS **de ese mismo entorno**; Edge necesita la URL HTTPS del adaptador y el HMAC correspondiente, con `APP_LOCAL_FETCH_PROXY=0`. No permitir previews arbitrarias contra producción ni copiar dominios de staging a su CORS. La validación de cabecera IP sigue pendiente antes de activar otro modo.

`prepare:deployment` genera `frontend.env.example`, `edge.env.example` y `fetch-proxy.env.example` bajo `artifacts/deployment/<entorno>/`, con los orígenes indicados y solo marcadores para claves. El generador no lee ni carga secretos. Confirmar el destino antes de sustituir marcadores por el canal seguro. La [revisión de staging](staging-review.md) identifica los proyectos y el inventario aplicado.

**Staging ya está configurado y publicado:** [resultado y acceso seguro](staging-deployment-result.md). Vercel staging tiene cinco variables en su entorno Production (las tres públicas, callback y HMAC Sensitive); ese nombre de entorno pertenece al proyecto staging separado. Edge tiene siete variables de aplicación, CORS/base URL canónicos, callback al mismo Supabase, HMAC nuevos, `RATE_LIMIT_IP_SOURCE=off` y `APP_LOCAL_FETCH_PROXY=0`. No se añadieron claves service_role/DB o capacidades privadas a Vercel. Las claves de servidor del runtime Supabase siguen inyectadas por la plataforma.

Contraseña DB, HMAC y acceso inicial del organizador se conservan cifrados con DPAPI CurrentUser bajo `artifacts/deployment/staging/`, excluido de Git/subidas. El helper `open-organizer.ps1` abre el acceso sin imprimirlo; depende de este usuario/equipo. `.env.local` y los entornos del usuario no cambiaron; no hay link en la raíz. Producción mantiene sus proyectos/credenciales independientes y no se modificó.
