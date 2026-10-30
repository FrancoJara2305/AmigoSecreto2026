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
| **T17** | **Completa en local:** vista previa con fuentes, selección por campo, moneda verificada y aplicación solo al borrador; cancelación, respuestas obsoletas y cuotas. Recorrido real de navegador/Edge/Node/SQL probado. |
| **T18** | **Completa en local:** foto/ilustración, mensaje y gustos, subida pendiente, guardado con versión, cuotas y revisión de conflictos. Recorrido real con Edge/Storage/PostgreSQL, 100 unitarias y 249 casos UI completos comprobados. |
| **T19** | **Completa en local:** backend de altas, cambios, orden, bajas y ajustes, listado sin secretos y ciclo de enlaces protegido; SQL, Edge/Storage y siete carreras reales comprobados. |
| **T20** | **Completa en local:** panel de participantes/evento, formularios, fotos, orden, bajas, edición de listas y gestión de enlaces con relevo en memoria. 118 unitarias, 303 casos UI completos y recorrido real aislado comprobados. |
| **T21** | **Correcciones y pruebas de navegador verificadas en local; cierre manual pendiente:** teclado, errores asociados, contraste, reflujo y zoom nativo. Falta lector real; Computer Use detuvo el turno al no poder confirmar la URL de la ventana local para aplicar su política. |
| **T22** | **Integración y seguridad comprobadas en local:** 303 aserciones en PostgreSQL real, ataques HTTP/Storage, conflictos/cuotas/nonce concurrentes, siete carreras administrativas, lint, seis casos UI y panel real aislado. Sin fallos críticos observados en lo ensayado; T21 conserva pendiente el lector real. |
| **T23** | **Completa en local:** 16 mediciones finales de producción dentro de presupuesto, JS inicial reducido, perfil estable e imagen LCP priorizada. 339 casos UI y 37 comprobaciones entre motores correctos; sin operaciones remotas. |
| **T24** | **Completa en local:** README/variables/operación actualizados, instalación limpia desde lockfile probada, respaldo/restauración DB+Storage y recuperación/mantenimiento verificados en pila desechable. Sin accesos remotos. |
| **T25** | **En preparación local, sin despliegue:** generador de configuración/manifiesto, rutas/CSP/API probados en tres motores y exclusiones de subida. AmigoSecreto2026 reservado para producción; staging separado autorizado, pendiente de acceso y creación. T21 mantiene lector real pendiente. |

## T25: paquete local y destinos

Ver [paquete de revisión](deployment-package.md) y [secuencia de despliegue](deployment-review.md). El usuario confirmó AmigoSecreto2026 como producción, pidió staging separado e identificó Vercel `franco-9ec3/amigo-secreto2026`. No se ha creado staging ni comprobado configuración/historial/datos alojados. Se sugirieron las integraciones; falta acceso confirmado. La herramienta de navegador respondió que su host no estaba disponible.

El generador no lee entornos ni conecta servicios: requiere dos orígenes HTTPS explícitos y emite configuración con CSP exacta e inventario SHA-256 del código y las 14 migraciones. El artefacto generado usa dominios **ficticios**, no destinos aprobados. `.vercelignore` excluye secretos locales, respaldos, pruebas, artefactos y SQL de la subida CLI; `.vercel/` queda ignorado por Git. No se creó una configuración raíz que pudiera publicarse con un destino supuesto.

Pasaron 124 unitarias, 303 aserciones SQL en memoria, 11 pruebas de datos, TypeScript y build. El ensayo de producción en loopback 4203 pasó en Edge, Firefox y WebKit: rutas profundas/recarga, estilos, guardado privado simulado, CSP aplicada y bloqueos de script inline/backend ajeno. El adaptador Node real rechaza solicitudes sin firma; APIs/assets ausentes no reciben HTML. Pasó además el build del subconjunto de fuentes de hosting sin entornos/pruebas/scripts/SQL. Son comprobaciones locales; falta aceptación real en staging, CORS, TLS/DNS del proveedor, tiendas y promoción aprobada.

No se cambiaron SQL/RLS, datos, listas, enlaces permanentes, entornos del usuario o dependencias; sin vinculación, acceso a base remota, carga de secretos, reset/push, despliegue o Git push. El usuario aclaró que «funciona» se refería a abrir la ventana de revisión: **el lector real de T21 sigue pendiente**.

## T24: guías operativas y recuperación

