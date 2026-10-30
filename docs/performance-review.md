# T23: rendimiento del build de producción

Medición local del 30 de octubre de 2026 (America/Lima), con datos sintéticos. Se cumplieron los presupuestos del plan en las muestras finales: LCP ≤ 2500 ms, CLS ≤ 0,1 y JavaScript público inicial ≤ 200 000 bytes gzip. Son resultados de laboratorio, no métricas de visitantes de producción.

## Resultado antes y después

P75 calculado por rango más próximo sobre cinco navegaciones móviles y tres de escritorio por ruta. Cada navegación usa un contexto nuevo, caché desactivada y build de producción; se cuentan todos los scripts descargados por la ruta, incluidos sus módulos públicos diferidos.

| Ruta / dispositivo | LCP p75 antes → después (ms) | CLS p75 antes → después | JS gzip antes → después (KB) | Lecturas API |
| --- | --- | --- | --- | --- |
| Catálogo móvil | 1700 → **1440** | 0,0366 → **0,0366** | 174,45 → **124,42** | 2 |
| Perfil móvil | 2684 → **2048** | 0,2066 → **0** | 181,22 → **131,25** | 1 |
| Catálogo escritorio | 328 → **288** | 0,0019 → **0,0019** | 174,45 → **124,42** | 2 |
| Perfil escritorio | 788 → **668** | 0,1068 → **0** | 181,22 → **131,25** | 1 |

KB significa 1000 bytes. En las cinco muestras móviles finales, LCP del catálogo fue 1408–1488 ms y el del perfil 2020–2108 ms; todas quedaron por debajo de 2500 ms. El JavaScript del catálogo bajó un **28,7 %**. El build habitual de Vite informa una estimación de 125,77 KB gzip y 400,36 KB minificados para la entrada, frente a 176,17/598,54 KB anteriores; desapareció el aviso de chunk mayor de 500 KB sin elevar el umbral. La tabla usa compresión gzip de Node aplicada uniformemente al contenido servido, para comparar con el mismo método y configuración pública sintética.

El momento en que el ensayo verificó el contenido listo también se registró para distinguirlo del elemento LCP: p75 móvil de aproximadamente 1715 ms en catálogo y 2144 ms en perfil. Incluye la espera del verificador, no es una marca interna exacta de React. El LCP puede ser un texto de carga o una imagen según el contenido visible; el reporte conserva el elemento y la secuencia de desplazamientos para interpretar el valor.

## Cambios justificados por la medición

