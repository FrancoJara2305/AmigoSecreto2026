# T25: aplicación publicada y comprobada en staging

**Seguimiento actual:** las correcciones de confirmación visible y subida durante revalidación están publicadas en `dpl_GLM6zkS49db44WAJSD7VdhVb7m6h`; [resultado y pendientes](staging-feedback-result.md). El informe siguiente conserva la evidencia de la publicación inicial.

Resultado del 2026-10-31 (America/Lima). **Staging está publicado:** [abrir catálogo](https://amigo-secreto2026-staging.vercel.app). Supabase `eknnkmndfxgyjsdgkwkh` y Vercel `prj_5efvOrvzHx8WtpOy6YbRRLufpTwp` son proyectos independientes de producción. El usuario autorizó continuar después de revisar y aplicar las migraciones. No se enviaron mutaciones ni consultas SQL a producción; no hubo seed, reset, restauración remota, Git push o mensajes a participantes.

## Versión y configuración

| Componente | Resultado |
| --- | --- |
| Vercel | `franco-9ec3/amigo-secreto2026-staging`, despliegue `dpl_5yVrfEAgD4AdRnopdxdqSdem65tN`, `READY`; dominio canónico público HTTPS. |
| Build | Node 24, Vite, instalación desde lockfile con `npm ci --include=dev --ignore-scripts`; build remoto correcto. |
| Backend | Las 14 migraciones revisadas siguen registradas; cero pendientes. [Recuperación y resultado anterior](staging-migration-result.md). |
| Edge | `wishlist-api`, `media-upload` y `product-metadata`, activas en versión 1; `verify_jwt=false` y autorización propia mediante capacidades/SQL. Se incluyeron los recursos WASM del recodificador. |
| Data API | Solo `public` expuesto; exposición automática de tablas desactivada. Nueve RPC públicas `SECURITY INVOKER`, sin ejecución para `anon`/`authenticated`; ocho tablas de aplicación con RLS. |
| Auth y Realtime | Signup y acceso anónimo desactivados, `site_url` de staging; cero usuarios Auth y cero relaciones en `supabase_realtime`. La app no usa sesiones Auth. `auth.enabled=false`/`realtime.enabled=false` del TOML local **no apagan los servicios alojados**. |
| Storage | Límite remoto 3 MiB; bucket `wishlist-media` público para lectura JPEG/PNG/WebP y escritura protegida por backend. |
| Cuotas | `RATE_LIMIT_IP_SOURCE=off`, límites globales y de capacidad; no se confía en una cabecera IP sin verificar al proveedor. |

Se aplicó una configuración remota acotada: cuatro cambios declarados (esquemas API, signup, URL de Auth y límite Storage). El diff posterior no tiene cambios declarados pendientes; nueve diferencias de propiedades no declaradas se dejaron intactas. No se copió el TOML local completo.

El destino `production`/`--prod` de Vercel se usó **dentro del proyecto staging separado** para asignar su alias estable; no identifica al proyecto productivo `amigo-secreto2026`. Las URLs efímeras conservan la protección del proveedor. CORS y enlaces privados usan únicamente el dominio canónico, sin comodines para previews.

Vercel recibió cinco variables: las tres públicas `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_URL`, el callback HTTPS `FETCH_PROXY_CALLBACK_URL` y `FETCH_PROXY_HMAC_SECRET` marcado Sensitive. Edge recibió siete variables de aplicación: orígenes/base URL, modo IP, HMAC de cuotas, URL/HMAC del proxy y `APP_LOCAL_FETCH_PROXY=0`. Los dos HMAC se generaron para staging. No se copiaron claves de producción, DB/service_role o capacidades personales a Vercel.

El dry-run de subida incluyó 125 archivos regulares, sin entornos, respaldos, artefactos, SQL o pruebas. Las fuentes de aplicación y las 14 migraciones mantienen las huellas del paquete revisado. El despliegue procede del workspace revisado; no implica que todos sus cambios estén en HEAD. No se creó `.vercel/project.json` ni se vinculó Supabase en la raíz.

## Aceptación alojada

- Catálogo, perfil profundo, recarga y rutas privadas servidos por la SPA; API/assets inexistentes devuelven 404 sin HTML. Descargador real: GET 405 y POST sin firma 401.
- Cabeceras `no-referrer`, `nosniff`, `DENY`, `noindex, nofollow` y CSP con conexión al origen Supabase exacto. Edge permitió OPTIONS del origen canónico y rechazó un origen ajeno. En navegador alojado se bloquearon realmente script inline y conexión externa.
- Bootstrap inicial del organizador mediante hash, en canal administrativo del staging explícito. Dos participantes sintéticos; capacidad personal válida solo para su dueño y administración denegada a esa capacidad.
- Regalo creado/editado con persistencia real; versión antigua rechazada con 409. Subida PNG recodificada a WebP en el WASM alojado, asociada al perfil y leída desde Storage; asociación de imagen ajena rechazada.
- Importación HTTPS real de Factorio desde Steam: `status=ok`, título presente, sin guardar el regalo automáticamente. Funcionaron Edge → proxy Node con HMAC → callback/nonce SQL → tienda real.
- Navegador Edge: catálogo/perfil en escritorio y perfil móvil de 390 px; organizador, editor de participante y regalo persistido. Fragmento privado retirado y ninguna capacidad en URL de solicitudes, cuerpo o almacenamiento web en el recorrido comprobado. Se revisaron las capturas.
- Revocación real con editor personal abierto: Guardar mostró la pausa de edición, token anterior rechazado con 401 y borrador no persistido. Los tres tokens personales emitidos durante el ensayo están revocados; solo queda un organizador activo.

El primer ejecutor se detuvo por un selector que decía «Editar participante» donde el control se llama «Editar datos de …». Se corrigió el selector y continuó sobre los mismos datos, sin repetir altas ni cambiar la aplicación. El resultado final de aceptación es correcto.

Rendimiento alojado: 16 navegaciones frías, cinco móviles y tres de escritorio por ruta, con observadores LCP/CLS previos al código. Móvil 390×844/DPR3, CPU 4×, latencia añadida 150 ms y 1,6 Mbps; escritorio 1280×900, CPU 1×, 20 ms y 10 Mbps. HTTPS/red reales más limitación CDP, sin interacción, espera de red inactiva y 2,5 s; CLS por ventana de sesión. JS recompreso uniformemente con gzip para comparar presupuestos.

| Ruta | LCP p75 móvil / escritorio | CLS p75 móvil / escritorio | JS gzip |
| --- | --- | --- | --- |
| Catálogo | 1608 / 608 ms | 0,0017 / 0 | 125 164 bytes |
| Perfil | 1832 / 944 ms | 0 / 0 | 131 990 bytes |

Las cuatro series cumplen LCP ≤ 2500 ms, CLS ≤ 0,1 y JS ≤ 200 000 bytes gzip. El catálogo tiene solo dos personas y un regalo sin imagen de producto: no sustituye la [medición representativa local T23](performance-review.md), un catálogo alojado completo o datos de visitantes reales.

Estado final por SQL READ ONLY: dos participantes, un regalo, una imagen/registro de medio, una configuración de evento, un nonce de importación reclamado, cero permisos de escritura cliente. Son datos sintéticos públicos de prueba; no se copiaron personas o listas del grupo.

Se revisaron los logs expuestos por Vercel en los últimos 30 minutos: cero registros runtime disponibles y 176 solicitudes CDN, sin marcadores de fragmentos/cabeceras sensibles ni estados 5xx en esa muestra; sin páginas adicionales. Solo se guardaron agregados. La consulta inicial de una hora fue rechazada por retención Hobby y se ajustó a la ventana documentada. No se revisaron logs de Supabase ni se certifica ausencia de secretos desconocidos en toda la infraestructura.

## Acceso del organizador

La capacidad inicial está cifrada con DPAPI CurrentUser en `artifacts/deployment/staging/organizer-access.dpapi.local`. No se imprime ni se incluye en esta guía. Para abrirla desde la raíz del repositorio, con el mismo usuario Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\artifacts\deployment\staging\open-organizer.ps1 -Open
```

La excepción de ejecución se limita a ese proceso; no cambia la política del equipo. El helper valida el Ref/dominio antes de abrir el navegador. `-Check` verifica el cifrado sin abrir o mostrar el enlace; esa comprobación pasó. El fragmento privado puede quedar en el historial del navegador, por lo que este comando se usa en el perfil privado del organizador. Tras recargar una ruta privada hará falta volver a abrir su enlace: la credencial vive solo en memoria.

Contraseña DB, HMAC y acceso están cifrados por separado bajo `artifacts/`; la copia de variables públicas de build no contiene secretos de servidor. `artifacts/` está ignorado por Git y excluido de Vercel. DPAPI depende de este usuario/equipo; no equivale a custodia externa o respaldo portable. El baseline cifrado anterior es de aplicación vacía y no contiene el organizador o los datos de este ensayo.

## Evidencias y pendientes

Evidencias locales en `artifacts/deployment/staging/`: `hosted-deployment.json`, `infrastructure.json`, `functions-deployed.json`, `vercel-deploy-result.json`, `runtime-config-after.json`, `hosted-smoke-result.json`, `hosted-acceptance-result.json`, `verification-hosted.json`, `hosted-performance-result.json`, `vercel-log-review.json` y capturas en `screenshots/`. No publicar el directorio completo: también contiene archivos cifrados de acceso. `manifest.json` conserva la procedencia offline anterior al despliegue; no es el estado actual de infraestructura.

T25 sigue abierto para cerrar el recorrido con lector real de T21, revisar resultados y aprobar una eventual promoción a producción. Faltan revisión de logs Supabase, aceptación con más tiendas/catálogo representativo y custodia externa/recuperación del futuro entorno productivo antes de promover. No se certifican métricas de usuarios reales. La [guía de despliegue/rollback](deployment-review.md) mantiene la secuencia de promoción; no hay rollback anterior de staging porque esta es su primera publicación.
