# T25: paquete para revisar producción

Actualizado el 2026-10-31 (America/Lima). **T25 completado en el alcance autorizado: [producción publicada y aceptada](production-deployment-result.md)** en https://amigo-secreto2026.vercel.app, con staging independiente. Node 24 efectivo, tres Edge activas y catorce migraciones ya registradas (cero pendientes/aplicadas). Un organizador inicial cifrado; cero participantes/regalos añadidos. La copia externa sigue pendiente por decisión del usuario; límites y operación en el informe.

## Destinos y versión

Continuación autorizada completada: [respaldo productivo cifrado y restauración local verificados](production-recovery-result.md). La copia externa queda pendiente por decisión del usuario. La autorización posterior configuró/publicó producción y creó un único organizador: [resultado](production-deployment-result.md).

| Campo | Producción | Staging comprobado |
| --- | --- | --- |
| Supabase Ref | `jtuhcilcnuydsbcbsazo`, `AmigoSecreto2026` | `eknnkmndfxgyjsdgkwkh` |
| Vercel | `prj_gltGLu834t0fnjSB64FRMApxOI9h`, `franco-9ec3/amigo-secreto2026` | `prj_5efvOrvzHx8WtpOy6YbRRLufpTwp` |
| Framework / Node | Vite / `24.x`, build productivo efectivo comprobado | Vite / `24.x`, build alojado probado |
| Versión frontend publicada | `dpl_Bo3Vt83ahS1pi98FEv7yCbiAf3DD`; 137 fuentes y pin Node 24 en dos manifests | Despliegue `dpl_GLM6zkS49db44WAJSD7VdhVb7m6h` |
| Migraciones | Catorce versiones/nombres coincidentes; **cero pendientes** | Catorce aplicadas y verificadas |
| Dominio canónico | `https://amigo-secreto2026.vercel.app`, asignado/verificado y HTTP 200; alias exacto comprobado | `https://amigo-secreto2026-staging.vercel.app` |

La [revisión de configuración/publicación](production-publication-review.md) registró el estado previo 404/503, variables faltantes y ausencia de retorno funcional. La aplicación autorizada del plan corrigió ese estado; [producción publicada y aceptada](production-deployment-result.md), con runtime y secretos propios.

## Inspección de solo lectura realizada

El manifiesto está en `artifacts/deployment/production-review/manifest.json`: identifica Ref/ID, huellas de las catorce migraciones y de cada consulta; no contiene credenciales o datos del grupo. Las consultas revisables se conservan en [sondeo](sql/production-inspect-target.sql) e [historial](sql/production-inspect-history.sql).

1. Confirmar de nuevo el Ref productivo por gestión y seleccionar siempre `jtuhcilcnuydsbcbsazo` explícitamente, sin crear enlaces CLI en la raíz.
2. Ejecutar `docs/sql/production-inspect-target.sql`: transacción `READ ONLY`, timeout 15 s y límite de espera de locks 3 s, con ROLLBACK. Devuelve versión PostgreSQL, existencia del historial, catálogo de relaciones/rutinas/grants, RLS, configuración de buckets y conteos de Storage/Auth/Realtime. No devuelve listas de personas, regalos, objetos, capacidades o claves.
3. Solo si existe el historial, ejecutar `docs/sql/production-inspect-history.sql`, también READ ONLY/ROLLBACK, para obtener únicamente versiones y nombres. No crear la tabla para poder consultarla.
4. Si existen tablas de aplicación, preparar conteos acotados y revisar compatibilidad/colisiones según el catálogo obtenido. No asumir que una tabla con el mismo nombre tiene el contrato esperado.
5. Reconciliar historial con las catorce huellas locales y presentar **el conjunto exacto pendiente**, hallazgos, datos existentes y propuesta de recuperación. Si hay objetos sin historial, versiones ajenas o diferencias, detener la aplicación y revisar; no usar include-all/reset como arreglo.

Se ejecutaron sondeo/historial y comprobaciones acotadas de contexto, contrato, conteos y fuentes distintas. Se usó la API con `read_only=true` y READ ONLY/ROLLBACK. No hubo `db push`, bootstrap, seeds, limpieza o exportación. Resultado: conjunto pendiente vacío; no reaplicar las catorce migraciones.

## Recuperación completada y pasos posteriores

El usuario autorizó después el respaldo productivo y su restauración local, ya completados: [resultado](production-recovery-result.md). Aplicación/historial, nueve huellas de datos y permisos coinciden; producción conservó el mismo estado antes/después/al cierre. Storage seguía vacío. Copia cifrada DPAPI CurrentUser, servidor local detenido y copia externa pendiente por decisión del usuario; no es custodia portable. Ver [recuperación](backup-recovery.md).

La aprobación de aplicar debe identificar el Ref y las huellas pendientes después de inspeccionar. Aplicar solo ese conjunto; sin seeds ficticios, roles/include-all o reset. Verificar permisos/RLS/historial/bucket antes de publicar Edge/frontend. No recuperar o invalidar enlaces existentes por omisión; un bootstrap solo procede si se revisó y aprobó su necesidad.

Después, confirmar dominio y configurar secretos nuevos del entorno, callback/HMAC compartidos solo por sus servidores, CSP/CORS exactos, Node revisado y las tres variables VITE públicas. Publicar seleccionando el proyecto productivo explícito. Identificar el último despliegue productivo recuperable: **los despliegues de staging no son rollback de producción**. Hacer comprobaciones controladas sin inventar regalos o borrar listas reales. [Secuencia y rollback](deployment-review.md).

Las autorizaciones de inspección, respaldo/restauración local, revisión y aplicación/publicación/acceso inicial quedaron completadas. [Resultado final y límites](production-deployment-result.md). No hubo migraciones pendientes que aplicar ni se incorporaron personas/regalos automáticamente.
