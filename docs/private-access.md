# T07 — Enlaces privados sin cuentas

Implementado y verificado únicamente en Supabase local. No se desplegaron cambios remotos ni se crearon usuarios de Supabase Auth. La interfaz para abrir/administrar los enlaces corresponde a T12/T20; los mecanismos de servidor ya funcionan.

## Qué está disponible

- Tokens de 32 bytes aleatorios (256 bits), codificados como 43 caracteres base64url canónicos.
- SHA-256 del texto del token en `private.access_tokens`. El token original no se envía a PostgreSQL, no se guarda en archivos y no aparece en respuestas de validación.
- Bootstrap inicial y recuperación del organizador mediante un comando de mantenimiento fijado al contenedor Docker local.
- Validación de rol y propietario; expiración opcional; emisión, reemplazo y revocación de enlaces personales; rotación del organizador.
- Una sola credencial no revocada por participante y una de organizador. Reemplazar o recuperar revoca la anterior atómicamente.
- Errores de enlace desconocido, revocado y expirado con la misma respuesta 401. Un participante no puede emitir enlaces, revocarlos ni administrar a otra persona.

El enlace es una credencial transferible. Quien lo reciba podrá usar sus permisos; revocarlo permite cortar ese acceso. Sin fecha explícita dura hasta revocación.

## Iniciar localmente

La migración `20261027045044_private_access_lifecycle.sql` ya se aplicó al contenedor local durante la implementación. Para otro checkout/entorno local:

```powershell
npm run supabase -- start
npm run supabase -- migration up --local
```

En una terminal, mantener la función local iniciada:

```powershell
npm run functions:local
```

Sirve `http://127.0.0.1:54321/functions/v1/wishlist-api`. El archivo de entorno usado contiene solamente orígenes locales y configuración de ejemplo. El runtime inyecta las credenciales de servidor de su propia pila; nunca se requieren claves privilegiadas en Vite. Para personalizar los orígenes, usar un archivo Edge local ignorado y `--env-file`, sin cambiar las variables del frontend.

En otra terminal, generar el primer acceso del organizador:

```powershell
npm run organizer:bootstrap
```

Imprime una sola vez un enlace con este formato: `http://localhost:5173/organizador/acceso#token=…`. Guardarlo en un lugar privado. No compartirlo en capturas, repositorios o mensajes públicos. El script no necesita una clave real ni lee `.env`; usa PostgreSQL dentro del contenedor local.

Si ya se inicializó, el comando falla sin rotar el token existente. Para recuperar un enlace perdido, ejecutar explícitamente:

```powershell
npm run organizer:bootstrap -- --recover
```

**La recuperación revoca el enlace anterior.** Si se perdió la respuesta después de una rotación o bootstrap, este mismo comando crea un reemplazo. No hay recuperación del token original desde un hash.

Opcional: `--app-url http://localhost:5174` cambia el origen del enlace generado; no cambia la base de datos de destino. No se admiten credenciales ni una URL PostgreSQL. Los tokens no se pasan como argumentos a comandos.

Las rutas `/acceso` y `/organizador/acceso` aún no tienen pantalla funcional. Abrir el enlace en React no administra todavía la lista: T12 conectará la captura del fragmento y la memoria de la pestaña. Crear el enlace ahora prepara el acceso, pero no implementa el catálogo ni el panel.

## Contrato de la API de acceso

POST JSON, `Content-Type: application/json`, token original en `X-Edit-Token`. No ponerlo en query string, Authorization ni cuerpos registrados. Los fragmentos de enlaces no llegan al servidor HTTP. La aplicación cliente deberá extraerlos, limpiar la URL y conservarlos solo en memoria cuando se implemente T12.

| `action` | Campos adicionales | Permiso | Resultado |
| --- | --- | --- | --- |
| `validate_access` | `participant_id` opcional | Token válido; si es personal debe corresponder a ese UUID | `access` con rol, participante/slug, id de credencial y expiración; sin hash ni enlace. |
| `issue_participant_link` | `participant_id`, `expires_at` opcional | Organizador | `private_link` nuevo, id y expiración. Revoca el enlace anterior de esa persona. |
| `revoke_participant_link` | `participant_id` | Organizador | Número de enlaces revocados; es idempotente si ya no hay uno vigente. |
| `rotate_organizer_link` | `expires_at` opcional | Organizador | Nuevo enlace privado; el anterior deja de funcionar al confirmar la transacción. |

`expires_at` es ISO UTC, por ejemplo `2026-12-25T23:59:00Z`. La base rechaza fechas pasadas o infinitas; el handler rechaza formatos ambiguos y fechas inexistentes. Se ignoran las cookies como mecanismo de acceso y no se aceptan flags como `is_admin`. Los campos desconocidos se rechazan.

