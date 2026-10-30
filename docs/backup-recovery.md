# Respaldo y recuperación

Procedimiento operativo preparado en T24 y ensayado solo con datos sintéticos. **No se ha exportado ni restaurado tu instancia principal o remota.** La prueba no acepta URLs, rutas de entrada, credenciales o referencias de proyecto arbitrarias.

## Qué conservar

| Parte | Contenido y comprobación |
| --- | --- |
| Base de aplicación | Esquemas `public` y `private`: participantes, regalos, evento, registro de medios, cola/tombstones, hashes/revocaciones, cuotas y solicitudes de importación; funciones, restricciones, índices, grants/RLS y defaults de aplicación. |
| Storage | Bytes de cada objeto de `wishlist-media`, ruta exacta, tamaño, SHA-256, MIME y cacheControl. Conservar también configuración del bucket y políticas en las migraciones. Una URL externa conserva su referencia en SQL, no sus bytes. |
| Código e historial | Versión/commit o copia revisada, lockfile, migraciones y su historial aplicado, versión PostgreSQL y configuración de funciones. No reconstruir historial suponiendo que toda migración del checkout ya estaba aplicada. |
| Configuración de infraestructura | Orígenes, dominios, publicación, cron si se configura y versiones de runtime. Los secretos se recuperan del almacén seguro o se reemplazan; no van en el repositorio ni en un manifiesto público. |

