# T14: imágenes autorizadas y limpieza

Implementado y probado **solo en local**. No se vinculó ni modificó la instancia remota. La foto de perfil utiliza el mismo servidor con propósito `avatar`; su formulario sigue en T18. El servidor de importación se completó en [T16](product-import.md); su interfaz continúa en T17.

## Archivos creados o modificados en T14

| Archivos | Cambio |
| --- | --- |
| `supabase/migrations/20261027214226_protected_media_lifecycle.sql`, `20261027215115_media_cleanup_compatibility.sql` | Reservas, asociación protegida, gracia y limpieza con reclamaciones/reintentos. |
| `supabase/functions/_shared/image-inspection.ts`, `media-handler.ts` | Validación binaria y frontera HTTP autorizada. |
| `supabase/functions/media-upload/index.ts`, `codec.ts`, `vendor/` | Adaptador de servidor, procesamiento WASM, licencias y manifiesto de hashes. |
| `supabase/config.toml`, `supabase/functions/.env.example`, `supabase/functions/README.md` | Función habilitada localmente, archivos estáticos y orígenes locales de ensayo. |
| `src/services/media-upload.ts`, `private-session.ts`, `src/app/PrivateAccessProvider.tsx` | Transporte binario con credencial en memoria, cancelación y control de ámbito. |
| `src/hooks/useGiftEditor.ts`, `src/components/editor/GiftImageField.tsx`, `GiftEditor.tsx`, `src/styles/gift-editor.css` | Selector, preview, errores y guardado bloqueado durante subida. |
| `scripts/cleanup-media-local.mjs`, `vendor-image-codecs.mjs`, `generate-image-fixtures.mjs` | Mantenimiento local con simulación, preparación reproducible de códecs y fixtures. |
| `scripts/test-media-http.mjs`, `test-media-concurrency.mjs`, `test-media-ui-local.mjs` | Pruebas reales de Edge/Storage/SQL y navegador local. |
| `supabase/tests/database/004_media.sql`, `001_contract.sql`, `tests/fixtures/supabase-platform.sql` | Nuevas pruebas SQL; rechazo de pertenencia 42501 antes de FK; fecha de objetos para probar huérfanos. |
| `tests/unit/images.test.ts`, `media-client.test.ts`, `tests/ui/media-upload.spec.ts`, `fixtures/gift-editor.ts`, `tests/fixtures/images/` | Archivos sintéticos, pruebas del procesador, sesión, transporte e interfaz. |
| `vite.config.ts`, `scripts/preview-catalogue.mjs` | Cachés de optimización separadas para las vistas temporales y el navegador real de prueba. |
| `package.json`, `package-lock.json`, README y documentación de avance/integración/validación | Versiones fijadas, comandos y resultados de T14. |

## Archivos y acceso

El editor permite seleccionar JPEG, PNG o WebP estáticas, con vista previa tras confirmar la subida. Rechaza GIF, SVG, animaciones APNG/WebP, MIME falso, archivos truncados, más de **3 MiB** o **16 millones de píxeles**. La inspección previa de firma, contenedor y dimensiones ocurre antes de asignar los buffers del decodificador. El servidor decodifica los píxeles completos y vuelve a codificar a WebP; la inspección del navegador es solo una ayuda.

Se aplica la orientación EXIF de JPEG y se eliminan metadatos al codificar únicamente píxeles. No se conserva el nombre original. El lado mayor queda en un máximo de 1200 px para regalos y 512 px para avatares, sin ampliar imágenes pequeñas. Los objetivos del codificador son 250 000/100 000 bytes. Como esos objetivos son aproximados, se comprueban techos de salida de 400 000/150 000 bytes; nunca se guarda el archivo original como alternativa.

`media-upload` recibe POST binario con `Content-Type`, `X-Edit-Token`, `X-Participant-Id` y `X-Media-Purpose: gift|avatar`. No admite credenciales en query ni rutas elegidas por el cliente. CORS exige un origen configurado y exacto; las respuestas son `no-store`. `verify_jwt=false` permite los enlaces privados sin cuentas Auth: la autorización real se valida en PostgreSQL, no con la clave pública del navegador.

1. `server_media_upload('reserve', …)` limita solicitudes y valida hash, expiración, revocación y pertenencia **antes de leer el cuerpo**. Genera `participante/gift|avatar/UUID.webp` y una reserva no asociable.
2. El handler limita también los bytes recibidos en streaming y el tiempo de lectura, decodifica, reduce y recodifica. Storage recibe un objeto nuevo, sin upsert, con la clave interna del servidor.
3. `complete` vuelve a validar el acceso después de procesar/subir y exige el token que creó la reserva. Solo entonces el archivo queda disponible para asociarlo.
4. **Guardar regalo** asocia la ruta dentro de la transacción autorizada de T08. El trigger verifica registro, propietario, propósito, finalización y ausencia de una reclamación de limpieza. Las claves foráneas mantienen la pertenencia.

