# T25: revisión de configuración y primera publicación funcional

**Continuación posterior autorizada y completada:** [producción publicada/aceptada y acceso inicial](production-deployment-result.md). Esta revisión conserva el estado anterior y el plan que se aprobó; ya no es una aprobación pendiente.

Revisión del 2026-10-31 (America/Lima), después del [respaldo productivo y restauración local](production-recovery-result.md). **Dominio confirmado y paquete preparado; no se configuró ni publicó producción durante esta fase.** Las consultas fueron de gestión GET y HTTP GET/OPTIONS, sin escritura de aplicación o bootstrap.

## Estado comprobado

| Punto | Resultado |
| --- | --- |
| Vercel | Proyecto `prj_gltGLu834t0fnjSB64FRMApxOI9h`, equipo `franco-9ec3`, Vite y Node `26.x`. |
| Dominio | `https://amigo-secreto2026.vercel.app`, asignado al proyecto, verificado y sin redirección por gestión. La raíz y `/api/fetch-product` responden 404. |
| Despliegues | Tres registros productivos y ninguna página adicional; los tres en ERROR. El más reciente es `dpl_6LF5oxSKG3FvstxQAQQ2rK93Hoce`. **No hay frontend productivo READY para rollback.** No se atribuyó la causa del build a Node sin revisar sus errores. |
| Variables Vercel | Dieciséis variables existentes de integración; faltan las cinco variables específicas de esta aplicación. Se inspeccionaron nombres/tipo/destino, sin descifrar valores. |
| Supabase | `jtuhcilcnuydsbcbsazo`, `AmigoSecreto2026`, ACTIVE_HEALTHY. La inspección anterior confirmó catorce migraciones y cero pendientes; esta fase no volvió a modificar o migrar la base. |
| Edge | `media-upload` v1, `wishlist-api` v1 y `product-metadata` v2, ACTIVE y `verify_jwt=false`. Solo aparecen siete secretos de plataforma; faltan los siete de aplicación. Los tres preflight desde el dominio canónico responden 503. ACTIVE no equivale a aceptación funcional. |
| Auth | Registro habilitado (`disable_signup=false`), acceso anónimo deshabilitado. URL del sitio en alias anterior y lista de redirecciones con previews/comodines. |
| Data API / Storage | Esquemas `public,graphql_public`; límite global de archivos 50 MiB. El bucket propio ya tiene 3 MiB y JPEG/PNG/WebP según inspección/respaldo. |

La ausencia de variables de orígenes concuerda con las rutas de error 503 del código candidato; no se certificó igualdad de los bundles productivos existentes con ese código. Las cabeceras/CSP de una aplicación funcional no pudieron aceptarse porque el dominio responde 404.

## Cambios concretos propuestos

