# Avance del plan

Trabajo autorizado por iteraciones. Todo el trabajo aplicado hasta ahora se limita al entorno local; la instancia remota sigue pendiente de revisión y aprobación.

| Tarea | Estado real |
| --- | --- |
| T00 | Plan revisado y continuación autorizada por el usuario para las iteraciones locales. |
| T01 | Completa en local: códecs medidos en Edge durante T14 y transporte SSRF/DNS/TLS demostrado en Node durante T16, tras verificar la limitación de los clientes HTTP de Edge. Sin ensayo alojado. |
| T02 | React, TypeScript, Vite, Tailwind y React Router preparados; rutas de futuras pantallas pendientes de sus bloques. |
| T03 | Reglas puras de perfil/regalos, precios, URLs y detalles implementadas en T08 y reutilizadas por el editor T13. |
| T04 | Completa: esquema, relaciones, restricciones e índices probados localmente. |
| T05 | Grants, RLS, bucket y RPC restringidas de acceso/edición implementados y probados localmente. |
| **T06** | **Completa:** seed reproducible de 11 personas y 18 regalos, aplicado y probado en Supabase local. |
| **T07** | **Completa en local:** tokens, bootstrap, validación, pertenencia, emisión, revocación, rotación y recuperación, con pruebas SQL/HTTP/concurrencia. |
| **T08** | **Completa en local:** perfil, alta/edición/limpieza de regalos, validación, referencias propias, versiones, transacciones y pruebas de carreras/HTTP. |
| **T09** | **Completa en local:** tokens visuales, Tailwind, Lucide, componentes accesibles y previsualización con pruebas de navegador. |
| **T10** | **Completa en código local:** bienvenida, tarjetas 3/2/1, conteos, carga/error/vacío, consultas públicas y carga revisable de los once nombres con listas vacías. Aplicación al contenedor pendiente de Docker. |
| **T11** | **Completa en código local:** perfil por slug, tres posiciones, regalos/pendientes, preferencias, copia pública y estados de error/inexistente. |
| **T12** | **Completa en código local:** URL limpia antes de render, credencial solo en memoria, validación por API y navegación protegida por rol/propietario. Ensayo con Edge local real pendiente. |
| **T13** | **Completa en código local:** crear/editar/limpiar opciones, detalles por tipo/calzado, borradores, validación y revisión de conflictos. Ensayo contra Edge local real pendiente. |
| **T14** | **Completa en local:** subida autorizada, decodificación y WebP, asociación transaccional, limpieza con reintentos y pruebas SQL/Edge/Storage/concurrencia/UI. |
| **T15** | **Completa en local:** cuotas compartidas por minuto/hora, barrera de entrada, 429/Retry-After, limpieza acotada y concurrencia. Identidad IP solo tras verificar proveedor; fallback global activo. |
| **T16** | **Completa en local:** importación autorizada, cuotas, transporte HTTPS con IP fijada, protocolo firmado de un solo uso, parser y alternativa manual. Configuración ausente falla cerrada. |
| T17–T25 | Pendientes: selección/aplicación de sugerencias en T17, perfil en T18 y administración en T20. |

## T16: transporte seguro y parser

Ver [importación de productos](product-import.md). El sondeo reproducible de Edge encontró `ClientRequest.options.lookup` sin implementar y comprobación TLS contra la IP al usar fetch con Host de dominio. Se activa la alternativa Node ya prevista en el plan: un único adaptador descargador, sin credenciales de participantes ni claves de base de datos. Supabase conserva autorización, cuotas y parsing. No se desplegó el adaptador.

La migración incremental privada reserva solicitudes firmadas con vencimiento breve y consumo atómico antes de DNS. Node comprueba todas las direcciones A/AAAA, fija la conexión con Host/SNI originales y valida cada redirección. Límites de tiempo, streaming y JSON-LD; ninguna respuesta guarda un regalo. La UI de selección sigue en T17.

Resultado: 84 pruebas unitarias, 246 aserciones SQL en memoria y Docker, 11 pruebas de datos y 168 casos UI completos. Pasaron TLS real sintético, recorrido Edge→Node→SQL→parser, replay, pertenencia, DNS mixto sin conexión, 403/captcha, cuotas y concurrencia de consumo/vencimiento. TypeScript, build, lint y asesores locales correctos. Se conserva el aviso previo de chunk Vite. Solo se aplicó la nueva migración al contenedor local; se cerraron los servidores de prueba y se retiraron sus datos efímeros. Sin operación remota, seed ni cambios en los once participantes o `.env.local` del usuario.