La subida no guarda el regalo. Un error de formulario, conflicto o descarte conserva el regalo anterior. El formulario bloquea guardar/subir de nuevo mientras hay una carga, conserva el borrador en fallos y descarta respuestas tardías tras cerrar el acceso. Los errores no contienen detalles SQL ni credenciales. Los objetos pendientes se limpian después, incluyendo una subida de resultado incierto; no se borra precipitadamente un archivo ante un timeout.

Las cuotas iniciales de T14 son seis reservas por hash/minuto, 120 globales/minuto y doce archivos pendientes por participante. T15 añade diez cargas/hora por token, barrera de entrada, esperas horarias y limpieza de contadores; ver [políticas vigentes](rate-limits.md). Se cuentan también intentos rechazados. Un archivo inválido puede dejar una reserva sin objeto y consumir temporalmente uno de esos espacios.

## Prueba del procesador en Edge: parte de T01

Se eligieron los decodificadores WASM de jSquash JPEG **1.6.0**, PNG **3.1.1** y WebP **1.5.0**, y su codificador WebP. Son dependencias de desarrollo fijadas en el lockfile; el runtime utiliza archivos incluidos en `media-upload/vendor`, sin imports de CDN ni descargas de códecs en ejecución. Se incluyen licencias y hashes SHA-256. `npm run vendor:images` reproduce los archivos desde esos paquetes. La única adaptación del código generado PNG libera las referencias a su heap entre operaciones; está explícita en ese script. Los decodificadores y el codificador tampoco se conservan entre solicitudes, y cada isolate admite una normalización a la vez.

Se ejecutó el handler real en **supabase-edge-runtime 1.77.8 / Deno 2.1.4**, con Storage y PostgreSQL 17 locales. El bootstrap de la CLI configuró **256 MB**, límite blando de CPU de 1000 ms y duro de 2000 ms. Las pruebas usaron también PNG RGBA de 16 bits. Resultados de una repetición completa:

| Entrada sintética | Dimensiones de entrada | Resultado regalo | Tiempo HTTP local |
| --- | --- | --- | --- |
| JPEG | 4000 × 4000 | 1200 × 1200, 21 404 bytes | 667 ms |
| PNG | 4000 × 4000 | 1200 × 1200, 12 190 bytes | 825 ms |
| WebP | 4000 × 4000 | 1200 × 1200, 21 444 bytes | 681 ms |
| PNG RGBA16 | 4000 × 4000 | 1200 × 1200, 2814 bytes | 797 ms |

También se comprobó avatar de 96 × 64, que conserva dimensiones y ocupa 158 bytes. Los tiempos incluyen arranque, PostgreSQL y Storage; **no son mediciones aisladas de CPU, picos de memoria ni garantías de latencia de producción**. El runtime retiró workers al alcanzar su límite blando durante las repeticiones, sin fallar las operaciones comprobadas; no se aumentaron límites para hacer pasar los ensayos. Las pruebas unitarias cubren orientación EXIF, corrupción de píxeles, MIME, animaciones y dimensiones, además de decodificar los tres formatos.