Un backup SQL de Supabase **no contiene los binarios de Storage**. Restaurar filas no recupera un archivo eliminado. Referencias oficiales: [backups Supabase](https://supabase.com/docs/guides/platform/backups), [backup/restore CLI y copia de Storage](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Crear un respaldo revisable

1. Identificar origen, fecha, versión y responsable; distinguir local/staging/producción. Para origen remoto se requiere la aprobación de T25 **incluso si solo se va a leer**. Confirmar el Project Ref y conexión mediante un canal privado; no pegar contraseñas en comandos del historial.
2. Pausar escrituras, cargas, importaciones y limpiezas en una ventana de mantenimiento coordinada. No basta cerrar tu pestaña. Mantener esa ventana hasta terminar DB y Storage: son servicios separados y no hay snapshot atómico entre ambos.
3. Para una copia manual de la aplicación **local**, con carpeta privada ignorada por Git, la CLI permite:

```cmd
npm.cmd run supabase -- db dump --local --schema public,private --file backups/application-schema.sql
npm.cmd run supabase -- db dump --local --schema public,private --data-only --use-copy --file backups/application-data.sql
npm.cmd run supabase -- migration list --local
```

Estos comandos son una receta manual, **no ejecutada sobre tus datos en T24**. Crear antes la carpeta backups. Las dos exportaciones comparten estado lógico solo si las escrituras están detenidas. Comprobar que los archivos son válidos, registrar el historial y copiar los objetos por Storage API, listando todas las páginas y subcarpetas, no solo los primeros 100/1000 elementos. No copiar únicamente los archivos que aparecen en el perfil: incluir pendientes y cola para poder reconciliarlos.

4. Guardar un manifiesto de rutas, hashes y versión; verificar que el conjunto exportado corresponde a `private.media_assets` y a los objetos del bucket. Los elementos de una cola ya eliminados deben estar identificados como tales, no recrearse automáticamente. Nunca escribir directamente en storage.objects ni copiar el volumen Docker como sustituto de una exportación revisada.
5. Cifrar el respaldo y conservar copia fuera del equipo con acceso restringido. Gitignore evita una inclusión accidental, no cifra ni protege un archivo. Verificar la copia y una restauración de prueba antes de considerarlo recuperable. Propuesta operativa: copia diaria durante uso, una adicional antes de migraciones/bajas masivas y conservación de al menos siete juegos diarios; validar capacidad y política al desplegar. No hay cron contratado/configurado ni garantía de recuperación con ese intervalo todavía.

Para proyectos alojados, usar el flujo oficial de Supabase, sus filtros de roles/esquemas administrados y un destino **nuevo de staging aprobado**; no sustituir `--local` por `--linked` sin revisión. La restauración del proveedor y la del archivo custom de este ensayo son procedimientos diferentes. Roles administrados, contraseñas, configuración de proyecto y binarios no se recrean únicamente con el dump de aplicación.

## Restaurar sin reactivar accesos antiguos

1. Aislar el destino y bloquear escritura/mantenimiento. Conservar también el estado actual antes de cualquier sustitución. Preferir recuperar en un entorno nuevo; no restaurar encima de producción por ensayo y error.
2. Preparar plataforma compatible, extensiones, roles reservados y bucket/políticas según las migraciones de esa versión. Restaurar DDL/datos de aplicación respetando constraints, ACL y triggers; no importar ciegamente defaults/propietarios de roles administrados ni concederse privilegios para sortear un error. No usar `--no-acl` como solución rápida: perderías garantías de permisos. El flujo alojado se revisará con la guía oficial y un plan concreto para el destino.
3. Restaurar bytes por Storage API con las mismas rutas y MIME. Confirmar SHA-256, tamaños, referencias y configuración pública del bucket; dejar fuera rutas reclamadas como eliminadas. Reconciliar pendientes/tombstones antes de habilitar limpieza. Fallar de forma controlada si falta un archivo, sin afirmar que las fotos se restauraron.
4. **Invalidar todas las capacidades restauradas antes de reabrir endpoints.** Un hash activo en la copia puede corresponder a un enlace revocado después. Recuperar solo al organizador no revoca los enlaces personales. El responsable ejecutará una transacción de mantenimiento revisada que revoque los registros vigentes; después hará bootstrap/recuperación del organizador y emitirá nuevos enlaces personales desde el panel. No hay endpoint público para esta operación. No se puede recuperar el token original desde su hash.
5. Revisar reservas de importación y cuotas antiguas, y coordinar los secretos HMAC de Edge/Node si se reemplazan; no publicar secretos o enlaces al registrar la incidencia. Restaurar una DB no restaura configuración de Edge/Vercel.
6. Verificar recuentos/versiones, fecha literal, posiciones y relaciones; grants/RLS con roles de cliente; enlaces viejos rechazados y nuevos válidos; carga, limpieza protegida y lectura pública. Ejecutar las suites destructivas solo sobre la copia de staging, luego smoke test no destructivo en el destino final aprobado. Reabrir escritura únicamente al terminar la revisión.

No automatizamos esta secuencia sobre tu proyecto principal. Las tareas de recuperación de organizador existentes están fijadas a Docker local; no se convierten en herramientas remotas pasando otra URL.

## Ensayo reproducible T24

```cmd
npm.cmd run test:recovery:local
```

Requiere Docker Desktop. Crea **AmigoSecretoAdminTest** en 54421/54422, usa su worker Edge en 8094 y no toca la principal. Comparte workdir con los ensayos de seguridad/panel: ejecutarlos secuencialmente. Rechaza una pila existente. Genera un participante sintético, evento, regalo en posición 2 y dos imágenes mediante endpoints autorizados. No usa el seed de once personas.

El ensayo usa `pg_dump` PostgreSQL 17 custom, limitado a public/private, y exporta por API los dos objetos a `artifacts/recovery-local/rehearsal-*`. Produce application.dump, manifiesto con SHA-256/configuración de bucket y TOC. Simula pérdida **solo en esa pila**: retira los objetos por API y elimina los esquemas de aplicación; luego `pg_restore --single-transaction --exit-on-error` los reconstruye. Un archivo truncado se rechaza sin dejar esquemas parciales. No ejecuta db reset/push ni restaura una copia proporcionada por el usuario.

La lista de restauración excluye únicamente DEFAULT ACL de `supabase_admin`, pertenecientes a la plataforma y no modificables por postgres. Mantiene ACL/defaults de aplicación y corre las 303 aserciones SQL reales después. Esta diferencia se detectó en los primeros ensayos; no se quitó toda la seguridad ni se alteraron roles para conseguir la restauración. El entorno conserva sus roles/plataforma e historial de migraciones: se valida reconstrucción lógica de la aplicación en la misma pila desechable, **no** recuperación física completa o restauración alojada.

Compara el contenido de **todas** las tablas de aplicación antes/después, verifica bytes/rutas/relaciones, invalida credenciales del snapshot y recupera el organizador con nuevos enlaces. Finalmente prueba protección de una referencia vigente, reclamación de un huérfano y limpieza de cuotas. `result.json` registra resultados sin capacidades en claro. Los hashes privados solo existen en el dump sintético ignorado; no se guardan enlaces en archivos o logs.

El finally retira solo sus contenedores/volúmenes y archivo de variables. Los artefactos sintéticos quedan ignorados para revisión. Si el proceso o Docker se interrumpe forzosamente, revisar esa pila concreta antes de repetir; nunca limpiar volúmenes generales o la principal. El informe de ejecución está en [validación](validation-results.md).