Se actualizaron README, integración Supabase, guía de funciones y referencias de acceso/edición que todavía describían pantallas ya implementadas como futuras. Nuevas guías: [variables](environment.md), [operación y aceptación manual](operations.md), [respaldo/recuperación](backup-recovery.md) y [preparación de despliegue/rollback](deployment-review.md). Las tres plantillas siguen sin credenciales y no se sobrescribió ningún archivo local del usuario. Se añadió exclusión explícita de respaldos y `check:docs` para verificar archivos destino de enlaces locales, scripts npm y claves de las plantillas.

La instalación aislada `npm ci --ignore-scripts --offline` a partir del lockfile pasó, al igual que su build, CLI 2.122.0, 121 unitarias, 303 aserciones PGlite y 11 pruebas de datos. La copia no recibió archivos de entorno ni reemplazó node_modules del usuario. No se repitieron los 339 casos UI de T23 porque no hubo cambios de aplicación visual en T24.

`test:recovery:local` reconstruyó los esquemas de aplicación desde un pg_dump custom y restauró por API avatar/regalo con rutas y SHA-256 idénticos. Todas las tablas coinciden con el snapshot; un archivo truncado falló sin dejar restauración parcial. Se mantienen ACL de aplicación, excluyendo únicamente defaults del rol reservado de plataforma detectados en el ensayo. Se comprobó el riesgo de reactivar hashes revocados después del snapshot y se validó invalidación completa antes de recuperar organizador/emitir nuevos enlaces. Pasaron protección de medios referenciados, limpieza de huérfano/cuotas y 303 aserciones SQL reales después de restaurar.

Todo ocurrió en AmigoSecretoAdminTest; sus recursos y archivo temporal de variables se retiraron. No se exportaron/restauraron los datos de la principal, no se emitieron enlaces permanentes del usuario ni hubo migraciones nuevas o acciones remotas. La recuperación alojada, cabeceras/rutas/CORS/infraestructura y distribución de enlaces siguen pendientes de T25; el lector real sigue pendiente de T21. La guía no autoriza por sí sola acceder a producción, ni siquiera para un dry-run.

## T23: medición y corrección de rendimiento

Ver [comparación, metodología, archivos y reproducción](performance-review.md). El ensayo construye producción sin entornos/credenciales reales, sirve datos públicos sintéticos en 4193/4194 y registra 16 navegaciones frías con CPU/red controladas, inventario de módulos, solicitudes, elemento LCP y ventanas CLS. La comparación final cumple los objetivos del plan: catálogo móvil LCP p75 1440 ms / CLS 0,0366 y perfil 2048 ms / CLS 0; ambos por debajo de 200 KB gzip de JavaScript público cargado. La entrada se redujo alrededor del 28,7 %, el build habitual informa 125,77 KB gzip y ya no avisa de chunk mayor de 500 KB.

Se usa directamente el cliente PostgREST oficial de la misma versión instalada (2.118.0 fijada en dependencia y lockfile) para omitir productos no usados del bundle, manteniendo consultas, validación y permisos. Se reservó espacio en el estado de carga del perfil y se priorizó la primera imagen identificada como LCP. Una prueba demorada cubre el ajuste del título a 320 px/200 %. La centralización de orígenes permite la regresión en 4185/4186 sin detener la previsualización existente.

Pasaron las 16 mediciones finales, 121 unitarias, 303 aserciones SQL en memoria, 11 pruebas de datos, seis casos dirigidos de carga/reflujo y el recorrido real del organizador contra una pila desechable. **Regresión final 339/339 correcta**, sin reintentos, y **37 comprobaciones Edge/Firefox/WebKit**, incluido zoom nativo, correctas. Build, tipos y revisión de secretos correctos; `npm audit` sin avisos conocidos. Se retiraron los recursos de la pila de prueba, PostgreSQL principal sigue Healthy y la previsualización existente se conserva. No se cambiaron SQL, RLS, datos del grupo, `.env.local` o servicios remotos. T21 mantiene pendiente el lector real; los resultados de laboratorio se repetirán en staging cuando se autorice.

## T22: integración y revisión de seguridad

Ver [matriz de aceptación A01–A38, alcance y reproducción](security-review.md). Se añadió un ejecutor de revisión estática del código/build y un modo `--security` al ensayo administrativo desechable. Las pruebas atacan los tres endpoints, PostgREST y Storage reales, ejercitan UUID/regalo/archivo ajeno, revocación, conflictos, cuotas y nonce compartidos, SSRF/transporte firmado y ausencia de credenciales en respuestas/logs. El ensayo aplica las migraciones desde cero en **AmigoSecretoAdminTest**, corre las siete suites SQL transaccionales y el lint local de `public,private`, y retira solo sus contenedores/volúmenes.

