# T25: producción publicada y aceptación completada

Resultado del **2026-10-31, America/Lima**, tras la autorización «Autorizo» para aplicar el [plan revisado](production-publication-review.md), publicar y crear el acceso inicial del organizador. **Producción está disponible en [amigo-secreto2026.vercel.app](https://amigo-secreto2026.vercel.app).** Staging conserva sus proyectos, datos y acceso independientes.

## Versión e infraestructura

| Componente | Estado final |
| --- | --- |
| Supabase productivo | `jtuhcilcnuydsbcbsazo`, `AmigoSecreto2026`, ACTIVE_HEALTHY. |
| Vercel productivo | `prj_gltGLu834t0fnjSB64FRMApxOI9h`, equipo `franco-9ec3`. |
| Frontend/Node | `dpl_Bo3Vt83ahS1pi98FEv7yCbiAf3DD`, READY, **Node 24.x efectivo**. |
| Dominio | `https://amigo-secreto2026.vercel.app`, alias consultado y vinculado al despliegue anterior; HTTP 200. |
| Edge | `wishlist-api` v3, `media-upload` v3, `product-metadata` v4, ACTIVE y `verify_jwt=false`; autorización propia comprobada. |
| Migraciones | Catorce versiones registradas; **cero pendientes y cero aplicadas en esta publicación**. |
| Datos | Cero participantes, regalos, medios, importaciones, objetos Storage y usuarios Auth; una fila de evento y **un organizador activo**. Las pruebas generaron tres filas de cuotas, sin añadir datos ficticios al grupo. |

Se revalidaron identidades, huellas y snapshot antes de cambiar el remoto. El [respaldo SQL cifrado/restauración local](production-recovery-result.md) y las copias runtime cifradas se comprobaron. Se conservaron las dieciséis variables Vercel de integración existentes y se añadieron únicamente las cinco previstas de aplicación, solo para Production. El HMAC del proxy es Sensitive. Edge recibió siete variables propias y secretos nuevos de producción, cifrados localmente, sin copiar staging.

Auth tiene registro/acceso anónimo deshabilitados, URL canónica y lista de redirecciones vacía; Data API expone solo `public` y Storage limita a 3 MiB. El contrato SQL final coincide con la inspección previa: ocho tablas RLS, 72 columnas, 71 restricciones, 24 índices, cinco políticas, cinco triggers y 23 funciones invoker con permisos previstos. No hubo reset, seeds, cambios de roles, contraseña DB, restauración remota, Git push o mensajes a participantes. Edge se desplegó desde un workdir aislado; no se creó un enlace de proyecto en la raíz.

## Ajustes necesarios al publicar

El primer build READY eligió Node 26 porque el rango raíz `>=24` prevaleció sobre la preferencia del proyecto. Se fijó **`24.x` en `package.json` y en la raíz del lockfile**, sin cambiar dependencias o código de interfaz. El nuevo manifiesto registra las 137 fuentes y exactamente esos dos cambios frente a la versión aceptada en staging; las otras 135 huellas y las catorce migraciones permanecen intactas. Pasaron typecheck y las cinco pruebas de configuración; el build remoto confirmó Node 24.

El build se creó con `--prod --skip-domain`. Se verificaron sus rutas/cabeceras y bundle antes de promover. La URL inmutable estaba protegida; se generó un bypass de automatización temporal para la prueba y **se revocó al finalizar**, sin guardar su valor o cookies. No se deshabilitó la protección general. La CLI marcó el despliegue como actual, pero dejó solo el alias del equipo: se asignó explícitamente el dominio canónico ya verificado y se consultó su recurso de alias para demostrar la vinculación exacta.

Después de los builds, los dos campos Auth de URL/redirecciones volvieron al alias/previews anteriores; la causa no se demostró y es compatible con una sincronización de integración. Se reaplicaron los valores canónicos aprobados y la auditoría posterior a la promoción confirmó que seguían exactos. **En futuras publicaciones, comprobar de nuevo esos campos al terminar**, sin dar por hecho que persisten por haberlos configurado antes del build.

## Aceptación y límites

- HTTP canónico: raíz/rutas profundas/recarga correctas; assets/API inexistentes 404 sin fallback SPA; proxy GET 405 y POST sin firma 401. Cabeceras y CSP ligadas al Supabase productivo.
- Backend: lectura pública de participantes/regalos vacíos y evento, signup deshabilitado, RPC de servidor denegada al cliente, CORS canónico 204, origen ajeno 403 y peticiones sin capacidad 401 en los tres handlers.
- **Dieciséis archivos JavaScript públicos** recorridos, con hashes y destino productivo; sin los HMAC comprobados, claves secret/management o Ref de staging en ese contenido. No equivale a una auditoría universal de secretos.
- Transporte operativo: Edge rechazó un nonce no reservado con 409 y Node devolvió su rechazo 409 firmado, con HMAC verificado. No hubo reserva ficticia, descarga o importación completa. El recorrido completo con producto/imagen persistida se probó en staging, no sobre el catálogo productivo vacío.
- Edge de escritorio/móvil aislado: catálogo vacío correcto; entrada del organizador y lectura del evento sin guardar; fragmento retirado, sin token en URL HTTP o localStorage/sessionStorage. Recargar retiró el acceso en memoria. CSP real bloqueó script inline y conexión ajena; cero errores de página observados. Capturas revisadas.
- El único bootstrap usó `private.bootstrap_organizer(..., false)` con SHA-256, nunca el token en claro. Se verificaron acceso y listado del organizador. La [transacción revisable](sql/production-bootstrap-organizer.sql) exige contexto administrativo, historial/estado esperado y ausencia de accesos; no rota ni recupera enlaces ajenos.

No se probaron altas/edición de personas, fotos o guardado de regalos en producción porque se autorizó publicarla sin añadir esos datos. Esos recorridos y sus correcciones pasaron en staging; no se presentan como una prueba productiva que no se ejecutó. No se copiaron a producción las personas o regalos existentes en staging.

## Logs y asesores

Supabase: ventana posterior a la promoción **19:37:02–19:41:07 del 31 de octubre, Lima** (`00:37:02–00:41:07 UTC` del 1 de noviembre). Se revisaron **108 eventos de cuatro fuentes**, sin estados 5xx o severidad error/fatal/crítica y sin patrones de excepción en los 47 eventos runtime. Los dos 409 corresponden a la prueba deliberada del nonce. No aparecieron marcadores de fragmento, cabecera privada o token de gestión en los campos consultados.

Se clasificaron 24 eventos con `sb_secret_`: eran únicamente los dos campos de **prefijo truncado de 15 caracteres** de metadatos del proveedor, sin coincidencias largas de clave. No se descargaron los valores para clasificarlos. Vercel expuso una línea JSON de runtime y 94 de solicitudes en su ventana de 30 minutos, sin marcadores de 5xx/error o privados en la salida revisada. Son ventanas acotadas sujetas a ingestión/retención, no certificación de todos los logs.

Asesores: **sin WARN/ERROR; cinco INFO de seguridad y nueve INFO de rendimiento**. Las cinco tablas de `private` tienen RLS sin políticas de cliente por diseño, consistente con los grants/USAGE verificados; no se añadieron políticas permisivas. Rendimiento señala dos FK compuestas sin un índice específico (`gifts_owned_image_fk` y `participants_owned_photo_fk`) y siete índices sin uso registrado en esta base nueva. Revisar planes/volumen antes de proponer una migración de optimización; no retirar índices por no tener uso todavía. Los avisos no se ocultaron ni se aplicaron cambios SQL para silenciarlos. [Criterio oficial de revisión de asesores](https://supabase.com/docs/guides/observability/advisors).

## Abrir tu organizador

Desde la raíz del repositorio, en este usuario/equipo Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\artifacts\deployment\production\open-organizer.ps1 -Open
```

`-Check` verifica el cifrado sin abrir navegador. El helper y `organizer-access.dpapi.local` están ignorados por Git y excluidos de Vercel. El enlace no se imprimió en el chat o logs. No debes crear otro organizador al iniciar sesión: reabre el enlace conservado; la aplicación elimina su permiso en memoria al recargar/cerrar. Si rotas el enlace desde la interfaz, conserva el nuevo: este archivo inicial seguirá conteniendo el anterior. No se ejecuta recuperación automática.

## Cierre y operación posterior

**T25 queda completado en el alcance autorizado: staging separado, revisión/recuperación, publicación y aceptación productiva descrita.** Queda a cargo del organizador incorporar las personas reales y distribuir sus enlaces; no se hicieron esas acciones automáticamente. La copia externa continúa pendiente por decisión del usuario y DPAPI depende de este usuario/equipo. La restauración alojada completa tampoco se ha ensayado.

Este despliegue Node 24 verificado es el punto productivo que debe conservarse para volver desde una versión futura compatible. Antes de esta publicación no existía un retorno funcional: los tres ERROR originales y el build intermedio Node 26 no se consideran retorno aprobado. Un rollback de frontend no revierte Edge, secretos o datos; revisar siempre compatibilidad y [recuperación](backup-recovery.md).

Evidencias ignoradas en `artifacts/production-publication/`: `configuration-journal.json`, `configuration-result.json`, `runtime-source-manifest.json`, `edge-command-result.json`, `build-status.json`, `build-http-verification.json`, `temporary-bypass-result.json`, `promotion-result.json`, `canonical-alias.json`, `bootstrap-result.json`, `backend-verification.json`, `final-smoke-result.json`, `browser-acceptance-result.json`, `final-audit-result.json`, logs/asesores, capturas y `release-result.json` con hashes. Los archivos de error de intentos iniciales son históricos; los resultados finales anteriores registran el cierre correcto. La aceptación no afirma que HEAD contenga todos los cambios: no se creó commit o push.
