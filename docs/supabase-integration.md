# Integración Supabase y revisión de migraciones

Estado actual: aplicación y backend probados en local, con paquete local de T25 preparado. El usuario confirmó AmigoSecreto2026 para producción y staging separado pendiente; **no se consultó ni vinculó esa base**. El avance detallado está en [tareas](implementation-progress.md), el [paquete T25](deployment-package.md) y los ensayos en [validación](validation-results.md).

## Arquitectura aplicada

- React/Vite, rutas públicas y editores/panel diferidos. Cliente PostgREST oficial de solo uso público, sin cuentas o sesiones Auth. Dos lecturas por catálogo y una consulta relacional por perfil.
- public contiene participantes, regalos y evento con restricciones/versiones y lectura RLS/grants explícitos. private contiene hashes de acceso y registros internos, sin exposición Data API o permisos para clientes.
- wishlist-api autoriza mutaciones, enlaces y administración en SQL; media-upload autoriza antes y después de recodificar/subir; product-metadata exige capacidad y usa el transporte Node firmado con callback de un solo uso. Ninguno permite escritura solo con apikey.
- Bucket wishlist-media público para leer, sin escritura directa de anon/authenticated. Reservas/asociación/cola y reclamaciones impiden adjuntar medios ajenos o borrar referencias vigentes.
- Configuración local: PostgreSQL 17, esquema expuesto public, Auth/signup/realtime y seed automático desactivados. Las tres Edge están habilitadas con autorización propia y verify_jwt=false. Los validadores de URL SQL no reemplazan la protección DNS/TLS/redirecciones del importador.
- Sin sorteo, cuentas, reservas o presupuesto configurable. No se cambió ese alcance en T24.

## Herramientas y versión

Node 24+, npm desde lockfile y Docker Desktop Linux para Supabase. CLI como dependencia del proyecto: npm.cmd run supabase -- <comando>, versión verificada 2.122.0. No se requiere instalación global, psql o Deno en Windows. PostgREST 2.118.0 está fijado directamente; el SDK completo conservado para tests no se descarga en las rutas públicas de producción.

## Preparar y validar solo local

Con Docker activo y las variables según [entornos](environment.md):

~~~cmd
npm.cmd ci --ignore-scripts
npm.cmd run supabase -- start
npm.cmd run supabase -- migration up --local
npm.cmd run supabase -- migration list --local
npm.cmd run supabase -- db lint --local --schema public,private --fail-on warning
~~~

start crea/aplica migraciones cuando la pila local es nueva; migration up aplica pendientes sin reset ni borrado del grupo. El project_id AmigoSecreto2026 solo nombra la pila Docker: no es el Project Ref alojado. No ejecutar la demo sobre el grupo existente.

~~~cmd
npm.cmd test
npm.cmd run build
npm.cmd run check:docs
npm.cmd run test:security
npm.cmd run test:security:local
npm.cmd run test:admin:ui:local
npm.cmd run test:recovery:local
~~~

Los tres ensayos Docker anteriores usan una pila desechable separada y se ejecutan secuencialmente; la principal no se resetea. Las siete suites SQL corren con rollback y cubren restricciones, grants/RLS, EXECUTE, tokens, asociación/limpieza, cuotas, importación y administración. Tests en memoria no sustituyen la prueba real; ambos tipos ya están documentados. Lista reproducible y procedimientos de cierre: [operación](operations.md).

Las migraciones versionadas son incrementales: esquema/permisos/bucket iniciales, ciclo de acceso, mutaciones, medios, cuotas, importación y administración. No hay nuevas migraciones en T20–T24. Revisar todos los archivos de supabase/migrations y su historial, no solo los cuatro iniciales. El archivo tests/fixtures/supabase-platform.sql es una plataforma mínima para PGlite y **nunca se aplica a Supabase**.

## Vinculación futura: detenerse antes del remoto

Esta sección es una receta de revisión para T25, **no ejecutada ni autorizada automáticamente por T24**. Antes del primer acceso remoto, acordar Project Ref, versión PostgreSQL, datos existentes, respaldo, credencial con alcance mínimo y si se operará staging o producción. No enviar secretos al chat.

Después de aprobar el destino concreto, la secuencia manual prevista es:

~~~cmd
npm.cmd run supabase -- login
npm.cmd run supabase -- link --project-ref PROJECT_REF_APROBADO
npm.cmd run supabase -- migration list --linked
npm.cmd run supabase -- db push --linked --dry-run
~~~

El login interactivo puede crear un token amplio; preferir una credencial de gestión con alcance limitado por el canal seguro configurado. No poner contraseña o token en argumentos. El enlace se guarda en archivos CLI ignorados; comprobarlo antes de cada operación. list y dry-run también contactan el remoto: no ejecutarlos antes de aprobarlo. El dry-run no valida por sí solo las consultas/migraciones sobre tus datos.

Comparar el historial con los archivos revisados, examinar SQL y probar el mismo conjunto en staging aislado, incluido bucket/permisos. No usar include-all, include-seed, reset o config push para resolver diferencias automáticamente. Aplicar migraciones reales, cargar secretos, desplegar funciones o publicar frontend corresponde a un paso posterior de [despliegue](deployment-review.md), tras presentar los cambios y aprobación. Ninguno se ejecutó en T24.

## Respaldos y límites

DB y bytes de Storage se exportan por separado y se validan conjuntamente. Los secretos, roles administrados y configuración de proveedor no se recuperan con un dump de tablas. Un snapshot puede reactivar hashes de enlaces posteriormente revocados: [recuperación](backup-recovery.md) invalida los accesos antes de reabrir.

Se comprobaron en local lectura/escritura acotadas, concurrencia, Edge/Storage, recuperación y rendimiento. Siguen pendientes el lector real de T21 y rutas/CSP/CORS/logs/transporte/tiendas/métricas de infraestructura alojada. Estos límites no se dan por verificados mediante el estado Healthy de PostgreSQL.