Pasaron 118 unitarias, 303 aserciones SQL en memoria y en PostgreSQL real, 11 pruebas de datos, seis casos UI nuevos en escritorio/tableta/móvil y el recorrido real del panel con otra pestaña abierta durante revocación. La última regresión completa de T21 fue 330/330; la suite actual registra 336, sin atribuir a T22 una ejecución completa adicional. TypeScript, build, revisión estática y `npm audit` correctos (cero avisos conocidos). Se conserva el aviso previo de chunk de Vite; LCP/CLS y solicitudes se medirán en T23.

Se documentaron las respuestas del gateway CORS local, DELETE de Storage filtrado por RLS y el orden cuota/autorización, sin relajar permisos ni modificar código de aplicación. La huella de participantes, regalos, evento y credenciales principales coincide con la obtenida antes de los ensayos; PostgreSQL principal sigue Healthy, sin contenedores/volúmenes de prueba y sin el archivo temporal de secretos. No se modificaron migraciones, datos del grupo, `.env.local`, credenciales permanentes o infraestructura remota. El lector real de T21 y los criterios de rendimiento/restauración/despliegue permanecen expresamente pendientes.

## T21: accesibilidad y presentación responsiva

Ver [matriz, correcciones y revisión manual](accessibility-review.md). Se asociaron errores a los controles de foto/ilustración/regalo; se corrigieron títulos y etiquetas largos, áreas táctiles y contraste del campo de enlace nuevo. `AppLink` y las anclas nativas declaran tabulación cero para mantener el orden del DOM y el acceso mediante teclado en WebKit; no hay índices positivos ni cambios en permisos o credenciales.

Pasaron 37 comprobaciones entre Edge, Edge táctil, Firefox y WebKit, incluido un ensayo de zoom nativo 2× con perfil aislado, y la regresión final completa de 330 casos UI. Los contrastes medidos son 11,41:1 para texto/foco y 3,66:1 para el borde del campo de enlace. Hay capturas y árboles ARIA reproducibles; esto no sustituye la prueba con lector real. `review:a11y:local` prepara una ventana independiente con transporte sintético y se comprobó su arranque. El primer intento de abrir Narrador agotó la espera de aprobación; al intentar la revisión aislada, Computer Use detuvo el turno porque no pudo confirmar la URL con suficiente confianza para aplicar su política. Se cerró el ensayo y no se marca completado el criterio de lector.

Sin dependencias npm nuevas, cambios de SQL/Supabase, migraciones, archivos de entorno del usuario u operaciones remotas. Firefox/WebKit de prueba se descargaron únicamente bajo `artifacts/`, excluido de Git. TypeScript, 118 unitarias, 303 aserciones SQL en memoria, 11 pruebas de datos y build correctos; el aviso previo de tamaño minificado permanece. El resultado de la regresión final se registra en la [guía de validación](validation-results.md).

## T20: panel del organizador

Ver [uso, archivos y ensayo aislado](organizer-panel.md). Las rutas de administración cargan de forma diferida y verifican el rol. La lista adaptable permite altas con listas vacías, cambios de nombre/slug/foto/orden y textos, Subir/Bajar con versiones y vecino, acceso a los editores existentes y bajas con nombre escrito y confirmación. Evento admite título, bienvenida y fecha opcional sin conversión UTC.

La emisión muestra el enlace una sola vez con copia/selección manual; revocar identifica a la persona. La rotación explica la recuperación ante pérdida de respuesta, reemplaza la credencial dentro de la sesión en memoria y valida el relevo. Una respuesta incierta, incluida una rotación cancelada, retira la escritura. Los conflictos y altas con respuesta perdida conservan el borrador y requieren reconciliación por UUID/versión antes de reenviar.

Pasaron TypeScript, 118 unitarias, 303 aserciones SQL en memoria, 11 pruebas de datos y la regresión final completa de 303 casos UI (54 nuevos) en las tres resoluciones. El navegador real contra Edge/Storage/PostgreSQL en una pila separada comprobó el recorrido completo y revocación con otra pestaña abierta. Se revisaron capturas y axe/reflujo; lector real y otros motores siguen en T21. Build correcto: 176,14 KB gzip iniciales y panel diferido de 8,98 KB gzip, con el aviso previo de chunk minificado. La huella del proyecto principal coincide; se retiró la pila efímera y sus volúmenes. Sin nuevas dependencias, migraciones, RLS, endpoints, cambios de entorno del usuario u operaciones remotas.

## T19: administración y enlaces