## T15: cuotas atómicas

Ver [guía de límites](rate-limits.md). Dos migraciones incrementales unifican los contadores, distinguen ámbitos y duraciones, añaden diez cargas/hora por token y preparan las cuotas de importación sin habilitarla. Las RPC existentes conservan sus firmas y controles de autorización. Se comprueban límites de entrada antes de leer el cuerpo y se mantiene la espera más larga cuando coinciden las ventanas.

La IP no se infiere de cabeceras aportadas por clientes. El modo local y predeterminado usa límites globales/por token; HMAC de cabecera del proveedor queda disponible únicamente para una instalación con procedencia verificada. La limpieza automática y el comando local omiten ventanas activas/bloqueadas y limitan cada lote. No hay endpoint público de mantenimiento.

Resultado: 66 pruebas unitarias, 234 aserciones SQL tanto en memoria como en Docker, 11 pruebas de datos y 168 casos UI completos. Dos procesos HTTP compitieron por la décima carga horaria: uno obtuvo 201 y otro 429 sin crear otra reserva. Dos conexiones verificaron límites de minuto/hora y limpieza sin esperar filas bloqueadas. Pasaron también las regresiones HTTP y de concurrencia de acceso/edición/imágenes y el formulario real contra Edge/Storage/SQL. Lint y asesores locales sin incidencias; build correcto con el aviso previo de tamaño de chunk. Solo se aplicaron las dos migraciones locales; sin seed, cuentas Auth, cambios en `.env.local` o instancia remota.

## T14: carga, asociación y limpieza de imágenes

Ver [guía de imágenes](media-upload.md). El selector de archivos del editor utiliza la credencial en memoria y conserva la imagen anterior hasta guardar. El servidor autoriza antes de leer bytes, verifica contenedor/dimensiones, decodifica JPEG/PNG/WebP estáticas y genera WebP con ruta propia; vuelve a autorizar tras la subida. También prepara el propósito avatar para T18. No se habilitó un endpoint de mantenimiento.

Dos migraciones incrementales añaden reservas finalizables, guardas de asociación por propósito/propietario y reclamaciones duraderas de limpieza. El comando de mantenimiento es local, con simulación por defecto; usa Storage API y comprueba referencias bajo bloqueo. Se probaron reintentos, archivos huérfanos tras eliminar al propietario y ambas carreras entre limpiar y asociar.

El códec pasó en Edge Runtime/Deno real con límites de 256 MB y 2000 ms de CPU, incluyendo entradas de 16 MP y PNG de 16 bits. Esta evidencia completa la parte de imágenes de T01, pero el transporte SSRF sigue pendiente. Los tiempos son muestras HTTP locales y no un perfil exhaustivo de CPU/memoria. La prueba detallada y sus límites están en la guía.

Validación final: 58 pruebas unitarias, 201 comprobaciones SQL en memoria y Docker, 11 pruebas de datos y 162 casos UI. También pasó el formulario real con un Vite aislado contra Edge/Storage/PostgreSQL local. Lint y asesores locales sin incidencias relevantes; compilación correcta con el aviso de tamaño de chunk ya documentado. Se cerraron los procesos de prueba y se retiraron sus datos efímeros, conservando los servidores previamente abiertos y los participantes existentes.

## T06: resultado verificable

- `supabase/seed.sql` y `npm run seed:local`, sin nuevas dependencias ni migraciones.
- UUIDs estables, carga transaccional y sin sobrescrituras. Seed automático desactivado en CLI.
- Dos listas vacías, tres con una opción, tres con dos y tres completas. Los números indican opciones, no prioridad.
- Prendas, objetos y calzado; PEN por defecto y un precio USD de ejemplo; imágenes/enlaces opcionales sin dependencias de tiendas externas.
- Sin usuarios Auth, enlaces privados, hashes de tokens, cambios del evento ni subidas a Storage.
- Seis pruebas automatizadas: cobertura, repetibilidad preservando ediciones, bloqueo sin marcador local, rechazo de participantes ajenos, rechazo de identidades conflictivas y contrato SQL después de cargar demo.
- Aplicación en el contenedor local: `INSERT 0 11`, `INSERT 0 18`, COMMIT. Después pasó el contrato completo de 90 comprobaciones con ROLLBACK.

