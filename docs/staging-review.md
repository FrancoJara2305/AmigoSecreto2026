# T25: staging separado y revisión de migraciones

Última publicación: `dpl_GLM6zkS49db44WAJSD7VdhVb7m6h`, con corrección de confirmación visible y subida durante revalidación; [seguimiento](staging-feedback-result.md). Los datos/counts y el despliegue inicial documentados abajo corresponden a aquella fase y no sustituyen el seguimiento del uso posterior.

Actualizado el 2026-10-31 (America/Lima). **Staging está publicado y su aceptación técnica alojada pasó:** [abrir aplicación](https://amigo-secreto2026-staging.vercel.app). Las 14 migraciones están verificadas, cero pendientes; tres Edge activas, frontend/descargador y secretos propios configurados. Se creó el acceso inicial del organizador y datos sintéticos de prueba, con enlaces personales revocados. [Resultado, acceso seguro y pendientes](staging-deployment-result.md); [baseline y migraciones](staging-migration-result.md); [huellas](staging-migration-review.md). Producción no fue consultada por SQL ni modificada.

## Destinos verificados

| Campo | Staging | Producción |
| --- | --- | --- |
| Proyecto Supabase | [AmigoSecreto2026-staging](https://supabase.com/dashboard/project/eknnkmndfxgyjsdgkwkh), creado y `ACTIVE_HEALTHY` según gestión | `AmigoSecreto2026`, reservado por el usuario; `ACTIVE_HEALTHY` según gestión |
| Organización, región y coste | `SecretFriend` (`hrerqvikvvkcjkxgmgwo`), `us-east-1`; plan Free confirmado por el usuario antes de crear | Misma organización/región; no se solicitó cambiar plan o recursos |
| PostgreSQL | `17.11.0.016`, major 17, metadato de gestión | `17.11.0.003`, major 17, metadato de gestión |
| Project Ref y origen API | `eknnkmndfxgyjsdgkwkh`; `https://eknnkmndfxgyjsdgkwkh.supabase.co` | `jtuhcilcnuydsbcbsazo`; `https://jtuhcilcnuydsbcbsazo.supabase.co` |
| Proyecto Vercel | [franco-9ec3/amigo-secreto2026-staging](https://vercel.com/franco-9ec3/amigo-secreto2026-staging), creado; ID `prj_5efvOrvzHx8WtpOy6YbRRLufpTwp` | `franco-9ec3/amigo-secreto2026`, ID `prj_gltGLu834t0fnjSB64FRMApxOI9h`; solo metadatos consultados, sin cambios |
| Dominio canónico | `https://amigo-secreto2026-staging.vercel.app`, aplicación pública HTTPS comprobada | No modificado |
| Datos y accesos | Solo datos sintéticos y credenciales nuevas del entorno | No copiar datos, enlaces, claves o HMAC a staging |

Hay dos proyectos Supabase y dos proyectos Vercel, con IDs distintos verificados mediante sus APIs de gestión. No conecta previews arbitrarias a producción. Antes de publicar, comprobar también las variables compiladas y los destinos del proxy. Vercel figura en plan `hobby`; el usuario confirmó Supabase Free y se observó un solo proyecto antes de crear staging, ahora dos. No se solicitó upgrade, tamaño de pago o alta disponibilidad. La [facturación oficial](https://supabase.com/docs/guides/platform/billing-on-supabase) describe dos proyectos gratuitos y cuotas compartidas; el plan no se leyó mediante la API porque la CLI no lo muestra y el host del navegador no estaba disponible. La [guía oficial de entornos](https://supabase.com/docs/guides/deployment/managing-environments) describe proyectos Supabase separados para staging y producción.

El usuario autenticó Vercel CLI y autorizó continuar. Se verificó `francojara2305`, equipo `franco-9ec3` (`team_cN0TbMrhIrrpvXyOxdCeQafU`), con CLI 65.8.0. La extensión de VS Code y las integraciones del chat no son necesarias para este acceso. La red del sandbox bloqueó la primera consulta; las operaciones de gestión se ejecutaron después con el permiso de ejecución correspondiente. No se extrajeron ni mostraron tokens.

## Vercel staging verificado

Se creó/configuró y publicó únicamente `amigo-secreto2026-staging`, por proyecto y scope explícitos:

| Ajuste | Valor comprobado |
| --- | --- |
| Framework | `vite` |
| Node.js | `24.x` |
| Instalación | `npm ci --include=dev --ignore-scripts` |
| Build | `npm run build` |
| Salida | `dist` |
| Despliegues | 2; actual `dpl_GLM6zkS49db44WAJSD7VdhVb7m6h`, READY; inicial `dpl_5yVrfEAgD4AdRnopdxdqSdem65tN` conservado |
| Variables configuradas | 5 en Production del proyecto staging; tres VITE públicas, callback y HMAC Sensitive |

Identidad/ajustes se verificaron el 2026-10-31 y el build remoto terminó READY. La comprobación HTTP/navegador del alias canónico pasó. Producción conserva su ID y Node `26.x`; no se le enviaron mutaciones. No se importó Git, descargó `.env.local` o creó `.vercel/project.json` en la raíz. El target Production de este despliegue pertenece al proyecto staging independiente. Evidencias: `artifacts/deployment/staging/infrastructure.json` y `hosted-deployment.json`.

## Supabase staging aprovisionado

Supabase CLI 2.122.0 está autenticada y staging tiene Ref propio/PG17 en `SecretFriend`/`us-east-1`. La inspección inicial READ ONLY confirmó el baseline vacío; después se preparó recuperación, se comprobó el dry-run exacto y se aplicaron las 14 migraciones sin link/seeds. La continuación autorizada publicó las tres Edge y configuró API/signup/secretos. El [resultado SQL](staging-migration-result.md) y la [aceptación alojada](staging-deployment-result.md) documentan las fases por separado.

La contraseña nueva de la DB se conserva **cifrada con DPAPI para este usuario Windows** en `artifacts/deployment/staging/supabase-db-password.dpapi.local`, ignorado por Git y excluido de Vercel. Los nuevos HMAC y el acceso inicial se cifraron en archivos separados; solo la clave publishable llegó al frontend. No se mostraron secretos, copiaron de producción o modificaron `.env.local`. DPAPI depende del usuario/equipo Windows y no es respaldo portable; no distribuir estos archivos.

La creación confirmó que este comando no toma la contraseña desde `SUPABASE_DB_PASSWORD`: exige `--db-password` en modo no interactivo. El primer intento falló antes de crear; el segundo pasó el valor recuperado solo en memoria al argumento requerido, sin literal en el comando registrado. Una mezcla de stdout/stderr impidió analizar localmente su respuesta; se verificó el resultado por el listado de gestión y **no se repitió la creación**. No se guardaron respuestas crudas que pudieran contener credenciales.

## Paquete local revisable

El [generador](../scripts/prepare-deployment.mjs) conserva la selección explícita de entorno y produce tres plantillas con orígenes coherentes y marcadores de claves. El paquete se regeneró con los destinos reales de staging identificados por gestión:

```cmd
npm.cmd run prepare:deployment -- --stage staging --supabase-url https://eknnkmndfxgyjsdgkwkh.supabase.co --app-url https://amigo-secreto2026-staging.vercel.app
```

En `artifacts/deployment/staging/`:

| Archivo | Contenido |
| --- | --- |
| `vercel.json` | Build, rutas y CSP ligados al origen API indicado. |
| `frontend.env.example` | Tres variables públicas; marcador de clave conservado. El valor real ya está en el build alojado. |
| `edge.env.example` | CORS/base URL exactos del staging, proxy HTTPS en `/api/fetch-product`, cuotas globales y `APP_LOCAL_FETCH_PROXY=0`. |
| `fetch-proxy.env.example` | Callback HTTPS al `product-metadata` del mismo Supabase y marcador HMAC compartido con Edge. |
| `manifest.json` | Inventario de fuentes y 14 migraciones con SHA-256; huellas de configuración y plantillas; `destinationStatus: unverified`, `migrationPlanStatus: inventory-only`, `deployed: false`, `remoteInspected: false`. |

Las plantillas siguen sin valores reales. La configuración efectiva se cargó por los canales de los proveedores, con HMAC nuevos y compartidos solo entre los servidores correspondientes de staging. No sustituyen `.env.local`; el generador nunca lo lee. No añadir claves DB, `service_role` o capacidades personales a Vercel. Ver [matriz](environment.md).

El generador valida la forma de los orígenes, pero **no comprueba que pertenezcan al entorno elegido**. Su manifiesto offline conserva `destinationStatus=unverified`/`remoteInspected=false`; no es el estado actual. Identidades, aprobación/aplicación y despliegue constan en `infrastructure.json`, `migration-plan.json` y `hosted-deployment.json`. Regenerar el paquete no renueva inspección, aplicación o publicación. No se añadió configuración raíz de Vercel, enlace CLI o despliegue automático.

## Inventario SQL para revisar en orden

El inventario de abajo se reconcilió primero con el staging vacío y después fue aprobado y aplicado: **las 14 versiones están registradas en staging**, con cero pendientes. La [lista exacta con SHA-256](staging-migration-review.md) y `migration-plan.json` identifican el conjunto aplicado. No editar, reordenar o reaplicar esos archivos. Los [controles posteriores](staging-migration-result.md) verificaron los permisos efectivos y el estado esperado.

| Migración | Efecto y punto de revisión |
| --- | --- |
| [20261026000100 — esquema](../supabase/migrations/20261026000100_wishlist_schema.sql) | Crea `private`, tablas públicas/privadas, restricciones, índices y triggers de versión. Inserta **una fila de configuración del evento**, sin participantes/regalos/tokens. Revoca `EXECUTE` por defecto globalmente para funciones futuras creadas por el rol ejecutor, además de permisos privados. No es un cambio limitado a los objetos de esta app. |
| [20261026000200 — permisos](../supabase/migrations/20261026000200_wishlist_permissions.sql) | Habilita RLS; lectura pública de participantes, regalos y evento para `anon`/`authenticated`. Escritura solo mediante backend con permisos explícitos. `private` sin acceso cliente. La lectura pública es parte del producto: staging debe usar datos sintéticos. |
| [20261026000300 — Storage](../supabase/migrations/20261026000300_wishlist_storage.sql) | Crea o **actualiza** `wishlist-media` como bucket público, límite 3 MiB y MIME JPEG/PNG/WebP. Añade políticas restrictivas para impedir acceso directo cliente a sus tablas de Storage. Si ya existe un bucket con ese ID, puede cambiar su exposición/configuración; detenerse y revisar. No inserta/borra objetos. |
| [20261027045044 — acceso](../supabase/migrations/20261027045044_private_access_lifecycle.sql) | Crea validación, bootstrap y RPC `server_access`. Bootstrap solo para `postgres`; no lo ejecuta ni emite credenciales. RPC solo para `service_role`, con capacidades comprobadas dentro de SQL. |
| [20261027103637 — mutaciones](../supabase/migrations/20261027103637_protected_wishlist_mutations.sql) | Añade normalización, estado de medios y `server_mutate`; valida propiedad/versiones y restringe `EXECUTE` al servidor. Crear las funciones no ejecuta los cambios descritos en sus cuerpos. |
| [20261027104406 — volatilidad](../supabase/migrations/20261027104406_correct_mutation_helper_volatility.sql) | Cambia `normalize_mutation_payload` a `STABLE`; conserva la migración anterior. |
| [20261027214226 — medios](../supabase/migrations/20261027214226_protected_media_lifecycle.sql) | Añade `upload_complete` (existentes: `true`) y `unused_since`, índice, cola `media_deletions`, RLS, triggers y RPC de subida/limpieza. Revisar valores históricos y bloqueos al añadir columnas; no invoca limpieza ni borra archivos al migrar. |
| [20261027215115 — compatibilidad](../supabase/migrations/20261027215115_media_cleanup_compatibility.sql) | Sustituye un CHECK de rutas de la cola y la función de limpieza para JPEG/PNG/WebP canónicos. El CHECK se valida sobre filas existentes; formatos incompatibles bloquearían la migración. |
| [20261029035631 — cuotas](../supabase/migrations/20261029035631_atomic_rate_limits.sql) | Añade scope/ventana, reclasifica a `global` las filas con hash cero y sustituye PK/CHECK de `rate_limits`. Añade RPC y reemplaza acceso/mutación/subida para cuotas atómicas. Revisar datos existentes, validación y bloqueos de DDL; no vacía la tabla. |
| [20261029040501 — reintentos](../supabase/migrations/20261029040501_quota_retry_and_saturation.sql) | Reemplaza funciones de cuotas: contadores saturados, reintento tras espera y mayor `Retry-After` entre ventanas. Sin ejecución de mantenimiento al migrar. |
| [20261029043751 — importación](../supabase/migrations/20261029043751_protected_product_import.sql) | Crea `import_requests`, índices/RLS y RPC de preparar/reclamar nonce solo para servidor. No descarga productos ni importa regalos al migrar. |
| [20261030121604 — administración](../supabase/migrations/20261030121604_protected_organizer_admin.sql) | Añade helpers y `server_admin` con permisos de servidor. Su cuerpo permite bajas explícitas y encola medios, pero no se invoca durante la migración. Solicita recarga de esquema PostgREST. |
| [20261030124122 — lint](../supabase/migrations/20261030124122_organizer_admin_lint_fixes.sql) | Reemplaza normalización/administración con inicialización JSONB explícita y limpieza de variables; conserva grants. Solicita recarga PostgREST. |
| [20261030125225 — locks](../supabase/migrations/20261030125225_organizer_link_lock_order.sql) | Reemplaza `server_access` para orden credencial→propietario y revalidación de expiración tras esperas. Conserva autorización/cuotas/grants y solicita recarga PostgREST. |

En el SQL revisado no hay `SECURITY DEFINER`, reset, `TRUNCATE` o borrado de tablas/esquemas. Las funciones usan `search_path` fijo y permisos explícitos. Las operaciones de baja/limpieza dentro de sus cuerpos requieren invocación posterior; no confundirlas con acciones ejecutadas al aplicar el archivo. Los ensayos locales cubren el contrato acumulado; no demuestran compatibilidad con objetos o datos remotos desconocidos.

El [cambio de exposición de Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) exige atender los permisos explícitos. El estado final verificado concede solo `SELECT` de tablas públicas a los clientes, sin acceso privado o ejecución de RPC. Configuración remota confirmada: solo `public` expuesto y exposición automática desactivada. Lectura pública/servidor funcionaron; la clave pública no pudo invocar administración.

## Continuación pendiente

Las pausas iniciales se respetaron: se confirmó Free, se inspeccionó solo lectura y se aprobaron recuperación y las 14 migraciones exactas. Una autorización posterior permitió configurar/publicar staging y ejecutar su aceptación técnica. No hace falta reaplicar migraciones o volver a crear proyectos/bootstrap.

El baseline vacío se restauró únicamente en la instancia local aislada y cerrada; no hubo restauración remota. La comprobación posterior a publicación siguió siendo READ ONLY, sin credenciales en los resultados. El acceso inicial del organizador se conserva cifrado; los tres tokens personales del ensayo están revocados.

Recorrido guiado con lector T21 validado por el usuario y [logs Supabase revisados](staging-logs-review.md). Sigue la [inspección productiva de solo lectura](production-review.md), preparada y todavía no ejecutada. Producción mantiene preparación y aprobación separadas. Ver [publicación/acceso](staging-deployment-result.md), [despliegue](deployment-review.md) e [integración](supabase-integration.md).
