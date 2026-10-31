# T25: paquete local para revisar el despliegue

T25 está **publicado y comprobado en staging**: [abrir aplicación](https://amigo-secreto2026-staging.vercel.app). Supabase `eknnkmndfxgyjsdgkwkh` (`us-east-1`, PG17) y Vercel `franco-9ec3/amigo-secreto2026-staging` tienen IDs distintos de producción. Las 14 migraciones, tres Edge, variables propias, frontend/descargador y bootstrap están completos; aceptación técnica alojada correcta. [Resultado de publicación, acceso y pendientes](staging-deployment-result.md); [baseline y migraciones](staging-migration-result.md). Producción no fue consultada por SQL ni modificada. Recorrido guiado con lector T21 validado por el usuario y [logs Supabase revisados](staging-logs-review.md); [inspección productiva preparada](production-review.md), todavía no ejecutada.

La corrección posterior de confirmación de guardado y subida durante revalidación está publicada; [seguimiento](staging-feedback-result.md). Conserva el manifiesto inicial y añade `artifacts/t25-feedback/source-manifest.json` para las fuentes nuevas, sin modificar el conjunto de migraciones.

El paquete permite revisar código, migraciones y configuración antes de aplicarlos. Se respetaron las pausas de inspección y aplicación; la publicación recibió autorización posterior. La secuencia está en [despliegue y rollback](deployment-review.md); variables por servidor, en [entornos](environment.md). Ambas CLI están autenticadas; no dependen de las integraciones del chat o de la extensión VS Code.

La [preparación de staging](staging-review.md) y el [conjunto de 14 migraciones aplicado](staging-migration-review.md) precedieron a la publicación. La comprobación inicial encontró cero participantes/regalos/accesos; la aceptación posterior creó únicamente dos participantes y un regalo sintéticos. No se usaron `link`, include-all/include-roles/include-seed o reset.

## Generar sin credenciales ni red

Desde la raíz, con Node 24 y dependencias instaladas:

```cmd
npm.cmd run prepare:deployment -- --stage staging --supabase-url https://eknnkmndfxgyjsdgkwkh.supabase.co --app-url https://amigo-secreto2026-staging.vercel.app
```

**Son los destinos reales de staging identificados por gestión.** Este comando solo reproduce el paquete local; no crea proyectos ni comprueba el servidor. El generador no lee `.env.local`, no obtiene claves, no vincula proyectos ni contacta servicios. Rechaza orígenes HTTP, IP/loopback, credenciales en URL, rutas, query, fragmentos y comodines. Exige elegir explícitamente `staging` o `production`; no deduce el entorno de las variables locales. Los artefactos ficticios de la preparación anterior fueron reemplazados por esta generación.

Salida, ignorada por Git:

- `artifacts/deployment/staging/vercel.json`: configuración Vercel propuesta, con CSP limitada al Supabase elegido.
- `artifacts/deployment/staging/frontend.env.example`, `edge.env.example` y `fetch-proxy.env.example`: plantillas con orígenes/callback coherentes y marcadores de claves; sin valores secretos. No sobrescriben archivos locales. Los valores reales se configuraron después por los canales de cada proveedor.
- `artifacts/deployment/staging/manifest.json`: orígenes, SHA-256 de cada archivo, configuración y plantillas, inventario de las 14 migraciones, `deployed: false`, `remoteInspected: false`, destino sin verificar y plan de migraciones todavía limitado al inventario.

El manifiesto incluye código de aplicación/servidor/funciones, migraciones, lockfile y configuración de build; excluye entornos reales, semillas y participantes locales. **El inventario no es la lista de migraciones pendientes del remoto.** Esa lista depende de revisar su historial y datos después de aprobar el acceso. Cualquier cambio posterior requiere regenerar y revisar las huellas. El generador no verifica que los orígenes pertenezcan al entorno elegido: confirmar IDs/destinos antes de usarlo. No se creó un `vercel.json` raíz con un destino supuesto.

La inspección y aplicación posteriores reconciliaron ese inventario: las 14 están registradas y no quedan pendientes. Huellas/aprobación/recuperación constan en `migration-plan.json` y el [resultado SQL](staging-migration-result.md); estado publicado en `infrastructure.json`, `hosted-deployment.json` y el [resultado alojado](staging-deployment-result.md). Los flags del manifiesto offline reflejan su generación anterior y no sustituyen esas evidencias. Regenerarlo no vuelve a publicar ni autoriza reaplicar migraciones.

Fuentes: [generador](../scripts/prepare-deployment.mjs), [configuración](../server/deployment-config.ts), [pruebas de rutas y orígenes](../tests/unit/deployment-config.test.ts).

## Configuración de alojamiento preparada

| Componente | Comportamiento propuesto |
| --- | --- |
| Build | Vite, `npm ci --include=dev --ignore-scripts`, `npm run build`, salida `dist`. Seleccionar y verificar Node 24 en el proyecto alojado. |
| SPA | Fallback de rutas de aplicación a `index.html`; excluye `/api`, `/assets` y rutas con extensión. Probar recarga de perfil/editor directamente en staging. |
| Descargador | `api/fetch-product.ts`, duración máxima 15 s, con firma HMAC y callback antes de DNS. Sin claves DB ni tokens personales en este proceso. |
| CSP | Scripts y CSS propios; conexiones propias y un único origen Supabase exacto. Imágenes HTTPS/blob/data conforme a los formularios existentes. Sin `unsafe-eval`, scripts inline o comodín de Supabase. |
| Estilos de atributos | `style-src-attr 'unsafe-inline'` permite las propiedades visuales de React; la política de scripts sigue limitada a recursos propios. |
| Cabeceras | `no-referrer`, `nosniff`, sin framing, sin cámara/micrófono/geolocalización y `noindex, nofollow`. Documentos sin caché; assets con hash inmutables. |
| Subida CLI | [.vercelignore](../.vercelignore) excluye entornos, caches locales, respaldos, artefactos, pruebas y SQL. Conserva `supabase/functions/_shared`, requerido por el adaptador Node. |

La exclusión de subida no sustituye Git ni protege un archivo ya versionado. Tampoco restringe los archivos producidos por el build: se inspecciona `dist` con `test:security`. Las variables públicas de build y las dos variables privadas del descargador se configuran en el proveedor para **ese entorno**, sin subir los archivos locales. Las pruebas locales no certifican el router, los límites o la infraestructura de Vercel.

La CLI admite pasar la configuración mediante `--local-config artifacts/deployment/staging/vercel.json`. Ese argumento por sí solo no selecciona proyecto, cuenta o entorno, ni evita un despliegue. No ejecutar `vercel` con él hasta revisar autenticación, destino, variables y permiso de publicación. Para despliegues desde Git habrá que versionar una configuración raíz revisada del entorno o adaptar el flujo de build; este generador no configura despliegues automáticos.

Referencias oficiales revisadas: [rutas Vite](https://vercel.com/docs/frameworks/frontend/vite), [configuración Vercel](https://vercel.com/docs/project-configuration/vercel-json), [configuración local de CLI](https://vercel.com/docs/cli/global-options#local-config) y [exclusiones de subida](https://vercel.com/docs/deployments/vercel-ignore).

## Repetir la comprobación local

```cmd
npm.cmd run test:hosting:local
npm.cmd test
npm.cmd run build
npm.cmd run test:security
npm.cmd run check:docs
```

`test:hosting:local` usa loopback **4203**, un build de producción sintético y Edge/Firefox/WebKit de Playwright. Requiere Edge instalado y los motores Playwright disponibles en `artifacts/playwright-browsers`, o indicar `PLAYWRIGHT_BROWSERS_PATH`. Si faltan motores, seguir la [instalación de navegadores](accessibility-review.md#comprobaciones-reproducibles) con la versión del lockfile y esa ruta antes de repetir. No usa Docker, `.env.local`, participantes reales o Supabase alojado. No reutiliza un servidor que ocupe el puerto. Guarda capturas sintéticas bajo `artifacts/hosting-local` y cierra sus procesos.

Se comprueban rutas profundas y recarga, estilos, guardado del editor con transporte simulado, CSP efectiva y bloqueo real de script inline/conexión no permitida en los tres motores. El adaptador Node real rechaza POST sin firma y métodos no permitidos; API/asset inexistente no recibe HTML. Los datos API son interceptados: este ensayo **no comprueba** CORS remoto, persistencia alojada, importación desde una tienda real o autorización contra una base alojada.

Además pasó un build en una copia con solo las fuentes necesarias para hosting, sin entornos, tests, scripts ni SQL. Se reutilizaron dependencias de la instalación limpia de T24 mediante junction local; no se simuló una instalación Linux de Vercel ni se subió esa copia. Evidencia completa: [validación](validation-results.md).

## Estado remoto y continuación

Ambas CLI están autenticadas y los dos proyectos staging están publicados/configurados. El usuario confirmó Supabase Free; no se solicitaron upgrades o add-ons. API/signup, secretos propios, funciones/descargador, frontend, acceso inicial y aceptación técnica alojada están registrados en el [resultado](staging-deployment-result.md).

La promoción sigue la [secuencia T25](deployment-review.md), con revisión/aprobación separadas para producción. El acceso del organizador se abre mediante el helper cifrado documentado; no ejecutar bootstrap de nuevo, `db reset` o seeds. El usuario validó posteriormente el recorrido guiado con lector T21 y aclaró el bloqueo previsto del selector al crear un participante aún sin guardar.