Ver [contratos y ensayo aislado](organizer-backend.md). Se amplía `wishlist-api` con listado paginado, altas con UUID reconciliable y slug único, cambios parciales con versión, movimientos con vecino/versiones y confirmación exacta de bajas. Los ajustes admiten título, bienvenida y fecha; no se habilita presupuesto ni moneda configurable. Todos exigen organizador dentro de SQL, sin cuentas Auth ni credenciales privilegiadas en React.

Las bajas invalidan enlaces personales y retiran regalos/reservas en una transacción; las fotos propias quedan en una cola duradera para su eliminación mediante Storage API. El listado expone solamente estado/vencimiento de enlaces. Se reutiliza T07 y se corrige su orden de bloqueos, con revalidación después de las esperas para impedir escrituras o rotaciones de un organizador que acaba de vencer.

Se generaron tres migraciones incrementales y se aplicaron solo al contenedor local. Pasaron 108 pruebas unitarias, 303 aserciones SQL en memoria y PostgreSQL local, 11 pruebas de datos, build y TypeScript. El ensayo aislado comprobó Edge/Storage reales y siete carreras con conexiones separadas. Lint y asesores locales sin incidencias. La huella agregada de participantes, regalos, evento y credenciales coincide antes/después; no se cambiaron el roster, enlaces permanentes ni `.env.local`. Se retiró la pila efímera, conservando la principal. El panel sigue en T20; no se repitieron los 249 casos UI de T18 porque no hubo cambios de interfaz en T19. Sin despliegue ni operación remota.

## T18: perfil y preferencias

Ver [formulario de perfil](profile-editor.md). La ruta privada sustituye la pantalla preparatoria y conserva el modelo durante revalidaciones. Permite foto de hasta 512 px normalizada por T14, URL HTTPS o ilustración, mensaje y gustos opcionales. Nombre, slug y orden se mantienen fuera de este formulario, según el plan. Solo Guardar perfil persiste; los regalos no se modifican.

El cliente comprueba recibos, UUID/versión, campos permitidos y propósito avatar; la autorización definitiva sigue en las RPC existentes. Conflictos/respuestas perdidas exigen comparar antes de reenviar. Cancelar o fallar conserva el borrador; cerrar/expirar/reemplazar credencial aborta o descarta respuestas antiguas. Cuotas de subida y mutación tienen esperas independientes, sin reenvíos automáticos.

Pasaron TypeScript, 100 pruebas unitarias, 249 casos UI completos sin reintentos automáticos, build y el recorrido real navegador→Edge→Storage→SQL: avatar pendiente hasta guardar, reemplazo, vuelta a ilustración, textos públicos, regalos intactos, 403 ajeno y 409 antiguo. Se retiraron participantes/objetos/entorno efímeros. Se corrigió el foco en estados inexistente/error de la nueva ruta y se verificó el reintento. Resultados en [validación](validation-results.md). No hay dependencias, migraciones, RLS o handlers nuevos, ni operación remota. Permanece el aviso previo de chunk Vite mayor de 500 KB.

## T17: vista previa y aplicación selectiva

Ver [guía de la interfaz de importación](product-import-ui.md). El editor consulta solo al pulsar el botón, presenta los campos encontrados con fuente y marca por defecto únicamente los vacíos. Precio/moneda se revisan juntos: no hay conversión USD→PEN ni moneda inferida; un precio sin moneda requiere confirmación expresa. Aplicar modifica solo el borrador. El guardado sigue usando las mutaciones autorizadas y versionadas existentes.

Cancelar, cambiar el borrador o perder acceso descarta solicitudes/sugerencias. La sesión verifica rol/propietario, aborta al cerrar/reemplazar credencial y rechaza respuestas antiguas. Un 429 solo pausa la importación, conservando el formulario manual. No se cargan imágenes de la tienda hasta aplicar ese campo. Modelo se limita al tipo objeto del esquema existente; talla/ajuste nunca se infieren.

El ensayo real local comprobó desde navegador que consultar y aplicar dejan cero regalos en PostgreSQL, y solo Guardar crea la opción con el título revisado y USD intacto. Se limpiaron participantes, secretos efímeros y servidores propios. TypeScript, 92 pruebas unitarias, 207 casos UI completos y build correctos; permanece el aviso previo de chunk de Vite. La regresión detectó y corrigió una habilitación transitoria del selector de imágenes tras 429, con seis comprobaciones dirigidas adicionales. No hay nuevas dependencias, migraciones ni cambios de configuración del usuario, datos del roster o instancia remota. Los resultados completos están en [validación](validation-results.md).

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
