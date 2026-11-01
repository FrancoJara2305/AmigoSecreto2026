# T25: inspección de producción en solo lectura

Resultado del 2026-10-31 (America/Lima), después de la autorización expresa del usuario. **Producción ya tiene las catorce migraciones registradas: cero pendientes y ninguna versión adicional. No deben reaplicarse.** No se aplicaron migraciones, cambios de datos/configuración, bootstrap o despliegues durante esta inspección.

## Destino y alcance

Se confirmó por gestión el proyecto `AmigoSecreto2026`, Ref `jtuhcilcnuydsbcbsazo`, organización `hrerqvikvvkcjkxgmgwo`, `us-east-1`, `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.003`. Staging continúa siendo el proyecto separado `eknnkmndfxgyjsdgkwkh`.

Se usó la API oficial de gestión `database/query` con `read_only=true` y consultas `BEGIN READ ONLY`, timeout de sentencia 15 s, espera de locks 3 s y `ROLLBACK`. Todas devolvieron `transaction_read_only=on`. No se usó la CLI para crear un enlace/caché del proyecto, inicializar roles, exportar o aplicar SQL. La credencial existente se manejó en memoria sin mostrarse o guardarse.

El contexto comprobado fue `supabase_read_only_user`, sin superusuario y con `BYPASSRLS`. Eso permitió obtener conteos completos sin confundir filas ocultas por RLS con una base vacía. La vista `information_schema.role_table_grants` no mostró grants a ese rol; los permisos efectivos se verificaron aparte con `has_table_privilege`, `has_function_privilege` y `has_schema_privilege`.

## Historial y compatibilidad

- Las catorce versiones **y nombres** coinciden con los archivos locales revisados. Sus SHA-256 siguen intactos. Pendientes: **0**; versiones remotas ajenas: **0**.
- El contrato de tablas coincide con staging: ocho tablas, 72 columnas, 71 restricciones, 24 índices, cinco políticas de aplicación/Storage y cinco triggers propios.
- Las ocho tablas de aplicación tienen RLS. Los clientes `anon`/`authenticated` tienen solo lectura de participantes, regalos y evento; sin escritura o USAGE de `private`.
- Las 23 funciones son `SECURITY INVOKER`, con `search_path` fijo y sin EXECUTE cliente. Las nueve RPC públicas tienen ejecución para `service_role`; el bootstrap privado queda solo para `postgres`.
- El bucket `wishlist-media` es público para lectura, limitado a 3 MiB y JPEG/PNG/WebP; configuración observada equivalente a la prevista.

La primera comparación SHA-256 señaló nueve definiciones distintas. Se revisaron en memoria, preservando sus literales y atributos: **las nueve fuentes coinciden exactamente al normalizar CRLF a LF**. No hay diferencia de lógica en esas fuentes. Las otras catorce funciones ya coincidían por hash exacto. Los cuerpos recuperados para aclararlo no se guardaron ni imprimieron. No se propone una migración para cambiar finales de línea.

Consultas revisables: [sondeo](sql/production-inspect-target.sql), [historial](sql/production-inspect-history.sql), [rol de inspección](sql/production-inspect-role.sql), [contrato](sql/production-inspect-contract.sql), [conteos](sql/production-inspect-counts.sql) y [nueve fuentes comparadas en memoria](sql/production-inspect-routine-source.sql). El contrato de staging se consultó también en solo lectura, sin recuperar datos del usuario.

## Datos observados

| Objeto | Cantidad |
| --- | --- |
| Participantes / regalos | 0 / 0 |
| Configuración de evento | 1 |
| Accesos privados | 0 |
| Cuotas / medios / cola de borrado / importaciones | 0 en cada tabla |
| Archivos Storage / usuarios Auth | 0 / 0 |
| Relaciones en `supabase_realtime` | 0 |

Son conteos del momento de inspección, no una garantía de que el estado permanezca igual. No se descargaron filas de personas, regalos, hashes de acceso, claves o bytes de archivos. No se creó un acceso de organizador.

## Continuación posterior

El respaldo productivo y su restauración local se autorizaron después y quedaron [verificados](production-recovery-result.md). La propuesta siguiente conserva el alcance definido al terminar esta inspección; ahora quedan configuración/publicación y custodia externa pendiente.

**Preparar recuperación del estado productivo actual antes de publicar**, con autorización específica para exportación y restauración aislada. Aunque los datos de uso están vacíos, ya existe el backend y una fila de evento: el baseline vacío anterior de staging no sirve como respaldo productivo.

La preparación debe conservar esquema/datos de aplicación e historial, configuración/permisos y manifiesto; registrar que Storage no tiene archivos y revalidarlo al exportar; cifrar la copia, comprobar restauración en un PostgreSQL local aislado y preservar la producción de origen. Sin reset, bootstrap, seeds o cambios de filas en producción. Resolver custodia externa antes de depender de un archivo DPAPI ligado a este usuario/equipo.

Después, confirmar dominio y configuración efectiva de publicación, secretos propios, Node compatible y la versión/retorno de Vercel. La publicación y el acceso inicial se revisan por separado: **la autorización de inspección no los incluye**. Ya no se necesita aprobar/aplicar un conjunto de migraciones pendiente porque está vacío; cualquier cambio nuevo deberá revisarse como tal. [Plan de producción actualizado](production-review.md).

## Evidencias y límites

En `artifacts/deployment/production-review/`: `project-metadata.json`, `inspection.json`, `history.json`, `inspection-role.json`, `production-contract.json`, `staging-contract.json`, `contract-comparison.json`, `routine-comparison.json`, `counts.json`, `migration-plan.json`, `inspection-result.json` y manifiesto con hashes. Son evidencias locales ignoradas por Git; el informe y consultas son revisables en el repositorio.

Se comprobó el catálogo/contrato SQL y conteos, no operaciones de escritura HTTP contra producción, su configuración API/Auth alojada, salud funcional de Edge o frontend, ni una recuperación que aún no se preparó. La inspección no sustituyó el respaldo o la aceptación productiva.