Esta evidencia permite mantener el procesador en Edge para T14. No completa la parte SSRF/DNS/TLS de T01, necesaria antes de T16. Las referencias oficiales consultadas son [límites de Edge](https://supabase.com/docs/guides/functions/limits), [WASM](https://supabase.com/docs/guides/functions/wasm) y [jSquash](https://github.com/jamsinclair/jSquash).

La validación final reunió 58 pruebas unitarias, 201 aserciones SQL en memoria y Docker, 11 tests de datos, 162 pruebas UI y el recorrido real del navegador contra Supabase local. Se comprobaron los hashes de los quince archivos de código/binarios/licencias del manifiesto. La revisión de cambios oficiales incluyó [TLS HTTP](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) y [PostgreSQL 17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes); no se añadieron cifrados antiguos, extensiones ni operadores afectados en T14. Esto no sustituye revisar la versión de la instancia remota antes de una futura aplicación autorizada.

## Limpieza y reintentos

`private.media_deletions` es una cola privada con RLS y marcas permanentes de retirada. Las RPC de subida y mantenimiento son `SECURITY INVOKER`, con `search_path` fijo y EXECUTE únicamente para `service_role`; no están disponibles para `anon`/`authenticated`. Ninguna Edge Function ofrece un endpoint de limpieza.

El mantenimiento busca pendientes sin uso durante 24 horas, objetos de Storage sin registro durante 24 horas y reclamaciones que deban reintentarse. Al reemplazar una imagen se inicia una **nueva** gracia de 24 horas. Detecta también objetos cuyos participantes fueron eliminados. Solo considera rutas canónicas de esta aplicación y bucket; incluye las extensiones jpg/png del esquema original, aunque las nuevas cargas siempre producen WebP. Ignora URLs externas y nombres ajenos al patrón.

Antes de borrar, `claim` bloquea participante y archivo en el mismo orden que el guardado y vuelve a consultar todas las referencias. La marca permanente impide nuevas asociaciones mientras Storage y PostgreSQL realizan sus operaciones separadas. El script borra **por Storage API**, nunca mediante DELETE en `storage.objects`. `finish` exige el recibo de la reclamación y que el objeto ya no figure en Storage. Si falla la eliminación o el proceso termina, la reclamación sigue disponible para reintentar. Se conserva la marca después del éxito para impedir resucitar una ruta con una respuesta atrasada.

El script acepta únicamente Docker local y `127.0.0.1:54321`, obtiene la clave interna sin imprimirla y no lee `.env.local`. No acepta URL, clave ni proyecto remoto como argumento. Por defecto **solo muestra candidatos**, hasta cien por lote:

```powershell
npm.cmd run cleanup:local
# Revisar las rutas; el siguiente comando elimina SOLO los candidatos locales elegibles:
npm.cmd run cleanup:local -- --apply
```

La aplicación global de limpieza no se ejecutó durante esta iteración. La prueba HTTP reclamó y retiró exclusivamente sus propios archivos temporales, comprobó el rechazo de confirmación antes del borrado, reintentó y retiró un huérfano tras borrar su participante. Dos conexiones PostgreSQL comprobaron ambas carreras: asociación primero protege el objeto; reclamación primero impide asociarlo. Para un futuro mantenimiento remoto deberá revisarse y autorizarse un ejecutor de servidor equivalente. No se ha configurado cron ni acceso privilegiado de navegador. Ver [borrado oficial de objetos](https://supabase.com/docs/guides/storage/management/delete-objects).

## Ejecutar y revisar en local

Las dos migraciones nuevas se aplicaron únicamente al contenedor local, sin reset ni seed. Para reproducir en otro entorno local:

```powershell
npm.cmd install
npm.cmd run supabase -- start
npm.cmd run supabase -- migration up --local
npm.cmd test
npm.cmd run test:db:local
npm.cmd run supabase -- db lint --local --schema public,private --level warning --fail-on warning
npm.cmd run supabase -- db advisors --local --type all --level warn --fail-on warn
```

En una terminal deja las funciones ejecutándose y en otra ejecuta los ensayos locales:

```powershell
npm.cmd run functions:local
```

```powershell
npm.cmd run test:media:http
npm.cmd run test:media:concurrency
npm.cmd run test:media:ui:local
npm.cmd run test:ui
npm.cmd run build
```

Los tests SQL hacen rollback; HTTP/concurrencia crean identificadores y enlaces efímeros y eliminan sus propios datos al terminar. No incorporan regalos a los once participantes. Los fixtures binarios están en `tests/fixtures/images`; `node scripts/generate-image-fixtures.mjs` permite regenerarlos con Edge headless instalado.

`test:media:ui:local` ejecuta un Vite propio en **127.0.0.1:5175** con URL y clave pública del contenedor local, sin reusar el servidor del usuario ni modificar sus archivos de entorno. El origen 5175 está permitido explícitamente en el ejemplo de funciones. Con Edge headless se verificó el recorrido navegador → Edge → Storage → SQL: subir sin guardar todavía, guardar y reemplazar manteniendo el archivo anterior hasta confirmar. El script cierra su navegador/Vite y elimina exclusivamente su participante y archivos efímeros.

Para probar el formulario con archivos, revisa que `.env.local` del frontend apunte a **Supabase local**, con su clave pública y `VITE_APP_URL=http://localhost:5173`; después ejecuta `npm.cmd run dev -- --host 127.0.0.1 --port 5173`. Usa un enlace privado local válido según [la guía de acceso](private-access.md). No se modificó tu `.env.local` ni se generó un enlace permanente. `preview:local` sigue siendo una vista con lecturas temporales: permite revisar el catálogo, pero no autoriza subidas reales. La vinculación y revisión futura de la instancia remota están documentadas en [integración Supabase](supabase-integration.md); deben preceder a cualquier aplicación remota o despliegue autorizado.
