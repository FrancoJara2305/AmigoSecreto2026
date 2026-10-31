# T25: paquete para revisar producción

Preparado el 2026-10-31 (America/Lima). **No se consultó la base productiva ni se aplicaron migraciones, secretos o despliegues a producción.** Staging tiene la corrección publicada, pruebas alojadas, recorrido guiado T21 validado por el usuario y [logs revisados](staging-logs-review.md). Este paquete concreta la siguiente inspección y no presume que producción esté vacía.

## Destinos y versión

| Campo | Producción | Staging comprobado |
| --- | --- | --- |
| Supabase Ref | `jtuhcilcnuydsbcbsazo`, `AmigoSecreto2026` | `eknnkmndfxgyjsdgkwkh` |
| Vercel | `prj_gltGLu834t0fnjSB64FRMApxOI9h`, `franco-9ec3/amigo-secreto2026` | `prj_5efvOrvzHx8WtpOy6YbRRLufpTwp` |
| Framework / Node | Vite / `26.x`, metadatos de gestión consultados hoy | Vite / `24.x`, build alojado probado |
| Versión frontend candidata | Las 137 fuentes identificadas en `artifacts/t25-feedback/source-manifest.json` | Despliegue `dpl_GLM6zkS49db44WAJSD7VdhVb7m6h` |
| Migraciones | Inventario local de catorce; **pendientes remotas desconocidas** | Catorce aplicadas y verificadas |
| Dominio canónico | Pendiente de confirmar por gestión antes de configurar CSP/CORS/variables | `https://amigo-secreto2026-staging.vercel.app` |

No se deduce un dominio productivo del nombre del proyecto. Se propone alinear Node a 24 para reproducir el runtime probado, mediante un cambio posterior aprobado; todavía no se cambió Node 26. No se copian claves/HMAC, enlaces o datos de staging a producción. Tampoco se configura el frontend contra producción antes de reconciliar su backend.

## Inspección propuesta de solo lectura

El manifiesto está en `artifacts/deployment/production-review/manifest.json`: identifica Ref/ID, huellas de las catorce migraciones y de cada consulta; no contiene credenciales o datos del grupo. Las consultas revisables se conservan en [sondeo](sql/production-inspect-target.sql) e [historial](sql/production-inspect-history.sql).

1. Confirmar de nuevo el Ref productivo por gestión y seleccionar siempre `jtuhcilcnuydsbcbsazo` explícitamente, sin crear enlaces CLI en la raíz.
2. Ejecutar `docs/sql/production-inspect-target.sql`: transacción `READ ONLY`, timeout 15 s y límite de espera de locks 3 s, con ROLLBACK. Devuelve versión PostgreSQL, existencia del historial, catálogo de relaciones/rutinas/grants, RLS, configuración de buckets y conteos de Storage/Auth/Realtime. No devuelve listas de personas, regalos, objetos, capacidades o claves.
3. Solo si existe el historial, ejecutar `docs/sql/production-inspect-history.sql`, también READ ONLY/ROLLBACK, para obtener únicamente versiones y nombres. No crear la tabla para poder consultarla.
4. Si existen tablas de aplicación, preparar conteos acotados y revisar compatibilidad/colisiones según el catálogo obtenido. No asumir que una tabla con el mismo nombre tiene el contrato esperado.
5. Reconciliar historial con las catorce huellas locales y presentar **el conjunto exacto pendiente**, hallazgos, datos existentes y propuesta de recuperación. Si hay objetos sin historial, versiones ajenas o diferencias, detener la aplicación y revisar; no usar include-all/reset como arreglo.

La CLI no se ejecutará con `db push`, bootstrap, seeds o limpieza durante esta inspección. Tampoco se exportarán datos o bytes de Storage en esta fase. Las consultas preparadas aún no se han enviado a producción. Este es el punto de revisión previo a acceder a su base.

## Pasos posteriores, sujetos al resultado

Antes de aplicar cambios, preparar respaldo **productivo** coherente de DB y Storage, manifiesto y restauración en destino aislado. El baseline vacío de staging no protege los datos productivos. Acordar ventana/gestión de escrituras, custodia cifrada y copia externa; DPAPI CurrentUser por sí solo no es custodia portable. Ver [recuperación](backup-recovery.md).

La aprobación de aplicar debe identificar el Ref y las huellas pendientes después de inspeccionar. Aplicar solo ese conjunto; sin seeds ficticios, roles/include-all o reset. Verificar permisos/RLS/historial/bucket antes de publicar Edge/frontend. No recuperar o invalidar enlaces existentes por omisión; un bootstrap solo procede si se revisó y aprobó su necesidad.

Después, confirmar dominio y configurar secretos nuevos del entorno, callback/HMAC compartidos solo por sus servidores, CSP/CORS exactos, Node revisado y las tres variables VITE públicas. Publicar seleccionando el proyecto productivo explícito. Identificar el último despliegue productivo recuperable: **los despliegues de staging no son rollback de producción**. Hacer comprobaciones controladas sin inventar regalos o borrar listas reales. [Secuencia y rollback](deployment-review.md).

El paquete se entrega para aprobar la inspección de solo lectura. Aplicación, exportación/restauración, bootstrap y promoción requieren la revisión concreta posterior; no están autorizados por este documento.
