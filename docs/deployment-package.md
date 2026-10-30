# T25: paquete local para revisar el despliegue

T25 está **en preparación; no desplegado**. El usuario confirmó que Supabase **AmigoSecreto2026 se reserva para producción** y que debe prepararse un staging separado. También identificó el proyecto Vercel `franco-9ec3/amigo-secreto2026`. No se ha comprobado su configuración, dominio, historial o contenido remoto. No existe todavía un Project Ref confirmado para staging ni un dominio de prueba aprobado.

El paquete permite revisar código, migraciones y configuración antes del primer acceso a la base remota, como pidió el usuario. La secuencia posterior y la aceptación están en [despliegue y rollback](deployment-review.md); las variables por servidor, en [entornos](environment.md). Las integraciones Supabase y Vercel se sugirieron, pero no consta su instalación/conexión. La herramienta de navegador respondió que su host no estaba disponible; no se accedió al dashboard autenticado por esa vía.

## Generar sin credenciales ni red

Desde la raíz, con Node 24 y dependencias instaladas:

```cmd
npm.cmd run prepare:deployment -- --stage staging --supabase-url https://fixture.supabase.co --app-url https://amigo-staging.example.com
```

**Ambos dominios son ficticios.** Este comando reproduce el ejemplo local; no crea un proyecto ni comprueba que exista. Cuando se conozcan los destinos reales de staging, sustituir ambos orígenes y regenerar. El generador no lee `.env.local`, no obtiene claves, no vincula proyectos ni contacta servicios. Rechaza orígenes HTTP, IP/loopback, credenciales en URL, rutas, query, fragmentos y comodines. Exige elegir explícitamente `staging` o `production`; no deduce el entorno de las variables locales.

Salida, ignorada por Git:

- `artifacts/deployment/staging/vercel.json`: configuración Vercel propuesta, con CSP limitada al Supabase elegido.
- `artifacts/deployment/staging/manifest.json`: orígenes, SHA-256 de cada archivo y de la configuración, inventario de las 14 migraciones, `deployed: false` y `remoteInspected: false`.

El manifiesto incluye código de aplicación/servidor/funciones, migraciones, lockfile y configuración de build; excluye entornos, semillas y participantes locales. **El inventario no es la lista de migraciones pendientes del remoto.** Esa lista depende de revisar su historial y datos después de aprobar el acceso. Cualquier cambio posterior requiere regenerar y revisar las huellas. No se creó un `vercel.json` raíz con un destino supuesto.

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

## Paso remoto pendiente

Conectar Supabase y Vercel mediante las integraciones sugeridas o autenticar sus CLI por un canal seguro, sin enviar tokens al chat. Preparar **AmigoSecreto2026-staging** como nombre propuesto, confirmar organización, región, PostgreSQL y disponibilidad/coste antes de crearlo; no se ha creado ni se presupone gratuito. Reservar un dominio estable de prueba y sus variables, aislados de producción.

Presentar ese destino y el inventario de migraciones para revisión antes de consultar la base remota. Tras aprobar, comparar historial/datos, respaldo y lista exacta pendiente; presentar diferencias antes de aplicar. No ejecutar `db reset`, seeds o bootstrap local contra proyectos alojados. La publicación y las pruebas reales siguen la [secuencia T25](deployment-review.md). T21 mantiene pendiente el recorrido con lector: el usuario aclaró que solamente se abrió la ventana.