En T06 la pantalla React era preparatoria. T10 añade el catálogo y una carga separada para los nombres proporcionados por el usuario; la demo ficticia queda disponible para pruebas aisladas.

## T07: resultado verificable

Ver [guía de enlaces privados](private-access.md). Una nueva migración añade helpers privados y una RPC exclusivamente para el backend. Tokens canónicos de 256 bits, hashes SHA-256, scopes por participante y revocación/expiración verificadas en servidor. Bootstrap/recuperación solo desde el contenedor local, sin exponer un endpoint de mantenimiento.

127 aserciones SQL pasan en PostgreSQL embebido y Supabase local. Conexiones separadas verificaron bloqueo/revocación, y Edge/Deno real validó acceso, pertenencia, denegaciones y revocación por HTTP. Lint y asesores locales sin problemas reportados. No se generó un enlace permanente del usuario en la conversación ni se tocaron recursos remotos.

## T08: resultado verificable

Ver [edición protegida](protected-mutations.md). Mutaciones autorizadas dentro de la transacción, campos cerrados y comparación de UUID/versión. 170 comprobaciones SQL con casos de permisos, datos inválidos, media propia, conflictos y recreación de posición. Dos conexiones reales validaron un ganador por versión/posición y ausencia de nuevas escrituras tras revocación. El CRUD se probó además por HTTP en Edge/Deno.

Dos migraciones incrementales aplicadas únicamente en local, sin editar las anteriores. Lint sin advertencias y asesores locales sin problemas reportados. Sin dependencias nuevas, cuentas Auth ni cambios remotos. T09 abordará los componentes visuales; los formularios siguen previstos para T13/T18.

## T09: resultado verificable

Ver [sistema visual y componentes](ui-system.md). Paleta y tipografías del plan, espaciado/radios, botones, campos, estados, notificaciones y confirmación nativa con foco inicial en Cancelar, ciclo de teclado, Escape y restauración de foco. Ilustración SVG original y fuentes del sistema, sin descargas externas.

T09 añadió una galería interactiva de revisión con formulario simulado, ahora conservada en `/diseno` tras implementar T10. No representa el editor de T13. Tailwind y Lucide estaban previstos por la arquitectura; Playwright y axe se añaden solo para pruebas de accesibilidad e interacción. Sin migraciones ni cambios en Supabase en ese bloque.

Validación: 24 pruebas de navegador en escritorio/tableta/móvil, contraste de tokens, reflujo a 320 px, texto al 200 %, movimiento reducido y revisión visual de capturas. TypeScript, 27 tests unitarios, 170 comprobaciones SQL en memoria, seis tests de seed y build correctos. La revisión con lector de pantalla real sigue prevista para T21.

## T10: catálogo y participantes definitivos

Ver [guía del catálogo](catalogue.md). La raíz muestra bienvenida, cuadrícula y once tarjetas con nombre, avatar determinista y conteo real de regalos; no hay nombres ni cantidad fijados en los componentes. Se consultan participantes con `gifts(count)` y configuración en dos solicitudes públicas, sin consultas por tarjeta ni escrituras. Navegación y rutas mediante React Router; T09 se conserva en `/diseno`. El aviso de perfil usado durante T10 se reemplazó por el perfil completo en T11.

El usuario reemplazó los nombres ficticios por Melyza, Karina, Norma, Magaly, Cesar, Fabrizio, Brandon, Pamela, Franco, Derek Leonardo y Alice, y eligió comenzar con listas vacías. `participants:local` prepara esa carga transaccional; protege ediciones posteriores y rechaza reemplazar una demo modificada o con enlaces personales. Nombres, slug y orden siguen en PostgreSQL; su edición por el organizador se construirá en T20.

Docker no estaba disponible en esta ejecución. Se añadió `preview:local`: SQL y roster en PostgreSQL temporal, API de solo lectura y Vite en loopback, independiente de la configuración remota existente. Permite revisar las once tarjetas ahora, sin aplicar datos al contenedor ni a producción. No se modificaron migraciones ni permisos.

## T11: perfiles públicos y tres posiciones