1. **Cliente público específico de PostgREST.** El inventario de módulos mostró Auth, Realtime, Phoenix y Storage en la entrada inicial del SDK completo, aunque el cliente público solo usa `.from(...)`. `createPublicDataClient` usa ahora `@supabase/postgrest-js` **2.118.0**, la misma versión ya presente transitivamente, declarada directamente con versión exacta y lockfile. Conserva tipos, filtros, relaciones anidadas, errores, cancelación, esquema `public`, API key pública y encabezado anónimo. Valida la configuración, omite cookies y Referer y no mantiene sesiones. Grants/RLS y las mutaciones Edge siguen siendo la autoridad; no se trasladó autorización al navegador. No cambia el alcance funcional. Referencia del SDK oficial: [PostgREST JS](https://github.com/supabase/supabase-js/tree/master/packages/core/postgrest-js).
2. **Espacio durante carga de perfil.** La instrumentación identificó el cierre y footer como fuentes del CLS: estaban visibles en el estado corto de carga y bajaban al llegar los datos. Solo el estado de carga del perfil reserva ahora al menos `100svh`, de modo que el footer queda fuera del viewport durante esa transición. Los estados de error/404 conservan su tamaño y acciones. La regresión detectó además un título de carga que podía desbordarse a 320 px/200 %; se acotaron los hijos y se permitió envolver el texto, con una respuesta demorada controlada para probarlo.
3. **Prioridad de la primera imagen.** El elemento LCP del perfil móvil fue la imagen del primer regalo. Esa imagen se solicita de forma inmediata con `fetchPriority="high"`; las otras opciones conservan carga diferida y sus dimensiones reservadas. No se descargan por adelantado rutas privadas ni se elimina contenido para mejorar la puntuación.

Se conservaron las consultas existentes, sin añadir caché persistente, polling, bibliotecas de estado o endpoints. El ejecutor falla si vuelven al JavaScript público los módulos de Auth, Realtime o Storage, o si aparecen los chunks de organizador, editores o galería antes de una interacción.

## Condiciones exactas y solicitudes

- Windows, Node **24.14.0**, Edge headless **156.0.4314.50**; AMD Ryzen 7 5700X, 16 procesadores lógicos y 24 GB de RAM. Otros procesos del equipo pueden introducir variación; se evitó ejecutar las suites de navegador simultáneamente con las mediciones.
- Móvil: 390 × 844 CSS px, DPR 3, tacto, **CPU 4×**, latencia añadida de **150 ms**, descarga de **1,6 Mbps** y subida de 0,75 Mbps mediante CDP. Escritorio: 1280 × 900, DPR 1, CPU 1×, latencia 20 ms y descarga 10 Mbps.
- Servidores HTTP en loopback, puertos **4193/4194**, respuesta gzip y API de lectura con forma PostgREST. No intervienen DNS/TLS remotos, región de Supabase, Vercel, CDN o tiendas reales.
- Once participantes y tres regalos por persona, únicamente en memoria del ejecutor. Las imágenes se generan con el normalizador real: avatar WebP 512 × 512 / **5714 bytes**, regalo WebP 1200 × 1200 / **21 444 bytes**. No se insertan esos regalos en listas del usuario. Las primeras sondas de preparación usaron imágenes originales de 4000 px; se sustituyeron por salidas normalizadas **antes de registrar la comparación definitiva**, para respetar el contrato de Storage.
- Observadores LCP y layout-shift instalados antes del código de la aplicación. Sin clic, scroll o interacción en la ventana de medición; espera mínima de 2,5 s tras contenido listo y hasta red inactiva. CLS excluye cambios con entrada reciente y toma la mayor ventana de sesión de hasta 5 s, separada por huecos mayores de 1 s.

| Navegación fría | HTML | CSS | JS | Preflight | GET API | Imágenes | Total registrado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Catálogo móvil | 1 | 1 | 1 | 2 | 2 | 3 | **10** |
| Catálogo escritorio | 1 | 1 | 1 | 2 | 2 | 11 | **18** |
| Perfil móvil / escritorio | 1 | 1 | 7 | 1 | 1 | 4 | **15** |

Las imágenes visibles/cercanas se deciden por la carga diferida del navegador, de ahí la diferencia móvil/escritorio. La captura se realiza después de medir. Las dos consultas del catálogo se ejecutan en paralelo: participantes con `gifts(count)` y ajustes; el perfil usa una consulta por slug con `gifts(*)`. El ejecutor verifica ese número en cada muestra y que no se repita después del estado listo. No son tiempos de ejecución SQL ni un EXPLAIN del proveedor; no se consultó ni modificó su base para inferirlos. No se observó un patrón N+1 que justificara cambiar consultas o índices.

## Reproducir y revisar artefactos

```cmd
npm.cmd ci
npm.cmd run measure:performance
```

No requiere Docker, claves o `.env.local`. El comando construye su propio bundle en `artifacts/performance/final/build`, excluye archivos de entorno y variables públicas heredadas, levanta exclusivamente sus dos servidores de lectura y cierra servidores/navegador al terminar. Rechaza otros argumentos/destinos. Si los puertos están ocupados, falla y conserva el proceso existente. No toca `dist`, datos, enlaces o infraestructura de Supabase.

Artefactos ignorados por Git:

- `artifacts/performance/baseline/report.json` y `final/report.json`: condiciones, muestras individuales, resúmenes, secuencia CLS, elemento LCP, recursos/CDP, consultas y huella del código fuente previo al build.
- `baseline/bundle.json` y `final/bundle.json`: imports y peso por chunk/módulo, para localizar regresiones. Los módulos usan `renderedLength` previo a minificación; no se suman como bytes gzip transferidos.
- Capturas de catálogo/perfil en móvil/escritorio dentro de cada carpeta; el contenido debajo del viewport puede permanecer sin decodificar por carga diferida hasta hacer scroll.
- `artifacts/t23-performance.log`, `t23-build.log`, `t23-base-tests.log`, `t23-ui-regression.log`, `t23-admin-ui.log` y `t23-npm-audit.json`: resultados de esta sesión.

`npm.cmd run measure:performance -- --label baseline` mide el **código actual** con otra etiqueta y sobrescribe esa carpeta; no recupera la versión anterior. La línea base aquí comparada se guardó antes de las optimizaciones. El comando normal solo reemplaza `final` y conserva esa referencia.

Para la regresión completa sin interferir con una previsualización abierta en 4173/4174, PowerShell:

```powershell
$env:APP_UI_ISOLATED='1'
npm.cmd run test:ui -- --workers=2
npm.cmd run test:a11y -- --workers=2
Remove-Item Env:APP_UI_ISOLATED
```

Usa 4185/4186, con orígenes de fixtures centralizados; el modo de seguridad conserva su pareja 4183/4184 y los comandos habituales mantienen 4173/4174. No se reutilizan servidores existentes.

## Alcance del cierre

Validación final: **121 unitarias, 303 aserciones PGlite, 11 pruebas de datos, 339/339 UI y 37 comprobaciones entre motores** correctas, además del recorrido real del organizador en pila desechable, TypeScript, build, revisión de secretos y audit npm sin avisos conocidos. La primera regresión detectó el título de carga a 320 px/200 %; después de corregirlo y probar la demora controlada, la ejecución completa final pasó sin reintentos. Recuentos y logs: [resultados de validación](validation-results.md).

Estas medidas cubren catálogo y perfil público de producción bajo condiciones de laboratorio. No son Lighthouse, CrUX, INP ni una garantía sobre otros equipos, imágenes externas o redes. Deberán repetirse contra staging autorizado para incluir latencia, compresión y cabeceras de la infraestructura final. Fuentes de la metodología: [LCP](https://web.dev/articles/lcp), [CLS y ventanas de sesión](https://web.dev/articles/cls), [CDP en Playwright](https://playwright.dev/docs/api/class-cdpsession) y [build de Vite](https://vite.dev/guide/build).

T21 conserva pendiente la revisión con lector de pantalla real. T24 continúa con las guías operativas y la restauración; T25 requiere revisión y aprobación antes de actuar sobre infraestructura remota.

| Archivos | Cambio en T23 |
| --- | --- |
| `scripts/measure-performance.mjs`, `package.json`, `vite.config.ts` | Medición, presupuestos, inventario y build público aislado. |
| `src/services/supabase.ts`, `catalogue.ts`, `profile.ts`, `profile-editor.ts` | Cliente público PostgREST tipado y contratos de lectura. |
| `package-lock.json`, `tests/unit/public-rest-client.test.ts` | Dependencia exacta existente y tres pruebas del transporte real del cliente. |
| `ParticipantProfilePage.tsx`, `src/styles/profile.css` | Reserva del estado de carga para evitar el desplazamiento del footer. |
| `GiftImage.tsx`, `WishlistGrid.tsx` | Prioridad de la primera imagen sin perder dimensiones ni fallback. |
| `playwright.config.ts`, fixtures y specs UI con orígenes literales | Centralización de parejas locales para ejecutar regresiones sin detener la previsualización del usuario. |
| README, avance, matriz de aceptación y resultados | Evidencia, comandos y limitaciones. |