1. **Vercel del proyecto productivo:** Node `24.x`, Vite, `npm ci --include=dev --ignore-scripts`, build `npm run build`, salida `dist`. Node 24 coincide con staging probado y está [soportado para builds/funciones](https://vercel.com/changelog/node-js-24-lts-is-now-generally-available-for-builds-and-functions). Comprobar también la versión realmente usada por el build; una preferencia de proyecto no basta como evidencia.
2. **Cinco variables, solo entorno Production de este proyecto:** `VITE_SUPABASE_URL=https://jtuhcilcnuydsbcbsazo.supabase.co`, `VITE_APP_URL=https://amigo-secreto2026.vercel.app`, `VITE_SUPABASE_PUBLISHABLE_KEY` obtenida del proyecto productivo; `FETCH_PROXY_CALLBACK_URL=https://jtuhcilcnuydsbcbsazo.supabase.co/functions/v1/product-metadata` y `FETCH_PROXY_HMAC_SECRET` nuevo, Sensitive y compartido solo con Edge. Conservar las dieciséis variables existentes de integración; no eliminarlas ni reutilizar valores de staging. Algunas existentes corresponden a DB/service_role: esta propuesta no añade esas claves ni las incorpora al código cliente.
3. **Siete variables Edge:** `APP_ALLOWED_ORIGINS` y `APP_BASE_URL` con el único origen canónico; `FETCH_PROXY_URL=https://amigo-secreto2026.vercel.app/api/fetch-product`; HMAC idéntico al del adaptador Node; `RATE_LIMIT_IP_SOURCE=off`, un `RATE_LIMIT_HMAC_SECRET` nuevo y `APP_LOCAL_FETCH_PROXY=0`. Generar secretos propios de producción y conservarlos cifrados, sin imprimirlos. No permitir previews de staging contra producción.
4. **Ajustes acotados Supabase:** `disable_signup=true`, `external_anonymous_users_enabled=false`, `site_url` canónico y `uri_allow_list` vacío (Auth no se usa para entrar); Data API solo `public`; límite global Storage 3 MiB. Conservar las políticas/RLS y el bucket ya verificados. No enviar config push completo, apagar servicios administrados ni cambiar roles/contraseña DB.
5. **Código probado:** desplegar los tres handlers con su autorización propia y `verify_jwt=false`, incluido WASM de imágenes, y frontend/adaptador Node del manifiesto candidato. CSP permite conexión únicamente al Supabase productivo y recursos propios según el generador. **Cero migraciones, seeds o reset.**
6. **Acceso inicial, si se autoriza junto a la publicación:** revalidar que no existen accesos; generar una sola capacidad nueva de organizador, pasar únicamente su SHA-256 a `private.bootstrap_organizer(..., false)` por canal administrativo y guardar el enlace cifrado DPAPI. No usar recuperación, no revocar accesos que aparezcan entretanto y no imprimir/distribuir el enlace. Si cambió el estado observado, detener este paso. No crear participantes/regalos de prueba en producción.

## Secuencia y retorno

Revalidar identidades, las 137 fuentes/catorce migraciones y el snapshot del respaldo antes de cambiar nada. Si hubo escrituras desde el respaldo, renovar recuperación y revisar la diferencia. **Los tres cuerpos Edge actuales y los ajustes afectados ya se preservaron cifrados** en `backups/production/20261031-runtime-before-publication/`, con manifiesto, SHA-256 y cuatro roundtrips DPAPI verificados, sin copias en claro. Se revalidaron las versiones/huellas de los bundles antes de descargarlos. Son cuerpos exactos de la API conservados como bundles opacos: no se ensayó su redespliegue alojado. Revalidar versiones/ajustes antes de reemplazarlos; el respaldo SQL no los contiene.

Preparar backend y configuración; construir con proyecto explícito y `--prod --skip-domain`. La ayuda de CLI 65.8.0 confirma que ese flag evita asignar automáticamente los dominios; no se ha ejecutado un deploy. Verificar READY, Node efectivo, destinos compilados, ausencia de secretos de servidor en frontend, cabeceras/CSP, lecturas públicas y autorización/CORS antes de promover el despliegue inmutable al dominio confirmado. La cadena de callback que usa ese dominio y las comprobaciones del organizador se completarán después de promover.

**No prometer un Instant Rollback saludable donde no existe uno.** Si falla el build, no promover. Si falla después de promover, retirar la versión defectuosa del servicio o corregirla de forma revisada; los tres despliegues ERROR y los de staging no son una alternativa funcional productiva. Restaurar ajustes/bundles anteriores devolvería el estado observado, también defectuoso. Un retorno de frontend no revierte datos/Edge/secretos. No improvisar restauración SQL, invalidación de accesos o migración inversa.

La aceptación final comprobará rutas/recarga, API y proxy, CORS exactos/rechazo ajeno, CSP en navegador y logs. Con cero participantes no puede certificarse una edición de perfil o foto real productiva sin crear datos: esos recorridos ya pasaron en staging. No añadir datos sintéticos para cerrar una casilla. La copia externa sigue pendiente por decisión del usuario y DPAPI depende de este usuario/equipo.

## Paquete y validación

Generado `artifacts/deployment/production/`: manifiesto offline, `vercel.json` y tres plantillas con marcadores. El manifiesto offline conserva `destinationStatus=unverified`; la verificación remota está separada en `artifacts/production-publication/review-result.json`. No confundir las catorce migraciones inventariadas con migraciones pendientes: **pendientes cero**.

En `artifacts/production-publication/`: `vercel-inspection.json`, `supabase-inspection.json`, `http-inspection.json`, `vercel-dry-run.json`, `desired-config.json` y `review-result.json`, con hashes. No contienen valores de secretos. El dry-run creó cero despliegues: **125 archivos regulares verificados**, sin entornos/credenciales, respaldos, artefactos, documentación, pruebas o migraciones. Los directorios vacíos listados por CLI no cuentan como archivos subidos. Las 137 huellas de fuentes y catorce migraciones coinciden con la versión aceptada; pasaron las cinco pruebas de configuración y la comprobación de documentación/whitespace.

**Pendiente aprobar la aplicación de este plan:** configuración, publicación y el acceso inicial descrito. No queda SQL de migraciones por aplicar. El plan no incluye incorporar personas, enviar enlaces, contratar servicios o hacer recuperación alojada. [Seguimiento T25](implementation-progress.md).
