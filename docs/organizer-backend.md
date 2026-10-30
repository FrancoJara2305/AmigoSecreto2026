# T19: administración protegida y enlaces

Implementado y verificado únicamente en local el 30 de octubre de 2026. El panel visual se documenta en [T20](organizer-panel.md). No se consultó ni modificó la instancia remota, ni se generaron credenciales permanentes del usuario.

## Contrato HTTP

Se reutiliza `POST /functions/v1/wishlist-api`, con origen permitido, clave pública de Supabase y `X-Edit-Token` del organizador. El token se transforma en SHA-256 en el servidor. No hay registro en Supabase Auth, endpoint de bootstrap ni flag que conceda administración. La clave privilegiada pertenece exclusivamente al runtime del servidor.

Las solicitudes usan campos cerrados; los campos no documentados se rechazan. Los UUID y versiones se verifican tanto en Edge como en SQL. Las respuestas son `no-store` y nunca incluyen hashes, claves o enlaces privados en los listados.

| Acción | Cuerpo, además de `action` | Resultado |
| --- | --- | --- |
| `admin_list` | `limit` opcional, 1–100; `offset` opcional, entero no negativo | `participants`, `total`, `limit`, `offset`, `event`. |
| `create_participant` | `participant_id` generado por el cliente; `participant` con `name` y campos opcionales | 201 y `participant`. No crea un enlace privado. |
| `update_participant` | `participant_id`, `expected_version`, `participant` con cambios parciales | 200 y `participant` actualizado. |
| `move_participant` | `participant_id`, `expected_version`, `direction` (`up`/`down`), `neighbor_id`, `neighbor_version` | 200, dos `participants` y `reload_required: true`. |
| `delete_participant` | `participant_id`, `expected_version`, `confirm_participant_id` idéntico al primero | 200 y `deleted`: `id`, `slug`, `gifts_removed`, `links_removed`, `media_queued`. |
| `update_event` | `expected_version`, `event` con cambios parciales | 200 y `event` actualizado. |

Cada participante incluye `id`, `name`, `slug`, `photo_path`, `photo_url`, `avatar_key`, `personal_message`, `general_preferences`, `display_order` y `version`. En el listado se añaden `gift_count` y `link`, limitado a `status` (`none`, `active`, `expired`, `revoked`) y `expires_at`. No permite recuperar un token previo. El evento incluye exclusivamente `id`, `title`, `welcome_message`, `exchange_date` y `version`.

## Altas, cambios y orden

El nombre admite hasta 80 caracteres. Al omitir `slug` en el alta, el servidor normaliza acentos y separadores, y añade sufijos `-2`, `-3`, etc. bajo bloqueo para resolver colisiones. Un slug explícito admite hasta 100 caracteres ASCII minúsculos/números separados por guiones; si está ocupado devuelve 409. Cambiar el nombre conserva el slug. Cambiar el slug exige enviarlo expresamente y cambia la URL pública, por lo que el futuro panel debe advertirlo.

El UUID de alta se genera una sola vez por borrador. Ante una respuesta perdida, consultar el listado y reconciliar por ese UUID antes de reenviar. Un alta repetida con el mismo UUID devuelve 409; no crea otra persona. No hay reintentos automáticos de escrituras.

`display_order` es un entero de 0 a 2147483647. Si se omite al crear, se añade al final; se rechaza el desbordamiento. La ordenación pública sigue siendo orden, nombre e ID. `move_participant` exige el vecino actual y las versiones de ambas filas. Con rangos únicos intercambia ambos; con rangos repetidos normaliza la secuencia completa para resolver empates sin perder personas. Puede cambiar versiones de terceros, por eso **siempre se vuelve a cargar el listado**. Un vecino o versión obsoletos devuelve 409.

El organizador también puede modificar los campos públicos de perfil previstos en T18. Se reutilizan sus límites y validación HTTPS/ilustración. Una foto subida debe ser un avatar completado del mismo participante; no se aceptan rutas ajenas, regalos como avatar ni URL y ruta simultáneas. Para una persona nueva, primero crearla, luego subir el archivo con propósito `avatar` y finalmente asociarlo con la versión vigente. El alta no admite una ruta de archivo pendiente.

## Bajas y ajustes

Eliminar requiere UUID confirmado y versión vigente. Dentro de la transacción se eliminan participante, regalos, credenciales personales y reservas asociadas. Las rutas propias se incorporan antes a `private.media_deletions`, cuya cola sobrevive a las cascadas. Incluye objetos registrados y huérfanos reconocidos bajo el prefijo propio del bucket `wishlist-media`. Una subida tardía no puede volver a asociarse a una persona eliminada.

La baja no borra bytes mediante SQL: el mantenimiento de T14 reclama la cola, elimina mediante Storage API y confirma el resultado. Los reintentos cubren objetos que terminen de subirse después de la baja. Hasta que se ejecute esa limpieza, los bytes públicos pueden seguir accesibles por su antigua URL. Nunca se elimina una imagen externa referenciada mediante URL. Ver [mantenimiento de imágenes](media-upload.md).

Los ajustes editables son `title` (1–100 caracteres), `welcome_message` (1–500) y `exchange_date` (fecha de calendario `AAAA-MM-DD`, o `null` para quitarla). Se rechazan fechas inexistentes, horas, zonas e infinitos. No se activa presupuesto ni moneda configurable, reservados fuera del alcance funcional actual.

## Enlaces, permisos y concurrencia