Ver [perfiles públicos](public-profiles.md). Una consulta pública por slug carga participante y regalos relacionados, con cancelación y límite de espera. Se muestran exactamente las posiciones 1/2/3, conservando huecos, precios sin conversión, características por tipo/calzado, fotos sin recorte y preferencias generales separadas. Sin controles de edición pública.

Incluye copia de URL pública sin query/fragmento, alternativa manual si el portapapeles falla, estados de carga, inexistente y error con reintento, foco de entrada y navegación de retorno. Se reutiliza el avatar y se carga la ruta de perfil de forma diferida. La API temporal de previsualización admite lectura parametrizada por slug; conserva los once participantes con listas vacías y no añade deseos ficticios a sus datos.

Sin dependencias, migraciones, permisos, cuentas o endpoints de escritura nuevos. La integración con PostgREST/Docker real sigue pendiente del entorno local; las pruebas de T11 usan PostgreSQL en memoria, el SDK público y transporte local/controlado.

Validación: 75 pruebas UI (24 nuevas del perfil), 35 unitarias, 170 comprobaciones SQL en memoria y 11 pruebas de datos correctas. Build sin advertencias de tamaño después de diferir la ruta de perfil. Capturas revisadas en escritorio/tableta/móvil; lectores de pantalla reales pendientes de T21.

## T12: acceso y navegación privada

Ver [navegación privada](private-navigation.md). Captura síncrona de `/acceso#token=…` y `/organizador/acceso#token=…`, URL reemplazada antes de render y credencial en clausura de memoria. El contexto solo publica metadatos validados, sin token, cookies ni almacenamiento persistente.

Validación por `wishlist-api` con clave pública y `X-Edit-Token`; controles propios/organizador, cierre local, expiración, revalidación al recuperar foco y verificación al entrar en destinos privados. Respuestas antiguas no restauran permisos después de cerrar o reemplazar el enlace. HTTP 401/403 retira el acceso y 429 respeta `Retry-After`; se añadió únicamente su exposición CORS al handler existente.

Los destinos de regalo/perfil y organizador están protegidos, con pantallas preparatorias hasta T13/T18/T20. No se añadieron formularios, mutaciones, endpoints de escritura, migraciones ni dependencias. La previsualización temporal conserva las once listas vacías y no acepta credenciales. Pruebas UI con tokens ficticios y respuestas controladas; validación contra la pila real local todavía pendiente, sin operaciones remotas.

Validación: 42 tests unitarios, 170 comprobaciones SQL en memoria y 11 pruebas de datos correctas. Regresión de 108 casos UI y batería final de 36 casos T12 correctas (111 casos distintos en la suite actual). Build y TypeScript correctos. Datos reales, credenciales existentes y configuración remota sin cambios.

## T13: editor manual de regalos

Ver [editor de regalos](gift-editor.md). La ruta de cada opción tiene un formulario de 760 px con título/tipo, enlace e imagen por URL opcionales, descripción, precio/moneda y detalles contextuales. Ropa/calzado y objetos conservan borradores independientes por tipo. Guardar y limpiar operan sobre una sola posición con UUID/versión; no se exige completar las otras dos.

La sesión privada incorpora un transporte cerrado de mutaciones sin entregar el token a componentes. Rechaza sujetos ajenos, bloquea duplicados y pierde permisos con 401/403. Los errores conservan el borrador; 409 o respuesta incierta bloquean nuevos envíos hasta consultar lo guardado y decidir explícitamente. La limpieza y el descarte usan confirmaciones accesibles.

React Router pasa a `createBrowserRouter`/`RouterProvider`, con inicialización posterior a limpiar la credencial, para usar su bloqueo oficial de navegación con cambios pendientes. Se conserva el flujo de T12 y no se añaden dependencias, endpoints ni migraciones. Subidas binarias e importación siguen en sus bloques originales.

Docker no tenía daemon accesible durante T13. La integración del navegador se prueba con transporte estatal aislado; el backend se verifica con las pruebas SQL existentes. Los once nombres/listas, enlaces reales, `.env.local` y recursos remotos no se modificaron.

Validación: 150 pruebas UI (39 del editor), 48 unitarias, 170 comprobaciones SQL en memoria y 11 pruebas de datos correctas. Build y TypeScript correctos; JS inicial aproximado de 170,46 KB gzip, con aviso de Vite por tamaño minificado. Comparación, cancelación y accesibilidad repasadas después de los ajustes finales.