No existen acciones HTTP de bootstrap/recuperación ni CRUD de participantes/regalos. Los endpoints de importación y upload continúan deshabilitados. Todas las respuestas de acceso usan `no-store`; no se registran cuerpos ni tokens.

## Separación de permisos

`private.require_access` bloquea la fila de la credencial con `FOR SHARE`, comprueba revocación/expiración después de adquirir el bloqueo y puede exigir propietario u organizador. T08 deberá llamarla dentro de la misma transacción que modifica datos; una validación HTTP anterior no reemplaza ese control.

`private.bootstrap_organizer` queda reservado al propietario PostgreSQL. `service_role` tampoco tiene EXECUTE sobre ese helper. El comando de mantenimiento no tiene variante remota.

`public.server_access` es un puente RPC **solo para `service_role`**, con SECURITY INVOKER y `search_path` fijo. Evita exponer el esquema privado o añadir un driver de PostgreSQL al runtime Edge. Aunque la función está en un esquema expuesto, anon/authenticated/PUBLIC carecen de EXECUTE; sus llamadas directas fallan. No contiene SQL dinámico ni acepta nombres de tablas/acciones arbitrarios. Los tipos del cliente público no incluyen esta función de servidor.

El backend usa su credencial privilegiada únicamente en una petición interna a esa RPC. Solo se envían hashes; la respuesta autorizada de emisión incorpora el nuevo enlace generado en memoria por Edge.

Se conserva `private` fuera de los esquemas expuestos. Las tablas públicas mantienen únicamente SELECT para visitantes; conocer un token no permite escribir por la Data API.

Referencias: [permisos de funciones](https://supabase.com/docs/guides/database/functions), [esquemas expuestos](https://supabase.com/docs/guides/api/using-custom-schemas) y [autenticación de Edge Functions](https://supabase.com/docs/guides/functions/auth-headers). La desactivación de `verify_jwt` en wishlist-api permite usar la credencial propia; la autorización obligatoria se implementa en su handler y RPC.

## Revocación, concurrencia y frecuencia

Las operaciones de ciclo de vida se serializan con un advisory lock para este evento pequeño. El orden es cuota → bloqueo del ciclo de vida → credencial del actor → destino. No hay tablas de sesiones ni JWT propios.

La prueba con conexiones separadas mantiene una transacción autorizada abierta, observa en `pg_stat_activity` que la revocación está esperando un lock, libera la transacción y comprueba que una validación posterior devuelve 401. Se verificó en PostgreSQL de Docker, no solo en PGlite.

T07 añade una cuota mínima de acceso persistida en PostgreSQL: 30 solicitudes por minuto y hash, y 120 por minuto para todo el evento. Los intentos fallidos consumen cuota; los contadores no se revierten cuando el bloque de autorización falla. La cuota global también limita el cambio continuo de tokens o IPs; no se confía en un `X-Forwarded-For` del cliente. Los excesos devuelven 429 y `Retry-After`. Cuerpos de hasta 4 KiB, acciones/campos cerrados y timeout de la RPC de 5 segundos.

Esto adelanta únicamente la protección necesaria de acceso; T15 completará cuotas específicas de mutación, importación y archivos. No se declara terminada esa tarea.

## Validación reproducible

Sin Docker:

```powershell
npm test
npm run build
```

Con Supabase local y la función iniciados:

```powershell
npm run test:db:local
npm run test:access:concurrency
npm run test:access:http
```

El contrato SQL usa transacciones con ROLLBACK, incluyendo una recuperación temporal del organizador. Ejecutarlo solo en el entorno local de prueba, sin personas usando simultáneamente sus enlaces. Las pruebas de concurrencia y HTTP crean identidades aleatorias temporales y las limpian al finalizar. No imprimen tokens, enlaces reales ni hashes. Las cuotas globales locales pueden registrar esos pocos intentos de prueba hasta que venza la ventana.

Resultados de T07: 127 aserciones SQL; generación, canonicalización, hashing, respuestas, CORS, validaciones y secretos verificados por pruebas Node; bootstrap/reemplazo/expiración/rotación/recuperación probados en la base local; concurrencia entre sesiones e integración HTTP real en Edge Runtime. Lint y asesores de seguridad locales sin problemas reportados.

No se ejecutó el bootstrap persistente para el usuario: el enlace inicial debe generarse manualmente en su terminal para que no aparezca en el historial de herramientas de esta conversación. Las pruebas verificaron el bootstrap dentro de transacciones revertidas. El siguiente bloque es T08, mutaciones protegidas de perfil y regalos.