Se conservan las operaciones de [T07](private-access.md): `issue_participant_link`, `revoke_participant_link` y `rotate_organizer_link`. Emitir reemplaza el enlace anterior en una transacción. El enlace nuevo solo se entrega en la respuesta de emisión/rotación; no aparece en `admin_list`. El panel de T20 deberá permitir copiarlo entonces y advertir antes de revocar o rotar.

Las nuevas RPC/helpers son SECURITY INVOKER con `search_path` vacío y EXECUTE exclusivamente para `service_role`; `anon` y `authenticated` carecen de ejecución. La autorización del organizador se comprueba dentro de la misma transacción que escribe. Una credencial personal válida recibe 403 para las seis acciones, aunque apunte a su propia persona.

Las escrituras administrativas comparten el bloqueo de ciclo de vida de T07. El orden común es cuota → ciclo de vida → credencial del actor → credenciales de destino cuando corresponde → participante → media. Las filas de reordenación se bloquean por UUID. La migración de enlaces corrige el orden anterior de emisión/revocación para que una edición personal parcialmente autorizada no forme un ciclo de bloqueos. Se vuelve a verificar la autorización después de esperas por filas; una credencial vencida durante la espera no puede editar, revocar ni rotar.

`admin_list` comparte la cuota de acceso: 120 intentos globales y 30 por token/minuto. Las cinco escrituras comparten la cuota de mutaciones: 240 globales y 60 por token/minuto. Se conserva la barrera HTTP compartida de 600/minuto y las protecciones por red de T15, sin confiar en cabeceras IP aportadas por el cliente. Los intentos rechazados cuentan. Ver [cuotas](rate-limits.md).

Errores: 401 acceso ausente/vencido/revocado; 403 rol insuficiente; 404 participante inexistente; 409 versión, vecindad, UUID o slug en conflicto; 422 campos inválidos; 429 con `Retry-After`. Los errores internos devuelven un mensaje genérico sin SQL, claves ni cuerpos. Antes de reintentar una escritura de resultado incierto, consultar el estado vigente.

## Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20261030121604_protected_organizer_admin.sql` | Helpers privados, RPC administrativa, permisos, bajas y cola de media. |
| `supabase/migrations/20261030124122_organizer_admin_lint_fixes.sql` | Corrección incremental de variable sin uso y literal JSON explícito; conserva las migraciones aplicadas. |
| `supabase/migrations/20261030125225_organizer_link_lock_order.sql` | Orden de bloqueos de enlaces y autorización después de las esperas. |
| `supabase/functions/_shared/admin-validation.ts` | Contratos cerrados y listas explícitas de campos de respuesta. |
| `_shared/access-handler.ts`, `_shared/server-rpc.ts`, `wishlist-api/index.ts` dentro de `supabase/functions/` | Despacho protegido y transporte de `server_admin`. |
| `supabase/tests/database/007_admin.sql`, `tests/unit/admin.test.ts` | Integridad, permisos, contratos y respuestas. |
| `scripts/test-admin-local.mjs`, `tests/support/admin-concurrency.mjs` | Edge/Storage/SQL reales y siete carreras con conexiones separadas. |
| `package.json`, README y guías de avance/validación/integración/enlaces/cuotas/funciones | Comando y documentación. |

Sin dependencias, variables de entorno ni cambios de UI nuevos. El trabajo de T18 ya presente se conserva.

## Reproducir en local

Desde la raíz del repositorio, con Docker Desktop encendido:

```powershell
npm.cmd run test:admin:local
```

Este ensayo no acepta destinos remotos. Crea **AmigoSecretoAdminTest**, separado del proyecto local principal, con API 54421, PostgreSQL 54422 e inspector 8094. Deben estar libres y no debe existir otra pila con ese nombre. Copia las migraciones/funciones a `artifacts/admin-local`, excluyendo archivos `.env*`, y genera únicamente datos y credenciales efímeras propias. No lee ni rota el enlace permanente del organizador. No requiere un proceso `functions:local` previo. Docker puede necesitar descargar imágenes si aún no están en caché. T20 añade únicamente `--ui`, disponible como `npm.cmd run test:admin:ui:local`, para comprobar el panel real en lugar del recorrido HTTP/concurrencia.

Al terminar detiene y retira exclusivamente los contenedores/volúmenes de **AmigoSecretoAdminTest**, sin respaldo de sus datos ficticios. Conserva la pila principal y las copias de código ignoradas por Git. Si se interrumpe forzosamente el proceso, revisar ese proyecto de prueba antes de volver a ejecutarlo; el runner rechaza reutilizar contenedores existentes.

Las tres migraciones se aplicaron únicamente en la instancia local principal, preservando sus datos. Para reproducir esa aplicación en otro entorno local revisado:

```powershell
npm.cmd run supabase -- migration up --local
npm.cmd test
npm.cmd run test:db:local
npm.cmd run supabase -- db lint --local --schema public,private --level warning --fail-on warning
npm.cmd run supabase -- db advisors --local --type all --level warn --fail-on warn
npm.cmd run build
```

El contrato SQL usa transacciones con ROLLBACK, incluyendo cambios temporales en credenciales para comprobar permisos. Ejecutarlo sin usuarios usando simultáneamente la pila de prueba. No ejecutar estos ensayos sobre una base remota. Vinculación, aplicación remota y despliegue permanecen pendientes de revisión y aprobación del usuario, según la [guía de integración](supabase-integration.md).
